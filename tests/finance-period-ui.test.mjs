import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinanceUI} from '../dist/finance-ui.mjs';
import {accountState} from '../dist/account-state.mjs';

function fixture(){
 let today='2026-11-05';const state=accountState(null,{name:'QA'});
 state.records=[{id:'oct',title:'Despesa outubro',cents:1000,date:'2026-10-05',type:'expense',status:'actual'}, {id:'nov',title:'Despesa novembro',cents:5000,date:'2026-11-05',type:'expense',status:'actual'}, {id:'dec',title:'Despesa dezembro',cents:9000,date:'2026-12-05',type:'expense',status:'actual'}];
 const noop=()=>'',ui=createFinanceUI({today:()=>today,getState:()=>state,getRoute:()=> 'dinheiro/lancamentos',render:noop,toast:noop,icon:noop,button:noop,link:noop,badge:noop,heading:noop,empty:noop,section:(title,body)=>body});
 return {ui,date:value=>today=value,change:(id,value)=>ui.handleChange({target:{id,value}})};
}

test('financeiro abre no mês operacional e mostra os lançamentos desse mês',()=>{
 const f=fixture(),html=f.ui.renderFinance();assert.match(html,/id="finance-month"[^>]*value="2026-11"/);assert.match(html,/id="finance-from"[^>]*value="2026-11-01"/);assert.match(html,/id="finance-to"[^>]*value="2026-11-30"/);assert.match(html,/Despesa novembro/);assert.doesNotMatch(html,/Despesa outubro|Despesa dezembro/);
});

test('período automático acompanha virada do mês sem substituir filtro escolhido pelo usuário',()=>{
 const f=fixture();f.date('2026-12-01');let html=f.ui.renderFinance();assert.match(html,/value="2026-12"/);assert.match(html,/Despesa dezembro/);
 f.change('finance-month','2026-10');f.date('2027-01-01');html=f.ui.renderFinance();assert.match(html,/value="2026-10"/);assert.match(html,/Despesa outubro/);assert.doesNotMatch(html,/Despesa dezembro/);
});

test('intervalo manual permanece selecionado e mês automático trata fevereiro bissexto',()=>{
 const f=fixture();f.change('finance-from','2026-10-01');f.date('2026-12-01');let html=f.ui.renderFinance();assert.match(html,/id="finance-from"[^>]*value="2026-10-01"/);assert.match(html,/Despesa outubro/);assert.match(html,/Despesa novembro/);
 const leap=fixture();leap.date('2028-02-01');html=leap.ui.renderFinance();assert.match(html,/id="finance-to"[^>]*value="2028-02-29"/);
});
