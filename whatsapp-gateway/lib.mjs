// Funções puras do gateway, testáveis sem abrir uma sessão de WhatsApp.
import {createHmac} from 'node:crypto';

export const MAX_AUDIO_BYTES=2*1024*1024;
export const FRESH_WINDOW_MS=10*60*1000;

export function config(env=process.env){
 const api=String(env.MENTRA_API_URL||'').replace(/\/+$/,''),secret=String(env.WHATSAPP_GATEWAY_SECRET||'');
 const problems=[];
 let validApi=false;try{const u=new URL(api);validApi=!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)));}catch{}
 if(!validApi)problems.push('MENTRA_API_URL deve ser uma origem HTTPS válida do backend (ou HTTP apenas em localhost), por exemplo https://mentra-life-production.SEU-USUARIO.workers.dev');
 if(!/^[a-f0-9]{64}$/.test(secret))problems.push('WHATSAPP_GATEWAY_SECRET deve ter 64 caracteres hexadecimais (o mesmo valor cadastrado no Worker).');
 const host=env.HOST||'127.0.0.1',password=env.PANEL_PASSWORD||'',loopback=['127.0.0.1','localhost','::1'].includes(host)||(host==='0.0.0.0'&&env.PANEL_LOOPBACK_ONLY==='1');
 if(!loopback&&password.length<12)problems.push('Para expor o painel fora do próprio servidor (HOST), defina PANEL_PASSWORD com pelo menos 12 caracteres.');
 return {api,secret,host,password,port:Number(env.PORT||3000),dataDir:env.DATA_DIR||'./data',problems};
}

export function sign(secret,raw,timestamp=String(Date.now())){
 return {'Content-Type':'application/json','x-mentra-timestamp':timestamp,'x-mentra-signature':'sha256='+createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex')};
}

export const digits=jid=>{const value=String(jid||'').split('@')[0].split(':')[0];return /^\d{7,20}$/.test(value)?value:null;};
const isPhoneJid=jid=>String(jid||'').endsWith('@s.whatsapp.net');

// Só conversas individuais: nada de grupos, status, listas de transmissão ou canais.
export function isDirectChat(jid){
 return typeof jid==='string'&&(isPhoneJid(jid)||jid.endsWith('@lid'));
}

export function unwrap(message){
 let current=message;
 for(let depth=0;depth<5&&current;depth++){
  const inner=current.ephemeralMessage?.message||current.viewOnceMessage?.message||current.viewOnceMessageV2?.message||current.documentWithCaptionMessage?.message||current.editedMessage?.message;
  if(!inner)break;current=inner;
 }
 return current||{};
}

// Devolve null para eventos que não são uma mensagem da pessoa (reações, protocolo, enquetes...).
export function classify(message){
 const m=unwrap(message);
 const text=typeof m.conversation==='string'&&m.conversation?m.conversation:m.extendedTextMessage?.text;
 if(typeof text==='string'&&text.trim())return {kind:'text',text:text.trim()};
 if(m.audioMessage)return {kind:'audio',mime:m.audioMessage.mimetype||'audio/ogg',size:Number(m.audioMessage.fileLength||0)};
 if(m.imageMessage||m.videoMessage||m.documentMessage||m.stickerMessage||m.locationMessage||m.liveLocationMessage||m.contactMessage||m.contactsArrayMessage)return {kind:'other'};
 return null;
}

// Prefere o número de telefone; o identificador @lid segue como alternativa para o servidor.
export async function identify(key,resolvePhone=async()=>null){
 const jid=key?.remoteJid;
 if(isPhoneJid(jid))return {from:digits(jid),alt:digits(key.remoteJidAlt)};
 let phone=isPhoneJid(key?.remoteJidAlt)?key.remoteJidAlt:null;
 if(!phone){try{phone=await resolvePhone(jid);}catch{phone=null;}}
 const lid=digits(jid),pn=digits(phone);
 return pn?{from:pn,alt:lid}:{from:lid,alt:null};
}

export function shouldHandle(msg,now=Date.now()){
 const key=msg?.key;
 if(!key||key.fromMe||!key.id||!isDirectChat(key.remoteJid)||!msg.message)return false;
 const sentAt=Number(msg.messageTimestamp)*1000;
 return Number.isFinite(sentAt)&&sentAt>now-FRESH_WINDOW_MS;
}

// Uma conversa por vez por contato: as respostas saem na ordem em que as mensagens chegaram.
export function createQueue(){
 const tails=new Map();
 return function enqueue(id,job){
  const next=(tails.get(id)||Promise.resolve()).then(job,job).catch(()=>{}).finally(()=>{if(tails.get(id)===next)tails.delete(id);});
  tails.set(id,next);return next;
 };
}
