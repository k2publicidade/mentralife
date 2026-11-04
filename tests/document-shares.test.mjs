import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {accountState} from '../dist/account-state.mjs';
import {digest} from '../server/integration-utils.mjs';

const origin='https://mentra.test',password='synthetic-sharing-password-2026';
const bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url));
async function fixture(){
 const DB=integrationDB(),env={DB};
 async function call(path,{method='GET',body,cookie,requestOrigin=origin}={}){
  const r=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
  return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer()),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
 }
 const users=[];for(const name of ['Owner','Recipient','Other']){const r=await call('register',{method:'POST',body:{name,email:name.toLowerCase()+'@shares.test',password,plan:'plus'}});assert.equal(r.status,200);users.push({...r.body.user,cookie:r.cookie});}
 const state=accountState(null,users[0]);state.documents=[{id:'doc-private',title:'Contrato privado',originalName:'contrato.png',fileData:bytes.toString('base64'),mime:'image/png',ext:'PNG',fileSize:bytes.length,note:'Anotação que não deve sair',extractedText:'OCR que não deve sair',trashed:false}];state.tasks=[{id:'task-private',title:'Outra informação privada',done:false}];
 const save=async(value=state,revision=1)=>call('state',{method:'PUT',body:{data:value,revision},cookie:users[0].cookie});assert.equal((await save(state,0)).status,200);
 async function preview(documentId='doc-private'){return call('document-shares/preview',{method:'POST',cookie:users[0].cookie,body:{documentId,recipientEmail:users[1].email,hours:24}});}
 async function create(p,{...extra}={}){p||=(await preview()).body;const body={documentId:p.document.id,recipientId:p.recipient.id,signature:p.signature,revision:p.revision,hours:p.hours,confirmed:true,...extra};return call('document-shares',{method:'POST',cookie:users[0].cookie,body});}
 async function access(link,user=users[1],download=false){return call('document-shares/'+(download?'download':'access'),{method:'POST',cookie:user?.cookie,body:{token:new URL(link).hash.slice(1),confirmed:true}});}
 return {DB,env,call,users,state,save,preview,create,access};
}

test('compartilhamento exige revisão, dono do documento e destinatário cadastrado',async()=>{
 const c=await fixture(),[a,b]=c.users;
 assert.equal((await c.call('document-shares/preview',{method:'POST',body:{documentId:'doc-private',recipientEmail:b.email,hours:24}})).status,401);
 assert.equal((await c.call('document-shares/preview',{method:'POST',cookie:b.cookie,body:{documentId:'doc-private',recipientEmail:a.email,hours:24}})).status,404);
 assert.equal((await c.call('document-shares/preview',{method:'POST',cookie:a.cookie,requestOrigin:'https://attacker.test',body:{}})).status,403);
 assert.equal((await c.call('document-shares/preview',{method:'POST',cookie:a.cookie,body:{documentId:'doc-private',recipientEmail:'missing@shares.test',hours:24}})).status,400);
 assert.equal((await c.create(undefined,{confirmed:false})).status,400);assert.equal((await c.create(undefined,{hours:999})).status,400);
 assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM document_shares').get().n,0);
});

