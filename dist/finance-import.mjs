import {parseBRL,validateFinancialEntry,MAX_CENTS} from './finance.mjs';
import {validCalendarDate} from './organizer.mjs';
const enc=new TextEncoder();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const normal=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const signature=s=>JSON.stringify({accounts:s.accounts,records:s.records});
export async function parseFinancialCsv(text,delimiter=';'){
 if(typeof text!=='string'||enc.encode(text).length>200*1024||![';',',','\t'].includes(delimiter))throw Error('Escolha um CSV de até 200 KB e um separador válido.');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\uFFFD]/.test(text))throw Error('O arquivo precisa conter texto UTF-8 válido.');
 const hash=await sha(text);text=text.replace(/^\uFEFF/,'');
 let rows=[],row=[],field='',quoted=false,closed=false;
 const cell=()=>{row.push(field);field='';closed=false;if(row.length>25)throw Error('O arquivo pode ter até 25 colunas.');};
 const line=()=>{cell();if(row.some(c=>c!==''))rows.push(row);row=[];if(rows.length>101)throw Error('Importe até cem registros por arquivo.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
  else if(c===delimiter)cell();
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
  else if(c==='"'){if(field||closed)throw Error('Aspas inválidas no CSV.');quoted=true;}
  else{if(closed)throw Error('Há conteúdo depois de fechar as aspas. Confira o separador.');field+=c;}
  if(field.length>1000)throw Error('Uma célula ultrapassa mil caracteres.');
 }
 if(quoted)throw Error('Uma célula está com aspas abertas.');if(field||row.length||closed)line();
 if(rows.length<2)throw Error('O CSV precisa ter cabeçalho e ao menos um registro.');
 const headers=rows.shift().map(h=>h.trim());if(headers.length<3||headers.some(h=>!h)||new Set(headers.map(normal)).size!==headers.length)throw Error('Use ao menos três colunas com cabeçalhos únicos e preenchidos.');
 if(rows.some(r=>r.length!==headers.length))throw Error('Há registros com quantidade diferente de colunas. Confira o separador.');
 return {headers,rows,hash};
}
export async function readFinancialCsv(file,delimiter){
 if(!file||!/\.csv$/i.test(file.name)||file.size>200*1024)throw Error('Escolha um arquivo .csv de até 200 KB.');
 const bytes=await file.arrayBuffer();if(bytes.byteLength>200*1024)throw Error('O arquivo ultrapassa 200 KB.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Salve o CSV em UTF-8 antes de importar.');}
 return parseFinancialCsv(text,delimiter);
}
function amount(value,format){
 const raw=value.trim().replace(/^R\$\s*/,'').replace(/^\+/,'');
 if(format==='brl')return parseBRL(raw,{allowNegative:true});
 if(format!=='decimal'||! /^-?\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const [integer,fraction='']=raw.replace('-','').split('.'),cents=(Number(integer)*100+Number(fraction.padEnd(2,'0')))*(raw.startsWith('-')?-1:1);
 return Number.isSafeInteger(cents)&&Math.abs(cents)<=MAX_CENTS&&cents!==0?cents:null;
}
function dateValue(raw,format){const value=raw.trim();if(format==='br'&&/^\d{2}\/\d{2}\/\d{4}$/.test(value))return value.slice(6)+'-'+value.slice(3,5)+'-'+value.slice(0,2);return format==='iso'?value:'';}
const fingerprint=r=>JSON.stringify([r.accountId,r.title,r.type,r.cents,r.date,r.category,r.paymentMethod,r.status]);
const similar=(a,b)=>a.accountId===b.accountId&&a.date===b.date&&a.type===b.type&&a.cents===b.cents&&normal(a.title||'')===normal(b.title||'');
export async function reviewFinancialCsv(state,parsed,config){
 state={accounts:structuredClone(state.accounts),records:structuredClone(state.records)};
 const account=state.accounts.find(a=>a.id===config.accountId&&!a.archived);if(!account)throw Error('Escolha uma conta ativa para receber os lançamentos.');
 if(!['brl','decimal'].includes(config.amountFormat)||!['br','iso'].includes(config.dateFormat)||!['actual','estimated'].includes(config.status))throw Error('Escolha os formatos de valor/data e a situação.');
 const required=['date','title','amount'],optional=['type','category','externalId'],map={};
 for(const k of [...required,...optional]){const value=config[k];if(optional.includes(k)&&(value===''||value===undefined)){map[k]=null;continue;}const n=Number(value);if(value===''||!Number.isInteger(n)||n<0||n>=parsed.headers.length)throw Error('Selecione as colunas de data, descrição e valor; confira as demais.');map[k]=n;}
 const columns=Object.values(map).filter(v=>v!==null);if(new Set(columns).size!==columns.length)throw Error('Cada campo precisa usar uma coluna diferente.');
 const items=[],keys=new Set(),finance={accounts:state.accounts,records:[]};
 for(let i=0;i<parsed.rows.length;i++){
  const row=parsed.rows[i],item={index:i,status:'new',errors:[]};
  const title=row[map.title].trim(),date=dateValue(row[map.date],config.dateFormat),cents=amount(row[map.amount],config.amountFormat),category=map.category===null?'Outros':row[map.category].trim();
  let type=cents<0?'expense':'income';
  if(map.type!==null){const raw=normal(row[map.type]);type=({entrada:'income',income:'income',saida:'expense',expense:'expense'})[raw];if(!type)item.errors.push('Tipo deve ser Entrada ou Saída; transferências internas exigem registro próprio.');if(cents<0)item.errors.push('Com coluna de tipo, informe valor positivo.');}
  if(!title||title.length>300)item.errors.push('Descrição precisa ter entre 1 e 300 caracteres.');if(category.length>80)item.errors.push('Categoria ultrapassa 80 caracteres.');if(!validCalendarDate(date))item.errors.push('Data inválida para o formato escolhido.');if(cents===null)item.errors.push('Valor inválido para o formato escolhido.');
  const external=map.externalId===null?'':row[map.externalId].trim();if(map.externalId!==null&&(!external||external.length>200))item.errors.push('Identificador de origem precisa ter entre 1 e 200 caracteres.');
  const sourceKey=await sha(JSON.stringify(['csv-v1',account.id,external?['external',external]:['file',parsed.hash,i]]));
  const draft={title,date,cents:cents===null?null:Math.abs(cents),type,category:category||'Outros',accountId:account.id,paymentMethod:config.paymentMethod,status:config.status,importSourceKey:sourceKey,source:'csv-import'};
  const validation=validateFinancialEntry(finance,draft);item.errors.push(...validation.errors);
  item.draft=validation.draft;item.draft.importFingerprint=fingerprint(item.draft);
  const existing=state.records.filter(r=>r.importSourceKey===sourceKey);
  if(keys.has(sourceKey)){item.errors.push('Identificador de origem repetido no arquivo.');const previous=items.find(x=>x.draft.importSourceKey===sourceKey);previous.status='invalid';previous.errors.push('Identificador de origem repetido no arquivo.');}keys.add(sourceKey);
  if(item.errors.length)item.status='invalid';
  else if(existing.length){item.status=existing.length===1&&existing[0].importFingerprint===item.draft.importFingerprint&&fingerprint(existing[0])===item.draft.importFingerprint?'duplicate':'conflict';}
  else if(state.records.some(r=>similar(r,item.draft))||items.some(r=>r.status!=='invalid'&&similar(r.draft,item.draft)))item.status='possible';
  items.push(item);
 }
 return {items,signature:signature(state),accountName:account.name,status:config.status,paymentMethod:config.paymentMethod,createdAt:Date.now()};
}
export function applyFinancialCsv(state,review,selected,{now=Date.now(),id=()=>crypto.randomUUID()}={}){
 if(!review||now-review.createdAt>600000||signature(state)!==review.signature)throw Error('O controle financeiro mudou ou a revisão expirou. Importe e revise novamente.');
 if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)throw Error('Selecione ao menos um registro válido, sem repetir linhas.');
 const additions=[];const ids=new Set(state.records.map(r=>r.id));
 for(const index of selected){const item=review.items.find(r=>r.index===index);if(!item||!['new','possible'].includes(item.status))throw Error('Há registros indisponíveis na seleção. Revise o arquivo.');const uuid=id();if(ids.has(uuid))throw Error('Identificador repetido. Revise novamente.');ids.add(uuid);additions.push({...structuredClone(item.draft),id:uuid});}
 const next=structuredClone(state);next.records=[...additions,...next.records];return next;
}
