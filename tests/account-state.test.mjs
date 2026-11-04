import test from 'node:test';
import assert from 'node:assert/strict';
import {accountState} from '../dist/account-state.mjs';
test('conta nova começa vazia sem tarefas, contas bancárias ou registros de saúde fictícios',()=>{
 const state=accountState(null,{name:'Pessoa'});for(const key of ['tasks','events','records','documents','inbox','messages','accounts','obligations','budgets','recurrences','journeys'])assert.deepEqual(state[key],[]);assert.deepEqual(state.health.appointments,[]);assert.deepEqual(state.health.medications,[]);assert.equal(state.profile.name,'Pessoa');assert.equal(state.profile.reminders,false);assert.equal(state.plan,null);
});
test('conta existente recebe somente coleções ausentes e preserva conteúdo e originais',()=>{
 const saved={version:4,profile:{name:'Nome escolhido'},tasks:[{id:'t'}],events:[],records:[],documents:[{id:'original',fileData:'BYTES',context:'business'}],inbox:[],messages:[],plan:{id:'legado'}};
 const state=accountState(saved,{name:'Outro nome'});assert.equal(state.profile.name,'Nome escolhido');assert.deepEqual(state.tasks,saved.tasks);assert.deepEqual(state.documents,saved.documents);assert.deepEqual(state.plan,saved.plan);assert.deepEqual(state.accounts,[]);assert.deepEqual(state.health.logs,[]);assert.equal(saved.health,undefined);
 const recorded={...saved,health:{version:1,appointments:[{id:'consulta',title:'Consulta informada'}]}};assert.deepEqual(accountState(recorded,{name:'Pessoa'}).health,recorded.health);
});
test('estado malformado não é substituído por demonstração nem descartado silenciosamente',()=>{
 const saved={profile:{name:'Pessoa'},tasks:[],events:[],records:[],documents:[],inbox:[],messages:[],accounts:'dados desconhecidos'};assert.throws(()=>accountState(saved,{name:'Pessoa'}),/preservados/);assert.equal(saved.accounts,'dados desconhecidos');
});
