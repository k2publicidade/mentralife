import {readState} from './state.mjs';
import {digest,integrationBody,problem} from './integration-utils.mjs';
import {readUpload,uploadFilename} from '../dist/uploads.mjs';

const HOURS=[1,24,168],MAX_ACTIVE=20;
const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Pragma':'no-cache','Expires':'0'};
const json=(body,status=200)=>Response.json(body,{status,headers});
const unavailable=()=>problem('Link indisponível. Confira a conta destinatária ou peça um novo link ao remetente.',404);
const original=doc=>doc?.fileData||doc?.pdfData;
export const documentSignature=async doc=>digest(String(doc.mime||doc.ext||'')+'\0'+original(doc));

function findDocument(state,id){const docs=(state?.documents||[]).filter(d=>d?.id===id);return docs.length===1&&!docs[0].trashed?docs[0]:null;}
async function fileFrom(doc){
 const encoded=original(doc);
 if(typeof encoded!=='string'||!encoded||encoded.length>4*Math.ceil(500*1024/3)||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))problem('Este documento não possui original válido de até 500 KB.',422);
 const binary=atob(encoded);if(btoa(binary)!==encoded)problem('Original inválido.',422);
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),ext=String.fromCharCode(...bytes.slice(0,5))==='%PDF-'?'PDF':bytes[0]===137&&bytes[1]===80?'PNG':bytes[0]===255&&bytes[1]===216?'JPG':null;
 if(!ext)problem('Compartilhe um original PDF, PNG ou JPEG.',422);
 const filename=uploadFilename({...doc,ext}).toWellFormed();let checked;
 try{checked=await readUpload({name:filename,size:bytes.length,arrayBuffer:async()=>bytes.buffer});}catch{problem('Original inválido ou acima do limite de 500 KB.',422);}
 return {bytes,filename,mime:checked.mime,size:bytes.length,sha256:checked.sha256,signature:await documentSignature(doc)};
}
async function throttle(db,userId,limit=40,period=900000){const now=Date.now(),key='document-shares:'+userId+':'+Math.floor(now/period),row=await db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+period).first();if(row.count>limit)problem('Muitas solicitações de compartilhamento. Aguarde e tente novamente.',429);}
function validateId(id){if(typeof id!=='string'||!id||id.length>120)problem('Documento inválido.');}
const metadata=(doc,file)=>({id:doc.id,title:String(doc.title||'Documento').slice(0,160),filename:file.filename,mime:file.mime,size:file.size,sha256:file.sha256});
function expiry(hours){if(!HOURS.includes(hours))problem('Escolha um prazo de uma hora, um dia ou sete dias.');return Date.now()+hours*3600000;}

// Called before a state write. The SQL also invalidates grants created during this read,
// so a trash/restore or original replacement cannot resurrect an old link.
export async function shareRevocationStatement(db,ownerId,next,manifest){
 const rows=(await db.prepare('SELECT DISTINCT document_id FROM document_shares WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?').bind(ownerId,Date.now()).all()).results;
 const allowed=[];
 for(const row of rows){const doc=findDocument(next,row.document_id);if(doc&&typeof original(doc)==='string')allowed.push({id:doc.id,signature:await documentSignature(doc)});}
 return db.prepare("UPDATE document_shares SET revoked_at=? WHERE owner_id=? AND revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM json_each(?) a WHERE json_extract(a.value,'$.id')=document_shares.document_id AND json_extract(a.value,'$.signature')=document_shares.document_signature) AND EXISTS(SELECT 1 FROM user_states WHERE user_id=? AND data=?)").bind(Date.now(),ownerId,JSON.stringify(allowed),ownerId,manifest);
}

