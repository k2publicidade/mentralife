import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../dist/core.mjs';
import {migrateFinanceState,parseBRL,saveAccount,validateFinancialEntry,applyFinancialEntry,createObligation,settleObligation,obligationRemaining,obligationStatus,recurrenceDate,generateRecurrences,accountBalances,saveBudget,financialSummary,parseFinancialCapture,toCsv,validDate} from '../dist/finance.mjs';

const empty = () => migrateFinanceState({version: 4, records: []});
const entry = (extra = {}) => ({title:'Compra',type:'expense',cents:13000,date:'2026-10-14',accountId:'itau',paymentMethod:'pix',category:'Casa',...extra});
const obligation = (extra = {}) => ({title:'Aluguel',kind:'payable',cents:100000,dueDate:'2026-10-20',category:'Casa',accountId:'itau',...extra});
const capture = (text, state=empty()) => parseFinancialCapture(text,state,{today:'2026-10-14'});
const must = result => {assert.equal(result.ok,true,JSON.stringify(result.errors));return result.state;};

test('migration preserves all old data without inventing account ownership or initial balances',()=>{
 const original=initialState(), snapshot=structuredClone(original), migrated=migrateFinanceState(original);
 assert.deepEqual(original,snapshot);assert.equal(migrated.version,5);assert.equal(migrated.records.length,4);assert.deepEqual(migrated.tasks,original.tasks);
 for(const record of migrated.records){assert.equal(record.accountId,null);assert.equal(record.paymentMethod,'other');assert.deepEqual(original.records.find(r=>r.id===record.id),Object.fromEntries(Object.entries(record).filter(([key])=>!['accountId','paymentMethod'].includes(key))));}
 assert.deepEqual(migrateFinanceState(migrated),migrated);assert.equal(migrated.accounts.length,3);assert.ok(migrated.accounts.every(a=>a.openingBalanceCents===null));
 assert.equal(financialSummary(migrated).net,83500);assert.equal(financialSummary(migrated).unassignedCents,83500);
});
test('BRL arithmetic accepts integer cents only and refuses fractional cents, negatives, exponent, overflow',()=>{
 for(const [raw,expected] of [['1.234,56',123456],['130',13000],['R$ 0,01',1],['19,9',1990]]) assert.equal(parseBRL(raw),expected);
 for(const raw of ['1,234','1.25','0','-1','2e3','NaN','Infinity','1,00,00','99999999999',''])assert.equal(parseBRL(raw),null,raw);
 assert.equal(parseBRL('-1,20',{allowNegative:true}),-120);assert.equal(parseBRL('0',{allowZero:true}),0);
 for(const cents of [1.2,0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]) assert.equal(applyFinancialEntry(empty(),entry({cents})).ok,false);
});
test('calendar validation rejects rolled dates and accepts leap years',()=>{
 for(const value of ['2026-02-29','2026-04-31','2026-1-01','','yesterday'])assert.equal(validDate(value),false);
 assert.equal(validDate('2028-02-29'),true);
});
test('manual account requires dated snapshot and distinguishes unknown, zero, and negative opening balance',()=>{
 let state=empty();assert.equal(saveAccount(state,{id:'itau',openingBalanceCents:0}).ok,false);
 state=must(saveAccount(state,{id:'itau',openingBalanceCents:0,openingBalanceDate:'2026-10-01'}));
 state=must(saveAccount(state,{id:'nubank',openingBalanceCents:-500,openingBalanceDate:'2026-10-01'}));
 const b=accountBalances(state);assert.equal(b[0].known,true);assert.equal(b[0].balanceCents,0);assert.equal(b[1].balanceCents,-500);assert.equal(b[2].known,false);assert.equal(b[2].balanceCents,null);
 assert.equal(saveAccount(state,{name:'Itaú',kind:'bank'}).ok,false);assert.equal(saveAccount(state,{name:'Conta extra',kind:'bank'}).ok,true);
});
test('immutable ledger entry supports safe retry and refuses an idempotency key reused with different money',()=>{
 const state=empty(),snapshot=structuredClone(state);const result=applyFinancialEntry(state,entry({idempotencyKey:'capture-1'}));
 assert.equal(result.ok,true);assert.deepEqual(state,snapshot);assert.equal(result.state.records.length,1);
 const again=applyFinancialEntry(result.state,entry({idempotencyKey:'capture-1'}));assert.equal(again.duplicate,true);assert.equal(again.state.records.length,1);
 assert.equal(applyFinancialEntry(result.state,entry({idempotencyKey:'capture-1',cents:999})).ok,false);
});
test('editing preserves identity and count; transfer cannot be converted into an isolated expense',()=>{
 const added=applyFinancialEntry(empty(),entry({idempotencyKey:'capture'}));const edited=applyFinancialEntry(added.state,{id:added.record.id,cents:14000});
 assert.equal(edited.ok,true);assert.equal(edited.updated,true);assert.equal(edited.record.id,added.record.id);assert.equal(edited.record.idempotencyKey,'capture');assert.equal(edited.state.records.length,1);assert.equal(added.record.cents,13000);
 assert.equal(applyFinancialEntry(edited.state,{id:'missing',cents:1}).ok,false);
 const t=applyFinancialEntry(empty(),entry({type:'transfer',fromAccountId:'itau',toAccountId:'nubank'}));assert.equal(applyFinancialEntry(t.state,{id:t.record.id,type:'expense',accountId:'itau'}).ok,false);
});
test('actual, estimated and payment methods are independently validated',()=>{
 for(const paymentMethod of ['credit','card','credito'])assert.equal(validateFinancialEntry(empty(),entry({paymentMethod})).ok,false);
 assert.equal(applyFinancialEntry(empty(),entry({installments:3})).ok,false);assert.equal(applyFinancialEntry(empty(),entry({accountId:null})).ok,false);
 let state=must(applyFinancialEntry(empty(),entry()));state=must(applyFinancialEntry(state,entry({status:'estimated',accountId:null,cents:2000})));
 const summary=financialSummary(state);assert.equal(summary.expense,13000);assert.equal(summary.estimatedExpense,2000);assert.equal(accountBalances(state)[0].movementCents,-13000);
});
test('transfer is atomic, equal-valued, sum-zero and never income or expense',()=>{
 let state=empty();for(const id of ['itau','nubank'])state=must(saveAccount(state,{id,openingBalanceCents:50000,openingBalanceDate:'2026-10-01'}));
 const snapshot=structuredClone(state);const result=applyFinancialEntry(state,entry({type:'transfer',fromAccountId:'itau',toAccountId:'nubank',cents:20000,idempotencyKey:'tx-1'}));
 assert.equal(result.ok,true);assert.deepEqual(state,snapshot);assert.equal(result.state.records.length,1);
 const balances=accountBalances(result.state);assert.equal(balances.find(b=>b.id==='itau').balanceCents,30000);assert.equal(balances.find(b=>b.id==='nubank').balanceCents,70000);assert.equal(balances.reduce((total,b)=>total+b.movementCents,0),0);
 const summary=financialSummary(result.state);assert.equal(summary.income,0);assert.equal(summary.expense,0);assert.equal(summary.net,0);assert.equal(summary.accounts.find(a=>a.accountId==='itau').transferCents,-20000);
 for(const overrides of [{toAccountId:'itau'},{toCents:19999},{fromCents:21000},{status:'estimated'},{toAccountId:'missing'}])assert.equal(applyFinancialEntry(state,entry({type:'transfer',fromAccountId:'itau',toAccountId:'nubank',...overrides})).ok,false);
});
test('dated initial balance is not revenue and pre-snapshot history is not double counted',()=>{
 let state=must(saveAccount(empty(),{id:'itau',openingBalanceCents:100000,openingBalanceDate:'2026-10-10'}));
 state=must(applyFinancialEntry(state,entry({date:'2026-10-09',cents:5000})));state=must(applyFinancialEntry(state,entry({date:'2026-10-10',cents:3000})));
 const balance=accountBalances(state)[0];assert.equal(balance.balanceCents,97000);assert.equal(balance.beforeOpeningCents,-5000);assert.equal(financialSummary(state).expense,8000);assert.equal(financialSummary(state).income,0);
 assert.equal(accountBalances(state,'2026-10-09')[0].balanceCents,null);assert.equal(accountBalances(state,{throughDate:'2026-10-09'})[0].movementCents,-5000);
});
test('archived accounts retain history and balances but reject new postings and settlements',()=>{
 let state=must(applyFinancialEntry(empty(),entry()));state=must(saveAccount(state,{id:'itau',archived:true}));
 assert.equal(financialSummary(state).expense,13000);assert.equal(accountBalances(state)[0].movementCents,-13000);assert.equal(applyFinancialEntry(state,entry()).ok,false);
 assert.equal(applyFinancialEntry(state,entry({type:'transfer',fromAccountId:'itau',toAccountId:'nubank'})).ok,false);assert.equal(capture('gastei 30 do Itaú no Pix',state).type,'clarification');
});
test('partial settlement changes outstanding and creates one actual record with linked payment, atomically',()=>{
 const created=createObligation(empty(),obligation());const before=structuredClone(created.state);
 const first=settleObligation(created.state,created.obligation.id,{cents:30000,accountId:'itau',date:'2026-10-14',paymentMethod:'pix',idempotencyKey:'payment-1'});
 assert.equal(first.ok,true);assert.deepEqual(created.state,before);assert.equal(first.obligation.status,'partial');assert.equal(obligationRemaining(first.obligation),70000);assert.equal(first.state.records.length,1);assert.equal(first.record.obligationId,created.obligation.id);
 assert.deepEqual(first.obligation.settlementIds,[first.record.id]);assert.equal(financialSummary(first.state).expense,30000);assert.equal(financialSummary(first.state).payableCents,70000);
 const duplicate=settleObligation(first.state,created.obligation.id,{cents:30000,accountId:'itau',date:'2026-10-14',paymentMethod:'pix',idempotencyKey:'payment-1'});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.state.records.length,1);assert.equal(obligationRemaining(duplicate.obligation),70000);
 assert.equal(applyFinancialEntry(first.state,{id:first.record.id,cents:1}).ok,false);
 const paid=settleObligation(first.state,created.obligation.id,{cents:70000,accountId:'itau',date:'2026-10-20',paymentMethod:'pix',idempotencyKey:'payment-2'});assert.equal(paid.ok,true);assert.equal(paid.obligation.status,'settled');assert.equal(obligationRemaining(paid.obligation),0);assert.equal(paid.state.records.length,2);
});
test('invalid or excessive settlements are all-or-nothing; retries cannot switch obligations',()=>{
 let state=must(createObligation(empty(),obligation()));const id=state.obligations[0].id,snapshot=structuredClone(state);
 for(const changes of [{cents:100001},{cents:0},{cents:1.5},{accountId:'missing'},{date:'2026-02-30'},{paymentMethod:'credit'},{idempotencyKey:null}]){const r=settleObligation(state,id,{cents:100,accountId:'itau',date:'2026-10-14',idempotencyKey:'s1',...changes});assert.equal(r.ok,false);assert.deepEqual(r.state,snapshot);}
 const first=settleObligation(state,id,{cents:100,accountId:'itau',date:'2026-10-14',idempotencyKey:'s1'});state=must(createObligation(first.state,obligation()));assert.equal(settleObligation(state,state.obligations[0].id,{cents:100,accountId:'itau',date:'2026-10-14',idempotencyKey:'s1'}).ok,false);
});
test('receivables become income only when settled; overdue uses remaining value',()=>{
 const created=createObligation(empty(),obligation({kind:'receivable',dueDate:'2026-10-01'}));assert.equal(financialSummary(created.state).income,0);assert.equal(financialSummary(created.state).receivableCents,100000);assert.equal(obligationStatus(created.obligation,'2026-10-14'),'overdue');
 const settled=settleObligation(created.state,created.obligation.id,{cents:100000,date:'2026-10-14',accountId:'nubank',paymentMethod:'pix',idempotencyKey:'received'});assert.equal(settled.ok,true);assert.equal(financialSummary(settled.state).income,100000);assert.equal(financialSummary(settled.state).receivableCents,0);assert.equal(obligationStatus(settled.obligation,'2026-10-14'),'settled');
});
test('obligation creation retry is safe and mismatched key is rejected',()=>{
 const draft=obligation({idempotencyKey:'bill'}),created=createObligation(empty(),draft);assert.equal(created.ok,true);assert.equal(createObligation(created.state,draft).duplicate,true);assert.equal(createObligation(created.state,{...draft,cents:1}).ok,false);
 assert.equal(createObligation(empty(),obligation({status:'settled'})).ok,false);assert.equal(createObligation(empty(),obligation({settledCents:20})).ok,false);
});
test('monthly/yearly recurrence keeps original day including end-of-month and leap day',()=>{
 assert.equal(recurrenceDate('2026-01-31','monthly',1,1),'2026-02-28');assert.equal(recurrenceDate('2026-01-31','monthly',1,2),'2026-03-31');assert.equal(recurrenceDate('2028-01-31','monthly',1,1),'2028-02-29');
 assert.equal(recurrenceDate('2028-02-29','yearly',1,1),'2029-02-28');assert.equal(recurrenceDate('2028-02-29','yearly',1,4),'2032-02-29');assert.equal(recurrenceDate('2026-12-28','weekly',1,1),'2027-01-04');
});
test('recurrence generation is bounded and idempotent with stable occurrence keys',()=>{
 const created=createObligation(empty(),obligation({dueDate:'2026-01-31',recurrence:{frequency:'monthly',interval:1,until:'2026-04-30'}}));assert.equal(created.ok,true);assert.equal(created.state.recurrences.length,1);
 const generated=generateRecurrences(created.state,'2026-04-30');assert.equal(generated.ok,true);assert.equal(generated.count,3);assert.deepEqual(generated.state.obligations.map(o=>o.dueDate).sort(),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
 const repeated=generateRecurrences(generated.state,'2026-04-30');assert.equal(repeated.count,0);assert.deepEqual(repeated.state.obligations,generated.state.obligations);assert.equal(new Set(generated.state.obligations.map(o=>o.occurrenceKey)).size,4);
 const open=createObligation(empty(),obligation({recurrence:{frequency:'monthly'}}));assert.equal(generateRecurrences(open.state,'2030-10-14').ok,false);assert.equal(createObligation(empty(),obligation({recurrence:{frequency:'daily'}})).ok,false);assert.equal(createObligation(empty(),obligation({recurrence:{frequency:'monthly',count:101}})).ok,false);
});
test('monthly summary supports date/account/category filters and budgets exclude transfers/forecasts',()=>{
 let state=must(applyFinancialEntry(empty(),entry()));state=must(applyFinancialEntry(state,entry({type:'income',cents:20000})));state=must(applyFinancialEntry(state,entry({accountId:'nubank',cents:5000})));state=must(applyFinancialEntry(state,entry({date:'2026-09-30',cents:1000})));
 state=must(applyFinancialEntry(state,entry({status:'estimated',cents:1000})));state=must(applyFinancialEntry(state,entry({type:'transfer',fromAccountId:'itau',toAccountId:'nubank',cents:1000})));
 state=must(saveBudget(state,{month:'2026-10',category:'Casa',cents:17000}));state=must(saveBudget(state,{month:'2026-10',category:'Casa',cents:12000,accountId:'itau'}));
 const summary=financialSummary(state,{month:'2026-10',accountId:'all'});assert.equal(summary.expense,18000);assert.equal(summary.income,20000);assert.equal(summary.net,2000);assert.deepEqual(summary.categories,[{category:'Casa',income:20000,expense:18000,net:2000}]);assert.equal(summary.budgets[0].spentCents,18000);assert.equal(summary.budgets[0].remainingCents,-1000);assert.equal(summary.budgets[0].exceeded,true);assert.equal(summary.budgets[1].spentCents,13000);
 const filtered=financialSummary(state,{from:'2026-10-01',to:'2026-10-31',accountId:'itau',category:'casa'});assert.equal(filtered.expense,13000);assert.equal(filtered.income,20000);
 const edited=saveBudget(state,{month:'2026-10',category:'Casa',cents:20000});assert.equal(edited.ok,true);assert.equal(edited.state.budgets.length,2);assert.equal(saveBudget(state,{month:'2026-13',category:'Casa',cents:100}).ok,false);
});
test('capture parses compact Portuguese without grabbing the date as amount',()=>{
 const compact=capture('gastei130doItaúnoPix');assert.equal(compact.type,'record');assert.equal(compact.cents,13000);assert.equal(compact.draft.accountId,'itau');assert.equal(compact.paymentMethod,'pix');
 const dated=capture('comprei no dia 10 um material de 130 reais');assert.equal(dated.type,'record');assert.equal(dated.cents,13000);assert.equal(dated.date,'2026-10-10');
 for(const text of ['Paguei R$ 130,50 no Itaú em 10/10/2026','Paguei em 2026-10-10 130,50 reais do Itaú','No dia 10 de outubro paguei 130,50 reais no Itaú']){const r=capture(text);assert.equal(r.type,'record',JSON.stringify(r));assert.equal(r.cents,13050);assert.equal(r.date,'2026-10-10');}
 const qty=capture('comprei 2 livros por 130 reais');assert.equal(qty.type,'record');assert.equal(qty.cents,13000);
});
test('capture refuses ambiguous or invalid numeric information, unsupported cards, and mixed directions',()=>{
 for(const text of ['gastei 10 e 130 reais','comprei 2 de 130 reais','comprei 130,123 reais','paguei R$ 1.25','paguei 2e3 reais','paguei no dia 32 130 reais','paguei 130 em 31/02/2026','paguei 130 dia 10 e dia 11','gastei 50 no cartão','gastei 50 no crédito','paguei 3x de 50','recebi 30 e gastei 10','gastei sem lembrar o valor'])assert.equal(capture(text).type,'clarification',text);
});
test('capture recognizes exact transfer direction and insists on both accounts',()=>{
 const first=capture('Transferi 300 do Itaú para o Nubank');assert.equal(first.type,'transfer',JSON.stringify(first));assert.equal(first.draft.fromAccountId,'itau');assert.equal(first.draft.toAccountId,'nubank');assert.equal(first.cents,30000);
 const reverse=capture('Transferi 300 para o Nubank do Itaú');assert.equal(reverse.type,'transfer',JSON.stringify(reverse));assert.equal(reverse.draft.fromAccountId,'itau');assert.equal(reverse.draft.toAccountId,'nubank');
 for(const text of ['transferi 30 no Itaú','transferi 30 entre Itaú e Nubank','transferi 30 do Itaú para Itaú','transferi 30 do Itaú para Nubank e 20 do Nubank para Itaú'])assert.equal(capture(text).type,'clarification',text);
});
test('capture distinguishes unpaid status, uses relative date calendar, and avoids accidental mutations',()=>{
 const state=empty(),snapshot=structuredClone(state),future=capture('Vou pagar 130 reais do Itaú amanhã',state);assert.equal(future.status,'estimated');assert.equal(future.date,'2026-10-15');assert.equal(future.suggestedObligationKind,'payable');assert.equal(future.draft.type,'expense');assert.deepEqual(state,snapshot);
 const income=capture('Recebi 500,50 no Nubank ontem');assert.equal(income.recordType,'income');assert.equal(income.date,'2026-10-13');assert.equal(income.cents,50050);assert.equal(capture('Reunião no dia 10').type,'none');
});
test('CSV quotes separators, newlines, quotes and neutralizes user formula injection',()=>{
 const csv=toCsv([{title:'=HYPERLINK("bad")',note:'line1;line2\n"quoted"',cents:13000},{title:'  @SUM(A1)',note:'\tformula',cents:-1},{title:'+1',note:'normal',cents:0}],['title','note','cents']);
 assert.ok(csv.startsWith('\uFEFF"title";"note";"cents"'));assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('"line1;line2\n""quoted"""'));assert.ok(csv.includes('"\'  @SUM(A1)"'));assert.ok(csv.includes('"\'\tformula"'));assert.ok(csv.includes('"-1"'));assert.ok(csv.includes('"\'+1"'));
 assert.ok(toCsv([{'=bad':'x'}]).startsWith('\uFEFF"\'=bad"'));
});

