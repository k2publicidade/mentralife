import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEventSeries,reviewSeriesEdit,applySeriesEdit} from '../dist/event-series.mjs';
const make=()=>makeEventSeries({title:'Original',date:'2028-01-31',time:'10:00',duration:30,frequency:'monthly',until:'2028-04-30'},{timeZone:'America/Manaus'});
const patch={title:'Novo nome',time:'11:30',duration:'45'};
test('edição coletiva revisa sem mutar, preserva IDs, datas, fusos e cancelamentos',()=>{
 const events=make();events[1].cancelled=true;const snapshot=structuredClone(events),review=reviewSeriesEdit(events,events[0].seriesId,patch);
 assert.deepEqual(events,snapshot);assert.equal(review.changes.length,3);const next=applySeriesEdit(events,review);
 assert.deepEqual(next[1],events[1]);for(const i of [0,2,3]){assert.equal(next[i].title,'Novo nome');for(const key of ['id','date','timeZone','seriesId','seriesIndex'])assert.equal(next[i][key],events[i][key]);}
});
test('escopo por data inclui somente ocorrências ativas a partir da escolhida',()=>{
 const events=make(),review=reviewSeriesEdit(events,events[0].seriesId,patch,{from:'2028-03-31'}),next=applySeriesEdit(events,review);
 assert.equal(review.changes.length,2);assert.deepEqual(next.slice(0,2),events.slice(0,2));
});
test('nova edição da série invalida revisão e repetir confirmação não sobrescreve',()=>{
 const events=make(),review=reviewSeriesEdit(events,events[0].seriesId,patch);const changed=structuredClone(events);changed[0].time='09:00';assert.throws(()=>applySeriesEdit(changed,review),/mudou/);
 const next=applySeriesEdit(events,review);assert.throws(()=>applySeriesEdit(next,review),/mudou/);
 const other={id:'other',title:'Outra',date:'2028-01-01'};assert.deepEqual(applySeriesEdit([...events,other],review).at(-1),other);
});
test('sem mudanças, campos inválidos e série ausente falham antes de alterar',()=>{
 const events=make();for(const raw of [{...patch,time:''},{...patch,duration:0},{...patch,title:''},events[0]])assert.throws(()=>reviewSeriesEdit(events,events[0].seriesId,raw));
 assert.throws(()=>reviewSeriesEdit(events,'missing',patch));assert.throws(()=>reviewSeriesEdit(events,events[0].seriesId,patch,{from:'bad'}));
});
