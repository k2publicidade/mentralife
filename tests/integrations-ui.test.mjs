import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrationsUI} from '../dist/integrations-ui.mjs';
import {accountState} from '../dist/account-state.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('app nativo ativa o provedor da plataforma sem exigir Web Push e mostra contagem atualizada',async t=>{
 const previous=globalThis.mentraNativePush;let subscriptions=0,removals=0;
 t.after(()=>{if(previous===undefined)delete globalThis.mentraNativePush;else globalThis.mentraNativePush=previous;});
 globalThis.mentraNativePush={platform:'ios',subscribe:async()=>{subscriptions++;return {devices:2};},unsubscribe:async()=>removals++};
 const c=setup(t,{pushData:{configured:false,nativeConfigured:{ios:true,android:false},nativeDevices:1,eligible:true,enabled:true,settings:{}}});
 await c.ui.refresh();assert.match(c.root.innerHTML,/Ativar neste dispositivo/);await c.click('integration-subscribe');assert.equal(subscriptions,1);assert.match(c.root.innerHTML,/<strong>2<\/strong> vinculados/);
 await c.ui.beforeLogout();assert.equal(removals,1);
});
function setup(t,{persist=true,pushData=null,audioEligible=true}={}){const old={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData,production:globalThis.mentraProduction};t.after(()=>{globalThis.document=old.document;globalThis.window=old.window;globalThis.FormData=old.FormData;if(old.production===undefined)delete globalThis.mentraProduction;else globalThis.mentraProduction=old.production;});globalThis.mentraProduction=true;
 const root={innerHTML:'',getAttribute:()=>true};globalThis.document={querySelector:()=>root};globalThis.window={mentraDataEpoch:0};globalThis.FormData=class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}};
 const state=accountState(null,{name:'QA'}),items=[{id:'wa_test1',kind:'text',status:'ready',created_at:Date.parse('2026-10-28T15:00:00Z'),payload:{text:'Amanhã reunião às 14h',sentAt:Date.parse('2026-10-28T15:00:00Z')}}];let flushed=true,dialog='',saves=0;const calls=[];
 const ui=createIntegrationsUI({getState:()=>state,save:()=>{saves++;return persist;},flush:async()=>flushed,render(){},modal:(title,body)=>{dialog=title+body;},closeModal:()=>ui.cancelPending(),financialCapture:()=>null,api:async path=>path==='push'?(pushData||{configured:false,devices:0,enabled:false,settings:{}}):{configured:true,audioConfigured:true,audioEligible,linked:{phone:'••••9999'},items:structuredClone(items)},send:async(path,data,method)=>{calls.push({path,data,method});return {};}});
 return {ui,state,calls,root,saves:()=>saves,dialog:()=>dialog,setFlush:v=>flushed=v,submit:async(id,values,dataset={})=>{ui.handleSubmit({id,values,dataset,checkValidity:()=>true,reportValidity(){}});await tick();},click:async(action,data={})=>{ui.handleClick(action,data);await tick();}};
}
test('importação exige persistência confirmada, evita duplicidade e usa data da mensagem recebida',async t=>{const c=setup(t);await c.ui.refresh();c.setFlush(false);await c.submit('integration-import-form',{text:'Amanhã reunião às 14h'},{id:'wa_test1'});assert.equal(c.calls.length,0);assert.equal(c.state.inbox.length,1);assert.equal(c.state.inbox[0].date,'2026-10-29');assert.equal(c.state.inbox[0].originalText,'Amanhã reunião às 14h');c.setFlush(true);await c.submit('integration-import-form',{text:'Amanhã reunião às 14h'},{id:'wa_test1'});assert.equal(c.state.inbox.length,1);assert.equal(c.calls[0].path,'integrations/inbox/wa_test1/ack');});
test('recusa síncrona preserva entrada remota e cancelamento invalida desvinculação',async t=>{const c=setup(t,{persist:false});await c.ui.refresh();await c.submit('integration-import-form',{text:'Lembrar tarefa'},{id:'wa_test1'});assert.equal(c.state.inbox.length,0);assert.equal(c.calls.length,0);await c.click('integration-unlink-review');assert.match(c.dialog(),/Desvincular/);c.ui.cancelPending();await c.click('integration-unlink-confirm');assert.equal(c.calls.length,0);});
test('áudio sem consentimento não faz envio; preferências desligadas não pedem permissão push',async t=>{const c=setup(t);await c.ui.refresh();await c.submit('integration-audio-form',{audio:{size:1}});assert.equal(c.calls.length,0);assert.match(c.root.innerHTML,/Confirme o envio/);await c.submit('integration-push-form',{timeZone:'America/Sao_Paulo',taskTime:'09:00',eventMinutes:'10',quietStart:'22:00',quietEnd:'07:00',tasks:'on',events:'on'});assert.equal(c.calls[0].path,'push/settings');assert.equal(c.calls[0].data.enabled,false);});


