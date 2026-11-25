import test from 'node:test';
import assert from 'node:assert/strict';
import {accountAIContext} from '../server/ai-context.mjs';

test('contexto individual usa campos permitidos e exclui saúde, documentos e segredos',()=>{
 const payload=accountAIContext({profile:{name:'Ana',goal:'Organizar mudança',password:'SECRET'},tasks:[{title:'Reservar transporte',done:false,token:'SECRET'},{title:'Feita',done:true}],records:[{title:'Frete',cents:30000}],health:{note:'SECRET'},documents:[{fileData:'SECRET'}],messages:[{text:'SECRET'}]});
 assert.ok(!payload.includes('SECRET'));
 const result=JSON.parse(payload);assert.equal(result.profile.name,'Ana');assert.equal(result.tasks.total,1);assert.equal(result.tasks.included[0].title,'Reservar transporte');assert.equal(result.records.included[0].cents,30000);
 assert.equal(JSON.parse(accountAIContext(null)).tasks.total,0);
});

test('contexto sinaliza recorte e limita textos sem mutar a conta',()=>{
 const state={tasks:Array.from({length:100},()=>({title:'x'.repeat(500),done:false}))};
 const result=JSON.parse(accountAIContext(state));assert.equal(result.tasks.total,100);assert.equal(result.tasks.included.length,20);assert.equal(result.tasks.truncated,true);assert.equal(result.tasks.included[0].title.length,180);assert.equal(state.tasks[0].title.length,500);
});

test('totais financeiros incluem registros além do recorte e separam previsões, transferências e baixas',()=>{
 const records=Array.from({length:25},(_,i)=>({title:'Despesa '+i,cents:100,type:'expense',status:'actual',date:'2026-11-05'}));
 records.push({cents:50000,type:'income',status:'actual',date:'2026-11-01'}, {cents:8000,type:'income',status:'estimated',date:'2026-11-06'}, {cents:9000,type:'transfer',status:'actual',date:'2026-11-01'}, {cents:600,type:'expense',status:'actual',date:'2026-10-31'}, {cents:'900',type:'expense',status:'actual',date:'2026-11-05'}, {cents:500,type:'expense',status:'actual',date:'2026-02-31'});
 const state={records,obligations:[{kind:'payable',cents:5000,settledCents:2000,dueDate:'2026-11-10'}, {kind:'payable',cents:8000,dueDate:'2026-11-10',status:'cancelled'}, {kind:'receivable',cents:4000,settledCents:4000,dueDate:'2026-11-10'}]};
 const c=JSON.parse(accountAIContext(state,new Date('2026-11-05T12:00:00Z')));
 assert.equal(c.records.included.length,20);assert.equal(c.finances.period.expenseCents,2500);assert.equal(c.finances.period.incomeCents,50000);assert.equal(c.finances.period.netFlowCents,47500);assert.equal(c.finances.period.estimatedIncomeCents,8000);assert.equal(c.finances.allTime.expenseCents,3100);assert.equal(c.finances.period.outstandingPayableCents,3000);assert.equal(c.finances.period.outstandingReceivableCents,0);assert.equal(c.finances.invalidRecordsExcluded,2);assert.equal(c.obligations.total,1);
});

test('agenda exclui cancelados e prioriza próximos eventos; tarefas respeitam prioridades e busca além do recorte',()=>{
 const state={tasks:Array.from({length:30},(_,i)=>({title:i===29?'Revisar contrato violeta':'Tarefa '+i,done:false,priority:i===25})),events:[{title:'Cancelado',date:'2026-11-05',cancelled:true},{title:'Passado',date:'2026-01-01'},{title:'Amanhã',date:'2026-11-06'},{title:'Hoje',date:'2026-11-05'}]};
 const now=new Date('2026-11-05T12:00:00Z'),before=structuredClone(state),c=JSON.parse(accountAIContext(state,now));assert.equal(c.events.total,3);assert.equal(c.events.included[0].title,'Hoje');assert.equal(c.tasks.included[0].title,'Tarefa 25');
 const search=JSON.parse(accountAIContext(state,now,{question:'Como revisar o contrato violeta?'}));assert.equal(search.tasks.included[0].title,'Revisar contrato violeta');assert.deepEqual(state,before);
});

test('mês financeiro acompanha fuso, mês anterior e período explícito sem usar fuso do servidor',()=>{
 const state={profile:{timeZone:'America/Sao_Paulo'}};const now=new Date('2026-11-01T01:00:00Z');
 let c=JSON.parse(accountAIContext(state,now));assert.equal(c.today,'2026-10-31');assert.equal(c.finances.period.month,'2026-10');
 c=JSON.parse(accountAIContext(state,now,{question:'Analise o mês passado'}));assert.equal(c.finances.period.month,'2026-09');
 c=JSON.parse(accountAIContext(state,now,{question:'Quero revisar 2025-03'}));assert.equal(c.finances.period.month,'2025-03');
 assert.equal(JSON.parse(accountAIContext({profile:{timeZone:'inválido'}},now)).timeZone,'UTC');
});

test('plano selecionado inclui recursos, dificuldade e todas as etapas até o limite do produto',()=>{
 const journeys=Array.from({length:25},(_,i)=>({id:'j'+i,title:'Plano '+i,resources:'Celular',barrier:'Pouco tempo',time:5,status:'paused',steps:Array.from({length:100},(_,n)=>({title:'Etapa '+n,description:'d'.repeat(600),status:n===99?'doing':'todo'}))}));
 const c=JSON.parse(accountAIContext({journeys},new Date(),{journeyId:'j24'}));assert.equal(c.selectedJourney.title,'Plano 24');assert.equal(c.selectedJourney.barrier,'Pouco tempo');assert.equal(c.selectedJourney.time,5);assert.equal(c.selectedJourney.status,'paused');assert.equal(c.selectedJourney.steps.included.length,100);assert.equal(c.selectedJourney.steps.included[99].status,'doing');assert.equal(c.selectedJourney.steps.included[0].description.length,600);assert.equal(c.selectedJourney.steps.truncated,false);
 assert.equal(JSON.parse(accountAIContext({journeys},new Date(),{journeyId:'outra-conta'})).selectedJourney,null);
});
