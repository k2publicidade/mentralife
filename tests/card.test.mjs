import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {cardRenewals,luhn,validCpf,cardBrand,parseCard} from '../server/card.mjs';

const KEY='ssp_test_'+'0'.repeat(40),DAY=86400000,origin='https://site.example.test',backend='https://worker.example.test',secret='a'.repeat(64);
const NUMBER='4111111111111111',CPF='52998224725';
const form=(over={})=>({plan:'essencial',acceptTerms:true,authorizeRenewal:true,
 card:{number:'4111 1111 1111 1111',holderName:'Ana Souza',expMonth:12,expYear:2030,cvv:'123'},
 client:{name:'Ana Souza',cpf:'529.982.247-25',phone:'(21) 98214-3394',address:{zip:'22775-042',street:'Rua Carlos Machado',number:'152',neighborhood:'Barra Olímpica',city:'Rio de Janeiro',state:'RJ'}},...over});

function setup(t){
 const DB=integrationDB();t.after(()=>DB.sql.close());
 const env={DB,PUBLIC_ORIGIN:origin,VERCEL_ORIGIN_SECRET:secret,SIX7PAY_API_KEY:KEY,SIX7PAY_CHECKOUT:'on',SIX7PAY_CARD:'on',SIX7PAY_ESTABLISHMENT:'440627'};
 const call=async(path,data,cookie,method)=>{const r=await worker.fetch(new Request(backend+'/api/'+path,{method:method||(data?'POST':'GET'),headers:{Origin:origin,'x-mentra-origin-secret':secret,'x-vercel-forwarded-for':'203.0.113.7',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async(email='ana@example.test')=>{const r=await call('register',{name:'Ana Souza',email,password:'synthetic-card-password',plan:'essencial',acceptTerms:true});assert.equal(r.status,200,JSON.stringify(r.body));return {...r,id:r.body.user.id};};
 return {DB,env,call,signup};
}
// Six7Pay falsa: guarda cada chamada (sem o corpo do cartão nos logs do teste) e responde conforme o cenário.
function six7pay(t,{verify='PAID',renew='PAID',token='tok_abc123456789'}={}){
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  assert.equal(options.redirect,'manual');
  const {pathname}=new URL(url),body=options.body?JSON.parse(options.body):null;calls.push({method:options.method||'GET',path:pathname,body,key:options.headers?.['Idempotency-Key']});
  if(pathname==='/paytime/transactions'&&body.card?.create_token){
   if(verify==='HTTP402')return Response.json({error:{code:'CARD_REFUSED',message:'Saldo insuficiente'}},{status:402});
   return Response.json({_id:'cv'+calls.length+'x'.repeat(20),status:verify,amount:body.amount,original_amount:body.amount,establishment:{id:440627},card:{token,first4:'4111',last4:'1111'}});
  }
  if(pathname==='/paytime/transactions'&&body.card?.token)return Response.json({_id:'rn'+calls.length+'x'.repeat(20),status:renew,amount:body.amount,original_amount:body.amount,establishment:{id:440627}});
  if(/\/reversal$/.test(pathname))return Response.json({status:'REFUNDED'});
  if(/^\/paytime\/transactions\/[^/]+$/.test(pathname))return Response.json({_id:'x',status:'PAID',establishment:{id:440627}});
  return new Response('{}',{status:404});
 });
 return calls;
}

test('validação do cartão, CPF e bandeira',()=>{
 assert.equal(luhn(NUMBER),true);assert.equal(luhn('4111111111111112'),false);
 assert.equal(validCpf(CPF),true);assert.equal(validCpf('11111111111'),false);assert.equal(validCpf('52998224724'),false);
 assert.equal(cardBrand(NUMBER),'Visa');assert.equal(cardBrand('5555666677778884'),'Mastercard');assert.equal(cardBrand('6362970000457013'),'Elo');assert.equal(cardBrand('378282246310005'),'Amex');
 const parsed=parseCard(form(),{name:'Ana',email:'ana@example.test'},new Date('2026-11-26'));
 assert.deepEqual(parsed.client.address,{street:'Rua Carlos Machado',number:'152',neighborhood:'Barra Olímpica',city:'Rio de Janeiro',state:'RJ',zip_code:'22775042'});
 assert.equal(parsed.client.phone,'21982143394');assert.equal(parsed.card.holder_name,'ANA SOUZA');assert.equal(parsed.view.last4,'1111');
 for(const bad of [{card:{...form().card,number:'4111111111111112'}},{card:{...form().card,expYear:2025}},{card:{...form().card,cvv:'12'}},{client:{...form().client,cpf:'111.111.111-11'}},{client:{...form().client,phone:'123'}},{client:{...form().client,address:{...form().client.address,state:'XX'}}}])
  assert.throws(()=>parseCard(form(bad),{name:'Ana',email:'a@b'},new Date('2026-11-26')),e=>e.status===400,JSON.stringify(bad).slice(0,60));
});

test('cartão verificado com R$ 1,00 estornado libera 30 dias grátis com renovação; o número nunca é gravado',async t=>{
 const {DB,call,signup}=setup(t),user=await signup(),calls=six7pay(t);
 const r=await call('card/trial',form(),user.cookie);
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.card.last4,'1111');assert.equal(r.body.card.brand,'Visa');
 const charge=calls.find(c=>c.body?.card?.create_token);
 assert.equal(charge.body.payment_type,'CREDIT');assert.equal(charge.body.amount,100);assert.equal(charge.body.installments,1);assert.match(charge.key,/^mentra-cv-/);
 assert.equal(charge.body.client.document,CPF);assert.equal(charge.body.client.email,'ana@example.test');assert.equal(charge.body.client.address.zip_code,'22775042');
 assert.ok(calls.some(c=>/\/reversal$/.test(c.path)&&c.body.amount===100&&/^estorno-cv-/.test(c.key)),'verificação estornada');
 const sub=DB.sql.prepare('SELECT * FROM subscriptions WHERE user_id=?').get(user.id);
 assert.equal(sub.status,'active');assert.equal(sub.auto_renew,1);assert.ok(Math.abs(sub.current_period_end-(Date.now()+30*DAY))<60000);assert.equal(sub.trial_ends_at,sub.current_period_end);
 assert.equal(DB.sql.prepare('SELECT token FROM payment_methods WHERE user_id=?').get(user.id).token,'tok_abc123456789');
 assert.equal(DB.sql.prepare("SELECT status FROM card_verifications").get().status,'reversed');
 // Nenhuma tabela guarda o número do cartão, o CVV ou o CPF em texto.
 for(const {name} of DB.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())
  for(const row of DB.sql.prepare(`SELECT * FROM "${name}"`).all()){const dump=JSON.stringify(row);assert.ok(!dump.includes(NUMBER),name);assert.ok(!dump.includes('"123"'),name);if(name!=='payment_methods')assert.ok(!dump.includes(CPF),name);}
 const me=await call('me',null,user.cookie);
 assert.equal(me.body.billing.inTrial,true);assert.equal(me.body.billing.autoRenew,true);assert.equal(me.body.billing.card.last4,'1111');
 assert.equal(me.body.billing.nextCharge.cents,6700);assert.equal(me.body.billing.nextCharge.promotional,true);assert.equal(me.body.billing.trialEligible,false);
 // Segundo pedido de teste na mesma conta: recusado sem nova cobrança.
 const before=calls.length;assert.equal((await call('card/trial',form(),user.cookie)).status,409);assert.equal(calls.length,before);
});

test('o mesmo cartão ou CPF não ganha outro teste grátis em outra conta',async t=>{
 const {call,signup}=setup(t),one=await signup('a@example.test'),two=await signup('b@example.test');six7pay(t);
 assert.equal((await call('card/trial',form(),one.cookie)).status,200);
 const again=await call('card/trial',form(),two.cookie);assert.equal(again.status,409);assert.match(again.body.error,/já usou o teste grátis/);
 const otherCard=await call('card/trial',form({card:{...form().card,number:'5555666677778884'}}),two.cookie);assert.equal(otherCard.status,409,'mesmo CPF');
});

test('cartão recusado ou sem autorização de renovação não libera nada',async t=>{
 const {DB,call,signup}=setup(t),user=await signup();
 let calls=six7pay(t,{verify:'HTTP402'});
 const refused=await call('card/trial',form(),user.cookie);assert.equal(refused.status,402);assert.match(refused.body.error,/recusado: Saldo insuficiente/);
 assert.equal(DB.sql.prepare('SELECT status FROM subscriptions WHERE user_id=?').get(user.id).status,'pending');assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM payment_methods').get().n,0);
 t.mock.restoreAll();calls=six7pay(t,{verify:'PENDING'});
 const pending=await call('card/trial',form(),user.cookie);assert.equal(pending.status,402);
 const before=calls.length;
 assert.equal((await call('card/trial',form({authorizeRenewal:false}),user.cookie)).status,400);
 assert.equal((await call('card/trial',form({card:{...form().card,number:'4111111111111112'}}),user.cookie)).status,400);
 assert.equal(calls.length,before,'dados inválidos não chegam à Six7Pay');
});

test('no fim do teste a renovação cobra o plano pelo token e soma o período; depois cobra o preço normal',async t=>{
 const {DB,env,call,signup}=setup(t),user=await signup(),calls=six7pay(t);
 await call('card/trial',form(),user.cookie);
 const end=Date.now()+3600000;DB.sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE user_id=?').run(end,user.id);
 await cardRenewals(env);
 const charge=calls.find(c=>c.body?.card?.token);
 assert.equal(charge.body.amount,6700);assert.deepEqual(charge.body.card,{token:'tok_abc123456789'});assert.equal(charge.body.client.document,CPF);
 const order=DB.sql.prepare("SELECT * FROM six7pay_orders WHERE method='card'").get();assert.equal(order.status,'paid');assert.equal(order.amount,6700);assert.equal(order.promotional,1);
 const sub=DB.sql.prepare('SELECT * FROM subscriptions WHERE user_id=?').get(user.id);assert.equal(sub.current_period_end,end+30*DAY);assert.equal(sub.renewal_attempts,0);
 // Cron de novo antes do vencimento: nada é cobrado.
 const count=calls.length;await cardRenewals(env);assert.equal(calls.length,count);
 // Próximo período: preço normal.
 DB.sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE user_id=?').run(Date.now()+60000,user.id);await cardRenewals(env);
 assert.equal(calls.filter(c=>c.body?.card?.token).at(-1).body.amount,9990);
 // A renovação no cartão entra no direito de arrependimento como qualquer pagamento.
 const w=await call('six7pay/withdraw',{confirm:true},user.cookie);assert.equal(w.status,200,JSON.stringify(w.body));
});

test('renovação recusada tenta de novo em 1, 2 e 3 dias e depois para; cancelar evita a cobrança',async t=>{
 const {DB,env,call,signup}=setup(t),user=await signup();let calls=six7pay(t);
 await call('card/trial',form(),user.cookie);t.mock.restoreAll();calls=six7pay(t,{renew:'REFUSED'});
 const now=Date.now();DB.sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE user_id=?').run(now-1000,user.id);
 for(const [attempt,wait] of [[1,1],[2,2],[3,3],[4,null]]){
  const at=DB.sql.prepare('SELECT renewal_next_at FROM subscriptions WHERE user_id=?').get(user.id).renewal_next_at??now;
  await cardRenewals(env,at+1);
  const sub=DB.sql.prepare('SELECT * FROM subscriptions WHERE user_id=?').get(user.id);
  assert.equal(sub.renewal_attempts,attempt);assert.match(sub.renewal_error,/recusado/);
  if(wait)assert.equal(sub.renewal_next_at,at+1+wait*DAY);else assert.equal(sub.renewal_next_at,null);
 }
 const tries=calls.filter(c=>c.body?.card?.token).length;assert.equal(tries,4);
 await cardRenewals(env,now+30*DAY);assert.equal(calls.filter(c=>c.body?.card?.token).length,4,'parou depois da 4ª tentativa');
 const me=await call('me',null,user.cookie);assert.match(me.body.billing.renewalError,/recusado/);
 // Outra conta: cancela a renovação durante o teste e nada é cobrado no fim.
 const other=setup(t),u2=await other.signup('c@example.test');t.mock.restoreAll();const c2=six7pay(t);
 await other.call('card/trial',form({card:{...form().card,number:'5555666677778884'},client:{...form().client,cpf:'11144477735'}}),u2.cookie);
 assert.equal((await other.call('card/renewal',{autoRenew:false},u2.cookie)).status,200);
 other.DB.sql.prepare('UPDATE subscriptions SET current_period_end=? WHERE user_id=?').run(Date.now()-1,u2.id);await cardRenewals(other.env);
 assert.equal(c2.filter(c=>c.body?.card?.token).length,0);
 assert.equal((await other.call('card',null,u2.cookie,'DELETE')).status,200);assert.equal(other.DB.sql.prepare('SELECT COUNT(*) n FROM payment_methods').get().n,0);
});

test('excluir a conta apaga o cartão, mas mantém o bloqueio de novo teste (só HMAC)',async t=>{
 const {DB,call,signup}=setup(t),user=await signup();six7pay(t);
 await call('card/trial',form(),user.cookie);
 const del=await call('account',{password:'synthetic-card-password',confirmed:true},user.cookie,'DELETE');assert.equal(del.status,200,JSON.stringify(del.body));
 assert.equal(DB.sql.prepare('SELECT COUNT(*) n FROM payment_methods').get().n,0);
 const claims=DB.sql.prepare('SELECT key FROM trial_claims').all();assert.equal(claims.length,2);for(const c of claims)assert.match(c.key,/^[a-f0-9]{64}$/);
});

test('sem SIX7PAY_CARD=on o cartão fica desligado',async t=>{
 const {env,call,signup}=setup(t);env.SIX7PAY_CARD='off';const user=await signup();six7pay(t);
 assert.equal((await call('card/trial',form(),user.cookie)).status,503);
 assert.equal((await call('me',null,user.cookie)).body.billing.cardEnabled,false);
});

test('quem já pagou antes não ganha teste: "Assinar com cartão" cobra o plano na hora e liga a renovação',async t=>{
 const {DB,call,signup}=setup(t),user=await signup();const calls=six7pay(t);
 DB.sql.prepare("INSERT INTO payment_events(event_id,user_id,payload,created_at) VALUES('old',?,'{}',0)").run(user.id);
 const me=await call('me',null,user.cookie);assert.equal(me.body.billing.trialEligible,false);
 assert.equal((await call('card/trial',form(),user.cookie)).status,409);
 const r=await call('card',form({plan:'essencial'}),user.cookie);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.charged,true);
 assert.equal(calls.filter(c=>c.body?.card?.token).at(-1).body.amount,9990,'preço normal: já pagou antes');
 const sub=DB.sql.prepare('SELECT * FROM subscriptions WHERE user_id=?').get(user.id);
 assert.equal(sub.status,'active');assert.equal(sub.auto_renew,1);assert.ok(sub.current_period_end>Date.now()+29*DAY);assert.equal(sub.trial_ends_at,null);
 // Sem plano escolhido e sem acesso ativo, nada é cobrado.
 const other=setup(t),u2=await other.signup('d@example.test');
 assert.equal((await other.call('card',form({plan:undefined,card:{...form().card,number:'5555666677778884'}}),u2.cookie)).status,400);
});