test('descarte individual: cancelar não envia pedido; confirmar remove apenas a pendência',async t=>{const c=setup(t);await c.ui.refresh();await c.click('integration-discard-review',{id:'wa_test1'});assert.match(c.dialog(),/Descartar esta mensagem/);c.ui.cancelPending();await c.click('integration-discard-confirm');assert.equal(c.calls.length,0);await c.click('integration-discard-review',{id:'wa_test1'});await c.click('integration-discard-confirm');assert.equal(c.calls[0].path,'integrations/inbox/wa_test1');assert.equal(c.calls[0].method,'DELETE');assert.equal(c.calls[0].data.confirmed,true);assert.equal(c.state.inbox.length,0);assert.equal(c.saves(),0);await c.click('integration-discard-confirm');assert.equal(c.calls.length,1);});

test('assinatura inativa é recusada antes de solicitar permissão push ao navegador',async t=>{const previous=globalThis.Notification;let prompts=0;globalThis.Notification={requestPermission:async()=>{prompts++;return 'granted';}};t.after(()=>{if(previous===undefined)delete globalThis.Notification;else globalThis.Notification=previous;});const c=setup(t,{pushData:{configured:true,eligible:false,devices:0,settings:{}}});await c.ui.refresh();await c.click('integration-subscribe');assert.equal(prompts,0);assert.equal(c.calls.length,0);assert.match(c.root.innerHTML,/Ative sua assinatura antes/);});


test('áudio indisponível para assinatura pendente é informado antes de selecionar ou enviar arquivo',async t=>{const c=setup(t,{audioEligible:false});await c.ui.refresh();assert.match(c.root.innerHTML,/Assinatura necessária/);assert.match(c.root.innerHTML,/Sua assinatura precisa estar ativa/);assert.doesNotMatch(c.root.innerHTML,/<form id="integration-audio-form"/);let reads=0;const audio={get size(){reads++;return 100;}};await c.submit('integration-audio-form',{consent:'on',audio});assert.equal(reads,0);assert.equal(c.calls.length,0);assert.match(c.root.innerHTML,/Ative sua assinatura antes de enviar áudio/);});

test('passo a passo do WhatsApp: aparece para quem não conectou, gera o código e confirma a conexão',async t=>{
 const old={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData,localStorage:globalThis.localStorage,platform:globalThis.mentraPlatform};
 t.after(()=>{for(const [k,v] of [['document',old.document],['window',old.window],['FormData',old.FormData],['localStorage',old.localStorage],['mentraPlatform',old.platform]]){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 const store=new Map(),root={innerHTML:'',getAttribute:()=>true},slot={innerHTML:''};
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};globalThis.mentraPlatform={user:{id:'u1'},subscription:{status:'active'}};
 globalThis.document={hidden:false,querySelector:q=>q==='#wa-home-slot'?slot:q==='.modal'?null:root};globalThis.window={mentraDataEpoch:0};globalThis.FormData=class{constructor(form){this.values=form.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}};
 let linked=null,dialog='',closed=0;const calls=[];
 const make=()=>{const ui=createIntegrationsUI({getState:()=>({}),save:()=>true,flush:async()=>true,render(){},modal:(title,body)=>{dialog=title+body;},closeModal:()=>{closed++;dialog='';ui.cancelPending();},financialCapture:()=>null,api:async path=>path==='push'?{configured:false,devices:0,enabled:false,settings:{}}:{configured:true,chat:true,number:'5511900000000',linked,items:[]},send:async(path,data,method)=>{calls.push({path,data,method});return {code:'a'.repeat(32),command:'VINCULAR '+'a'.repeat(32),expiresAt:Date.now()+600000,url:'https://wa.me/5511900000000?text=VINCULAR%20'+'a'.repeat(32)};}});return ui;};
 let ui=make();await ui.announce();
 assert.match(dialog,/Converse com a Mentra pelo WhatsApp/);assert.match(dialog,/Envie a mensagem pronta/);assert.match(slot.innerHTML,/Conectar meu WhatsApp/);
 ui.handleSubmit({id:'integration-guide-form',values:{},dataset:{},checkValidity:()=>true,reportValidity(){}});await tick();assert.equal(calls.length,0);assert.match(dialog,/Marque a autorização/);
 ui.handleSubmit({id:'integration-guide-form',values:{consent:'on'},dataset:{},checkValidity:()=>true,reportValidity(){}});await tick();
 assert.deepEqual(calls[0],{path:'whatsapp/link',data:{consent:true},method:undefined});assert.match(dialog,/Abrir o WhatsApp/);assert.match(dialog,/VINCULAR a{32}/);
 ui.handleClick('integration-guide-check',{});await tick();assert.match(dialog,/Ainda não recebemos/);
 linked={phone:'••••1111',linkedAt:Date.now()};ui.handleClick('integration-guide-check',{});await tick();
 assert.match(dialog,/WhatsApp conectado/);assert.match(dialog,/••••1111/);assert.equal(slot.innerHTML,'');
 ui.handleClick('integration-guide-close',{});assert.equal(closed,1);
 // Depois de mostrado uma vez, não insiste na próxima abertura; "não mostrar de novo" vale para a conta.
 linked=null;dialog='';ui=make();await ui.announce();assert.equal(dialog,'');assert.match(slot.innerHTML,/Conectar meu WhatsApp/);
 ui.handleClick('integration-guide',{});assert.match(dialog,/Converse com a Mentra/);ui.handleClick('integration-guide-never',{});assert.equal(store.get('mentra-wa-guide:u1'),'never');
});
