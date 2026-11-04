import {digest,integrationBody,limitedBytes,problem,response} from './integration-utils.mjs';
import {validCalendarDate,addDays,eventDraft} from '../dist/organizer.mjs';
import {validTimeZone} from '../dist/time.mjs';
import {zonedInstant} from './reminder-plan.mjs';
const scope='https://www.googleapis.com/auth/calendar.readonly';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const enc=new TextEncoder(),base64=b=>btoa(String.fromCharCode(...b));
export function calendarConfigured(env){try{const u=new URL(env.GOOGLE_CALENDAR_REDIRECT_URI);return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID&&env.GOOGLE_CALENDAR_CLIENT_SECRET&&/^[a-f0-9]{64}$/.test(env.CALENDAR_ENCRYPTION_KEY||'')&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&u.pathname==='/calendar-callback');}catch{return false;}}
async function key(env){return crypto.subtle.importKey('raw',Uint8Array.from(env.CALENDAR_ENCRYPTION_KEY.match(/../g),v=>parseInt(v,16)),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealCalendar(env,userId,value){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(userId)},await key(env),enc.encode(JSON.stringify(value)));return base64(iv)+'.'+base64(new Uint8Array(data));}
export async function openCalendar(env,userId,value){try{const [a,b]=value.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0)),additionalData:enc.encode(userId)},await key(env),Uint8Array.from(atob(b),c=>c.charCodeAt(0)))));}catch{problem('Reconecte o calendário: não foi possível abrir a autorização.',409);}}
async function request(url,options={}){let r;try{r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{problem('Google Agenda indisponível. Tente novamente.',502);}return r;}
async function data(r){let value;try{value=JSON.parse(new TextDecoder().decode(await limitedBytes(r,1500000)));}catch{problem('Resposta inválida do Google Agenda.',502);}if(!r.ok)problem(r.status===401||r.status===400?'Autorização indisponível. Desconecte e conecte o calendário novamente.':'Google Agenda indisponível. Tente novamente.',r.status===401||r.status===400?409:502);return value;}
async function token(env,fields){const b=await data(await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET,...fields}).toString()}));if(typeof b.access_token!=='string'||b.token_type?.toLowerCase()!=='bearer')problem('Autorização inválida do Google.',502);return b;}
async function rate(db,id){const now=Date.now(),row=await db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind('calendar:'+id+':'+Math.floor(now/900000),now+900000).first();if(row.count>30)problem('Limite de consultas de calendário atingido. Aguarde 15 minutos.',429);}
const sessionHash=req=>digest(req.headers.get('cookie')?.match(/(?:^|;\s*)mentra_session=([a-f0-9]{64})(?:;|$)/)?.[1]||'');
export async function calendarRoutes(req,env,user){
 const url=new URL(req.url),path=url.pathname,db=env.DB;if(!path.startsWith('/api/calendar'))return null;
 const connection=await db.prepare('SELECT * FROM calendar_connections WHERE user_id=?').bind(user.id).first();
 if(path==='/api/calendar'&&req.method==='GET')return response({configured:calendarConfigured(env),connected:!!connection,connectionId:connection?.id||null,connectedAt:connection?.connected_at||null});
 if(req.method!=='DELETE'&&!calendarConfigured(env))problem('O operador ainda precisa configurar o Google Agenda.',503);
 if(req.method!=='DELETE'&&new URL(env.GOOGLE_CALENDAR_REDIRECT_URI).origin!==url.origin)problem('Endereço de retorno do calendário não corresponde ao sistema.',503);
 if(req.method!=='DELETE')await rate(db,user.id);
 if(path==='/api/calendar/connect'&&req.method==='POST'){
  const b=await integrationBody(req);if(b.confirmed!==true)problem('Confirme a autorização de leitura do calendário.');
  const state=random(),verifier=random(),challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  await db.batch([db.prepare('DELETE FROM calendar_oauth WHERE user_id=? OR expires_at<?').bind(user.id,Date.now()),db.prepare('INSERT INTO calendar_oauth(state_hash,user_id,session_hash,verifier,expires_at) VALUES(?,?,?,?,?)').bind(await digest(state),user.id,await sessionHash(req),await sealCalendar(env,user.id,verifier),Date.now()+600000)]);
  const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,redirect_uri:env.GOOGLE_CALENDAR_REDIRECT_URI,response_type:'code',scope,access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return response({url:target.href});
 }
 if(path==='/api/calendar/complete'&&req.method==='POST'){
  const b=await integrationBody(req);if(typeof b.state!=='string'||!/^[a-f0-9]{64}$/.test(b.state)||typeof b.code!=='string'||!b.code||b.code.length>4096)problem('Retorno de autorização inválido.');
  const stateHash=await digest(b.state),pending=await db.prepare('UPDATE calendar_oauth SET claimed=1 WHERE state_hash=? AND user_id=? AND session_hash=? AND expires_at>? AND claimed=0 RETURNING verifier').bind(stateHash,user.id,await sessionHash(req),Date.now()).first();if(!pending)problem('Autorização expirada, utilizada ou iniciada em outra sessão. Conecte novamente.',409);
  const grant=await token(env,{grant_type:'authorization_code',code:b.code,redirect_uri:env.GOOGLE_CALENDAR_REDIRECT_URI,code_verifier:await openCalendar(env,user.id,pending.verifier)});
  if(typeof grant.refresh_token!=='string'||!grant.refresh_token||!String(grant.scope||'').split(' ').includes(scope))problem('A permissão de leitura não foi concedida. Conecte novamente.',409);
  const credentials=await sealCalendar(env,user.id,{refreshToken:grant.refresh_token}),id=crypto.randomUUID();
  const saved=await db.prepare('INSERT INTO calendar_connections(user_id,id,credentials,connected_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM calendar_oauth WHERE state_hash=? AND user_id=? AND claimed=1 AND expires_at>?) AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,credentials=excluded.credentials,connected_at=excluded.connected_at RETURNING id').bind(user.id,id,credentials,Date.now(),stateHash,user.id,Date.now(),await sessionHash(req),user.id,Date.now()).first();
  await db.prepare('DELETE FROM calendar_oauth WHERE state_hash=? AND user_id=?').bind(stateHash,user.id).run();if(!saved)problem('Conexão cancelada ou expirada. Inicie novamente.',409);return response({ok:true});
 }
 if(path==='/api/calendar'&&req.method==='DELETE'){
  const b=await integrationBody(req);if(b.confirmed!==true)problem('Confirme a desconexão.');
  await db.batch([db.prepare('DELETE FROM calendar_oauth WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM calendar_connections WHERE user_id=?').bind(user.id)]);
  let revoked=!connection;if(connection){try{const grant=await openCalendar(env,user.id,connection.credentials);const r=await request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:grant.refreshToken}).toString()});revoked=r.ok;}catch{}}
  return response({ok:true,revoked});
 }
 if(path==='/api/calendar/preview'&&req.method==='POST'){
  if(!connection)problem('Conecte seu Google Agenda primeiro.',409);const b=await integrationBody(req);
  if(!validCalendarDate(b.from)||!validCalendarDate(b.until)||b.until<b.from||b.until>addDays(b.from,90)||!validTimeZone(b.timeZone))problem('Escolha datas válidas, até 90 dias, e um fuso válido.');
  const grant=await openCalendar(env,user.id,connection.credentials),access=await token(env,{grant_type:'refresh_token',refresh_token:grant.refreshToken});
  if(access.refresh_token)await db.prepare('UPDATE calendar_connections SET credentials=? WHERE user_id=? AND id=?').bind(await sealCalendar(env,user.id,{refreshToken:access.refresh_token}),user.id,connection.id).run();
  const endpoint=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');endpoint.search=new URLSearchParams({timeMin:addDays(b.from,-1)+'T00:00:00Z',timeMax:addDays(b.until,2)+'T00:00:00Z',singleEvents:'true',showDeleted:'false',maxResults:'250',orderBy:'startTime',timeZone:b.timeZone}).toString();
  const result=await data(await request(endpoint.href,{headers:{Authorization:'Bearer '+access.access_token}}));
  if(result.nextPageToken||!Array.isArray(result.items)||result.items.length>250)problem('Há muitos compromissos. Reduza o período e consulte novamente.',422);
  const events=[],skipped=[];let utcAdjusted=0;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:b.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  for(const item of result.items){
   if(item.status==='cancelled')continue;const title=String(item.summary||'Sem título').slice(0,100);
   const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(v),start=Date.parse(item.start?.dateTime),end=Date.parse(item.end?.dateTime),duration=(end-start)/60000;
   if(!item.id||!stamp(item.start?.dateTime)||!stamp(item.end?.dateTime)||!Number.isFinite(start)||!Number.isInteger(duration)||duration<1||duration>1440){skipped.push(title);continue;}
   const p=formatter.formatToParts(new Date(start)),get=k=>p.find(x=>x.type===k).value;let date=`${get('year')}-${get('month')}-${get('day')}`,time=`${get('hour')}:${get('minute')}`,zone=b.timeZone;
   if(date<b.from||date>b.until)continue;
   if(zonedInstant(date,time,zone)!==start){date=new Date(start).toISOString().slice(0,10);time=new Date(start).toISOString().slice(11,16);zone='UTC';utcAdjusted++;}
   const sourceKey=await digest('google-primary\0'+user.id+'\0'+String(item.iCalUID||item.id)+'\0'+String(item.originalStartTime?.dateTime||item.originalStartTime?.date||''));
   events.push({...eventDraft({title,date,time,duration},{},zone),sourceKey,source:'google-calendar'});
  }
  if(events.length>100)problem('Mais de cem ocorrências no período. Reduza o intervalo.',422);
  if(!await db.prepare('SELECT id FROM calendar_connections WHERE user_id=? AND id=?').bind(user.id,connection.id).first())problem('Conexão alterada durante a consulta. Consulte novamente.',409);
  return response({connectionId:connection.id,events,skipped,utcAdjusted,generatedAt:Date.now(),calendarName:String(result.summary||'Agenda principal').slice(0,160)});
 }
 return response({error:'Rota de calendário não encontrada.'},404);
}
