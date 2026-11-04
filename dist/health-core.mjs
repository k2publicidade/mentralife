/**
 * Local, fictional wellbeing organizer. No medical interpretation, dosage,
 * prescription, delivery scheduling, network, sharing or storage APIs.
 * All free text remains plain text; views must escape it before HTML rendering.
 * Mutations return a new root and health object and preserve unrelated state.
 */
const freeze = value => { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
export const DAYS=freeze([{id:'seg',label:'Segunda'},{id:'ter',label:'Terça'},{id:'qua',label:'Quarta'},{id:'qui',label:'Quinta'},{id:'sex',label:'Sexta'},{id:'sab',label:'Sábado'},{id:'dom',label:'Domingo'}]);
export const RECIPES=freeze([
 {id:'arroz-feijao',title:'Arroz, feijão e legumes',minutes:25,budget:'economico',preference:'vegetariano',ingredients:['Arroz','Feijão','Cenoura','Abobrinha','Azeite'],steps:['Prepare o arroz e o feijão como costuma fazer.','Cozinhe os legumes até a textura de sua preferência.','Monte o prato com os preparos.'],allergens:[]},
 {id:'omelete',title:'Omelete com tomate e salada',minutes:15,budget:'economico',preference:'vegetariano',ingredients:['Ovos','Tomate','Alface','Azeite'],steps:['Lave e separe os vegetais.','Prepare a omelete com os ovos e o tomate.','Sirva com a salada.'],allergens:['Ovos']},
 {id:'massa-legumes',title:'Macarrão com legumes',minutes:20,budget:'economico',preference:'vegetariano',ingredients:['Macarrão','Abobrinha','Tomate','Cenoura','Azeite'],steps:['Cozinhe o macarrão conforme a embalagem.','Prepare os legumes na frigideira.','Misture e sirva.'],allergens:['Trigo; confira a embalagem do macarrão']},
 {id:'frango-arroz',title:'Frango, arroz e salada',minutes:30,budget:'moderado',preference:'variado',ingredients:['Frango','Arroz','Alface','Tomate','Azeite'],steps:['Prepare o arroz.','Cozinhe o frango completamente.','Lave e monte a salada para acompanhar.'],allergens:[]},
 {id:'sopa-legumes',title:'Sopa de legumes com feijão',minutes:35,budget:'economico',preference:'vegetariano',ingredients:['Batata','Cenoura','Abobrinha','Feijão','Cebola'],steps:['Corte os legumes.','Cozinhe em água com a cebola até amaciarem.','Acrescente o feijão já cozido e aqueça.'],allergens:[]},
 {id:'sanduiche',title:'Sanduíche de queijo e tomate',minutes:10,budget:'moderado',preference:'vegetariano',ingredients:['Pão','Queijo','Tomate','Alface'],steps:['Lave e corte os vegetais.','Monte o sanduíche com o queijo e os vegetais.'],allergens:['Leite','Trigo; confira a embalagem do pão']},
]);
const collections=['appointments','medications','logs','activities','meals'];
const togglable=['appointments','medications','activities'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000')&&Number.isFinite(Date.parse(`${v}T12:00:00Z`))&&new Date(`${v}T12:00:00Z`).toISOString().slice(0,10)===v;
const validTime=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const emptyHealth=()=>({version:1,appointments:[],medications:[],logs:[],activities:[],meals:[],groceryChecked:[],professional:{nutrition:'',movement:''}});
const demoHealth=()=>({...emptyHealth(),appointments:[{id:'health-demo-consulta',type:'consulta',title:'Consulta de exemplo',date:'2026-10-15',time:'10:00',documentId:'',note:'Exemplo fictício para testar a organização.',done:false},{id:'health-demo-exame',type:'exame',title:'Exame de exemplo',date:'2026-10-16',time:'08:30',documentId:'',note:'Sem exame real ou preparação indicada.',done:false},{id:'health-demo-retorno',type:'retorno',title:'Retorno de exemplo',date:'2026-10-18',time:'14:00',documentId:'',note:'Data fictícia escolhida para a demonstração.',done:false}],medications:[{id:'health-demo-medication',title:'Medicamento fictício A',time:'08:00',note:'Horário de exemplo. Sem dose ou orientação de uso.',done:false}],logs:[{id:'health-demo-log',date:'2026-10-14',sleep:'regular',energy:'media',feeling:'Um dia tranquilo, no exemplo.',note:'Quero lembrar de comentar minha rotina na consulta fictícia.'}],activities:[{id:'health-demo-activity',title:'Passeio de exemplo',date:'2026-10-14',time:'17:30',note:'Atividade fictícia escolhida pela pessoa, não uma recomendação.',done:false}],meals:[{id:'health-demo-meal',day:'qua',slot:'almoco',recipeId:'arroz-feijao'}]});
const fail=(state,error)=>({ok:false,state,errors:Array.isArray(error)?error:[error]});
const success=(state,h,extra={})=>({ok:true,state:{...state,health:h},errors:[],...extra});
function text(value,label,max,errors,required=false){if(value===undefined)value='';if(typeof value!=='string'){errors.push(`${label}: informe um texto.`);return '';}const clean=value.trim();if(required&&!clean)errors.push(`${label}: preencha este campo.`);if(clean.length>max)errors.push(`${label}: use até ${max} caracteres.`);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean))errors.push(`${label}: remova os caracteres de controle.`);return clean;}
function row(collection,raw,id,state,{stored=false}={}){
 const errors=[];if(!record(raw)||!validId(id))return {errors:['Registro ou identificador inválido.']};
 const schemas={appointments:['type','title','date','time','documentId','note','done'],medications:['title','time','note','done'],logs:['date','sleep','energy','feeling','note'],activities:['title','date','time','note','done'],meals:['day','slot','recipeId']};
 const allowed=schemas[collection];if(!allowed)return {errors:['Área inválida.']};
 if(Object.keys(raw).some(k=>!allowed.includes(k)&&!(stored&&k==='id')))errors.push('Há campos não permitidos neste registro.');
 const item={id};
 if(allowed.includes('title'))item.title=text(raw.title,'Nome',120,errors,true);
 if(allowed.includes('note'))item.note=text(raw.note,'Observação',1000,errors);
 if(allowed.includes('date')){item.date=raw.date;if(!validDate(item.date))errors.push('Escolha uma data válida.');}
 if(allowed.includes('time')){item.time=raw.time;if(!validTime(item.time))errors.push('Escolha um horário válido.');}
 if(allowed.includes('done')){item.done=raw.done??false;if(typeof item.done!=='boolean')errors.push('Estado de conclusão inválido.');}
 if(collection==='appointments'){
  item.type=raw.type;if(!['consulta','exame','retorno'].includes(item.type))errors.push('Escolha consulta, exame ou retorno.');
  item.documentId=raw.documentId??'';
  if(typeof item.documentId!=='string'||(item.documentId&&!validId(item.documentId)))errors.push('Referência de documento inválida.');
  else if(!stored&&item.documentId&&!(Array.isArray(state.documents)&&state.documents.some(d=>d?.id===item.documentId&&!d.trashed)))errors.push('Escolha um documento existente e fora da lixeira.');
 }
 if(collection==='logs'){
  item.sleep=raw.sleep;item.energy=raw.energy;item.feeling=text(raw.feeling,'Como você está',200,errors,true);
  if(!['bem','regular','pouco'].includes(item.sleep))errors.push('Escolha como foi seu sono.');
  if(!['boa','media','baixa'].includes(item.energy))errors.push('Escolha sua disposição.');
 }
 if(collection==='meals'){
  item.day=raw.day;item.slot=raw.slot;item.recipeId=raw.recipeId;
  if(!DAYS.some(d=>d.id===item.day))errors.push('Escolha um dia da semana.');
  if(!['almoco','jantar'].includes(item.slot))errors.push('Escolha almoço ou jantar.');
  if(!RECIPES.some(r=>r.id===item.recipeId))errors.push('Escolha uma receita de exemplo.');
 }
 return {item,errors};
}
/** Absent state gets demo examples. Existing malformed state is never silently replaced. */
export function healthState(state={}){
 if(!record(state))return {...emptyHealth(),readOnly:true,error:'Estado local inválido.'};
 if(!own(state,'health'))return demoHealth();
 const h=state.health,invalid=()=>({...emptyHealth(),readOnly:true,error:'Os dados locais de cuidado têm um formato não reconhecido. Nada foi apagado ou substituído.'});
 if(!record(h)||h.version!==1||!collections.every(k=>Array.isArray(h[k])&&h[k].length<=250)||!Array.isArray(h.groceryChecked)||h.groceryChecked.some(v=>typeof v!=='string')||!record(h.professional)||!['nutrition','movement'].every(k=>typeof h.professional[k]==='string'&&h.professional[k].length<=3000))return invalid();
 const result={...h,professional:{...h.professional},groceryChecked:[...h.groceryChecked]};
 for(const collection of collections){const ids=new Set();result[collection]=[];for(const value of h[collection]){const parsed=row(collection,value,value?.id,state,{stored:true});if(parsed.errors.length||ids.has(value.id))return invalid();ids.add(value.id);result[collection].push(parsed.item);}}
 if(new Set(result.meals.map(m=>`${m.day}/${m.slot}`)).size!==result.meals.length)return invalid();
 return result;
}
function start(state){if(!record(state))return {error:'Estado local inválido.'};const h=healthState(state);return h.readOnly?{error:h.error}:{h};}
/** Required stable ID makes repeated form confirmation an upsert, never a duplicate. */
export function saveHealthItem(state,collection,raw,id){
 const {h,error}=start(state);if(error)return fail(state,error);if(!collections.includes(collection))return fail(state,'Área inválida.');
 const existing=h[collection].find(x=>x.id===id);
 const prepared=record(raw)&&existing&&togglable.includes(collection)&&!own(raw,'done')?{...raw,done:existing.done}:raw;
 const parsed=row(collection,prepared,id,state);if(parsed.errors.length)return fail(state,parsed.errors);
 const item=parsed.item;let list=h[collection].filter(x=>x.id!==id);
 if(collection==='meals')list=list.filter(x=>x.day!==item.day||x.slot!==item.slot);
 if(list.length>=250)return fail(state,'O limite de 250 exemplos nesta área foi atingido.');
 if(existing)list=h[collection].map(x=>x.id===id?item:x).filter(x=>collection!=='meals'||x.id===id||x.day!==item.day||x.slot!==item.slot);else list.push(item);
 h[collection]=list;
 if(collection==='meals')h.groceryChecked=h.groceryChecked.filter(i=>groceryList(h).includes(i));
 return success(state,h,{item,duplicate:!!existing&&JSON.stringify(existing)===JSON.stringify(item)});
}
export function removeHealthItem(state,collection,id){const {h,error}=start(state);if(error)return fail(state,error);if(!collections.includes(collection)||!validId(id))return fail(state,'Registro inválido.');const existed=h[collection].some(x=>x.id===id);h[collection]=h[collection].filter(x=>x.id!==id);if(collection==='meals')h.groceryChecked=h.groceryChecked.filter(i=>groceryList(h).includes(i));return success(state,h,{duplicate:!existed});}
export function toggleHealthItem(state,collection,id){const {h,error}=start(state);if(error)return fail(state,error);if(!togglable.includes(collection)||!validId(id))return fail(state,'Registro inválido.');const item=h[collection].find(x=>x.id===id);if(!item)return fail(state,'Este registro não está mais disponível.');item.done=!item.done;return success(state,h,{item});}
export function groceryList(health){const ids=new Set((Array.isArray(health?.meals)?health.meals:[]).map(m=>m?.recipeId));return [...new Set(RECIPES.filter(r=>ids.has(r.id)).flatMap(r=>r.ingredients))].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
export function toggleGrocery(state,ingredient){const {h,error}=start(state);if(error)return fail(state,error);if(!groceryList(h).includes(ingredient))return fail(state,'Este ingrediente não faz parte das refeições escolhidas.');h.groceryChecked=h.groceryChecked.includes(ingredient)?h.groceryChecked.filter(i=>i!==ingredient):[...h.groceryChecked,ingredient];return success(state,h);}
export function saveProfessional(state,kind,value){const {h,error}=start(state);if(error)return fail(state,error);if(!['nutrition','movement'].includes(kind))return fail(state,'Tipo de plano inválido.');const errors=[],clean=text(value,'Plano ou referência profissional',3000,errors);if(errors.length)return fail(state,errors);h.professional[kind]=clean;return success(state,h);}
/** Ingredient-keyword convenience only, never an allergy/safety assessment. */
export function filterRecipes({minutes='all',budget='all',preference='all',exclude=''}={}){
 const max=minutes===''||minutes==='all'?Infinity:Number(minutes),keywords=String(exclude).split(/[,;\n]/).map(normalize).filter(Boolean);
 return RECIPES.filter(r=>(Number.isFinite(max)||max===Infinity)&&r.minutes<=max&&(budget==='all'||!budget||r.budget===budget)&&(preference==='all'||!preference||r.preference===preference)&&!keywords.some(k=>r.ingredients.some(i=>normalize(i).includes(k))));
}
export function consultationSummary(state){
 const h=healthState(state);if(h.readOnly)return `MENTRA LIFE — RESUMO DE EXEMPLO\n${h.error}`;
 const date=v=>v.split('-').reverse().join('/'),type={consulta:'Consulta',exame:'Exame',retorno:'Retorno'},sleep={bem:'Bem',regular:'Regular',pouco:'Pouco'},energy={boa:'Boa',media:'Média',baixa:'Baixa'};
 const lines=[globalThis.mentraProduction?'MENTRA LIFE — RESUMO PARA CONSULTA':'MENTRA LIFE — RESUMO PARA CONSULTA (DEMONSTRAÇÃO)',globalThis.mentraProduction?'Registros informados pela pessoa. Não é diagnóstico, prescrição ou interpretação clínica.':'Somente registros fictícios deste navegador. Não é diagnóstico, prescrição ou interpretação clínica.','Este arquivo foi gerado por escolha da pessoa; nenhum envio é realizado.','','COMO TENHO ME SENTIDO'];
 const logs=[...h.logs].sort((a,b)=>a.date.localeCompare(b.date));
 if(!logs.length)lines.push('Nenhum registro de sono, disposição ou sentimentos.');
 for(const l of logs)lines.push(`${date(l.date)} | Sono: ${sleep[l.sleep]} | Disposição: ${energy[l.energy]}`,`Como me sinto: ${l.feeling}`,`Observações para conversar: ${l.note||'Não informadas.'}`,'');
 lines.push('CONSULTAS, EXAMES E RETORNOS');
 if(!h.appointments.length)lines.push('Nenhum compromisso registrado.');
 for(const a of [...h.appointments].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))){const doc=a.documentId?(Array.isArray(state.documents)?state.documents.find(d=>d?.id===a.documentId&&!d.trashed):null):null;lines.push(`${date(a.date)} ${a.time} | ${type[a.type]}: ${a.title} | ${a.done?'Concluído':'A organizar'}`,`Observação: ${a.note||'Não informada.'}`);if(a.documentId)lines.push(`Documento referenciado: ${doc?.title||'Não disponível na biblioteca local.'}`);}
 lines.push('',globalThis.mentraProduction?'HORÁRIOS INFORMADOS':'HORÁRIOS INFORMADOS — EXEMPLOS');
 if(!h.medications.length)lines.push('Nenhum horário registrado.');
 for(const m of [...h.medications].sort((a,b)=>a.time.localeCompare(b.time)))lines.push(`${m.time} | ${m.title} | ${m.done?(globalThis.mentraProduction?'Marcado':'Marcado na demonstração'):(globalThis.mentraProduction?'Sem marcação':'Sem marcação na demonstração')}`,`Nota: ${m.note||'Não informada.'}`);
 lines.push('','O protótipo não define doses, não valida tratamentos e não oferece lembretes externos ou conexão com profissionais. Confira os registros antes de escolher compartilhar.');
 return lines.join('\n');
}