test('capture masks whole clock times and slash dates preceded by dia',()=>{
 for(const text of ['gastei às 14h30','paguei hoje 14:30'])assert.equal(capture(text).type,'clarification',text);
 for(const text of ['gastei às 14h30 130 reais no Itaú','gastei às 14:30 130 reais no Itaú'])assert.equal(capture(text).cents,13000,text);
 const dated=capture('Paguei no dia 10/09 130 reais no Itaú');assert.equal(dated.type,'record',JSON.stringify(dated));assert.equal(dated.date,'2026-09-10');
 assert.equal(capture('vou transferir 130 do Itaú para o Nubank').type,'clarification');
});
test('recurrence can advance over multiple years in bounded user-triggered batches without truncation',()=>{
 let state=must(createObligation(empty(),obligation({dueDate:'2026-01-31',recurrence:{frequency:'monthly'}})));
 const first=generateRecurrences(state,'2027-01-31');assert.equal(first.ok,true);assert.equal(first.count,12);state=first.state;
 const second=generateRecurrences(state,'2028-01-31');assert.equal(second.ok,true);assert.equal(second.count,12);state=second.state;
 const third=generateRecurrences(state,'2028-02-29');assert.equal(third.ok,true);assert.equal(third.count,1);assert.equal(third.created[0].dueDate,'2028-02-29');assert.equal(generateRecurrences(third.state,'2028-02-29').count,0);
 assert.equal(recurrenceDate('9999-12-31','monthly',1,1),null);assert.equal(recurrenceDate('2026-01-31','weekly',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),null);
});
test('recurrence generation limit rejects atomically instead of silently truncating 100+ new occurrences',()=>{
 let state=empty();for(let n=0;n<3;n++)state=must(createObligation(state,obligation({title:`Semanal ${n}`,dueDate:'2026-01-01',recurrence:{frequency:'weekly'}})));
 const original=structuredClone(state),result=generateRecurrences(state,'2027-01-01');assert.equal(result.ok,false);assert.deepEqual(result.state,original);assert.deepEqual(state,original);
});
test('linked obligations cannot be bypassed by direct record creation',()=>{
 const created=createObligation(empty(),obligation());const result=applyFinancialEntry(created.state,entry({obligationId:created.obligation.id}));assert.equal(result.ok,false);assert.equal(result.state.records.length,0);assert.equal(obligationRemaining(result.state.obligations[0]),100000);
});

