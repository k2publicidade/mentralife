import test from 'node:test';
import assert from 'node:assert/strict';
import {AREAS,documentArea,validateDocumentMetadata,filterLibrary,importantDates,reminderDay,describeDays} from '../dist/library-core.mjs';
import {reminderPlan} from '../server/reminder-plan.mjs';
import {attentionItems,searchIndex} from '../dist/insights.mjs';

test('Meus Arquivos tem três áreas e documentos antigos continuam em Documentos',()=>{
 assert.deepEqual(Object.keys(AREAS),['documentos','contratos','garantias']);
 assert.equal(documentArea({}),'documentos');assert.equal(documentArea({area:'contratos'}),'contratos');assert.equal(documentArea({area:'xyz'}),'documentos');
 assert.equal(documentArea({area:'garantias',category:'Recibos e comprovantes'}),'documentos');
 const docs=[{id:'a',title:'RG',trashed:false},{id:'b',title:'Aluguel',area:'contratos',trashed:false},{id:'c',title:'Geladeira',area:'garantias',trashed:false}];
 assert.deepEqual(filterLibrary(docs,{area:'contratos'}).map(d=>d.id),['b']);assert.deepEqual(filterLibrary(docs,{area:'documentos'}).map(d=>d.id),['a']);
});
test('data importante e lembrete são validados',()=>{
 const base={title:'Aluguel',context:'personal',category:'Aluguel',area:'contratos'};
 const ok=validateDocumentMetadata({...base,importantDate:'2027-02-28',remind:'on',remindDaysBefore:'30'});
 assert.equal(ok.remind,true);assert.equal(ok.remindDaysBefore,30);assert.equal(ok.dateLabel,'Vencimento do contrato');assert.equal(reminderDay(ok),'2027-01-29');
 const none=validateDocumentMetadata({...base,remind:'on'});assert.equal(none.remind,false);assert.equal(none.importantDate,'');
 assert.throws(()=>validateDocumentMetadata({...base,importantDate:'2027-02-30'}),/data importante válida/);
 assert.throws(()=>validateDocumentMetadata({...base,importantDate:'2027-02-28',remind:'on',remindDaysBefore:'4'}),/antecedência/);
 assert.throws(()=>validateDocumentMetadata({...base,area:'outra'}),/Documentos, Contratos ou Garantias/);
 assert.equal(validateDocumentMetadata({...base,area:'garantias'},{category:'Recibos e comprovantes'}).area,'documentos');
});
test('próximas datas, textos e alerta em Hoje',()=>{
 const docs=[{id:'b',title:'Aluguel',area:'contratos',importantDate:'2026-11-20',dateLabel:'Vencimento do contrato',remind:true,remindDaysBefore:30},{id:'c',title:'Geladeira',area:'garantias',importantDate:'2027-06-01'},{id:'d',title:'Velho',importantDate:'2026-11-20',trashed:true}];
 assert.deepEqual(importantDates(docs,'2026-11-13').map(x=>x.doc.id),['b','c']);
 assert.equal(describeDays(0),'é hoje');assert.equal(describeDays(7),'em 7 dias');assert.equal(describeDays(-2),'venceu há 2 dias');
 const item=attentionItems({documents:docs},'2026-11-13').find(i=>i.id==='files-dates');assert.equal(item.route,'arquivos/contratos');assert.match(item.detail,/Aluguel/);
 assert.equal(attentionItems({documents:[docs[1]]},'2026-11-13').some(i=>i.id==='files-dates'),false);
 const found=searchIndex({documents:docs}).find(i=>i.title==='Geladeira');assert.equal(found.type,'Garantia');assert.equal(found.route,'arquivos/garantias');
});
test('a Mentra agenda aviso antecipado e no dia, só quando pedido',()=>{
 const state={documents:[{id:'b',title:'Aluguel',area:'contratos',importantDate:'2026-12-20',remind:true,remindDaysBefore:7},{id:'c',importantDate:'2026-12-20',remind:false},{id:'d',importantDate:'2026-12-20',remind:true,trashed:true}]};
 const plan=reminderPlan(state,{},Date.parse('2026-11-13T12:00:00Z'));
 assert.deepEqual(plan.map(p=>[p.key.split(':').slice(0,3).join(':'),new Date(p.dueAt).toISOString(),p.url]),[['document:b:before','2026-12-13T12:00:00.000Z','/#/arquivos/contratos'],['document:b:day','2026-12-20T12:00:00.000Z','/#/arquivos/contratos']]);
 assert.equal(reminderPlan(state,{tasks:false},Date.parse('2026-11-13T12:00:00Z')).length,0);
});
