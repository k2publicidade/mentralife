import test from 'node:test';
import assert from 'node:assert/strict';
import {compareStates} from '../dist/sync-review.mjs';
test('comparação identifica adições, remoções, substituições e mudanças de configuração',()=>{
 const remote={tasks:[{id:'a',title:'Título antigo'},{id:'b',title:'A remover'}],documents:[],profile:{name:'Antigo'}},local={tasks:[{id:'a',title:'Título novo'},{id:'c',title:'A adicionar'}],documents:[],profile:{name:'Novo'}};
 const changes=compareStates(local,remote);assert.equal(changes.length,4);assert.ok(changes.some(c=>c.type==='Remover'&&c.title==='A remover'));assert.ok(changes.some(c=>c.type==='Adicionar'&&c.title==='A adicionar'));assert.ok(changes.some(c=>c.type==='Substituir'&&c.title==='Título novo'));assert.ok(changes.some(c=>c.area==='Perfil'));
 assert.deepEqual(compareStates(local,structuredClone(local)),[]);
});
test('revisão apresenta campos alterados sem expor bytes do arquivo no resumo',()=>{
 const remote={documents:[{id:'d',title:'Contrato',favorite:false,fileData:'ORIGINAL'}]},local={documents:[{id:'d',title:'Contrato',favorite:true,fileData:'ORIGINAL'}]},change=compareStates(local,remote)[0];assert.deepEqual(change.fields,[{label:'Favorito',from:'Não',to:'Sim'}]);
 local.documents[0].fileData='NOVO CONTEUDO';assert.ok(!JSON.stringify(compareStates(local,remote)).includes('NOVO CONTEUDO'));
});
test('comparação não considera mudança de ordem como conteúdo idêntico',()=>{
 const a={tasks:[{id:'a',title:'A'},{id:'b',title:'B'}]},b={tasks:[...a.tasks].reverse()};assert.ok(compareStates(a,b).some(c=>c.type==='Reordenar'));
});
test('revisão de perfil revela objetivo, fuso e consentimento de notas da IA',()=>{
 const remote={profile:{goal:'Objetivo atual',timeZone:'America/Sao_Paulo',memoryEnabled:false,aiMemory:''}},local={profile:{goal:'Objetivo importado',timeZone:'UTC',memoryEnabled:true,aiMemory:'Notas escolhidas'}};
 const change=compareStates(local,remote)[0];assert.equal(change.title,'Preferências da conta');assert.ok(change.fields.some(f=>f.label==='Objetivo'&&f.from==='Objetivo atual'&&f.to==='Objetivo importado'));assert.ok(change.fields.some(f=>f.label==='Usar notas nas respostas da IA'&&f.from==='Não'&&f.to==='Sim'));assert.ok(change.fields.some(f=>f.label==='Notas para a IA'&&f.from==='Em branco'));
});
test('revisão de saúde e Momentos apresenta registros e opções que serão alterados',()=>{
 const remote={health:{appointments:[{id:'a',title:'Consulta',time:'10:00'},{id:'b',title:'Exame'}]},moments:{christian:false,periods:{morning:{time:'08:00'}}}},local=structuredClone(remote);local.health.appointments[0].time='11:00';local.health.appointments.pop();local.moments.christian=true;local.moments.periods.morning.time='09:00';
 const changes=compareStates(local,remote);assert.ok(changes[0].fields.some(f=>f.label.includes('Consulta / Horário')&&f.to==='11:00'));assert.ok(changes[0].fields.some(f=>f.label.includes('Remover')&&f.from==='Exame'));assert.ok(changes[1].fields.some(f=>f.label==='Conteúdo cristão'&&f.to==='Sim'));
});
test('resumo identifica abreviações e continua sem revelar bytes de originais aninhados',()=>{
 const changes=compareStates({health:{note:'a'.repeat(200),fileData:'PRIVATE-NEW'}},{health:{note:'b'.repeat(200),fileData:'PRIVATE-OLD'}});assert.match(changes[0].fields[0].to,/abreviado/);assert.doesNotMatch(JSON.stringify(changes),/PRIVATE-NEW|PRIVATE-OLD/);
});