export async function documentShareRoutes(req,env,user){
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 if(!path.startsWith('/api/document-shares'))return null;
 if(path==='/api/document-shares/preview'&&req.method==='POST'){
  await throttle(db,user.id);const b=await integrationBody(req);validateId(b.documentId);expiry(b.hours);
  const current=await readState(db,user.id),doc=findDocument(current.data,b.documentId);if(!doc)problem('Documento não disponível.',404);
  const email=String(b.recipientEmail||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)problem('Informe o e-mail da conta destinatária.');
  const recipient=await db.prepare('SELECT id,name,email FROM users WHERE email=?').bind(email).first();if(!recipient)problem('A pessoa precisa ter uma conta Mentra cadastrada antes de receber este acesso.');
  const file=await fileFrom(doc);return json({document:metadata(doc,file),recipient,hours:b.hours,revision:current.revision,signature:file.signature});
 }
 if(path==='/api/document-shares'&&req.method==='POST'){
  await throttle(db,user.id);const b=await integrationBody(req);validateId(b.documentId);expiry(b.hours);
  if(b.confirmed!==true||!Number.isInteger(b.revision)||typeof b.signature!=='string'||typeof b.recipientId!=='string')problem('Revise o destinatário e confirme o compartilhamento.');
  if(b.requestId!==undefined&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(b.requestId))problem('Identificador da operação inválido.');
  if(b.clientToken!==undefined&&!/^[a-f0-9]{64}$/.test(b.clientToken))problem('Código do link inválido.');
  const token=b.clientToken||Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),id=b.requestId||crypto.randomUUID(),tokenHash=await digest(token);
  const repeated=await db.prepare('SELECT * FROM document_shares WHERE id=? AND owner_id=?').bind(id,user.id).first();
  const replay=async repeated=>{
   if(repeated.token_hash!==tokenHash||repeated.document_id!==b.documentId||repeated.recipient_id!==b.recipientId||repeated.document_signature!==b.signature||repeated.expires_at-repeated.created_at!==b.hours*3600000||repeated.revoked_at||repeated.expires_at<=Date.now())problem('Esta operação mudou ou o link já não está ativo. Faça uma nova revisão.',409);
   const recipient=await db.prepare('SELECT id,name,email FROM users WHERE id=?').bind(repeated.recipient_id).first();
   return json({id,url:url.origin+'/share#'+token,expiresAt:repeated.expires_at,recipient,document:{id:repeated.document_id,title:repeated.title,filename:repeated.filename,mime:repeated.mime,size:repeated.file_size,sha256:repeated.sha256}},200);
  };
  if(repeated)return replay(repeated);
  const current=await readState(db,user.id),doc=findDocument(current.data,b.documentId);if(!doc||current.revision!==b.revision)problem('O documento ou sua conta mudou. Revise novamente antes de criar o link.',409);
  const recipient=await db.prepare('SELECT id,name,email FROM users WHERE id=?').bind(b.recipientId).first();if(!recipient)problem('A conta destinatária não está disponível.',409);
  const file=await fileFrom(doc);if(file.signature!==b.signature)problem('O original mudou. Revise novamente.',409);
  const now=Date.now(),expiresAt=now+b.hours*3600000;
  const saved=await db.prepare('INSERT OR IGNORE INTO document_shares(id,owner_id,recipient_id,document_id,token_hash,document_signature,sha256,title,filename,mime,file_size,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_states WHERE user_id=? AND revision=?) AND (SELECT COUNT(*) FROM document_shares WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?)<? RETURNING id').bind(id,user.id,recipient.id,doc.id,tokenHash,file.signature,file.sha256,String(doc.title||'Documento').slice(0,160),file.filename,file.mime,file.size,now,expiresAt,user.id,current.revision,user.id,now,MAX_ACTIVE).first();
  if(!saved){const race=await db.prepare('SELECT * FROM document_shares WHERE id=? AND owner_id=?').bind(id,user.id).first();if(race)return replay(race);const collision=await db.prepare('SELECT id FROM document_shares WHERE id=? OR token_hash=?').bind(id,tokenHash).first();if(collision)problem('Esta operação já foi usada. Faça uma nova revisão.',409);const latest=await readState(db,user.id);if(latest.revision!==current.revision)problem('A conta mudou. Revise novamente.',409);problem('Limite de vinte links ativos por conta. Revogue um acesso ou aguarde sua expiração.',429);}
  return json({id,url:url.origin+'/share#'+token,expiresAt,recipient,document:metadata(doc,file)},201);
 }
 if(path==='/api/document-shares'&&req.method==='GET'){
  const documentId=url.searchParams.get('documentId');if(documentId)validateId(documentId);
  const rows=(await db.prepare('SELECT s.id,s.document_id,s.title,s.filename,s.file_size,s.created_at,s.expires_at,s.revoked_at,u.name AS recipient_name,u.email AS recipient_email FROM document_shares s JOIN users u ON u.id=s.recipient_id WHERE s.owner_id=? AND (? IS NULL OR s.document_id=?) ORDER BY s.created_at DESC,s.id DESC LIMIT 100').bind(user.id,documentId,documentId).all()).results;
  return json({shares:rows.map(r=>({...r,status:r.revoked_at?'revoked':r.expires_at<=Date.now()?'expired':'active'})),maxActive:MAX_ACTIVE});
 }
 const revoke=path.match(/^\/api\/document-shares\/([a-f0-9-]{36})$/i);
 if(revoke&&req.method==='DELETE'){
  const b=await integrationBody(req);if(b.confirmed!==true)problem('Confirme a revogação do acesso.');
  const row=await db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=? RETURNING id').bind(Date.now(),revoke[1],user.id).first();if(!row)problem('Acesso não encontrado.',404);return json({ok:true});
 }
 if(['/api/document-shares/access','/api/document-shares/download'].includes(path)&&req.method==='POST'){
  await throttle(db,'recipient:'+user.id,120,60000);const b=await integrationBody(req);if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))unavailable();
  const share=await db.prepare('SELECT s.*,u.name AS owner_name FROM document_shares s JOIN users u ON u.id=s.owner_id WHERE s.token_hash=? AND s.recipient_id=? AND s.revoked_at IS NULL AND s.expires_at>?').bind(await digest(b.token),user.id,Date.now()).first();if(!share)unavailable();
  const current=await readState(db,share.owner_id),doc=findDocument(current.data,share.document_id);
  if(!doc||await documentSignature(doc)!==share.document_signature){await db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(Date.now(),share.id).run();unavailable();}
  const file=await fileFrom(doc);if(file.sha256!==share.sha256)unavailable();
  const authorized=await db.prepare('SELECT id FROM document_shares WHERE id=? AND recipient_id=? AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM user_states WHERE user_id=? AND revision=?)').bind(share.id,user.id,Date.now(),share.owner_id,current.revision).first();if(!authorized)unavailable();
  if(path.endsWith('/access'))return json({id:share.id,title:share.title,filename:share.filename,mime:share.mime,size:share.file_size,sha256:share.sha256,expiresAt:share.expires_at,ownerName:share.owner_name});
  if(b.confirmed!==true)problem('Confirme o download do original.');
  const ascii=share.filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,150)||'documento';
  return new Response(file.bytes,{headers:{...headers,'Content-Type':share.mime,'Content-Disposition':`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(share.filename)}`,'X-Content-Type-Options':'nosniff'}});
 }
 return json({error:'Rota não encontrada.'},404);
}
