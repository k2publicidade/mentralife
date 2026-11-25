import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../server/worker.mjs';

function database(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
  sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 return {sql,prepare(text){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){if(/RETURNING/i.test(text))return {results:sql.prepare(text).all(...args)};const r=sql.prepare(text).run(...args);return {meta:{changes:Number(r.changes)}};}};},
  async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}

const KEY='ssp_test_'+'0'.repeat(40),TX='6aa5d6ac5f5fc577ba661748',EMV='00020101021226860014br.gov.bcb.pix2564pix.example.test/qr/v2/cobv/abc5204000053039865802BR5913NEXO TESTE6009SAO PAULO62070503***6304ABCD';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function setup(t,extra={}){
 const DB=database(),origin='https://site.example.test',backend='https://worker.example.test',secret='a'.repeat(64);
 const env={DB,PUBLIC_ORIGIN:origin,VERCEL_ORIGIN_SECRET:secret,SIX7PAY_API_KEY:KEY,SIX7PAY_CHECKOUT:'on',SIX7PAY_ESTABLISHMENT:'440627',...extra};
 t.after(()=>DB.sql.close());
 const call=(path,data,cookie,method)=>worker.fetch(new Request(backend+'/api/'+path,{
  method:method||(data?'POST':'GET'),headers:{Origin:origin,'x-mentra-origin-secret':secret,...(cookie?{Cookie:cookie}:{})},
  body:data?JSON.stringify(data):undefined}),env);
 const signup=await call('register',{name:'Teste',email:'six7pay@example.test',password:'synthetic-six7pay-password',plan:'essencial'});
 const cookie=signup.headers.get('set-cookie').split(';')[0];
 const me=async()=>(await (await call('me',null,cookie)).json());
 const age=ms=>DB.sql.exec(`UPDATE six7pay_orders SET created_at=created_at-${ms},checked_at=checked_at-${ms}`);
 return {DB,env,call,cookie,me,age};
}

// Six7Pay stub: records every request and answers from the handlers given per route.
function stub(t,handlers){
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  const {pathname,search}=new URL(url),method=options.method||'GET';
  calls.push({method,path:pathname+search,headers:options.headers||{},body:options.body?JSON.parse(options.body):null});
  if(!String(url).startsWith('https://painel.six7pay.com.br/'))return new Response('{}',{status:404});
  assert.equal(options.headers['x-api-key'],KEY);
  for(const [pattern,handler] of handlers)if(pattern.test(method+' '+pathname))return handler(calls.at(-1));
  return Response.json({error:{code:'NOT_FOUND',message:'x',requestId:'00000000-0000-0000-0000-000000000000'}},{status:404});
 });
 return calls;
}

