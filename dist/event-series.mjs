import {eventDraft,validCalendarDate,addDays,moveMonth} from './organizer.mjs';
export function makeEventSeries(raw,{timeZone,id=()=>crypto.randomUUID()}={}){
 const base=eventDraft(raw,{},timeZone),frequency=raw.frequency||'none';
 if(!['none','daily','weekly','monthly'].includes(frequency))throw Error('Repetição inválida.');
 if(frequency==='none')return [{...base,id:id()}];
 if(!validCalendarDate(raw.until)||raw.until<base.date)throw Error('Informe a última data da série, a partir do primeiro compromisso.');
 const seriesId=id(),events=[];let date=base.date,index=0;
 while(date<=raw.until){if(events.length===100)throw Error('A série pode ter no máximo 100 compromissos. Reduza o período.');events.push({...base,id:id(),date,seriesId,seriesIndex:index,seriesFrequency:frequency,seriesUntil:raw.until});index++;date=frequency==='monthly'?moveMonth(base.date,index):addDays(base.date,index*(frequency==='weekly'?7:1));}
 return events;
}
export function appendEventSeries(events,proposed){if(proposed.some(p=>events.some(e=>e.id===p.id)))return events;return [...events,...structuredClone(proposed)];}
export function cancelEventSeries(events,seriesId){if(!seriesId||!events.some(e=>e.seriesId===seriesId))throw Error('Série não encontrada.');return events.map(e=>e.seriesId===seriesId?{...e,cancelled:true}:e);}
export function reviewSeriesEdit(events,seriesId,raw,{from=''}={}){
 if(from&&!validCalendarDate(from))throw Error('Data inicial inválida.');
 const selected=events.filter(e=>e.seriesId===seriesId&&!e.cancelled&&(!from||e.date>=from));
 if(!seriesId||!selected.length)throw Error('Nenhuma ocorrência ativa neste período.');
 const changes=selected.map(before=>({before:structuredClone(before),after:eventDraft({...before,title:raw.title,time:raw.time,duration:raw.duration},before,before.timeZone)})).filter(({before,after})=>JSON.stringify(before)!==JSON.stringify(after));
 if(!changes.length)throw Error('Nenhuma alteração encontrada.');
 return {seriesId,from,signature:JSON.stringify(events.filter(e=>e.seriesId===seriesId)),changes};
}
export function applySeriesEdit(events,review){
 if(!review||review.signature!==JSON.stringify(events.filter(e=>e.seriesId===review.seriesId)))throw Error('A série mudou desde a revisão. Abra a edição novamente.');
 return events.map(e=>review.changes.find(c=>c.before.id===e.id)?.after?structuredClone(review.changes.find(c=>c.before.id===e.id).after):e);
}
