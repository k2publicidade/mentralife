import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceImportUI} from '../dist/finance-import-ui.mjs';
import {migrateFinanceState} from '../dist/finance.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function wait(predicate){const start=Date.now();while(!predicate()){if(Date.now()-start>2000)throw Error('Interface não chegou à etapa esperada.');await tick();}}
function fixture(t){
 const previous={document:globalThis.document,FormData:globalThis.FormData};t.after(()=>{for(const[k,v]of Object.entries(previous))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const error={textContent:''};globalThis.document={querySelector:s=>s==='#csv-error'?error:null};globalThis.FormData=class{constructor(f){this.values=f.values;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}getAll(k){return Array.isArray(this.values[k])?this.values[k]:this.values[k]===undefined?[]:[this.values[k]];}};
 let html='',state=migrateFinanceState({records:[],version:5}),saves=0,flush=true;const downloads=[];let ui;
 ui=createFinanceImportUI({getState:()=>state,setState:v=>state=v,save:()=>saves++,flush:async()=>flush,modal:(_,body)=>html=body,closeModal:()=>ui.cancelPending(),render:()=>{},toast:()=>{},download:(...args)=>downloads.push(args)});
 const form=(id,values,extra={})=>({id,values,checkValidity:()=>true,...extra});
 async function load(){ui.open();const file=new File(['Data;Descrição;Valor;ID\n2026-10-29;<script>;-10,00;a'], 'synthetic.csv');ui.handleSubmit(form('csv-file-form',{accountId:'itau',delimiter:';'},{querySelector:()=>({files:[file]})}));await wait(()=>html.includes('csv-mapping-form'));}
 async function review(){ui.handleSubmit(form('csv-mapping-form',{date:'0',title:'1',amount:'2',externalId:'3',amountFormat:'brl',dateFormat:'iso',paymentMethod:'other',status:'actual'}));await wait(()=>html.includes('csv-confirm-form'));}
 const confirm=async(selected=['0'])=>{ui.handleSubmit(form('csv-confirm-form',{rows:selected,confirmed:'on'}));await tick();};
 return {ui,error,downloads,load,review,confirm,form,html:()=>html,state:()=>state,saves:()=>saves,block:()=>flush=false};
}
test('leitura e revisão não salvam; cancelar invalida a confirmação e escapa dados',async t=>{const c=fixture(t);await c.load();await c.review();assert.match(c.html(),/&lt;script&gt;/);assert.doesNotMatch(c.html(),/<script>/);assert.equal(c.saves(),0);c.ui.handleClick('csv-close');await c.confirm();assert.equal(c.saves(),0);});
test('confirmar duas vezes importa uma vez e o modelo é CSV protegido',async t=>{const c=fixture(t);await c.load();await c.review();await c.confirm();await c.confirm();assert.equal(c.saves(),1);assert.equal(c.state().records.length,1);assert.equal(c.state().records[0].cents,1000);c.ui.handleClick('csv-template');assert.equal(c.downloads[0][0],'mentra-modelo-importacao.csv');});
test('alteração financeira após revisão impede importação',async t=>{const c=fixture(t);await c.load();await c.review();c.state().accounts[0].archived=true;await c.confirm();assert.match(c.error.textContent,/mudou/);assert.equal(c.saves(),0);});
test('sincronização bloqueada e seleção vazia não alteram o controle',async t=>{const c=fixture(t);await c.load();await c.review();await c.confirm([]);assert.match(c.error.textContent,/Selecione/);assert.equal(c.saves(),0);c.block();await c.confirm();assert.match(c.error.textContent,/sincronização/);assert.equal(c.saves(),0);});
test('fechar durante leitura impede reaparecer revisão ou salvar resposta tardia',async t=>{const c=fixture(t);c.ui.open();let finish;const file={name:'synthetic.csv',size:50,arrayBuffer:()=>new Promise(r=>finish=r)};c.ui.handleSubmit(c.form('csv-file-form',{accountId:'itau',delimiter:';'},{querySelector:()=>({files:[file]})}));c.ui.cancelPending();finish(new TextEncoder().encode('Data;Descrição;Valor\n2026-10-29;A;1,00').buffer);await tick();await tick();assert.doesNotMatch(c.html(),/csv-mapping-form/);assert.equal(c.saves(),0);});
