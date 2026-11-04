const collections={tasks:'Tarefas',events:'Agenda',records:'Lançamentos',documents:'Documentos',inbox:'Capturas',messages:'Conversa',journeys:'Planos',accounts:'Contas',obligations:'Compromissos financeiros',recurrences:'Recorrências',budgets:'Orçamentos'};
const label=item=>String(item?.title||item?.name||item?.text||item?.id||'Registro').slice(0,120);
const fieldNames={title:'Nome',name:'Nome',favorite:'Favorito',context:'Contexto',category:'Categoria',date:'Data',time:'Horário',dueDate:'Prazo',done:'Concluído',trashed:'Na lixeira',note:'Anotação',cents:'Valor em centavos',extractedText:'Texto de busca',fileData:'Arquivo original',pdfData:'PDF original',sha256:'Integridade do arquivo',goal:'Objetivo',timeZone:'Fuso horário',memoryEnabled:'Usar notas nas respostas da IA',aiMemory:'Notas para a IA',reminders:'Lembretes',enabled:'Ativado',christian:'Conteúdo cristão',periods:'Períodos',morning:'Manhã',afternoon:'Tarde',night:'Noite',appointments:'Consultas e exames',medications:'Medicamentos',logs:'Registros de rotina',activities:'Atividades',meals:'Refeições',professional:'Orientações informadas',nutrition:'Alimentação',movement:'Movimento',groceryChecked:'Compras marcadas'};
const short=value=>{const text=String(value);return text.length>160?text.slice(0,160)+'… (abreviado)':text;};
function preview(value,key){if(value===undefined||value===null)return 'Não informado';if(value==='')return 'Em branco';if(key==='fileData'||key==='pdfData')return 'Conteúdo do arquivo';if(typeof value==='boolean')return value?'Sim':'Não';if(Array.isArray(value))return short(value.map(v=>v&&typeof v==='object'?label(v):String(v)).join(', ')||'Nenhum registro');if(typeof value==='object')return short(label(value));return short(value);}
function changedFields(local,remote){
 const result=[];let truncated=false;
 const push=(path,a,b,key)=>{if(result.length>=120){truncated=true;return;}result.push({label:path.length?path.join(' / '):'Valor',from:preview(b,key),to:preview(a,key)});};
 function walk(a,b,path=[],depth=0){
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(result.length>=120){truncated=true;return;}
  const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(depth<8&&(record(a)||record(b))&&(!a||record(a))&&(!b||record(b))){for(const key of new Set([...Object.keys(a||{}),...Object.keys(b||{})]))walk(a?.[key],b?.[key],[...path,fieldNames[key]||short(key)],depth+1);return;}
  if(depth<8&&Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(v=>record(v)&&typeof v.id==='string')){
   const left=new Map(a.map(v=>[v.id,v])),right=new Map(b.map(v=>[v.id,v]));
   for(const [id,item]of left){if(!right.has(id))push([...path,'Adicionar'],item,undefined);else walk(item,right.get(id),[...path,label(item)],depth+1);}
   for(const [id,item]of right)if(!left.has(id))push([...path,'Remover'],undefined,item);
   if(a.length===b.length&&a.every(v=>right.has(v.id))&&JSON.stringify(a.map(v=>v.id))!==JSON.stringify(b.map(v=>v.id)))push([...path,'Ordem'],a,b);
   return;
  }
  push(path,a,b,path.at(-1)==='Arquivo original'?'fileData':path.at(-1)==='PDF original'?'pdfData':'');
 }
 walk(local,remote);if(truncated)result.push({label:'Outros campos',from:'Conteúdo abreviado',to:'Baixe as duas cópias para revisar todas as alterações'});return result;
}
export function compareStates(local,remote){
 const changes=[];local=local||{};remote=remote||{};
 for(const [key,area] of Object.entries(collections)){
  const a=Array.isArray(local[key])?local[key]:[],b=Array.isArray(remote[key])?remote[key]:[],left=new Map(a.map((item,i)=>[item?.id||'index-'+i,item])),right=new Map(b.map((item,i)=>[item?.id||'index-'+i,item]));
  for(const [id,item] of left)if(!right.has(id))changes.push({area,type:'Adicionar',title:label(item)});else if(JSON.stringify(item)!==JSON.stringify(right.get(id)))changes.push({area,type:'Substituir',title:label(item),fields:changedFields(item,right.get(id))});
  for(const [id,item] of right)if(!left.has(id))changes.push({area,type:'Remover',title:label(item)});
  if(left.size===right.size&&[...left.keys()].every(id=>right.has(id))&&JSON.stringify([...left.keys()])!==JSON.stringify([...right.keys()]))changes.push({area,type:'Reordenar',title:`${left.size} registros em outra ordem`});
 }
 for(const key of new Set([...Object.keys(local),...Object.keys(remote)]))if(!Object.hasOwn(collections,key)&&JSON.stringify(local[key])!==JSON.stringify(remote[key]))changes.push({area:key==='profile'?'Perfil':key==='health'?'Saúde e bem-estar':key==='moments'?'Momentos':'Configurações',type:'Substituir',title:({profile:'Preferências da conta',health:'Registros e preferências de saúde',moments:'Preferências dos Momentos',version:'Versão dos dados',financeVersion:'Versão financeira',currency:'Moeda'})[key]||short(key),fields:changedFields(local[key],remote[key])});
 return changes;
}
