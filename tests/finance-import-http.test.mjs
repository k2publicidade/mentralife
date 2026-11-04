import test from 'node:test';
import assert from 'node:assert/strict';
import {saveAccount} from '../dist/finance.mjs';
import {accountState} from '../dist/account-state.mjs';
import {parseFinancialCsv,reviewFinancialCsv,applyFinancialCsv} from '../dist/finance-import.mjs';
const base=process.env.MENTRA_TEST_URL;
test('lote CSV persiste via HTTP/D1 com revisão CAS e isolamento da conta',{skip:!base},async()=>{
 const password='synthetic-import-password-2026',users=[];
 const call=async(path,{method='GET',body,cookie}={})=>{const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  for(const name of ['importer','other']){const a=await call('register',{method:'POST',body:{name,email:name+'-'+crypto.randomUUID()+'@import.test',password,plan:'plus'}});assert.equal(a.status,200);users.push(a);}
  const owner=users[0],s=saveAccount(accountState(null,owner.body.user),{name:'Conta sintética',kind:'bank',openingBalanceCents:null}).state,parsed=await parseFinancialCsv('Data;Descrição;Valor\n2026-10-29;Teste sintético;-5,25'),review=await reviewFinancialCsv(s,parsed,{accountId:s.accounts[0].id,date:'0',title:'1',amount:'2',amountFormat:'brl',dateFormat:'iso',paymentMethod:'other',status:'actual'}),next=applyFinancialCsv(s,review,[0]);
  assert.equal((await call('state',{method:'PUT',cookie:owner.cookie,body:{data:next,revision:0}})).status,200);
  const read=await call('state',{cookie:owner.cookie});assert.equal(read.body.data.records[0].cents,525);assert.equal(read.body.data.records[0].importSourceKey,next.records[0].importSourceKey);
  assert.equal((await call('state',{method:'PUT',cookie:owner.cookie,body:{data:s,revision:0}})).status,409);assert.equal((await call('state',{cookie:users[1].cookie})).body.data,null);
 }finally{for(const u of users)assert.equal((await call('account',{method:'DELETE',cookie:u.cookie,body:{password,confirmed:'on'}})).status,200);}
});