const DAY=86400000;
for(const [plan,amount,regular,days] of [['essencial',6700,9990,30],['plus',14700,19990,90],['premium',29700,49990,365]])
test(`Six7Pay PIX (${plan}): 1º pagamento promocional, ${days} dias, não duplica e ativa só depois de PAID`,async t=>{
 const {env,call,cookie,me,age}=await setup(t);
 assert.equal((await call('six7pay/checkout',{plan})).status,401);
 let status='PENDING',paidAmount=amount,establishment=440627;
 // Shapes copied from real Six7Pay responses: with interest STORE, amount is net and original_amount is charged.
 let txid=TX;
 const tx=()=>({_id:txid,status,interest:'STORE',establishment:{id:establishment,type:'BUSINESS'},amount:paidAmount-3,original_amount:paidAmount,fees:3,type:'PIX',emv:EMV,reference_id:'x'});
 const calls=stub(t,[
  [/^POST \/paytime\/transactions$/,({body,headers})=>{
   assert.deepEqual(Object.keys(body).sort(),['amount','interest','payment_type','reference_id']);
   assert.equal(body.payment_type,'PIX');assert.equal(body.amount,paidAmount);assert.equal(body.interest,'STORE');
   assert.match(body.reference_id,/^mentra-[a-f0-9]{24}$/);
   assert.equal(headers['Idempotency-Key'],body.reference_id);
   return Response.json(tx());
  }],
  [/^GET \/paytime\/transactions\/[^/]+\/qrcode$/,()=>Response.json({qrcode:PNG})],
  [/^GET \/paytime\/transactions\/[^/]+$/,()=>Response.json(tx())]
 ]);
 // Whatever the client sends besides the plan id is ignored: the server sets amount and days.
 const first=await (await call('six7pay/checkout',{plan,amount:1,chargeCents:1,priceCents:1,days:999,promotional:true},cookie)).json();
 assert.equal(first.order.status,'pending');
 assert.equal(first.order.amount,amount);
 assert.equal(first.order.days,days);
 assert.equal(first.order.promotional,true);
 assert.equal(first.order.pixCode,EMV);
 assert.equal(first.order.qrImage,PNG);
 const again=await (await call('six7pay/checkout',{plan},cookie)).json();
 assert.equal(again.order.id,first.order.id);
 assert.equal(calls.filter(c=>c.method==='POST').length,1,'um pedido aberto nunca gera uma segunda cobrança');
 const other=plan==='essencial'?'plus':'essencial';
 assert.equal((await call('six7pay/checkout',{plan:other},cookie)).status,409);
 // Status checks are throttled per order.
 const before=calls.length;
 assert.equal((await (await call('six7pay/order',null,cookie)).json()).order.status,'pending');
 assert.equal(calls.length,before);
 assert.equal((await me()).subscription.status,'pending');
 // A paid amount that differs from the order never activates the plan.
 status='PAID';paidAmount=1;age(20000);
 assert.equal((await (await call('six7pay/order',null,cookie)).json()).order.status,'pending');
 assert.equal((await me()).subscription.status,'pending');
 // A transaction from another establishment is never accepted.
 paidAmount=amount;establishment=335886;age(20000);
 assert.equal((await (await call('six7pay/order',null,cookie)).json()).order.status,'pending');
 assert.equal((await me()).subscription.status,'pending');
 establishment=440627;age(20000);
 const paid=await (await call('six7pay/order',null,cookie)).json();
 assert.equal(paid.order.status,'paid');
 const active=(await me()).subscription;
 assert.equal(active.plan,plan);
 assert.equal(active.status,'active');
 assert.ok(Math.abs(active.current_period_end-(Date.now()+days*DAY))<60000,`libera ${days} dias`);
 age(20000);
 await call('six7pay/order',null,cookie);
 await worker.scheduled({},env);
 assert.deepEqual((await me()).subscription,active,'confirmação repetida não estende o período');
 // After a paid order the promotion is gone: renewing costs the regular price.
 const priced=(await me()).plans.find(p=>p.id===plan);
 assert.equal(priced.chargeCents,regular);assert.equal(priced.promotional,false);
 paidAmount=regular;status='PENDING';txid='6aa5d6ac5f5fc577ba661799';
 const renewal=await (await call('six7pay/checkout',{plan,amount:amount},cookie)).json();
 assert.equal(renewal.order.amount,regular,'segundo pagamento a preço cheio');
 assert.equal(renewal.order.promotional,false);
 assert.equal(calls.filter(c=>c.method==='POST').at(-1).body.amount,regular);
});

