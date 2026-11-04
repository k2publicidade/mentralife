let selectedZone='';
export function validTimeZone(zone){try{return typeof zone==='string'&&zone.length<=80&&!!new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{return false;}}
export function deviceTimeZone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
export function setTimeZone(zone){if(zone&&!validTimeZone(zone))throw Error('Escolha um fuso horário válido, como America/Sao_Paulo.');selectedZone=zone||'';}
export function currentTimeZone(){return selectedZone||deviceTimeZone();}
export function dateInZone(now=new Date(),zone=currentTimeZone()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const part=type=>parts.find(p=>p.type===type).value;return `${part('year')}-${part('month')}-${part('day')}`;}
export function operationDate(now=new Date()){return globalThis.mentraProduction?dateInZone(now):'2026-10-14';}
