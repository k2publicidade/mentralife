import {eventDraft} from './organizer.mjs';
import {validTimeZone} from './time.mjs';
export function reviewCalendarImport(events,proposal,{now=Date.now(),id=()=>crypto.randomUUID()}={}){
 if(!proposal||!Array.isArray(proposal.events)||proposal.events.length>100||!Number.isFinite(proposal.generatedAt)||now-proposal.generatedAt>600000||proposal.generatedAt>now+60000)throw Error('Consulta expirada ou inválida. Consulte o calendário novamente.');
 const changes=[],seen=new Set();
 for(const raw of proposal.events){
  if(!/^[a-f0-9]{64}$/.test(raw.sourceKey)||seen.has(raw.sourceKey)||!validTimeZone(raw.timeZone))throw Error('A consulta contém uma ocorrência inválida ou repetida.');seen.add(raw.sourceKey);
  const matches=events.filter(e=>e.source==='google-calendar'&&e.sourceKey===raw.sourceKey);if(matches.length>1)throw Error('Há ocorrências duplicadas na agenda. Resolva antes de importar.');
  const before=matches[0],after={...eventDraft(raw,before||{},raw.timeZone),id:before?.id||id(),source:'google-calendar',sourceKey:raw.sourceKey};
  if(!before||['title','date','time','duration','timeZone'].some(k=>before[k]!==after[k]))changes.push({before:before?structuredClone(before):null,after});
 }
 return {changes,signature:JSON.stringify(events),generatedAt:proposal.generatedAt,connectionId:proposal.connectionId};
}
export function applyCalendarImport(events,review,now=Date.now()){
 if(!review||now-review.generatedAt>600000||review.signature!==JSON.stringify(events))throw Error('Sua agenda mudou ou a consulta expirou. Consulte novamente antes de importar.');
 const changes=new Map(review.changes.map(c=>[c.after.id,c.after]));
 return [...events.map(e=>changes.has(e.id)?structuredClone(changes.get(e.id)):e),...review.changes.filter(c=>!c.before).map(c=>structuredClone(c.after))];
}
