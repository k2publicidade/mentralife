import {validCalendarDate,addDays} from '../dist/organizer.mjs';
import {validTimeZone,dateInZone} from '../dist/time.mjs';
import {normalizeMomentsSettings} from '../dist/moments-core.mjs';
const clock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const formats=new Map();
function formatter(zone){if(!formats.has(zone))formats.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));return formats.get(zone);}
function parts(time,zone){const p=formatter(zone).formatToParts(new Date(time)),get=k=>p.find(x=>x.type===k).value;return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};}
export function zonedInstant(date,time,zone){if(!validCalendarDate(date)||!clock(time)||!validTimeZone(zone))return null;const target=Date.parse(`${date}T${time}:00Z`);let guess=target;for(let i=0;i<4;i++){const p=parts(guess,zone),delta=target-Date.parse(`${p.date}T${p.time}:00Z`);if(!delta)break;guess+=delta;}const candidates=[-120,-90,-60,-30,0,30,60,90,120].map(n=>guess+n*60000).filter(t=>{const p=parts(t,zone);return p.date===date&&p.time===time;});return candidates.length?Math.min(...candidates):null;}
export function validateReminderSettings(raw={}){const defaults={timeZone:'America/Sao_Paulo',tasks:true,events:true,moments:false,taskTime:'09:00',eventMinutes:10,quietStart:'22:00',quietEnd:'07:00'};const s={...defaults,...raw};if(!validTimeZone(s.timeZone)||!clock(s.taskTime)||!clock(s.quietStart)||!clock(s.quietEnd)||![0,5,10,15,30,60].includes(s.eventMinutes)||['tasks','events','moments'].some(k=>typeof s[k]!=='boolean'))throw Error('Preferências de lembretes inválidas.');return Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]]));}
export function isQuietTime(settings,now){const s=validateReminderSettings(settings),at=parts(now,s.timeZone).time;return s.quietStart!==s.quietEnd&&(s.quietStart<s.quietEnd?at>=s.quietStart&&at<s.quietEnd:at>=s.quietStart||at<s.quietEnd);}
export function reminderPlan(state,settings,now=Date.now()){
 if(!state)return [];const s=validateReminderSettings(settings),zone=s.timeZone,items=[];
 const add=(key,date,time,itemZone,url,offset=0)=>{const instant=zonedInstant(date,time,itemZone);if(instant===null)return;const dueAt=instant-offset*60000;if(dueAt<now-3600000||isQuietTime(s,dueAt))return;items.push({key:key+':'+dueAt,dueAt,url});};
 if(s.tasks)for(const t of state.tasks||[])if(t&&!t.done&&t.id&&t.dueDate)add('task:'+t.id,t.dueDate,s.taskTime,zone,'/#/vida/tarefas');
 if(s.events)for(const e of state.events||[])if(e&&!e.cancelled&&e.id)add('event:'+e.id,e.date,e.time,validTimeZone(e.timeZone)?e.timeZone:zone,'/#/vida/agenda',s.eventMinutes);
 if(s.moments){const m=normalizeMomentsSettings(state.moments);if(m.enabled){const today=dateInZone(new Date(now),zone);for(let i=0;i<8;i++){const day=addDays(today,i);for(const [period,p] of Object.entries(m.periods))if(p.enabled)add('moment:'+period+':'+day,day,p.time,zone,'/#/momentos/'+period);}}}
 if(items.length>1000)throw Error('Limite de 1.000 lembretes pendentes atingido. Reduza as datas ou desative um tipo de aviso.');return items;
}
