// Gateway de WhatsApp da Mentra.
// Mantém UMA sessão de WhatsApp (pareada por QR Code) e repassa cada mensagem individual ao
// backend da Mentra, que identifica a conta, consulta a IA e devolve a resposta.
// Nenhum dado de conta ou chave de IA fica neste serviço.
import makeWASocket,{useMultiFileAuthState,DisconnectReason,downloadMediaMessage,fetchLatestBaileysVersion,Browsers} from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {config,sign,classify,identify,shouldHandle,createQueue,MAX_AUDIO_BYTES} from './lib.mjs';

try{process.loadEnvFile?.('.env');}catch{}
const cfg=config();
if(cfg.problems.length){console.error('Configuração incompleta:\n- '+cfg.problems.join('\n- '));process.exit(1);}
const authDir=path.join(cfg.dataDir,'auth'),log=(...args)=>console.log(new Date().toISOString(),...args);
const status={state:'connecting',number:null,qr:null},enqueue=createQueue(),seen=new Set();
let sock=null,attempt=0,stopping=false;

async function api(body,{retries=3,timeout=120000}={}){
 const raw=JSON.stringify(body);let last;
 for(let i=0;i<retries;i++){
  try{
   const res=await fetch(cfg.api+'/api/whatsapp/gateway',{method:'POST',headers:sign(cfg.secret,raw),body:raw,signal:AbortSignal.timeout(timeout)});
   if(res.ok)return await res.json();
   last=Error('backend respondeu '+res.status);if(res.status<500&&res.status!==429)break;
  }catch(error){last=error;}
  await new Promise(r=>setTimeout(r,1500*(i+1)));
 }
 throw last;
}

let reporting=Promise.resolve();
function report(){
 reporting=reporting.then(async()=>{
  try{
   const result=await api({event:'status',state:status.state,number:status.number,qr:status.state==='qr'?status.qr:null},{retries:3,timeout:15000});
   if(result.command==='logout'&&sock){log('Desconexão solicitada pelo painel da Mentra.');await sock.logout().catch(()=>{});}
  }catch(error){log('Não foi possível informar o estado ao backend:',error.message);}
 });
 return reporting;
}

async function handle(msg){
 const jid=msg.key.remoteJid,content=classify(msg.message);if(!content)return;
 const who=await identify(msg.key,lid=>sock.signalRepository?.lidMapping?.getPNForLID?.(lid));if(!who.from)return;
 const body={event:'message',id:msg.key.id,from:who.from,alt:who.alt,timestamp:Number(msg.messageTimestamp)*1000,kind:content.kind,name:String(msg.pushName||'').slice(0,80)};
 if(content.kind==='text')body.text=content.text.slice(0,20000);
 if(content.kind==='audio'&&content.size<=MAX_AUDIO_BYTES){
  try{const buffer=await downloadMediaMessage(msg,'buffer',{});if(buffer.length<=MAX_AUDIO_BYTES){body.audio=buffer.toString('base64');body.mime=content.mime;}}
  catch(error){log('Falha ao baixar áudio:',error.message);}
 }
 await sock.readMessages([msg.key]).catch(()=>{});
 const typing=()=>sock?.sendPresenceUpdate('composing',jid).catch(()=>{});typing();const pulse=setInterval(typing,8000);
 try{
  const {reply}=await api(body);
  if(typeof reply==='string'&&reply){await new Promise(r=>setTimeout(r,500+Math.random()*900));await sock.sendMessage(jid,{text:reply});}
 }catch(error){log('Mensagem não respondida ('+msg.key.id+'):',error.message);}
 finally{clearInterval(pulse);sock?.sendPresenceUpdate('paused',jid).catch(()=>{});}
}

