import {validDate,MAX_CENTS} from '../dist/finance.mjs';
import {normalizeQuery,resolveAccountQuery} from './ai-query.mjs';

const list=value=>(Array.isArray(value)?value:[]).filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
const live=v=>!v.trashed&&!v.cancelled&&!v.canceled&&!['cancelled','canceled'].includes(v.status);
const amount=v=>Number.isSafeInteger(v)&&v>0&&v<=MAX_CENTS;
const label=(v,max=80)=>typeof v==='string'?v.slice(0,max):'';
const accountId=v=>typeof v==='string'&&v.length<=128?v:null;
const inPeriod=(date,p)=>!p||(!p.fromDate||date>=p.fromDate)&&(!p.toDate||date<=p.toDate);

function aggregate(records,obligations,period){
 const totals={incomeCents:0,expenseCents:0,netFlowCents:0,estimatedIncomeCents:0,estimatedExpenseCents:0,outstandingPayableCents:0,outstandingReceivableCents:0,matchedRecords:0};
 const categories=new Map();
 for(const r of records){
  if(!inPeriod(r.date,period))continue;totals.matchedRecords++;
  if(r.type==='transfer')continue;
  const income=r.type==='income';
  if(r.status==='estimated'){totals[income?'estimatedIncomeCents':'estimatedExpenseCents']+=r.cents;continue;}
  totals[income?'incomeCents':'expenseCents']+=r.cents;
  const key=normalizeQuery(r.category),group=categories.get(key)||{category:r.category,incomeCents:0,expenseCents:0};group[income?'incomeCents':'expenseCents']+=r.cents;categories.set(key,group);
 }
 for(const o of obligations){if(inPeriod(o.dueDate,period))totals[o.kind==='payable'?'outstandingPayableCents':'outstandingReceivableCents']+=o.cents-o.settledCents;}
 totals.netFlowCents=totals.incomeCents-totals.expenseCents;
 const groups=[...categories.values()].sort((a,b)=>b.expenseCents-a.expenseCents||a.category.localeCompare(b.category));
 return {totals,categories:{total:groups.length,included:groups.slice(0,20),truncated:groups.length>20}};
}

function balances(accounts,records,asOf,query){
 const eligible=accounts.filter(a=>!query.accountIds.length||query.accountIds.includes(a.id));
 const selected=eligible.slice(0,20),map=new Map(selected.map(a=>{
  const known=Number.isSafeInteger(a.openingBalanceCents)&&Math.abs(a.openingBalanceCents)<=MAX_CENTS&&validDate(a.openingBalanceDate)&&a.openingBalanceDate<=asOf;
  return [a.id,{name:label(a.name),archived:a.archived===true,known,openingBalanceDate:known?a.openingBalanceDate:null,openingBalanceCents:known?a.openingBalanceCents:null,movementCents:0,balanceCents:null}];
 }));
 const add=(id,cents,date)=>{const a=map.get(id);if(a&&(!a.known||date>=a.openingBalanceDate))a.movementCents+=cents;};
 for(const r of records){if(r.status!=='actual'||r.date>asOf)continue;if(r.type==='transfer'){add(r.fromAccountId,-r.cents,r.date);add(r.toAccountId,r.cents,r.date);}else add(r.accountId,r.type==='income'?r.cents:-r.cents,r.date);}
 for(const a of map.values())if(a.known)a.balanceCents=a.openingBalanceCents+a.movementCents;
 return {asOf,basis:'Saldos manuais calculados a partir do saldo inicial e movimentações realizadas vinculadas. Sem saldo inicial válido, balanceCents é null. Filtros de categoria/texto não alteram o saldo integral da conta. Não representa consulta ao banco.',total:eligible.length,included:[...map.values()],truncated:eligible.length>20};
}

export function buildFinanceContext(state,today,question){
 const allRecords=list(state.records).filter(live),allObligations=list(state.obligations).filter(live);
 const records=allRecords.filter(r=>validDate(r.date)&&amount(r.cents)&&['income','expense','transfer'].includes(r.type)&&['actual','estimated'].includes(r.status)).map(r=>({title:label(r.title,300),date:r.date,type:r.type,status:r.status,cents:r.cents,category:label(r.category)||'Outros',accountId:accountId(r.accountId),fromAccountId:accountId(r.fromAccountId),toAccountId:accountId(r.toAccountId)}));
 const obligations=allObligations.filter(o=>validDate(o.dueDate)&&amount(o.cents)&&['payable','receivable'].includes(o.kind)&&(o.settledCents==null||Number.isSafeInteger(o.settledCents)&&o.settledCents>=0&&o.settledCents<=o.cents)).map(o=>({title:label(o.title,300),dueDate:o.dueDate,kind:o.kind,cents:o.cents,settledCents:o.settledCents||0,category:label(o.category)||'Outros',accountId:accountId(o.accountId)}));
 const query=resolveAccountQuery(state,question,today);
 const categoryNames=new Set(query.categoryNames.map(normalizeQuery));
 const matches=r=>(!query.accountIds.length||query.accountIds.includes(r.accountId)||r.type==='transfer'&&[r.fromAccountId,r.toAccountId].some(id=>query.accountIds.includes(id)))&&(!categoryNames.size||categoryNames.has(normalizeQuery(r.category)))&&(!query.textTerms.length||query.textTerms.some(term=>normalizeQuery(r.title+' '+r.category).includes(term)));
 const scopedRecords=records.filter(matches),scopedObligations=obligations.filter(matches);
 const first=query.periods[0],sums=query.needsClarification?[]:query.periods.map(p=>({period:p,...aggregate(scopedRecords,scopedObligations,p)}));
 const accounts=list(state.accounts).filter(a=>accountId(a.id)&&typeof a.name==='string'&&a.name.length<=80);
 const counts=new Map();for(const a of accounts)counts.set(a.id,(counts.get(a.id)||0)+1);
 const uniqueAccounts=accounts.filter(a=>counts.get(a.id)===1);
 return {currency:'BRL',unit:'centavos inteiros',basis:'Todos os registros válidos salvos que correspondem aos filtros explícitos da consulta, não apenas os detalhes incluídos. Fluxo líquido não é saldo bancário. Transferências internas não são receitas/despesas. Previsões e compromissos a liquidar são separados e não devem ser somados sem verificar sobreposição.',
  query,allTime:query.needsClarification?null:aggregate(scopedRecords,scopedObligations).totals,
  period:sums.length?{...first,...sums[0].totals}:null,
  comparisons:query.mode==='comparison'?sums.map(s=>({...s.period,...s.totals,categories:s.categories})):[],
  categories:sums[0]?.categories||{total:0,included:[],truncated:false},
  accounts:query.needsClarification?null:balances(uniqueAccounts,records,first?.toDate&&first.toDate<today?first.toDate:today,query),
  invalidAccountsExcluded:accounts.length-uniqueAccounts.length,
  validRecords:records.length,invalidRecordsExcluded:allRecords.length-records.length,validObligations:obligations.length,invalidObligationsExcluded:allObligations.length-obligations.length};
}
