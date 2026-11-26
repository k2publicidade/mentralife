import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccountQuery} from '../server/ai-query.mjs';
import {accountAIContext} from '../server/ai-context.mjs';
const now=new Date('2026-11-05T12:00:00Z');
const query=(text,today='2026-11-05',state={})=>resolveAccountQuery(state,text,today);

test('consultas aceitam intervalos ISO, brasileiros e meses por extenso com limites inclusivos',()=>{
 for(const text of ['de 2026-10-03 a 2026-11-04','entre 03/10/2026 e 04/11/2026','de 3 de outubro de 2026 a 4 de novembro de 2026']){
  const q=query(text);assert.equal(q.needsClarification,false,text);assert.equal(q.periods[0].fromDate,'2026-10-03');assert.equal(q.periods[0].toDate,'2026-11-04');
 }
 assert.equal(query('de 01/11 a 05/11').periods[0].fromDate,'2026-11-01');
 assert.equal(query('gastos em março de 2025').periods[0].month,'2025-03');
 assert.equal(query('de outubro a novembro de 2026').periods[0].toDate,'2026-11-30');
 assert.equal(query('gastos em novembro passado').periods[0].month,'2025-11');
});

test('períodos relativos usam o dia da conta, semana de segunda a domingo e virada de ano',()=>{
 const cases=[['gastos hoje','2026-11-05','2026-11-05'],['gastos ontem','2026-11-04','2026-11-04'],['gastos nos últimos 7 dias','2026-10-30','2026-11-05'],['gastos nesta semana','2026-11-02','2026-11-08'],['gastos na semana passada','2026-10-26','2026-11-01'],['gastos no trimestre passado','2026-07-01','2026-09-30'],['gastos no segundo trimestre de 2025','2025-04-01','2025-06-30'],['gastos no ano passado','2025-01-01','2025-12-31'],['gastos desde 01/11/2026','2026-11-01','2026-11-05']];
 for(const [text,from,to] of cases){const q=query(text);assert.equal(q.needsClarification,false,text);assert.equal(q.periods[0].fromDate,from,text);assert.equal(q.periods[0].toDate,to,text);}
 assert.equal(query('gastos no mês passado','2026-01-02').periods[0].month,'2025-12');
 assert.equal(query('gastos no próximo mês','2026-12-02').periods[0].month,'2027-01');
 assert.equal(query('gastos nos últimos 2 meses').periods[0].fromDate,'2026-10-01');
 assert.equal(query('minha próxima tarefa').needsClarification,false);
});

test('datas inválidas, intervalos invertidos, anos curtos e escopos desconhecidos pedem esclarecimento',()=>{
 for(const text of ['de 31/02/2026 a 05/11/2026','de 2026-11-06 a 2026-11-01','gastos em 2026-13','gastos na última quinzena','gastos nos últimos 99999 dias','gastos em 05/11/26','gastos na conta que não existe','gastos da categoria desconhecida'])assert.equal(query(text).needsClarification,true,text);
});

function financeState(){
 return {profile:{name:'QA',timeZone:'America/Sao_Paulo'},accounts:[{id:'a',name:'Conta Pessoal',openingBalanceCents:10000,openingBalanceDate:'2026-10-01'},{id:'b',name:'Conta Empresa',openingBalanceCents:null}],records:[
 ...Array.from({length:100},(_,i)=>({id:'r'+i,title:'Compra '+i,date:'2026-11-05',type:'expense',status:'actual',cents:100,category:'Alimentação',accountId:'a'})),
 {title:'Outra conta',date:'2026-11-05',type:'expense',status:'actual',cents:9000,category:'Alimentação',accountId:'b'},
 {title:'Outra categoria',date:'2026-11-05',type:'expense',status:'actual',cents:7000,category:'Transporte',accountId:'a'},
 {title:'Gasolina distante no histórico',date:'2026-10-31',type:'expense',status:'actual',cents:500,category:'Transporte',accountId:'a'},
 {title:'Renda',date:'2026-11-01',type:'income',status:'actual',cents:40000,category:'Trabalho',accountId:'a'},
 {title:'Transferência interna',date:'2026-11-02',type:'transfer',status:'actual',cents:1000,fromAccountId:'a',toAccountId:'b'}],obligations:[{title:'A pagar',dueDate:'2026-11-03',kind:'payable',cents:8000,settledCents:3000,category:'Alimentação',accountId:'a'}]};
}
const context=(state,text)=>JSON.parse(accountAIContext(state,now,{question:text}));

test('totais por categoria, conta e intervalo incluem todo o conjunto, não apenas vinte detalhes',()=>{
 const s=financeState(),before=structuredClone(s),c=context(s,'Quanto gastei na Conta Pessoal na categoria Alimentação entre 01/11/2026 e 05/11/2026?');
 assert.equal(c.records.included.length,20);assert.equal(c.finances.period.expenseCents,10000);assert.equal(c.finances.period.outstandingPayableCents,5000);assert.deepEqual(c.finances.query.accountIds,['a']);assert.deepEqual(c.finances.query.categoryNames,['Alimentação']);assert.deepEqual(s,before);
 assert.equal(context(s,'Quanto gastei em novembro de 2026 na Conta Empresa?').finances.period.expenseCents,9000);
 assert.equal(context(s,'Quanto gastei em todo o histórico com gasolina?').finances.period.expenseCents,500);
});

test('comparações de meses mantêm filtros de conta/categoria e totais independentes',()=>{
 const c=context(financeState(),'Compare outubro de 2026 com novembro de 2026 na Conta Pessoal na categoria Transporte');
 assert.equal(c.finances.query.mode,'comparison');assert.deepEqual(c.finances.comparisons.map(p=>p.expenseCents),[500,7000]);assert.equal(c.finances.comparisons[0].month,'2026-10');assert.equal(c.finances.comparisons[1].month,'2026-11');
});

test('saldos manuais usam saldo inicial e transferências sem confundir categoria e fluxo de caixa',()=>{
 const c=context(financeState(),'Qual meu saldo na Conta Pessoal em novembro de 2026?'),a=c.finances.accounts.included[0];assert.equal(a.known,true);assert.equal(a.balanceCents,31500);assert.equal(c.finances.period.netFlowCents,23000);
 const b=context(financeState(),'Qual o saldo na Conta Empresa?').finances.accounts.included[0];assert.equal(b.known,false);assert.equal(b.balanceCents,null);assert.equal(b.movementCents,-8000);
 const category=context(financeState(),'Qual o saldo na Conta Pessoal da categoria Transporte em novembro?');assert.equal(category.finances.accounts.included[0].balanceCents,31500);
});

test('consulta ambígua não expõe totais genéricos como resposta à conta ou período não identificado',()=>{
 const c=context(financeState(),'Quanto gastei na conta Desconhecida em novembro?');assert.equal(c.finances.query.needsClarification,true);assert.equal(c.finances.period,null);assert.equal(c.finances.allTime,null);assert.equal(c.finances.accounts,null);
 const s=financeState();s.accounts.push({...s.accounts[0],id:'duplicate-name'});assert.equal(context(s,'Gastos na Conta Pessoal').finances.query.needsClarification,true);
});
