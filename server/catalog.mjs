export const PLAN_IDS = ['essencial','plus','premium'];
export const DEFAULT_PLANS = [
 {id:'essencial',name:'Essencial',monthlyRequests:100,priceCents:null,currency:'BRL',description:'Sua rotina, documentos e finanças em um só lugar.'},
 {id:'plus',name:'Plus',monthlyRequests:500,priceCents:null,currency:'BRL',description:'Mais espaço para conversar, organizar e colocar ideias em prática.'},
 {id:'premium',name:'Premium',monthlyRequests:2000,priceCents:null,currency:'BRL',description:'Para quem usa a Mentra intensamente no dia a dia.'}
];
export function validateCatalog(input){
 if(!Array.isArray(input)||input.length!==PLAN_IDS.length)throw Error('Informe os três planos.');
 return PLAN_IDS.map(id=>{
  const rows=input.filter(p=>p?.id===id);if(rows.length!==1)throw Error('Os planos Essencial, Plus e Premium precisam aparecer uma única vez.');
  const p=rows[0],name=typeof p.name==='string'?p.name.trim():'',description=typeof p.description==='string'?p.description.trim():'';
  if(!name||name.length>60||!description||description.length>240)throw Error('Cada plano precisa de nome (até 60 caracteres) e descrição (até 240).');
  if(!Number.isInteger(p.monthlyRequests)||p.monthlyRequests<1||p.monthlyRequests>1000000)throw Error('O limite mensal deve ser um inteiro entre 1 e 1.000.000.');
  if(p.priceCents!==null&&(!Number.isInteger(p.priceCents)||p.priceCents<100||p.priceCents>10000000))throw Error('Defina um preço mensal entre R$ 1,00 e R$ 100.000,00 ou deixe sem preço.');
  return {id,name,description,monthlyRequests:p.monthlyRequests,priceCents:p.priceCents,currency:'BRL'};
 });
}
export async function loadPlans(db){
 const row=await db.prepare("SELECT value,updated_at FROM product_settings WHERE key='plans'").first();
 return {plans:row?validateCatalog(JSON.parse(row.value)):structuredClone(DEFAULT_PLANS),revision:row?.updated_at||0};
}
