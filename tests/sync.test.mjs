import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openDraftStore} from '../dist/draft-store.mjs';
import {createSyncController} from '../dist/sync-controller.mjs';
const freshStore=()=>openDraftStore({indexedDB:new IDBFactory(),name:'test-'+crypto.randomUUID()});

test('ação remota aguarda gravações, adota revisão do servidor e impede sobrescrita durante o pedido',async()=>{
 const store=await freshStore(),writes=[];const sync=createSyncController({userId:'a',revision:0,store,write:async p=>{writes.push(p);return {revision:p.revision+1};}});
 sync({tasks:['manual']});let applied;
 const response=await sync.remote(async revision=>{assert.equal(revision,1);assert.equal(sync({tasks:['não sobrescrever']}),false);assert.equal(sync.hasPending(),true);return {state:{revision:2,data:{tasks:['manual','IA']}}};},r=>{applied=r.state.data;});
 assert.deepEqual(applied.tasks,['manual','IA']);assert.equal(response.state.revision,2);assert.equal(sync.hasPending(),false);
 sync({tasks:['manual','IA','próxima']});await sync.flush();assert.deepEqual(writes.map(p=>p.revision),[0,2]);store.close();
});

test('erro remoto mantém revisão e libera bloqueio para repetir o mesmo pedido',async()=>{
 const store=await freshStore(),sync=createSyncController({userId:'a',revision:3,store,write:async p=>({revision:p.revision+1})});
 await assert.rejects(sync.remote(async()=>{throw Error('Sem rede');},()=>{}),/Sem rede/);assert.equal(sync.status().revision,3);assert.equal(sync.hasPending(),false);
 await assert.rejects(sync.remote(async()=>({state:{revision:2,data:{}}}),()=>{throw Error('Não aplicar');}),/versão/);
 assert.equal(sync({tasks:['preservar']}),true);await sync.flush();assert.equal(sync.status().revision,4);store.close();
});
test('cópias locais são isoladas por conta e um ACK antigo não apaga edição mais recente',async()=>{
 const store=await freshStore(),a={key:'a:one',userId:'a',writerId:'one',operationId:'old',baseRevision:0,updatedAt:1,data:{title:'antigo'}};
 await store.put(a);await store.put({...a,operationId:'new',updatedAt:2,data:{title:'novo'}});await store.put({...a,key:'b:one',userId:'b'});await store.acknowledge(a.key,'old',1);
 const drafts=await store.list('a');assert.equal(drafts.length,1);assert.equal(drafts[0].data.title,'novo');assert.equal(drafts[0].baseRevision,1);assert.equal((await store.list('b')).length,1);
 await store.remove(a.key,'old');assert.equal((await store.list('a')).length,1);await store.acknowledge(a.key,'new',2);assert.equal((await store.list('a')).length,0);await store.clearUser('b');assert.equal((await store.list('b')).length,0);store.close();
});
test('gravações rápidas são serializadas com revisão correta e cópia local é removida apenas após confirmação',async()=>{
 const store=await freshStore(),writes=[];let revision=0;const sync=createSyncController({userId:'a',revision,store,write:async payload=>{writes.push(payload);assert.equal(payload.revision,revision);return {revision:++revision};}});
 sync({tasks:['primeira']});sync({tasks:['primeira','segunda']});sync({tasks:['primeira','segunda','terceira']});assert.equal(await sync.flush(),true);assert.deepEqual(writes.map(w=>w.revision),[0,1,2]);assert.equal((await store.list('a')).length,0);assert.equal(sync.status().phase,'idle');store.close();
});
test('sem conexão: edições continuam aceitas, ficam guardadas no aparelho e a mais recente é enviada ao reconectar',async()=>{
 const store=await freshStore(),seen=[];let fail=true;const sync=createSyncController({userId:'a',revision:0,store,write:async payload=>{seen.push(payload);if(fail)throw new TypeError('Sem rede');return {revision:1};}});
 sync({title:'a preservar'});assert.equal(await sync.flush(),false);assert.equal(sync.status().localCopySaved,true);assert.equal(sync.status().phase,'offline');assert.equal(sync.status().blocked,false,'sem conexão não trava a edição');
 assert.equal(sync({title:'editado offline'}),true);await sync.flush();assert.equal(seen.length,1,'offline não tenta a rede a cada edição');const draft=(await store.list('a'))[0];assert.equal(draft.data.title,'editado offline','a edição feita sem conexão fica guardada no aparelho');
 fail=false;assert.equal(await sync.retry(),true);assert.equal(seen.length,2);assert.equal(seen[1].data.title,'editado offline','ao reconectar envia a versão mais recente');assert.equal(sync.status().phase,'idle');assert.equal((await store.list('a')).length,0);store.close();
});
test('falha durante fila retém alterações enfileiradas posteriores para recuperação',async()=>{
 const store=await freshStore(),sync=createSyncController({userId:'a',revision:0,store,write:async()=>{throw Error('Falha');}});
 sync({value:1});sync({value:2});sync({value:3});await sync.flush();const draft=(await store.list('a'))[0];assert.equal(draft.data.value,3);assert.equal(sync.status().localCopy.data.value,3);store.close();
});
test('conflito nunca reenvia automaticamente sobre versão mais recente e substituição usa revisão revisada',async()=>{
 const store=await freshStore();let remoteRevision=5;const writes=[];const sync=createSyncController({userId:'a',revision:2,store,write:async payload=>{writes.push(payload);if(payload.revision!==remoteRevision)throw Object.assign(Error('Conflito'),{status:409});return {revision:++remoteRevision};}});
 sync({value:'local'});await sync.flush();assert.equal(sync.status().phase,'conflict');assert.equal(writes.length,1);assert.equal((await store.list('a')).length,1);assert.equal(await sync.replace({value:'local'},5),true);assert.equal(writes[1].revision,5);assert.equal((await store.list('a')).length,0);store.close();
});
test('recuperação após nova instância mantém revisão antiga até confirmação e não aceita cópia de outra conta',async()=>{
 const store=await freshStore(),record={key:'a:old',userId:'a',operationId:crypto.randomUUID(),baseRevision:1,updatedAt:1,data:{value:'recuperar'}};await store.put(record);
 const sync=createSyncController({userId:'a',revision:2,store,write:async payload=>{assert.equal(payload.revision,1);assert.equal(payload.operationId,record.operationId);return {revision:2};}});
 await assert.rejects(sync.adopt({...record,userId:'b'}),/outra conta/);assert.equal(await sync.adopt(record),true);assert.equal((await store.list('a')).length,0);store.close();
});
test('falha de armazenamento não envia dado sem cópia e descarte não grava sobre servidor',async()=>{
 const store=await freshStore();let writes=0;const broken={...store,put:async()=>{throw Object.assign(Error('Sem espaço'),{name:'QuotaExceededError'});}};
 const sync=createSyncController({userId:'a',revision:0,store:broken,write:async()=>{writes++;return {revision:1};}});sync({value:'memória'});await sync.flush();assert.equal(writes,0);assert.equal(sync.status().phase,'storage');assert.equal(sync.status().localCopy.data.value,'memória');await sync.discard(7);assert.equal(sync.status().revision,7);assert.equal(writes,0);store.close();
});
