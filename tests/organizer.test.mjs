import test from 'node:test';
import assert from 'node:assert/strict';
import {validCalendarDate,addDays,moveMonth,monthCells,taskDraft,setTaskPriority,orderedTasks,eventDraft,localToday,eventFromText} from '../dist/organizer.mjs';
import {calendarMarkup} from '../dist/calendar-ui.mjs';
test('calendário cobre meses reais, anos bissextos e viradas sem alterar o dia pelo fuso',()=>{
 assert.equal(validCalendarDate('2028-02-29'),true);assert.equal(validCalendarDate('2026-02-29'),false);assert.equal(validCalendarDate('2026-04-31'),false);
 assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(moveMonth('2026-01-31',1),'2026-02-28');assert.equal(moveMonth('2028-03-31',-1),'2028-02-29');
 for(const date of ['2026-10-28','2027-01-01','2028-02-29']){const cells=monthCells(date);assert.equal(cells.length,42);assert.equal(new Date(cells[0].date+'T12:00:00Z').getUTCDay(),1);assert.equal(new Set(cells.map(c=>c.date)).size,42);assert.ok(cells.some(c=>c.date===date));}
 assert.equal(localToday(new Date(2026,9,28,23,59)),'2026-10-28');
});
test('tarefas preservam dados, validam prazo e deixam a pessoa escolher no máximo três prioridades',()=>{
 const original={id:'t',title:'Antigo',category:'Pessoal',done:false,priority:true,custom:'preservar'};
 const next=taskDraft({title:' Revisar ',category:'Trabalho',dueDate:'2026-11-01'},original);assert.equal(next.title,'Revisar');assert.equal(next.custom,'preservar');assert.equal(next.priority,true);assert.equal(original.title,'Antigo');
 assert.throws(()=>taskDraft({title:'A',dueDate:'2026-02-30'}));assert.throws(()=>taskDraft({title:'A',category:'desconhecida'}));
 let tasks=Array.from({length:4},(_,i)=>({id:String(i),done:false,priority:false,title:'T'+i}));for(let i=0;i<3;i++)tasks=setTaskPriority(tasks,String(i));assert.throws(()=>setTaskPriority(tasks,'3'),/até três/);tasks=setTaskPriority(tasks,'0');tasks=setTaskPriority(tasks,'3');assert.equal(tasks.filter(t=>t.priority).length,3);
 assert.throws(()=>setTaskPriority([{id:'x',done:true}],'x'),/Reabra/);
 const ordered=orderedTasks([{id:'done',done:true,priority:true},{id:'later',dueDate:'2026-12-01'},{id:'earlier',dueDate:'2026-10-01'},{id:'priority',priority:true}]);assert.deepEqual(ordered.map(t=>t.id),['priority','earlier','later','done']);
});
test('compromissos exigem data e horário informados e preservam o fuso',()=>{
 const raw={title:' Consulta ',date:'2026-11-02',time:'08:30',duration:'30'};assert.deepEqual(eventDraft(raw,{id:'e'},'America/Sao_Paulo'),{id:'e',title:'Consulta',date:'2026-11-02',time:'08:30',duration:30,timeZone:'America/Sao_Paulo'});
 for(const time of ['',undefined,'24:00','8:30'])assert.throws(()=>eventDraft({...raw,time}),/horário/);
 assert.throws(()=>eventDraft({...raw,date:'2026-11-31'}),/data/);assert.throws(()=>eventDraft({...raw,duration:0}),/duração/);
});
test('agenda mostra mês selecionado, navegação, próximos eventos e texto escapado',()=>{
 const html=calendarMarkup({profile:{timezone:'America/Sao_Paulo'},events:[{id:'a',title:'<script>injetado</script>',date:'2027-01-12',time:'09:00',duration:30}]},'2027-01-12');
 assert.match(html,/janeiro de 2027/);assert.match(html,/America\/Sao_Paulo/);assert.match(html,/Próximo mês/);assert.match(html,/data-action="remove-event"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>injetado/);assert.equal((html.match(/class="calendar-day /g)||[]).length,42);
});
test('captura de agenda extrai apenas data e horário explícitos e pede revisão quando houver ambiguidade',()=>{
 assert.deepEqual(eventFromText('Amanhã tenho uma reunião às 14h','2026-12-31'),{type:'event',title:'Amanhã tenho uma reunião às 14h',date:'2027-01-01',time:'14:00',needsReview:true});
 assert.equal(eventFromText('Consulta depois de amanhã às 08:30','2026-10-28').date,'2026-10-30');
 assert.equal(eventFromText('Reunião 02/11/2027 9h15','2026-10-28').time,'09:15');
 assert.equal(eventFromText('Reunião amanhã ou hoje às 14h','2026-10-28').date,'');
 assert.equal(eventFromText('Reunião amanhã das 14h às 15h','2026-10-28').time,'');
 assert.equal(eventFromText('Reunião sem horário','2026-10-28').time,'');assert.equal(eventFromText('Reunião 31/02 às 25h','2026-10-28').date,'');assert.equal(eventFromText('Reunião às 25h','2026-10-28').time,'');
});
