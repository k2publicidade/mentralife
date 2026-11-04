import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {sealCalendar,openCalendar} from '../server/calendar.mjs';
import {reviewCalendarImport,applyCalendarImport} from '../dist/calendar-import.mjs';
const origin='https://mentra.test',scope='https://www.googleapis.com/auth/calendar.readonly';
async function fixture(t){
 const DB=integrationDB(),env={DB,GOOGLE_CALENDAR_CLIENT_ID:'synthetic-client',GOOGLE_CALENDAR_CLIENT_SECRET:'synthetic-secret',CALENDAR_ENCRYPTION_KEY:'a'.repeat(64),GOOGLE_CALENDAR_REDIRECT_URI:origin+'/calendar-callback'};
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;DB.sql.close();});
 const calls=[];let events=[],exchangeHook=null,extraToken={},httpStatus=200;
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/token')){if(exchangeHook)await exchangeHook();return Response.json({access_token:'synthetic-access',token_type:'Bearer',refresh_token:'synthetic-refresh',scope,...extraToken},{status:httpStatus});}if(String(url).endsWith('/revoke'))return new Response('',{status:httpStatus});return Response.json({summary:'Agenda sintética <privada>',items:events},{status:httpStatus});};
 async function call(path,{method='GET',body,cookie,requestOrigin=origin}={}){const response=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 const a=await call('register',{method:'POST',body:{name:'Calendar A',email:'a@calendar.test',password:'synthetic-password-2026',plan:'plus'}}),b=await call('register',{method:'POST',body:{name:'Calendar B',email:'b@calendar.test',password:'synthetic-password-2026',plan:'plus'}});
 const start=async(cookie=a.cookie)=>call('calendar/connect',{method:'POST',cookie,body:{confirmed:true}});
 const complete=async(started,cookie=a.cookie)=>call('calendar/complete',{method:'POST',cookie,body:{code:'synthetic-code',state:new URL(started.body.url).searchParams.get('state')}});
 const connect=async()=>complete(await start());
 const preview=async(body={from:'2026-10-01',until:'2026-10-31',timeZone:'America/Sao_Paulo'})=>call('calendar/preview',{method:'POST',cookie:a.cookie,body});
 return {DB,env,call,a,b,calls,start,complete,connect,preview,setEvents:v=>events=v,setToken:v=>extraToken=v,setStatus:v=>httpStatus=v,hook:fn=>exchangeHook=fn};
}
const event=(patch={})=>({id:'external-1',iCalUID:'stable-uid',summary:'Consulta sintética',start:{dateTime:'2026-10-29T13:00:00Z'},end:{dateTime:'2026-10-29T14:00:00Z'},...patch});
test('OAuth exige sessão/origem/consentimento, PKCE e estado secreto de uso único',async t=>{
 const c=await fixture(t);assert.equal((await c.start(null)).status,401);
 assert.equal((await c.call('calendar/connect',{method:'POST',cookie:c.a.cookie,body:{confirmed:true},requestOrigin:'https://attacker.test'})).status,403);
 assert.equal((await c.call('calendar/connect',{method:'POST',cookie:c.a.cookie,body:{}})).status,400);
 const start=await c.start(),url=new URL(start.body.url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),scope);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('code_challenge'));assert.doesNotMatch(start.body.url,/synthetic-secret/);
 assert.equal((await c.complete(start,c.b.cookie)).status,409);assert.equal((await c.complete(start)).status,200);assert.equal((await c.complete(start)).status,409);
 const stored=c.DB.sql.prepare('SELECT * FROM calendar_connections').get();assert.doesNotMatch(stored.credentials,/synthetic-refresh/);assert.equal((await openCalendar(c.env,c.a.body.user.id,stored.credentials)).refreshToken,'synthetic-refresh');
 assert.equal((await c.call('calendar',{cookie:c.b.cookie})).body.connected,false);
 const exported=await c.call('account/export',{cookie:c.a.cookie});assert.doesNotMatch(JSON.stringify(exported.body),/synthetic-refresh|credentials|synthetic-access/);
});
test('estado expirado e sessão diferente da mesma conta não concluem autorização',async t=>{
 const c=await fixture(t),start=await c.start(),other=await c.call('login',{method:'POST',body:{email:'a@calendar.test',password:'synthetic-password-2026'}});
 assert.equal((await c.complete(start,other.cookie)).status,409);c.DB.sql.prepare('UPDATE calendar_oauth SET expires_at=0').run();assert.equal((await c.complete(start)).status,409);assert.equal(c.calls.length,0);
});
test('negação de escopo e falha do Google não concedem acesso',async t=>{
 const c=await fixture(t);c.setToken({scope:'openid'});assert.equal((await c.connect()).status,409);assert.equal((await c.call('calendar',{cookie:c.a.cookie})).body.connected,false);
 c.setStatus(503);assert.equal((await c.connect()).status,502);assert.equal((await c.call('calendar',{cookie:c.a.cookie})).body.connected,false);
});
test('desconectar durante troca de código impede recriação tardia da conexão',async t=>{
 const c=await fixture(t),start=await c.start();c.hook(async()=>{assert.equal((await c.call('calendar',{method:'DELETE',cookie:c.a.cookie,body:{confirmed:true}})).status,200);});assert.equal((await c.complete(start)).status,409);assert.equal((await c.call('calendar',{cookie:c.a.cookie})).body.connected,false);
});
test('consulta normaliza fuso e originais recorrentes sem importar anexos, alarmes ou convidados',async t=>{
 const c=await fixture(t);assert.equal((await c.connect()).status,200);c.setEvents([event({description:'secret note',attendees:[{email:'private@test'}],attachments:[{fileUrl:'https://attacker.test'}]})]);const r=await c.preview();assert.equal(r.status,200);assert.equal(r.body.events[0].time,'10:00');assert.equal(r.body.events[0].duration,60);assert.doesNotMatch(JSON.stringify(r.body),/secret note|private@test|attacker/);
 const request=c.calls.find(x=>x.url.includes('/events?'));assert.match(request.url,/singleEvents=true/);assert.equal(request.options.headers.Authorization,'Bearer synthetic-access');
 assert.equal((await c.call('state',{cookie:c.a.cookie})).body.data,null);
});
test('dia inteiro, duração longa e precisão incompatível são apresentados como não importados',async t=>{
 const c=await fixture(t);await c.connect();c.setEvents([event({id:'day',start:{date:'2026-10-29'},end:{date:'2026-10-30'}}),event({id:'long',end:{dateTime:'2026-10-31T14:00:00Z'}}),event({id:'seconds',start:{dateTime:'2026-10-29T13:00:30Z'}}),event()]);const r=await c.preview();assert.equal(r.status,200);assert.equal(r.body.skipped.length,3);assert.equal(r.body.events.length,1);
});
test('limite, datas inválidas, provedor indisponível e conexão removida não devolvem consulta parcial',async t=>{
 const c=await fixture(t);assert.equal((await c.preview()).status,409);await c.connect();assert.equal((await c.preview({from:'bad',until:'2026-10-31',timeZone:'UTC'})).status,400);assert.equal((await c.preview({from:'2026-01-01',until:'2026-10-31',timeZone:'UTC'})).status,400);
 c.setEvents(Array.from({length:101},(_,i)=>event({id:'e'+i,iCalUID:'u'+i})));assert.equal((await c.preview()).status,422);
 c.setStatus(503);assert.equal((await c.preview()).status,502);
});
test('desconexão elimina autorização local mesmo sem configuração ou falha de revogação no Google',async t=>{
 const c=await fixture(t);await c.connect();assert.equal((await c.call('calendar',{method:'DELETE',cookie:c.b.cookie,body:{confirmed:true}})).status,200);assert.equal((await c.call('calendar',{cookie:c.a.cookie})).body.connected,true);
 c.setStatus(503);const result=await c.call('calendar',{method:'DELETE',cookie:c.a.cookie,body:{confirmed:true}});assert.equal(result.body.revoked,false);assert.equal((await c.call('calendar',{cookie:c.a.cookie})).body.connected,false);
 await c.start();delete c.env.GOOGLE_CALENDAR_CLIENT_SECRET;assert.equal((await c.call('calendar',{method:'DELETE',cookie:c.a.cookie,body:{confirmed:true}})).status,200);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM calendar_oauth').get().n,0);
});
test('criptografia rejeita outra conta e dados adulterados',async t=>{const c=await fixture(t),sealed=await sealCalendar(c.env,'one',{token:'private'});assert.notEqual(sealed,await sealCalendar(c.env,'one',{token:'private'}));await assert.rejects(openCalendar(c.env,'two',sealed));await assert.rejects(openCalendar(c.env,'one',sealed.slice(0,-3)+'bad'));});
test('consulta perde validade se desconectar durante a requisição ao Google',async t=>{
 const c=await fixture(t);await c.connect();c.hook(async()=>{await c.call('calendar',{method:'DELETE',cookie:c.a.cookie,body:{confirmed:true}});});assert.equal((await c.preview()).status,409);
});
test('revisão de importação não muta, evita duplicidade e preserva cancelamento local',()=>{
 const now=Date.now(),proposal={connectionId:'connection',generatedAt:now,events:[{sourceKey:'a'.repeat(64),title:'Novo',date:'2026-10-29',time:'10:00',duration:60,timeZone:'America/Sao_Paulo'}]},events=[];
 const review=reviewCalendarImport(events,proposal),next=applyCalendarImport(events,review);assert.equal(events.length,0);assert.equal(next.length,1);assert.equal(reviewCalendarImport(next,proposal).changes.length,0);
 const cancelled=[{...next[0],cancelled:true,title:'Editado aqui'}],review2=reviewCalendarImport(cancelled,proposal);assert.equal(review2.changes.length,1);assert.equal(applyCalendarImport(cancelled,review2)[0].cancelled,true);
 assert.throws(()=>applyCalendarImport(next,review),/mudou/);assert.throws(()=>applyCalendarImport([],review,now+600001),/expirou/);
});
test('ocorrências repetidas, fuso inválido e consulta vencida falham antes de alterar agenda',()=>{
 const event={sourceKey:'a'.repeat(64),title:'A',date:'2026-10-29',time:'10:00',duration:30,timeZone:'UTC'},proposal={events:[event],generatedAt:Date.now()-600001};assert.throws(()=>reviewCalendarImport([],proposal),/expirada/);proposal.generatedAt=Date.now();proposal.events=[event,event];assert.throws(()=>reviewCalendarImport([],proposal),/repetida/);proposal.events=[{...event,timeZone:'bad'}];assert.throws(()=>reviewCalendarImport([],proposal));
});
test('janela de consulta cobre UTC+14 e mudança de DST preserva o instante repetido',async t=>{
 const c=await fixture(t);await c.connect();c.setEvents([event({start:{dateTime:'2026-10-28T10:30:00Z'},end:{dateTime:'2026-10-28T11:00:00Z'}})]);
 const first=await c.preview({from:'2026-10-29',until:'2026-10-29',timeZone:'Pacific/Kiritimati'});assert.equal(first.body.events[0].time,'00:30');assert.match(c.calls.at(-1).url,/2026-10-28T00/);
 c.setEvents([event({start:{dateTime:'2026-11-01T06:30:00Z'},end:{dateTime:'2026-11-01T07:00:00Z'}})]);const dst=await c.preview({from:'2026-11-01',until:'2026-11-01',timeZone:'America/New_York'});assert.equal(dst.body.utcAdjusted,1);assert.equal(dst.body.events[0].timeZone,'UTC');assert.equal(dst.body.events[0].time,'06:30');
});
test('troca de senha remove concessões e autorizações pendentes de calendário',async t=>{
 const c=await fixture(t);await c.connect();await c.start();assert.equal((await c.call('account/password',{method:'POST',cookie:c.a.cookie,body:{currentPassword:'synthetic-password-2026',password:'synthetic-new-password-2026'}})).status,200);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM calendar_connections').get().n,0);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM calendar_oauth').get().n,0);
});
test('logout durante troca do código impede concluir autorização na sessão revogada',async t=>{
 const c=await fixture(t),start=await c.start();c.hook(async()=>{assert.equal((await c.call('logout',{method:'POST',cookie:c.a.cookie,body:{}})).status,200);});assert.equal((await c.complete(start)).status,409);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM calendar_connections').get().n,0);
});
