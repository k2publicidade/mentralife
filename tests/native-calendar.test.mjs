import test from 'node:test';
import assert from 'node:assert/strict';
import {installNativeCalendar} from '../mobile/calendar.mjs';
import {calendarReturnLink} from '../dist/calendar-native-return.mjs';
import worker from '../server/worker.mjs';
const state='native.'+'a'.repeat(64),origin='https://mentra.test';
const authorization=()=>{const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({state,redirect_uri:origin+'/calendar-callback',code_challenge_method:'S256'});return target.href;};
test('retorno HTTPS não envia código OAuth pelo cabeçalho Referer aos assets',async()=>{
 const response=await worker.fetch(new Request(origin+'/calendar-callback?code=synthetic-code&state='+state),{ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}});
 assert.equal(response.status,200);assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
});
function fixture({launch,user='account-a'}={}){
 const listeners={},values=new Map(),calls=[],visits=[];let owner=user,closed=0;
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const app={addListener:async(name,fn)=>listeners[name]=fn,getLaunchUrl:async()=>launch?{url:launch}:undefined};
 const browser={addListener:async(name,fn)=>listeners[name]=fn,open:async options=>calls.push({open:options.url}),close:async()=>closed++};
 const request=async(path,options)=>{calls.push({path,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};};
 return {listeners,values,calls,visits,closed:()=>closed,setUser:value=>owner=value,options:{app,browser,request,origin,storage,user:()=>owner,onComplete:()=>visits.push('connected')}};
}
test('retorno nativo usa esquema fixo e não transforma estado web em link de aplicativo',()=>{
 assert.equal(calendarReturnLink(new URLSearchParams({state:'a'.repeat(64),code:'web-code'})),null);
 const target=new URL(calendarReturnLink(new URLSearchParams({state,code:'one-use+&=code'})));assert.equal(target.protocol,'mentralife:');assert.equal(target.host,'calendar');assert.equal(target.searchParams.get('code'),'one-use+&=code');
 assert.equal(new URL(calendarReturnLink(new URLSearchParams({state,error:'access_denied'}))).searchParams.get('error'),'denied');
 assert.throws(()=>calendarReturnLink(new URLSearchParams({state})),/incompleto/);
});
test('app confere nonce e só conclui com a sessão original, sem guardar o código',async()=>{
 const f=fixture(),calendar=await installNativeCalendar(f.options),pending=calendar.connect(authorization());
 f.listeners.appUrlOpen({url:'mentralife://calendar/complete?state=native.'+'b'.repeat(64)+'&code=wrong'});
 assert.equal(f.calls.filter(x=>x.path).length,0);
 f.listeners.appUrlOpen({url:calendarReturnLink(new URLSearchParams({state,code:'synthetic-code'}))});await pending;
 assert.deepEqual(f.calls.find(x=>x.path),{path:'calendar/complete',data:{state:'a'.repeat(64),code:'synthetic-code'}});assert.equal(f.values.size,0);assert.equal(f.closed(),1);
 f.listeners.appUrlOpen({url:calendarReturnLink(new URLSearchParams({state,code:'synthetic-code'}))});assert.equal(f.calls.filter(x=>x.path).length,1);
});
test('fechar autorização ou negar consentimento não conecta nem mantém solicitação local',async()=>{
 const f=fixture(),calendar=await installNativeCalendar(f.options);let pending=calendar.connect(authorization());const closed=assert.rejects(pending,/interrompida/);f.listeners.browserFinished();await closed;assert.equal(f.values.size,0);
 pending=calendar.connect(authorization());const denied=assert.rejects(pending,/cancelada/);f.listeners.appUrlOpen({url:calendarReturnLink(new URLSearchParams({state,error:'access_denied'}))});await denied;assert.equal(f.calls.filter(x=>x.path).length,0);
});
test('retorno após reabrir o app aguarda identidade e nunca usa conta diferente',async()=>{
 const raw=calendarReturnLink(new URLSearchParams({state,code:'cold-start-code'}));
 for(const owner of ['account-a','account-b']){
  const f=fixture({launch:raw,user:null});f.values.set('mentra-native-calendar-flow',JSON.stringify({owner:'account-a',state,expiresAt:Date.now()+600000}));
  const calendar=await installNativeCalendar(f.options);assert.equal(f.calls.length,0);f.setUser(owner);await calendar.resume();
  assert.equal(f.calls.filter(x=>x.path).length,owner==='account-a'?1:0);assert.equal(f.values.size,0);
 }
});
test('origem de autorização e retorno HTTPS de outro ambiente são recusados antes de abrir navegador',async()=>{
 const f=fixture(),calendar=await installNativeCalendar(f.options);
 for(const url of ['https://attacker.test/?state='+state,authorization().replace('mentra.test','other.test')])await assert.rejects(calendar.connect(url),/inválido/);
 assert.equal(f.calls.length,0);
});
test('fechamento da aba antes do evento de retorno não descarta um retorno legítimo',async()=>{
 const f=fixture(),calendar=await installNativeCalendar(f.options),pending=calendar.connect(authorization());
 f.listeners.browserFinished();f.listeners.appUrlOpen({url:calendarReturnLink(new URLSearchParams({state,code:'legitimate-return'}))});await pending;
 assert.equal(f.calls.filter(x=>x.path).length,1);
});
