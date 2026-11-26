import {validDate} from '../dist/finance.mjs';

export const normalizeQuery=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const rows=value=>(Array.isArray(value)?value:[]).filter(v=>v&&typeof v==='object');
const shiftDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const monthPeriod=(year,month,selection)=>{
 const value=`${year}-${String(month).padStart(2,'0')}`;
 return {month:value,fromDate:value+'-01',toDate:new Date(Date.UTC(year,month,0,12)).toISOString().slice(0,10),selection};
};
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Resolve only explicit, deterministic scopes. Never guess a bank, category or date.
export function resolveAccountQuery(state,question,today){
 const q=normalizeQuery(question),year=Number(today.slice(0,4)),month=Number(today.slice(5,7)),questions=[];
 const financial=/gast|despes|receit|saldo|renda|financeir|orcament|pagar|receber|lancament|movimenta|transferenc|quanto.*(?:entrou|saiu)/.test(q);
 const comparison=/\bcompar(?:e|ar|acao)|\bversus\b|\bvs\b/.test(q);
 let periods=[],mode='single';
 const range=(fromDate,toDate,selection)=>({fromDate,toDate,selection});
 const rawDates=[...q.matchAll(/\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b(?![\/\d])/g)].map(m=>({index:m.index,date:m[1]||`${m[4]||year}-${m[3].padStart(2,'0')}-${m[2].padStart(2,'0')}`}));
 for(const m of q.matchAll(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${months.join('|')})(?:\\s+de\\s+(\\d{4}))?\\b`,'g')))rawDates.push({index:m.index,date:`${m[3]||year}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`});
 const dates=rawDates.sort((a,b)=>a.index-b.index).map(r=>r.date);
 if(/\b\d{1,2}\/\d{1,2}\/\d{1,3}\b/.test(q))questions.push('Informe o ano da data com quatro dígitos.');
 if(dates.length){
  if(dates.some(d=>!validDate(d)))questions.push('Qual é o intervalo correto? Há uma data inválida na pergunta.');
  else if(dates.length>2)questions.push('Informe até duas datas para o intervalo ou comparação.');
  else if(dates.length===2&&comparison){mode='comparison';periods=dates.map(d=>range(d,d,'dia explícito para comparação'));}
  else if(dates.length===2)periods=[range(dates[0],dates[1],'intervalo explícito, inclusive')];
  else if(/\bdesde\b|\ba partir de\b/.test(q))periods=[range(dates[0],today,'desde a data informada até hoje')];
  else if(/\bate\b/.test(q))periods=[range(null,dates[0],'todos os registros até a data informada')];
  else periods=[range(dates[0],dates[0],'dia explícito')];
 }else{
  const numeric=[...q.matchAll(/\b(\d{4})-(\d{2})\b/g)];
  const named=[...q.matchAll(new RegExp(`\\b(${months.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`,'g'))];
  if(numeric.length||named.length){
   const refs=[...numeric.map(m=>({index:m.index,year:Number(m[1]),month:Number(m[2])})),...named.map(m=>{const n=months.indexOf(m[1])+1,past=/^\s+(?:passado|anterior)\b/.test(q.slice(m.index+m[0].length));return {index:m.index,year:m[2]?Number(m[2]):year-(/\bano (?:passado|anterior)\b/.test(q)||past&&n>=month?1:0),month:n};})].sort((a,b)=>a.index-b.index);
   if(refs.some(r=>r.month<1||r.month>12||r.year<1900||r.year>2200))questions.push('Informe um mês válido entre 1900 e 2200.');
   else if(refs.length>6)questions.push('Compare no máximo seis períodos por pergunta.');
   else if(comparison&&refs.length>1){mode='comparison';periods=refs.map(r=>monthPeriod(r.year,r.month,'mês explícito para comparação'));}
   else if(refs.length===2)periods=[range(monthPeriod(refs[0].year,refs[0].month).fromDate,monthPeriod(refs[1].year,refs[1].month).toDate,'intervalo entre meses, inclusive')];
   else if(refs.length===1)periods=[monthPeriod(refs[0].year,refs[0].month,'mês explícito na pergunta')];
   else questions.push('Informe um intervalo ou peça explicitamente uma comparação entre os meses.');
  }else{
   const rolling=q.match(/\b(ultimos?|proximos?)\s+(\d+)\s+(dias?|meses?)\b/);
   const quarter=q.match(/\b(primeiro|segundo|terceiro|quarto|[1-4])(?:o|º)?\s+trimestre(?:\s+(?:de\s+)?(\d{4}))?\b/);
   const explicitYear=q.match(/\b(?:ano(?: de)?|em|durante)\s+((?:19|20|21|22)\d{2})\b/);
   if(rolling){
    const n=Number(rolling[2]),past=rolling[1].startsWith('ultimo');
    if(n<1||n>3660||rolling[3].startsWith('mes')&&n>120)questions.push('Use de 1 a 3.660 dias ou de 1 a 120 meses.');
    else if(rolling[3].startsWith('dia'))periods=[past?range(shiftDays(today,1-n),today,`últimos ${n} dias, incluindo hoje`):range(today,shiftDays(today,n-1),`próximos ${n} dias, incluindo hoje`)];
    else{const d=new Date(Date.UTC(year,month-1+(past?1-n:n-1),1,12)),p=monthPeriod(d.getUTCFullYear(),d.getUTCMonth()+1);periods=[past?range(p.fromDate,today,`${n} meses de calendário incluindo o atual, até hoje`):range(today,p.toDate,`${n} meses de calendário incluindo o atual`)];}
   }else if(quarter||/\btrimestre (?:passado|anterior)\b|\b(?:este|neste|esse) trimestre\b/.test(q)){
    const ordinal=quarter?['primeiro','segundo','terceiro','quarto'].indexOf(quarter[1])+1:0;
    let y=quarter?.[2]?Number(quarter[2]):year,k=quarter?(ordinal||Number(quarter[1])):Math.ceil(month/3);
    if(!quarter&&/\btrimestre (?:passado|anterior)\b/.test(q)){k--;if(k===0){k=4;y--;}}
    if(y<1900||y>2200)questions.push('Informe um ano entre 1900 e 2200.');
    else periods=[range(monthPeriod(y,(k-1)*3+1).fromDate,monthPeriod(y,k*3).toDate,'trimestre de calendário completo')];
   }else if(explicitYear||/\bano (?:passado|anterior)\b|\b(?:este|neste|esse) ano\b/.test(q)){
    const y=explicitYear?Number(explicitYear[1]):year-(/\bano (?:passado|anterior)\b/.test(q)?1:0);periods=[range(`${y}-01-01`,`${y}-12-31`,'ano de calendário completo')];
   }else if(/\bmes (?:passado|anterior|retrasado)\b|\bultimo mes\b/.test(q)){const d=new Date(Date.UTC(year,month-(/\bmes retrasado\b/.test(q)?3:2),1,12));periods=[monthPeriod(d.getUTCFullYear(),d.getUTCMonth()+1,'mês anterior solicitado')];}
   else if(/\bmes (?:seguinte|que vem)\b|\bproximo mes\b/.test(q)){const d=new Date(Date.UTC(year,month,1,12));periods=[monthPeriod(d.getUTCFullYear(),d.getUTCMonth()+1,'próximo mês solicitado')];}
   else if(/\bsemana (?:passada|anterior)\b|\b(?:esta|nesta|essa) semana\b/.test(q)){const weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7,first=shiftDays(today,-weekday-(/\bsemana (?:passada|anterior)\b/.test(q)?7:0));periods=[range(first,shiftDays(first,6),'semana de segunda a domingo')];}
   else if(/\bontem\b/.test(q)){const day=shiftDays(today,-1);periods=[range(day,day,'ontem no fuso da conta')];}
   else if(/\bhoje\b/.test(q))periods=[range(today,today,'hoje no fuso da conta')];
   else if(/\btodo (?:o )?historico\b|\bdesde o inicio\b/.test(q))periods=[range(null,null,'todo o histórico salvo')];
   else if(financial&&/\bquinzena\b|\bbimestre\b|\bsemestre\b|\bentre\b|\bultim[oa]s?\b|\bproxim[oa]s?\b/.test(q))questions.push('Informe as datas ou meses do período para eu calcular sem presumir o intervalo.');
   else periods=[monthPeriod(year,month,'mês atual no fuso da conta; padrão sem período explícito')];
  }
 }
 if(periods.some(p=>p.fromDate&&p.toDate&&p.fromDate>p.toDate))questions.push('A data inicial precisa ser anterior ou igual à data final.');

 function matches(values,input){
  const labels=[...new Map(values.filter(v=>typeof v==='string'&&v.trim()&&v.length<=80).map(v=>[normalizeQuery(v.trim()),v.trim()])).values()].sort((a,b)=>b.length-a.length);
  let remaining=input;const found=[];
  for(const label of labels){const re=new RegExp(`(^|[^a-z0-9])(${escape(normalizeQuery(label))})(?=$|[^a-z0-9])`,'g');let hit=false;remaining=remaining.replace(re,(whole,prefix,name)=>{hit=true;return prefix+' '.repeat(name.length);});if(hit)found.push(label);}
  return {found,remaining};
 }
 const accounts=rows(state.accounts).filter(a=>typeof a.id==='string'&&a.id.length<=128&&typeof a.name==='string'&&a.name.length<=80);
 const accountMatches=matches(accounts.map(a=>a.name),q),accountIds=accounts.filter(a=>accountMatches.found.some(n=>normalizeQuery(n)===normalizeQuery(a.name))).map(a=>a.id);
 const categoryLabels=[...rows(state.records),...rows(state.obligations),...rows(state.budgets)].map(r=>r.category);
 const explicitCategory=/\bcategoria\b/.test(q);
 const categoryMatches=matches(categoryLabels,explicitCategory?q:accountMatches.remaining);
 if(accountMatches.found.some(n=>accounts.filter(a=>normalizeQuery(a.name)===normalizeQuery(n)).length>1))questions.push('Há contas com o mesmo nome. Diferencie os nomes antes de pedir uma análise por conta.');
 if(financial&&/\b(?:na|da|pela|nessa|dessa) conta\s+/.test(q)&&!accountIds.length)questions.push('Qual é o nome exato da conta financeira cadastrada?');
 if(explicitCategory&&!categoryMatches.found.length)questions.push('Qual é o nome exato da categoria cadastrada?');
 if(accountIds.length>20)questions.push('Analise no máximo vinte contas financeiras por pergunta.');
 let textTerms=[];
 if(!categoryMatches.found.length){
  const topic=financial?q.match(/\b(?:com|sobre|contendo)\s+(.+)/):null;
  if(topic){const phrase=topic[1].split(/\s+(?:(?:na|da|pela) conta|(?:no|nesse|neste) (?:mes|ano|trimestre)|entre|desde|ate|categoria)\b|[?!;,]/)[0].replace(new RegExp(`\\s+em\\s+(?:\\d|${months.join('|')}|todo o historico).*`),'').replace(/["']/g,'').trim();
   if(phrase&&phrase.length<=120)textTerms=phrase.split(/\s+e\s+/).map(v=>v.trim()).filter(Boolean).slice(0,10);
  }
 }
 return {mode,periods,accountIds,accountNames:accountMatches.found,categoryNames:categoryMatches.found,textTerms,textMatch:'busca literal normalizada em títulos e categorias; termos alternativos unidos por OU',needsClarification:questions.length>0,questions};
}
