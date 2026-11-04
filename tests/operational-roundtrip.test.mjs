import test from 'node:test';
import assert from 'node:assert/strict';
import {accountState} from '../dist/account-state.mjs';
import {saveAccount,applyFinancialEntry,createObligation,settleObligation,financialSummary} from '../dist/finance.mjs';
import {createIndependentDocument,paymentDocumentBytes} from '../dist/documents-ui.mjs';
import {saveHealthItem,saveProfessional} from '../dist/health-core.mjs';
import {createJourney,updateJourneyStep} from '../dist/journeys-core.mjs';
import {makeEventSeries} from '../dist/event-series.mjs';
import {parseAccountBackup} from '../dist/backup.mjs';
const base=process.env.MENTRA_TEST_URL;
test('operação integrada: finanças, saúde, documentos, caminhos e agenda sobrevivem ao D1 e à restauração isolada', {skip:!base},async()=>{
 async function api(path,{cookie,method='GET',data}={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const suffix=crypto.randomUUID(),password='synthetic-roundtrip-password',a=await api('register',{method:'POST',data:{email:'roundtrip-'+suffix+'@example.test',name:'QA integrada',password,plan:'plus'}}),b=await api('register',{method:'POST',data:{email:'isolated-'+suffix+'@example.test',name:'QA isolada',password,plan:'essencial'}});assert.equal(a.status,200);assert.equal(b.status,200);
 try{let state=accountState(null,a.body.user);const must=r=>{assert.equal(r.ok,true,JSON.stringify(r.errors));return r.state;};
 state=must(saveAccount(state,{name:'Conta manual QA',kind:'bank',openingBalanceCents:100000,openingBalanceDate:'2026-10-01'}));const accountId=state.accounts[0].id;
 state=must(applyFinancialEntry(state,{title:'Despesa de teste',type:'expense',cents:10000,date:'2026-10-28',accountId,paymentMethod:'pix',category:'Casa',status:'actual',idempotencyKey:'expense-qa'}));
 const obligation=createObligation(state,{title:'Compromisso de teste',kind:'payable',cents:20000,dueDate:'2026-10-29',accountId,category:'Casa',idempotencyKey:'obligation-qa'});state=must(obligation);state=must(settleObligation(state,obligation.obligation.id,{cents:5000,date:'2026-10-28',accountId,paymentMethod:'pix',idempotencyKey:'settlement-qa'}));
 const before=structuredClone(state.records);state=must(createIndependentDocument(state,{documentType:'receipt',payer:'Pessoa QA',payee:'Recebedor QA',title:'Recibo independente',amount:'50,00',date:'2026-10-28',paymentMethod:'pix',note:'Sintético',recordId:''},'receipt-qa'));assert.deepEqual(state.records,before);
 state=must(saveHealthItem(state,'appointments',{title:'Retorno QA',type:'retorno',date:'2026-11-03',time:'10:00',note:'Anotação QA',documentId:'receipt-qa'},'appointment-qa'));
 state=must(saveHealthItem(state,'logs',{date:'2026-10-28',sleep:'bem',energy:'boa',feeling:'Registro QA',note:'Sem interpretação'},'log-qa'));state=must(saveProfessional(state,'nutrition','Referência QA'));
 const journey=createJourney(state,{track:'discover',title:'Plano QA',goal:'Testar uma possibilidade',context:'personal',time:15,resources:'Caderno',skills:'Organizar',interests:'Aprender'},'journey-qa');state=must(journey);state=must(updateJourneyStep(state,'journey-qa',state.journeys[0].steps[0].id,{status:'doing'}));state.events=makeEventSeries({title:'Revisão QA',date:'2026-11-01',time:'09:00',duration:30,frequency:'weekly',until:'2026-11-22'},{timeZone:'America/Sao_Paulo'});
 const snapshot=JSON.stringify(state);const stored=await api('state',{method:'PUT',cookie:a.cookie,data:{revision:0,operationId:crypto.randomUUID(),data:state}});assert.equal(stored.status,200);
 const loaded=(await api('state',{cookie:a.cookie})).body;assert.equal(JSON.stringify(loaded.data),snapshot);assert.equal((await api('state',{cookie:b.cookie})).body.data,null);assert.ok(Buffer.from(paymentDocumentBytes(loaded.data.documents[0])).toString('latin1').startsWith('%PDF-'));
 assert.equal(financialSummary(loaded.data,{month:'2026-10'}).expense,15000);
 const exported=(await api('account/export',{cookie:a.cookie})).body;const restored=await parseAccountBackup(JSON.stringify(exported),a.body.user);assert.deepEqual(restored,loaded.data);await assert.rejects(parseAccountBackup(JSON.stringify(exported),b.body.user));
 }finally{for(const account of [a,b])assert.equal((await api('account',{method:'DELETE',cookie:account.cookie,data:{password}})).status,200);}
});