test('optional undefined or null IDs cannot overwrite generated account and budget IDs',()=>{
 for(const id of [undefined,null,'']){
  const account=saveAccount(empty(),{id,name:'Conta nova',kind:'bank'});assert.equal(account.ok,true);assert.equal(typeof account.account.id,'string');assert.ok(account.account.id.length>0);assert.equal(account.state.accounts.length,4);assert.equal(new Set(account.state.accounts.map(a=>a.id)).size,4);
  const budget=saveBudget(empty(),{id,month:'2026-10',category:'Casa',cents:50000});assert.equal(budget.ok,true);assert.equal(typeof budget.budget.id,'string');assert.ok(budget.budget.id.length>0);
 }
 assert.equal(saveAccount(empty(),{id:{bad:true},name:'Conta nova',kind:'bank'}).ok,false);assert.equal(saveBudget(empty(),{id:{bad:true},month:'2026-10',category:'Casa',cents:50000}).ok,false);
 const original=saveAccount(empty(),{name:'Conta extra',kind:'bank'});const updated=saveAccount(original.state,{id:original.account.id,name:'Conta revisada'});assert.equal(updated.ok,true);assert.equal(updated.state.accounts.length,4);assert.equal(updated.account.id,original.account.id);
});
test('explicit budget editing cannot create duplicate category-month-account scope',()=>{
 let state=must(saveBudget(empty(),{month:'2026-10',category:'Casa',cents:50000}));const first=state.budgets[0].id;state=must(saveBudget(state,{month:'2026-10',category:'Lazer',cents:10000}));
 assert.equal(saveBudget(state,{id:first,month:'2026-10',category:'Lazer',cents:60000}).ok,false);assert.equal(state.budgets.length,2);
 for(const id of [0,false,42]){assert.equal(saveAccount(empty(),{id,name:'Outra',kind:'bank'}).ok,false);assert.equal(saveBudget(empty(),{id,month:'2026-10',category:'Casa',cents:5000}).ok,false);}
});