async function connect(){
 await mkdir(authDir,{recursive:true});
 const {state,saveCreds}=await useMultiFileAuthState(authDir),{version}=await fetchLatestBaileysVersion().catch(()=>({}));
 sock=makeWASocket({auth:state,...(version?{version}:{}),logger:pino({level:'silent'}),browser:Browsers.ubuntu('Chrome'),markOnlineOnConnect:false,syncFullHistory:false,generateHighQualityLinkPreview:false});
 sock.ev.on('creds.update',saveCreds);
 sock.ev.on('connection.update',async update=>{
  if(update.qr){
   status.state='qr';status.number=null;status.qr=await QRCode.toDataURL(update.qr,{margin:1,width:320});
   log('QR Code pronto. Leia pelo painel administrativo da Mentra, em http://'+cfg.host+':'+cfg.port+' ou aqui:\n'+await QRCode.toString(update.qr,{type:'terminal',small:true}));report();
  }
  if(update.connection==='open'){attempt=0;status.state='open';status.qr=null;status.number=String(sock.user?.id||'').split('@')[0].split(':')[0].replace(/\D/g,'')||null;log('WhatsApp conectado: +'+status.number);report();}
  if(update.connection==='close'){
   const code=update.lastDisconnect?.error?.output?.statusCode;status.state='connecting';status.qr=null;if(stopping)return;
   if(code===DisconnectReason.loggedOut){log('Sessão encerrada. Um novo QR Code será gerado.');status.number=null;await rm(authDir,{recursive:true,force:true});}
   else log('Conexão fechada (código '+code+'). Reconectando…');
   report();
   const wait=code===DisconnectReason.restartRequired||code===DisconnectReason.loggedOut?500:code===DisconnectReason.connectionReplaced?30000:Math.min(30000,2000*++attempt);
   setTimeout(()=>connect().catch(error=>{log('Falha ao reconectar:',error.message);setTimeout(()=>connect().catch(()=>{}),15000);}),wait);
  }
 });
 sock.ev.on('messages.upsert',({messages,type})=>{
  if(type!=='notify')return;
  for(const msg of messages){
   if(!shouldHandle(msg)||seen.has(msg.key.id))continue;
   seen.add(msg.key.id);if(seen.size>5000)seen.delete(seen.values().next().value);
   enqueue(msg.key.remoteJid,()=>handle(msg));
  }
 });
}

// Painel local: mostra o estado e o QR Code. Fica só em 127.0.0.1, salvo se HOST e PANEL_PASSWORD forem definidos.
function authorized(req){
 if(!cfg.password)return true;
 const header=String(req.headers.authorization||'');if(!/^Basic\s+/i.test(header))return false;
 const given=Buffer.from(header.replace(/^Basic\s+/i,''),'base64').toString().split(':').slice(1).join(':');
 return timingSafeEqual(createHash('sha256').update(given).digest(),createHash('sha256').update(cfg.password).digest());
}
const page=()=>`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>WhatsApp da Mentra</title><body style="font-family:system-ui,sans-serif;background:#f4f1ea;color:#1f2a24;display:grid;place-items:center;min-height:100vh;margin:0"><main style="background:#fff;padding:32px;border-radius:20px;max-width:380px;text-align:center;box-shadow:0 10px 40px #0001"><h1 style="font-size:22px;margin:0 0 8px">WhatsApp da Mentra</h1>${status.state==='open'?`<p style="color:#2f6b4f;font-weight:600">Conectado: +${status.number}</p><p>As mensagens estão sendo respondidas pela Mentra IA.</p><form method="post" action="/logout" onsubmit="return confirm('Desconectar este número?')"><button style="padding:10px 16px;border-radius:10px;border:1px solid #c9b3ac;background:#fff;color:#a23b2a;cursor:pointer">Desconectar e trocar número</button></form>`:status.state==='qr'&&status.qr?`<p>Abra o WhatsApp no celular da Mentra › <b>Dispositivos conectados</b> › <b>Conectar dispositivo</b> e leia o código.</p><img src="${status.qr}" width="300" height="300" alt="QR Code de conexão">`:'<p>Conectando ao WhatsApp…</p>'}<p style="color:#6b756f;font-size:13px">Esta página se atualiza sozinha.</p></main></body></html>`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:status.state}));}
 if(!authorized(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Mentra"'});return res.end('Acesso restrito.');}
 if(req.method==='POST'&&req.url==='/logout'){
  // Formulários de outros sites não podem acionar a desconexão.
  let sameOrigin=false;try{const source=req.headers.origin||'';sameOrigin=Boolean(source)&&new URL(source).host===req.headers.host&&req.headers['sec-fetch-site']!=='cross-site';}catch{sameOrigin=false;}
  if(!sameOrigin){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Origem inválida.');}
  await sock?.logout().catch(()=>{});res.writeHead(303,{Location:'/'});return res.end();
 }
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});return res.end(page());}
 res.writeHead(404);res.end();
});

server.listen(cfg.port,cfg.host,()=>log('Painel local em http://'+cfg.host+':'+cfg.port));
setInterval(report,45000).unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopping=true;status.state='close';await report();process.exit(0);});
process.on('unhandledRejection',error=>log('Erro não tratado:',error?.message||error));
connect().catch(error=>{log('Falha ao iniciar:',error.message);process.exit(1);});
