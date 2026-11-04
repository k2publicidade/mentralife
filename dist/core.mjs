import {operationDate} from './time.mjs';
import {parseFinancialCapture} from './finance.mjs';
import {eventFromText,validCalendarDate} from './organizer.mjs';
export const DEMO_DATE = globalThis.mentraProduction ? new Date().toLocaleDateString('en-CA') : '2026-10-14';
export const STORAGE_KEY = 'mentra-life-demo-v4';
export const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const money = cents => (Number(cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseMoney(value) {
  const raw=String(value).trim().replace(/R\$|\s/g,'');
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(raw)) return null;
  const [whole,decimal='']=raw.replaceAll('.','').split(',');
  const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  return Number.isSafeInteger(cents)&&cents>0&&cents<=999999999 ? cents : null;
}
export const initialState = () => ({version:4,profile:{name:'Marina',goal:'Mais clareza e menos coisas na cabeça',reminders:true},tasks:[{id:'t1',title:'Escolher só três prioridades',category:'Pessoal',done:false},{id:'t2',title:'Revisar os gastos da semana',category:'Dinheiro',done:false},{id:'t3',title:'Separar uma ideia para testar',category:'Projetos',done:true}],events:[{id:'e1',title:'Organizar a semana',date:'2026-10-14',time:'09:00',duration:20},{id:'e2',title:'Retomar minha ideia',date:'2026-10-14',time:'15:00',duration:30},{id:'e3',title:'Revisar prioridades',date:'2026-10-16',time:'10:00',duration:15}],records:[{id:'r1',title:'Serviço freelance',cents:125000,type:'income',status:'actual',category:'Trabalho',date:'2026-10-12'},{id:'r2',title:'Mercado da semana',cents:32000,type:'expense',status:'actual',category:'Casa',date:'2026-10-13'},{id:'r3',title:'Internet e celular',cents:9500,type:'expense',status:'actual',category:'Casa',date:'2026-10-14'},{id:'r4',title:'Serviço em negociação',cents:40000,type:'income',status:'estimated',category:'Trabalho',date:'2026-10-20'}],documents:[{id:'d1',title:'Garantia da cafeteira',category:'Casa',date:'2026-10-01',note:'Exemplo de organização. Nenhum arquivo real foi enviado.',ext:'PDF',trashed:false},{id:'d2',title:'Modelo de proposta',category:'Trabalho',date:'2026-10-10',note:'Modelo fictício para encontrar rapidamente.',ext:'DOC',trashed:false},{id:'d3',title:'Lista da mudança',category:'Pessoal',date:'2026-10-12',note:'Apenas metadados de demonstração.',ext:'TXT',trashed:false}],plan:null,inbox:[],messages:[]});
export function totals(records) {
 const sum=(type,status)=>records.filter(r=>r.type===type&&r.status===status).reduce((s,r)=>s+r.cents,0);
 const income=sum('income','actual'),expense=sum('expense','actual'),estimatedIncome=sum('income','estimated'),estimatedExpense=sum('expense','estimated');
 return {income,expense,balance:income-expense,estimatedIncome,estimatedExpense,projected:income-expense+estimatedIncome-estimatedExpense};
}
export const PATHS={
 income:{title:'Ainda não tenho renda',subtitle:'Começar com o que você já tem.',goal:'Testar uma possibilidade de renda sem gasto inicial.',steps:[['Listar o que você sabe fazer','Anote três habilidades e uma pessoa que poderia precisar delas.'],['Escolher uma oferta pequena','Descreva um serviço que consiga entregar com os recursos de hoje.'],['Conversar com duas pessoas','Pergunte sobre a necessidade antes de investir.'],['Avaliar o primeiro teste','Registre o que funcionou e ajuste a oferta.']]},
 noidea:{title:'Quero empreender, sem uma ideia',subtitle:'Encontrar um começo possível.',goal:'Escolher um problema real para investigar.',steps:[['Observar sua rotina','Anote três dificuldades que você ou pessoas próximas encontram.'],['Escolher um problema','Prefira algo que você conhece e pode investigar sem comprar nada.'],['Ouvir duas pessoas','Entenda como resolvem isso hoje.'],['Desenhar um teste simples','Defina uma oferta pequena e uma forma de aprender.']]},
 idea:{title:'Já tenho uma ideia',subtitle:'Tirar do papel, com um passo simples.',goal:'Validar uma ideia antes de fazer um investimento.',steps:[['Explicar a ideia em uma frase','Para quem é, qual problema resolve e como ajuda?'],['Conversar com três pessoas','Investigue a necessidade sem tentar convencer.'],['Montar uma versão simples','Pode ser uma descrição, uma amostra ou um atendimento de teste.'],['Rever o resultado','Compare o que ouviu e escolha o próximo ajuste.']]},
 business:{title:'Já tenho um negócio',subtitle:'Organizar para dar o próximo passo.',goal:'Encontrar um gargalo e testar uma melhoria.',steps:[['Separar pessoa e negócio','Liste compromissos e entradas de cada um, sem misturar.'],['Escolher um gargalo','Vendas, entrega ou organização: qual pesa mais agora?'],['Testar uma melhoria','Escolha uma mudança pequena com prazo e responsável.'],['Medir e ajustar','Registre o resultado do teste e decida se continua.']]}
};
export function makePlan(key,minutes='15 minutos',resource='Celular e internet') {if(!Object.hasOwn(PATHS,key))throw Error('Caminho inválido');const p=PATHS[key];return{key,title:p.title,goal:p.goal,minutes,resource,steps:p.steps.map(([title,description])=>({id:id(),title,description,done:false}))};}
export function planProgress(plan) {const total=plan?.steps?.length||0,done=plan?.steps?.filter(s=>s.done).length||0;return{total,done,percent:total?Math.round(done/total*100):0};}
export function classifyCapture(text,kind='text',today=operationDate()) {
 const clean=String(text).trim().slice(0,600);
 if(kind==='file')return {type:'document',title:'Documento de exemplo',category:'Pessoal',note:'Arquivo simulado. Somente o nome será incluído na biblioteca.'};
 const financial=parseFinancialCapture(clean,{}, {today});
 if(financial.type!=='none')return {...financial,type:financial.type==='clarification'?'clarification':'record',recordType:financial.draft?.type,needsReview:true};
 if(/reunião|reuniao|compromisso|encontro|agenda/i.test(clean))return globalThis.mentraProduction?eventFromText(clean,today):{type:'event',title:clean,date:'2026-10-15',time:'14:00'};
 return {type:'task',title:clean||'Revisar uma prioridade',category:'Pessoal'};
}
export function confirmCapture(state,capture) {
 if(capture.confirmed)return {state,duplicate:true};
 const item={...capture,confirmed:true};const next=structuredClone(state);let route='vida/tarefas';
 if(item.type==='record'||item.type==='clarification'){return {state,route:'dinheiro/lancamentos',duplicate:false,needsReview:true};}
 else if(item.type==='event'){if(!validCalendarDate(item.date)||typeof item.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))return {state,route:'vida/agenda',duplicate:false,needsReview:true};next.events.push({id:id(),title:item.title,date:item.date,time:item.time,duration:30,...(item.timeZone?{timeZone:item.timeZone}:{})});route='vida/agenda';}
 else if(item.type==='document'){next.documents.unshift({id:id(),title:item.title,category:item.category,date:operationDate(),note:item.note,ext:'PDF',trashed:false});route='vida/documentos';}
 else next.tasks.unshift({id:id(),title:item.title,category:item.category,done:false});
 next.inbox=next.inbox.map(c=>c.id===item.id?{...item,route}:c);
 return {state:next,route,duplicate:false};
}
export function scriptReply(text) {
 const t=text.toLowerCase();
 if(/document|arquivo|garantia/.test(t))return {text:'Vamos encontrar sem procurar em várias pastas. Na biblioteca de exemplo, você pode buscar por nome ou categoria e abrir os detalhes.',label:'Encontrar um documento',route:'vida/documentos'};
 if(/sem renda|não tenho renda|nao tenho renda|começar.*renda|sem ideia|não sei por onde|nao sei por onde|encontrar.*caminho|trabalho|carreira/.test(t))return {text:'Você pode começar pelo que já sabe fazer, sem assumir um gasto. O primeiro passo é listar três habilidades e escolher uma oferta pequena para testar. Não há garantia de renda.',label:'Encontrar meu próximo passo',route:'caminhos/novo/discover'};
 if(/dinheiro|gasto|conta|finance|saldo/.test(t))return {text:'Vamos separar o que já entrou e saiu do que ainda é uma previsão. Depois, você escolhe uma prioridade possível. Os valores desta demonstração são fictícios.',label:'Entender meu dinheiro',route:'dinheiro'};
 if(/negócio|negocio|empresa/.test(t))return {text:'Escolha só um ponto que esteja pesando no negócio. Podemos organizar vendas, entregas e próximos passos em um plano de teste.',label:'Organizar o que já comecei',route:'caminhos/novo/ongoing'};
 if(/ideia|empreender|projeto/.test(t))return {text:'Uma ideia fica mais leve quando vira um pequeno teste. Vamos definir para quem ela serve e qual problema resolve antes de investir.',label:'Tirar uma ideia do papel',route:'caminhos/novo/idea'};
 return {text:'Vamos tirar um pouco do peso da cabeça. Liste o que está pendente, escolha até três prioridades e comece pela menor ação. Você pode ajustar tudo no seu tempo.',label:'Organizar meu dia',route:'vida/tarefas'};
}
