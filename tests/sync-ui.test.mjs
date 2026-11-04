import test from 'node:test';
import assert from 'node:assert/strict';
import {installSyncUI} from '../dist/sync-ui.mjs';
import {createSyncController} from '../dist/sync-controller.mjs';
import {memoryDraftStore} from '../dist/draft-store.mjs';
import {accountState} from '../dist/account-state.mjs';
function setup(t){
 const previous={document:globalThis.document,window:globalThis.window};t.after(()=>{Object.assign(globalThis,previous);});
 let focuses=0,scrolls=0;const handlers={},nodes=[],app={inert:false};function node(){const events={},children=new Map();return {innerHTML:'',textContent:'',hidden:false,offsetHeight:48,events,setAttribute(){},append(){},addEventListener(name,fn){events[name]=fn;},querySelector(key){if(!children.has(key))children.set(key,key==='h2'?{textContent:'',focus(){focuses++;},scrollIntoView(){scrolls++;}}:{textContent:''});return children.get(key);}};}
 globalThis.document={createElement(){const n=node();nodes.push(n);return n;},documentElement:{style:{setProperty(){}}},body:{prepend(){},classList:{add(){}}},querySelector:()=>app,addEventListener(name,fn,options){if(!options)handlers[name]=fn;}};
 const user={id:'owner-ui',name:'Conta UI'},initial=accountState(null,user);let current=structuredClone(initial),server=structuredClone(initial),fail=false,calls=0;
 globalThis.window={mentraSnapshot:()=>structuredClone(current),mentraReplaceState:data=>{current=structuredClone(data);},mentraCloseModal(){},mentraInterrupt(){},addEventListener(){}};
 const store=memoryDraftStore(),sync=createSyncController({userId:user.id,revision:1,store,write:async payload=>{calls++;if(fail)throw Object.assign(Error('Sem rede'),{status:503});server=structuredClone(payload.data);return {revision:2};},onStatus:value=>ui?.update(value)});let ui;
 const platform={user,data:initial},api=async()=>({data:structuredClone(server),revision:1});
 return {async start(){ui=await installSyncUI({sync,store,platform,api,send:async()=>{}});},sync,app,initial,platform,current:()=>current,server:()=>server,calls:()=>calls,setFailure:v=>fail=v,uploadFile:(file,input={})=>handlers.change({target:Object.assign(input,{value:'backup.json',matches:()=>true,files:[file]})}),upload:async(data,ownerId=user.id)=>{const raw=JSON.stringify({format:'mentra-life-account-v1',ownerId,data}),input={value:'backup.json',matches:()=>true,files:[{size:raw.length,text:async()=>raw}]};await handlers.change({target:input});},click:async action=>nodes[1].events.click({preventDefault(){},target:{closest:()=>({dataset:{sync:action}})}}),focuses:()=>focuses,scrolls:()=>scrolls,update:()=>ui.update(sync.status()),panel:()=>nodes[1].innerHTML};
}
test('importação: revisar/cancelar preserva estado e arquivo de outra conta não grava',async t=>{const c=setup(t);await c.start();const imported=structuredClone(c.initial);imported.profile.goal='Objetivo importado';await c.upload(imported);assert.equal(c.app.inert,true);assert.deepEqual(c.current(),c.initial);assert.match(c.panel(),/Revisar restauração/);await c.click('cancel-review');assert.equal(c.app.inert,false);assert.deepEqual(c.current(),c.initial);await c.upload(imported,'other-user');assert.match(c.panel(),/mesma conta/);assert.equal(c.calls(),0);});
test('importação: falha após confirmar mantém conteúdo importado para reenvio, sem trocar pela versão antiga',async t=>{const c=setup(t);await c.start();const imported=structuredClone(c.initial);imported.profile.goal='Conteúdo escolhido na restauração';await c.upload(imported);c.setFailure(true);await c.click('confirm-review');assert.equal(c.sync.status().blocked,true);assert.deepEqual(c.current(),imported);assert.deepEqual(c.sync.status().localCopy.data,imported);assert.deepEqual(c.server(),c.initial);c.setFailure(false);await c.click('retry');assert.equal(c.sync.hasPending(),false);assert.deepEqual(c.server(),imported);assert.equal(c.calls(),2);});
test('importação: leitura antiga que termina depois não substitui o arquivo mais recente',async t=>{
 const c=setup(t);await c.start();let finish;const old=structuredClone(c.initial);old.profile.goal='Arquivo antigo';const recent=structuredClone(c.initial);recent.profile.goal='Arquivo recente';const pending=c.uploadFile({size:100,text:()=>new Promise(r=>finish=r)});await c.upload(recent);finish(JSON.stringify({format:'mentra-life-account-v1',ownerId:c.platform.user.id,data:old}));await pending;await c.click('confirm-review');assert.equal(c.current().profile.goal,'Arquivo recente');
});
test('importação: sair da tela durante leitura não reabre revisão nem bloqueia a conta',async t=>{
 const c=setup(t);await c.start();let finish;const input={isConnected:true};const pending=c.uploadFile({size:100,text:()=>new Promise(r=>finish=r)},input);input.isConnected=false;finish(JSON.stringify({format:'mentra-life-account-v1',ownerId:c.platform.user.id,data:c.initial}));await pending;assert.equal(c.app.inert,false);assert.doesNotMatch(c.panel(),/Revisar restauração/);assert.equal(c.calls(),0);
});
test('importação: arquivo inválido não bloqueia conta sincronizada nem inventa cópias pendentes',async t=>{
 const c=setup(t);await c.start();await c.uploadFile({size:3,text:async()=>'{bad'});assert.equal(c.app.inert,false);assert.match(c.panel(),/Arquivo JSON inválido/);assert.match(c.panel(),/Nenhuma restauração foi aplicada/);assert.doesNotMatch(c.panel(),/Continuar com o servidor e manter cópias/);assert.deepEqual(c.current(),c.initial);assert.equal(c.calls(),0);
});
test('revisão recebe foco/rolagem uma vez e atualizações de estado não deslocam a leitura',async t=>{
 const c=setup(t);await c.start();const before=c.focuses();await c.upload(c.initial);assert.equal(c.focuses(),before+1);const scrolls=c.scrolls();c.update();assert.equal(c.scrolls(),scrolls);assert.match(c.panel(),/Cancelar restauração/);assert.match(c.panel(),/Confirmar restauração/);
});