test('Six7Pay: resposta incerta (202) nunca é reenviada e é conciliada pelo reference_id no cron',async t=>{
 const {env,DB,call,cookie,me,age}=await setup(t);
 let reference;
 const calls=stub(t,[
  [/^POST \/paytime\/transactions$/,({body})=>{reference=body.reference_id;return Response.json({status:'UNKNOWN'},{status:202});}],
  [/^GET \/paytime\/dashboard\/transactions$/,()=>Response.json({total:2,data:[
   {reference_id:reference,establishment_id:'335886',paytime_id:'ffffffffffffffffffffffff',status:'PAID',amount:6700},
   {reference_id:reference,establishment_id:'440627',paytime_id:TX,status:'PAID',amount:6700}]})],
  [/^GET \/paytime\/transactions\/6aa5d6ac5f5fc577ba661748$/,()=>Response.json({_id:TX,status:'PAID',amount:6700})]
 ]);
 const first=await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json();
 assert.equal(first.order.status,'unknown');
 assert.equal(first.order.pixCode,null);
 const again=await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json();
 assert.equal(again.order.id,first.order.id);
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
 // The cron finds the attempt by its unique reference, never by sending it again.
 age(120000);
 await worker.scheduled({},env);
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.ok(calls.some(c=>c.path==='/paytime/dashboard/transactions?q='+reference));
 assert.ok(calls.some(c=>c.path==='/paytime/transactions/'+TX),'usa o paytime_id do estabelecimento correto');
 assert.ok(!calls.some(c=>c.path.includes('ffffffff')));
 assert.equal(DB.sql.prepare('SELECT status FROM six7pay_orders').get().status,'paid');
 assert.equal((await me()).subscription.status,'active');
});

test('Six7Pay: recusa definitiva libera nova tentativa; chave sem SIX7PAY_CHECKOUT mantém o botão desligado',async t=>{
 const {DB,call,cookie,env}=await setup(t);
 let fail=true;
 stub(t,[
  [/^POST \/paytime\/transactions$/,()=>fail
   ?Response.json({error:{code:'PAYTIME_ERROR',message:'Falha',requestId:'46fdfa1a-749e-4558-8168-0e0bf30fdaa0'}},{status:422})
   :Response.json({_id:TX,status:'PENDING',amount:6700})],
  [/^GET \/paytime\/transactions\/[^/]+\/qrcode$/,()=>Response.json({qrcode:{emv:EMV}})]
 ]);
 const refused=await call('six7pay/checkout',{plan:'essencial'},cookie);
 assert.equal(refused.status,502);
 assert.equal(DB.sql.prepare('SELECT status FROM six7pay_orders').get().status,'failed');
 fail=false;
 const retry=await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json();
 assert.equal(retry.order.pixCode,EMV);
 assert.equal(retry.order.qrImage,null);
 env.SIX7PAY_CHECKOUT='off';
 assert.equal((await (await call('plans')).json()).paymentsConfigured,false);
 assert.equal((await call('six7pay/checkout',{plan:'plus'},cookie)).status,503);
});

