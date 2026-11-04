const pad=n=>String(n).padStart(2,'0');
export function localToday(now=new Date()){return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;}
export function validCalendarDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1900-01-01'&&value<='2200-12-31'&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function addDays(date,days){if(!validCalendarDate(date)||!Number.isInteger(days))throw Error('Data inválida.');const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function moveMonth(date,offset){if(!validCalendarDate(date)||!Number.isInteger(offset))throw Error('Data inválida.');const d=new Date(date+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);}
export function monthCells(date){if(!validCalendarDate(date))throw Error('Data inválida.');const first=date.slice(0,8)+'01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=addDays(first,-weekday);return Array.from({length:42},(_,i)=>{const day=addDays(start,i);return {date:day,day:Number(day.slice(8)),currentMonth:day.slice(0,7)===date.slice(0,7)};});}
export function monthLabel(date){return new Date(date+'T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});}
export function taskDraft(raw,existing={}){
 const title=typeof raw.title==='string'?raw.title.trim():'',category=typeof raw.category==='string'?raw.category:'Pessoal',dueDate=raw.dueDate||'';
 if(!title||title.length>100)throw Error('Informe uma tarefa com até 100 caracteres.');
 if(!['Pessoal','Dinheiro','Projetos','Trabalho'].includes(category))throw Error('Escolha uma área válida.');
 if(dueDate&&!validCalendarDate(dueDate))throw Error('Informe um prazo válido.');
 return {...existing,title,category,dueDate,done:existing.done===true,priority:existing.priority===true&&!existing.done};
}
export function setTaskPriority(tasks,id){const target=tasks.find(t=>t.id===id);if(!target)throw Error('Esta tarefa não está mais disponível.');if(target.done)throw Error('Reabra a tarefa antes de priorizá-la.');if(!target.priority&&tasks.filter(t=>t.priority&&!t.done).length>=3)throw Error('Escolha até três prioridades. Retire uma antes de incluir outra.');return tasks.map(t=>t.id===id?{...t,priority:!t.priority}:t);}
export function orderedTasks(tasks){return tasks.map((task,index)=>({task,index})).sort((a,b)=>Number(Boolean(a.task.done))-Number(Boolean(b.task.done))||Number(Boolean(b.task.priority))-Number(Boolean(a.task.priority))||((a.task.dueDate||'9999').localeCompare(b.task.dueDate||'9999'))||a.index-b.index).map(x=>x.task);}
export function eventDraft(raw,existing={},timeZone='America/Sao_Paulo'){
 const title=typeof raw.title==='string'?raw.title.trim():'',date=raw.date,time=raw.time,duration=Number(raw.duration);
 if(!title||title.length>100)throw Error('Informe o nome do compromisso com até 100 caracteres.');
 if(!validCalendarDate(date))throw Error('Informe uma data válida.');
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Informe o horário do compromisso.');
 if(!Number.isInteger(duration)||duration<1||duration>1440)throw Error('Informe uma duração entre 1 e 1440 minutos.');
 return {...existing,title,date,time,duration,timeZone};
}
export function eventFromText(text,today=localToday()){
 const title=String(text).trim().slice(0,600),plain=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const relatives=[...plain.matchAll(/\b(depois de amanha|amanha|hoje)\b/g)],absolute=[...plain.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)];let date='';
 if(relatives.length+absolute.length===1){if(relatives.length)date=addDays(today,{'hoje':0,'amanha':1,'depois de amanha':2}[relatives[0][1]]);else{const [,day,month,year]=absolute[0];const candidate=`${year||today.slice(0,4)}-${pad(month)}-${pad(day)}`;if(validCalendarDate(candidate))date=candidate;}}
 const times=[...plain.matchAll(/\b(?:as\s+(\d{1,2})(?:[:h](\d{2}))?|(\d{1,2})(?::(\d{2})|h(\d{2})?))\b/g)];let time='';
 if(times.length===1){const m=times[0],hours=Number(m[1]??m[3]),minutes=Number(m[2]??m[4]??m[5]??0);if(hours<=23&&minutes<=59)time=`${pad(hours)}:${pad(minutes)}`;}
 return {type:'event',title,date,time,needsReview:true};
}
