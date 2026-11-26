import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {keyboardVisible} from '../dist/mobile.mjs';
import {nativeApiRequest} from '../mobile/transport.mjs';
import {installNativePush} from '../mobile/notifications.mjs';

test('teclado não confunde paisagem ou rolagem com campo em edição',()=>{
 assert.equal(keyboardVisible(800,450,'INPUT'),true);
 assert.equal(keyboardVisible(800,750,'TEXTAREA'),false);
 assert.equal(keyboardVisible(800,450,'BUTTON'),false);
});
test('HTTP nativo mantém destino HTTPS e origem esperada sem expor cookie ao JavaScript',async()=>{
 let sent;
 const result=await nativeApiRequest(async options=>{sent=options;return {status:200,data:{ok:true}};},'state',{method:'PUT',body:'{"revision":3}'},'https://mentra.test');
 assert.equal(sent.url,'https://mentra.test/api/state');assert.equal(sent.headers.origin,'https://mentra.test');assert.equal(sent.headers.cookie,undefined);assert.equal(sent.data.revision,3);assert.deepEqual(await result.json(),{ok:true});
 for(const origin of ['http://mentra.test','https://user:pass@mentra.test','https://mentra.test/other'])await assert.rejects(nativeApiRequest(()=>assert.fail('Não deve enviar'),'me',{},origin));
 for(const path of ['../../secret','#fragment'])await assert.rejects(nativeApiRequest(()=>assert.fail('Não deve enviar'),path,{},'https://mentra.test'));
 const abort=new AbortController();abort.abort();await assert.rejects(nativeApiRequest(()=>assert.fail('Não deve enviar'),'me',{signal:abort.signal},'https://mentra.test'),{name:'AbortError'});
});
test('HTTP nativo mantém status HTTP para falhas de login e resposta inválida',async()=>{
 const response=await nativeApiRequest(async()=>({status:401,data:'{"error":"Entre novamente"}'}),'me',{},'https://mentra.test');
 assert.equal(response.ok,false);assert.equal(response.status,401);assert.equal((await response.json()).error,'Entre novamente');
});
test('áudio nativo mantém tipo e bytes exatos; cancelamento não espera o retorno da ponte',async()=>{
 const bytes=Uint8Array.from([0,255,128,1,2,10]),audio=new Blob([bytes],{type:'audio/mp4'});let sent;
 await nativeApiRequest(async options=>{sent=options;return {status:200,data:{text:'Transcrição'}};},'audio/transcribe',{method:'POST',headers:{'Content-Type':'audio/mp4'},body:audio},'https://mentra.test');
 assert.equal(sent.headers['content-type'],'audio/mp4');assert.equal(sent.dataType,'file');assert.deepEqual(Buffer.from(sent.data,'base64'),Buffer.from(bytes));
 const controller=new AbortController();let complete;
 const pending=nativeApiRequest(()=>new Promise(resolve=>complete=resolve),'state',{signal:controller.signal},'https://mentra.test');controller.abort();await assert.rejects(pending,{name:'AbortError'});complete({status:200,data:{}});
});
test('avisos nativos pedem consentimento somente na ativação e removem vínculo no logout',async()=>{
 const listeners={},calls=[],values=new Map();let prompts=0,owner='account-a',token='a'.repeat(64),unregistered=0;const visits=[];
 const plugin={addListener:async(name,fn)=>listeners[name]=fn,checkPermissions:async()=>({receive:'prompt'}),requestPermissions:async()=>{prompts++;return {receive:'granted'};},register:async()=>listeners.registration({value:token}),unregister:async()=>unregistered++,removeAllDeliveredNotifications:async()=>{}};
 const request=async(path,options)=>{calls.push({path,...options,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};};
 const notifications=await installNativePush(plugin,'ios',request,{storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},user:()=>owner,go:path=>visits.push(path)});
 assert.equal(prompts,0);assert.equal(calls.length,0);await notifications.subscribe();assert.equal(prompts,1);assert.equal(calls[0].data.token,token);
 listeners.pushNotificationActionPerformed({notification:{data:{url:'https://attacker.test'}}});assert.equal(visits.length,0);
 listeners.pushNotificationActionPerformed({notification:{data:{url:'/#/vida/agenda'}}});assert.deepEqual(visits,['/#/vida/agenda']);
 owner='account-b';listeners.pushNotificationActionPerformed({notification:{data:{url:'/#/vida/tarefas'}}});await notifications.resume();assert.equal(visits.length,1);
 owner='account-a';await notifications.unsubscribe();assert.equal(calls.at(-1).method,'DELETE');assert.equal(unregistered,1);assert.equal(values.size,0);
});
test('permissão nativa negada não registra o aparelho nem grava consentimento fictício',async()=>{
 let calls=0;const plugin={addListener:async()=>{},checkPermissions:async()=>({receive:'denied'})};
 const notifications=await installNativePush(plugin,'ios',()=>calls++,{storage:{getItem:()=>null},user:()=> 'account-a'});
 await assert.rejects(notifications.subscribe(),/Autorize/);assert.equal(calls,0);
});
test('sair sem avisos configurados não tenta registrar ou desregistrar Firebase',async()=>{
 let unregisters=0;const plugin={addListener:async()=>{},unregister:async()=>{unregisters++;throw Error('Firebase ausente');},removeAllDeliveredNotifications:async()=>{}};
 const notifications=await installNativePush(plugin,'android',()=>assert.fail('Não deve acessar servidor'),{storage:{getItem:()=>null,removeItem:()=>{}},user:()=> 'account-a'});
 await notifications.unsubscribe();assert.equal(unregisters,0);
});
test('build sem arquivo Firebase não pede permissão nem chama o SDK de registro',async()=>{
 const notifications=await installNativePush({addListener:async()=>{},checkPermissions:async()=>assert.fail('Não deve pedir permissão')},'android',()=>assert.fail('Não deve enviar'),{available:false,storage:{getItem:()=>null},user:()=> 'account-a'});
 assert.equal(notifications.available,false);await assert.rejects(notifications.subscribe(),/configuração/);
});
test('logout aguarda e desfaz registro que estava em andamento',async()=>{
 const listeners={},values=new Map(),requests=[];let release;
 const plugin={addListener:async(name,fn)=>listeners[name]=fn,checkPermissions:async()=>({receive:'granted'}),register:async()=>listeners.registration({value:'a'.repeat(64)}),unregister:async()=>{},removeAllDeliveredNotifications:async()=>{}};
 const notifications=await installNativePush(plugin,'ios',async(_path,options)=>{requests.push(options.method);if(options.method==='POST')await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true})};},{storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},user:()=> 'account-a'});
 const activation=notifications.subscribe();const failed=assert.rejects(activation,/cancelada|mudou/);
 while(!release)await new Promise(resolve=>setTimeout(resolve,0));
 const leaving=notifications.unsubscribe();release();await leaving;await failed;assert.deepEqual(requests,['POST','DELETE']);assert.equal(values.size,0);
});
test('service worker usa somente fallback público e nunca intercepta API, arquivos privados ou POST',async()=>{
 const handlers={},added=[],network=[],cacheReads=[],deleted=[];
 const cache={addAll:async values=>added.push(...values)};
 const caches={open:async()=>cache,keys:async()=>['mentra-offline-old','other-app'],delete:async key=>deleted.push(key),match:async key=>{cacheReads.push(key);return {offline:key};}};
 runInNewContext(readFileSync(new URL('../dist/push-sw.js',import.meta.url),'utf8'),{URL,caches,self:{location:{origin:'https://mentra.test'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}},fetch:async req=>{network.push(req.url);throw Error('offline');}});
 let pending;handlers.install({waitUntil:p=>pending=p});await pending;assert.deepEqual(added,['/offline.html','/offline.css','/assets/mentra-face.png']);
 handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['mentra-offline-old']);
 for(const [url,method,mode] of [['/api/state','GET','navigate'],['/api/chat','POST','cors'],['/assets/private.pdf','GET','cors'],['https://elsewhere.test/','GET','navigate']]){
  let responded=false;handlers.fetch({request:{url:new URL(url,'https://mentra.test').href,method,mode},respondWith:()=>responded=true});assert.equal(responded,false);
 }
 handlers.fetch({request:{url:'https://mentra.test/',method:'GET',mode:'navigate'},respondWith:p=>pending=p});assert.deepEqual(await pending,{offline:'/offline.html'});assert.deepEqual(cacheReads,['/offline.html']);
});