test('Six7Pay: estorno pelo admin devolve uma vez e retira os dias do pedido; estorno feito na Six7Pay é detectado',async t=>{
 const {env,DB,call,cookie,me,age}=await setup(t);
 const admin=await call('register',{name:'Admin',email:'admin-six7@example.test',password:'synthetic-admin-password',plan:'essencial'});
 DB.sql.prepare("UPDATE users SET role='admin' WHERE email=?").run('admin-six7@example.test');
 const adminCookie=admin.headers.get('set-cookie').split(';')[0];
 let status='PENDING',txCount=0;const ids=['6aa5d6ac5f5fc577ba661748','6aa5d6ac5f5fc577ba661749'],charged={};
 const calls=stub(t,[
  [/^POST \/paytime\/transactions$/,({body})=>{charged[ids[txCount]]=body.amount;return Response.json({_id:ids[txCount++],status:'PENDING',interest:'STORE',establishment:{id:440627},amount:body.amount-3,original_amount:body.amount,emv:EMV});}],
  [/^POST \/paytime\/transactions\/[^/]+\/reversal$/,()=>Response.json({_id:ids[0],status:'REFUNDED'})],
  [/^GET \/paytime\/transactions\/[^/]+\/qrcode$/,()=>Response.json({qrcode:PNG})],
  [/^GET \/paytime\/transactions\/[^/]+$/,({path})=>Response.json({status,establishment:{id:440627},amount:charged[path.split('/').pop()]-3,original_amount:charged[path.split('/').pop()]})],
  [/^GET \/paytime\/establishments\/balance$/,()=>Response.json({total_balance:2697,blocked_balance:2697,balance:0})]
 ]);
 const {order}=await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json();
 status='PAID';age(20000);await call('six7pay/order',null,cookie);
 assert.equal((await me()).subscription.status,'active');
 assert.equal((await call('admin/payments',null,cookie)).status,403,'só admin vê pagamentos');
 const list=await (await call('admin/payments',null,adminCookie)).json();
 assert.equal(list.items[0].status,'paid');assert.equal(list.balance.blocked,2697);assert.equal(list.checkout,true);
 assert.equal((await call('admin/payments/refund',{orderId:order.id},adminCookie)).status,400,'exige confirmação explícita');
 const refund=await call('admin/payments/refund',{orderId:order.id,confirm:true},adminCookie);
 assert.equal(refund.status,200);
 const reversal=calls.find(c=>c.path.endsWith('/reversal'));
 assert.deepEqual(reversal.body,{amount:6700},'estorna o valor promocional cobrado');
 assert.equal(reversal.headers['Idempotency-Key'],'estorno-'+order.id);
 assert.equal((await me()).subscription.status,'canceled');
 assert.equal((await call('admin/payments/refund',{orderId:order.id,confirm:true},adminCookie)).status,409);
 assert.equal(calls.filter(c=>c.path.endsWith('/reversal')).length,1);
 // A second purchase refunded directly in the Six7Pay panel is picked up by the cron.
 status='PENDING';
 const second=(await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json()).order;
 assert.equal(second.amount,9990,'um pagamento estornado ainda conta como já pago');
 status='PAID';age(20000);await call('six7pay/order',null,cookie);
 assert.equal((await me()).subscription.status,'active');
 status='REFUNDED';
 await worker.scheduled({},env);
 assert.equal((await me()).subscription.status,'active','espera 6 h antes de reconsultar um pagamento');
 age(7*3600000);
 await worker.scheduled({},env);
 assert.equal((await me()).subscription.status,'canceled');
 assert.equal(DB.sql.prepare("SELECT count(*) n FROM payment_events WHERE event_id LIKE 'six7pay-refund:%'").get().n,2);
});

