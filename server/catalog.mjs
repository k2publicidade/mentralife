// One plan with full access sold in three periods. The ids are kept from the old tiers
// (essencial/plus/premium) because the D1 tables restrict subscriptions.plan to them.
// priceCents is the regular price; promoPriceCents applies only to a first-ever payment.
export const PLAN_IDS = ['essencial','plus','premium'];
const DESCRIPTION='Acesso completo: rotina, finanças, documentos, Impulso, bem-estar e a IA da Mentra.';
export const DEFAULT_PLANS = [
 {id:'essencial',name:'Mensal',description:DESCRIPTION,days:30,priceCents:9990,promoPriceCents:6700,monthlyRequests:2000,currency:'BRL'},
 {id:'plus',name:'Trimestral',description:DESCRIPTION,days:90,priceCents:19990,promoPriceCents:14700,monthlyRequests:2000,currency:'BRL'},
 {id:'premium',name:'Anual',description:DESCRIPTION,days:365,priceCents:49990,promoPriceCents:29700,monthlyRequests:2000,currency:'BRL'}
];
const cents=value=>Number.isInteger(value)&&value>=100&&value<=10000000;
export function validateCatalog(input){
 if(!Array.isArray(input)||input.length!==PLAN_IDS.length)throw Error('Informe os três planos.');
 return PLAN_IDS.map(id=>{
  const rows=input.filter(p=>p?.id===id);if(rows.length!==1)throw Error('Cada um dos três planos precisa aparecer uma única vez.');
  const p=rows[0],name=typeof p.name==='string'?p.name.trim():'',description=typeof p.description==='string'?p.description.trim():'';
  if(!name||name.length>60||!description||description.length>240)throw Error('Cada plano precisa de nome (até 60 caracteres) e descrição (até 240).');
  if(!Number.isInteger(p.monthlyRequests)||p.monthlyRequests<1||p.monthlyRequests>1000000)throw Error('O limite mensal deve ser um inteiro entre 1 e 1.000.000.');
  if(!Number.isInteger(p.days)||p.days<1||p.days>730)throw Error('Os dias liberados por pagamento devem ser um inteiro entre 1 e 730.');
  if(p.priceCents!==null&&!cents(p.priceCents))throw Error('Defina um preço regular entre R$ 1,00 e R$ 100.000,00 ou deixe sem preço.');
  const promo=p.promoPriceCents??null;
  if(promo!==null&&(p.priceCents===null||!cents(promo)||promo>=p.priceCents))throw Error('O preço promocional precisa ser menor que o preço regular, ou ficar vazio.');
  return {id,name,description,days:p.days,priceCents:p.priceCents,promoPriceCents:promo,monthlyRequests:p.monthlyRequests,currency:'BRL'};
 });
}
export async function loadPlans(db){
 const row=await db.prepare("SELECT value,updated_at FROM product_settings WHERE key='plans'").first();
 const stored=row?JSON.parse(row.value):null;
 // A catalog saved before periods existed (no days) is replaced by the current defaults.
 const current=Array.isArray(stored)&&stored.every(p=>Number.isInteger(p?.days));
 return {plans:current?validateCatalog(stored):structuredClone(DEFAULT_PLANS),revision:row?.updated_at||0};
}

// The promotional price is for people who never had a paid Six7Pay order (or any recorded payment).
export async function promoEligible(db,userId){
 if(!userId)return true;
 const paid=await db.prepare(`SELECT 1 AS paid FROM six7pay_orders WHERE user_id=? AND (status='paid' OR paid_at IS NOT NULL)
  UNION ALL SELECT 1 FROM payment_events WHERE user_id=? LIMIT 1`).bind(userId,userId).first();
 return !paid;
}
// The amount the server charges now. Nothing sent by the client takes part in it.
export function chargeFor(plan,eligible){
 if(!plan?.priceCents)return {chargeCents:null,promotional:false};
 const promotional=Boolean(eligible&&plan.promoPriceCents&&plan.promoPriceCents<plan.priceCents);
 return {chargeCents:promotional?plan.promoPriceCents:plan.priceCents,promotional};
}
export const pricedPlans=(plans,eligible)=>plans.map(p=>({...p,regularPriceCents:p.priceCents,...chargeFor(p,eligible)}));