test('link não torna arquivo público e só libera original para a conta destinatária',async()=>{
 const c=await fixture(),[a,b,other]=c.users,created=await c.create();assert.equal(created.status,201);
 const token=new URL(created.body.url).hash.slice(1),stored=c.DB.sql.prepare('SELECT * FROM document_shares').get();assert.equal(stored.token_hash,await digest(token));assert.ok(!JSON.stringify(stored).includes(token));
 assert.equal((await c.access(created.body.url,null)).status,401);assert.equal((await c.access(created.body.url,other)).status,404);assert.equal((await c.access(created.body.url,a)).status,404);
 const info=await c.access(created.body.url);assert.equal(info.status,200);assert.equal(info.body.filename,'contrato.png');assert.ok(!JSON.stringify(info.body).match(/Anotação que|OCR que|Outra informação/));
 const downloaded=await c.access(created.body.url,b,true);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(downloaded.body),bytes);assert.equal(downloaded.headers.get('content-type'),'image/png');assert.match(downloaded.headers.get('content-disposition'),/^attachment/);assert.match(downloaded.headers.get('cache-control'),/no-store/);assert.equal(downloaded.headers.get('referrer-policy'),'no-referrer');
 const own=(await c.call('state',{cookie:b.cookie})).body;assert.equal(own.data,null);
 const list=(await c.call('document-shares',{cookie:a.cookie})).body;assert.equal(list.shares.length,1);assert.ok(!JSON.stringify(list).match(/token_hash|document_signature|share#/));assert.equal((await c.call('document-shares',{cookie:b.cookie})).body.shares.length,0);
});

test('revogar é confirmado, idempotente, isolado e impede futuros downloads',async()=>{
 const c=await fixture(),created=(await c.create()).body,path='document-shares/'+created.id;
 assert.equal((await c.call(path,{cookie:c.users[1].cookie,method:'DELETE',body:{confirmed:true}})).status,404);
 assert.equal((await c.call(path,{cookie:c.users[0].cookie,method:'DELETE',body:{}})).status,400);
 assert.equal((await c.access(created.url)).status,200);
 for(let i=0;i<2;i++)assert.equal((await c.call(path,{cookie:c.users[0].cookie,method:'DELETE',body:{confirmed:true}})).status,200);
 assert.equal((await c.access(created.url,undefined,true)).status,404);
});

test('expiração é aplicada no servidor mesmo que a página já esteja aberta',async()=>{
 const c=await fixture(),created=(await c.create(undefined,{hours:1})).body,previous=Date.now,now=previous();
 try{Date.now=()=>now+3600001;assert.equal((await c.access(created.url)).status,404);assert.equal((await c.access(created.url,undefined,true)).status,404);}finally{Date.now=previous;}
});

test('alteração de tarefa preserva o link, mas lixeira e restauração não o ressuscitam',async()=>{
 const c=await fixture(),created=(await c.create()).body;c.state.tasks[0].done=true;assert.equal((await c.save()).status,200);assert.equal((await c.access(created.url)).status,200);
 c.state.documents[0].trashed=true;assert.equal((await c.save(c.state,2)).status,200);assert.ok(c.DB.sql.prepare('SELECT revoked_at FROM document_shares').get().revoked_at);
 c.state.documents[0].trashed=false;assert.equal((await c.save(c.state,3)).status,200);assert.equal((await c.access(created.url)).status,404);
});

test('substituição do original e exclusão invalidam links mesmo após restaurar os bytes antigos',async()=>{
 const c=await fixture(),created=(await c.create()).body,old=c.state.documents[0].fileData;c.state.documents[0].fileData=Buffer.from('%PDF-1.4\nnovo').toString('base64');c.state.documents[0].mime='application/pdf';
 assert.equal((await c.save()).status,200);c.state.documents[0].fileData=old;c.state.documents[0].mime='image/png';assert.equal((await c.save(c.state,2)).status,200);assert.equal((await c.access(created.url)).status,404);
 const again=(await c.create()).body;c.state.documents=[];assert.equal((await c.save(c.state,3)).status,200);assert.equal((await c.access(again.url)).status,404);
});

test('gravação rejeitada por conflito não revoga um acesso válido',async()=>{
 const c=await fixture(),created=(await c.create()).body;c.state.documents[0].trashed=true;assert.equal((await c.save(c.state,0)).status,409);assert.equal((await c.access(created.url)).status,200);
});

test('arquivo inválido, referência sem original e preview antigo não geram acesso',async()=>{
 const c=await fixture(),preview=(await c.preview()).body;c.state.tasks[0].done=true;await c.save();assert.equal((await c.create(preview)).status,409);
 c.state.documents[0].fileData='not base64';await c.save(c.state,2);assert.equal((await c.preview()).status,422);delete c.state.documents[0].fileData;await c.save(c.state,3);assert.equal((await c.preview()).status,422);
});

test('tentativa repetida após perda da resposta conserva um só link e token não pode mudar',async()=>{
 const c=await fixture(),p=(await c.preview()).body,operation={requestId:crypto.randomUUID(),clientToken:'a'.repeat(64)},first=await c.create(p,operation),second=await c.create(p,operation);
 assert.equal(first.status,201);assert.equal(second.status,200);assert.equal(first.body.url,second.body.url);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM document_shares').get().n,1);
 assert.equal((await c.create(p,{...operation,clientToken:'b'.repeat(64)})).status,409);
});

test('criações concorrentes respeitam vinte links e repetição simultânea não duplica',async()=>{
 const c=await fixture(),p=(await c.preview()).body,operation={requestId:crypto.randomUUID(),clientToken:'c'.repeat(64)};
 const race=await Promise.all([c.create(p,operation),c.create(p,operation)]);assert.ok(race.every(r=>r.status===200||r.status===201));
 const replies=await Promise.all(Array.from({length:20},()=>c.create(p)));assert.equal(replies.filter(r=>r.status===201).length,19);assert.equal(replies.filter(r=>r.status===429).length,1);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM document_shares').get().n,20);
});

test('link criado durante uma gravação não sobrevive ao ciclo de lixeira/restauração',async()=>{
 const c=await fixture(),p=(await c.preview()).body,prepare=c.DB.prepare;let created,once=false;
 c.DB.prepare=function(sql){const statement=prepare.call(this,sql);if(sql.startsWith('SELECT DISTINCT document_id')){const all=statement.all;statement.all=async()=>{const rows=await all.call(statement);if(!once){once=true;created=await c.create(p);}return rows;};}return statement;};
 try{c.state.documents[0].trashed=true;assert.equal((await c.save()).status,200);}finally{c.DB.prepare=prepare;}
 assert.equal(created.status,201);c.state.documents[0].trashed=false;await c.save(c.state,2);assert.equal((await c.access(created.body.url)).status,404);
});

test('revogação durante leitura é verificada novamente antes de liberar os bytes',async()=>{
 const c=await fixture(),created=(await c.create()).body,prepare=c.DB.prepare;let once=false;
 c.DB.prepare=function(sql){const statement=prepare.call(this,sql);if(sql.startsWith('SELECT s.data AS manifest')){const all=statement.all;statement.all=async()=>{const rows=await all.call(statement);if(!once){once=true;c.DB.sql.prepare('UPDATE document_shares SET revoked_at=?').run(Date.now());}return rows;};}return statement;};
 try{const download=await c.access(created.url,undefined,true);assert.equal(download.status,404);assert.equal(download.headers.get('content-type'),'application/json');}finally{c.DB.prepare=prepare;}
});

test('exportação não inclui capacidades; exclusão de conta revoga por cascata',async()=>{
 const c=await fixture(),created=(await c.create()).body,token=new URL(created.url).hash.slice(1),exported=(await c.call('account/export',{cookie:c.users[0].cookie})).body;
 assert.equal(exported.documentShares.outgoing.length,1);assert.ok(!JSON.stringify(exported).includes(token));assert.ok(!JSON.stringify(exported.documentShares).match(/token_hash|document_signature/));
 c.DB.sql.prepare('DELETE FROM users WHERE id=?').run(c.users[0].id);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM document_shares').get().n,0);assert.equal((await c.access(created.url)).status,404);
});