test('Six7Pay: renovação antecipada soma dias ao fim da vigência; pedido mantém dias mesmo se o catálogo mudar',async t=>{
 const {DB,call,cookie,me,age}=await setup(t);
 let status='PENDING',n=0;const charged={},ids=['6aa5d6ac5f5fc577ba661750','6aa5d6ac5f5fc577ba661751','6aa5d6ac5f5fc577ba661752'];
 stub(t,[
  [/^POST \/paytime\/transactions$/,({body})=>{charged[ids[n]]=body.amount;return Response.json({_id:ids[n++],status:'PENDING',establishment:{id:440627},original_amount:body.amount,emv:EMV});}],
  [/^GET \/paytime\/transactions\/[^/]+\/qrcode$/,()=>Response.json({qrcode:PNG})],
  [/^GET \/paytime\/transactions\/[^/]+$/,({path})=>Response.json({status,establishment:{id:440627},original_amount:charged[path.split('/').pop()]})]
 ]);
 const pay=async()=>{status='PAID';age(20000);const r=(await (await call('six7pay/order',null,cookie)).json()).order;status='PENDING';return r;};
 // Visitors and new accounts see the promotional price; the regular one comes along.
 const anon=(await (await call('plans')).json()).plans;
 assert.deepEqual(anon.map(p=>[p.name,p.days,p.regularPriceCents,p.promoPriceCents,p.chargeCents,p.promotional,p.monthlyRequests]),
  [['Mensal',30,9990,6700,6700,true,2000],['Trimestral',90,19990,14700,14700,true,2000],['Anual',365,49990,29700,29700,true,2000]]);
 assert.equal((await me()).plans[0].chargeCents,6700);
 // First payment: Mensal, promotional, 30 days from now.
 const first=(await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json()).order;
 assert.equal(first.amount,6700);
 assert.equal((await pay()).status,'paid');
 const end1=(await me()).subscription.current_period_end;
 assert.ok(Math.abs(end1-(Date.now()+30*DAY))<60000);
 // Logged-in /api/plans now shows only regular prices for this person.
 const mine=(await (await call('plans',null,cookie)).json()).plans;
 assert.deepEqual(mine.map(p=>[p.chargeCents,p.promotional]),[[9990,false],[19990,false],[49990,false]]);
 // Early renewal with Trimestral while active: regular price, 90 days added after the current end.
 const second=(await (await call('six7pay/checkout',{plan:'plus'},cookie)).json()).order;
 assert.equal(second.amount,19990);assert.equal(second.days,90);assert.equal(second.promotional,false);
 // The catalog changes after the order was created: confirmation still grants what was sold.
 const changed=structuredClone((await me()).plans).map(({regularPriceCents,chargeCents,promotional,...p})=>({...p,days:7}));
 DB.sql.prepare("INSERT INTO product_settings(key,value,updated_at) VALUES('plans',?,?)").run(JSON.stringify(changed),Date.now());
 assert.equal((await pay()).status,'paid');
 const sub=(await me()).subscription;
 assert.equal(sub.plan,'plus');
 assert.ok(Math.abs(sub.current_period_end-(end1+90*DAY))<60000,'estende a partir do fim da vigência atual, não de hoje');
 DB.sql.prepare("DELETE FROM product_settings WHERE key='plans'").run();
 // Expired access: the next period starts now, not from the old end date.
 DB.sql.prepare('UPDATE subscriptions SET current_period_end=?').run(Date.now()-5*DAY);
 const third=(await (await call('six7pay/checkout',{plan:'premium'},cookie)).json()).order;
 assert.equal(third.amount,49990);
 await pay();
 assert.ok(Math.abs((await me()).subscription.current_period_end-(Date.now()+365*DAY))<60000);
 const events=DB.sql.prepare("SELECT json_extract(payload,'$.days') d,json_extract(payload,'$.promotional') p FROM payment_events ORDER BY created_at").all().map(r=>[r.d,r.p]);
 assert.deepEqual(events,[[30,1],[90,0],[365,0]]);
});

test('Six7Pay: quem pagou nos planos antigos paga o valor regular; acesso liberado sem prazo não compra',async t=>{
 const {DB,call,cookie,me}=await setup(t);
 const calls=stub(t,[
  [/^POST \/paytime\/transactions$/,({body})=>Response.json({_id:TX,status:'PENDING',establishment:{id:440627},original_amount:body.amount,emv:EMV})],
  [/^GET \/paytime\/transactions\/[^/]+\/qrcode$/,()=>Response.json({qrcode:PNG})]
 ]);
 const userId=(await me()).user.id;
 // An order paid before periods existed (R$ 27, no days column).
 DB.sql.prepare("INSERT INTO six7pay_orders(id,user_id,plan,amount,status,created_at,expires_at,transaction_id,paid_at) VALUES('a'||hex(randomblob(12)),?,'essencial',2700,'paid',?,?,'6aa5d6ac5f5fc577ba66aaaa',?)").run(userId,1,2,3);
 assert.equal((await me()).plans[0].chargeCents,9990);
 const order=(await (await call('six7pay/checkout',{plan:'essencial'},cookie)).json()).order;
 assert.equal(order.amount,9990);assert.equal(order.promotional,false);
 assert.equal(calls.filter(c=>c.method==='POST')[0].body.amount,9990);
 // Access granted by the admin with no end date never asks for payment.
 DB.sql.prepare("UPDATE six7pay_orders SET status='canceled' WHERE status!='paid'").run();
 DB.sql.prepare("UPDATE subscriptions SET status='active',current_period_end=NULL").run();
 assert.equal((await call('six7pay/checkout',{plan:'essencial'},cookie)).status,409);
});
