import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {deleteAccount} from '../server/account.mjs';
import {legalPages} from '../scripts/legal-pages.mjs';
import {COMPANY,LEGAL,missingCompanyFields,termsSections,privacySections,companyMarkup} from '../dist/legal.mjs';
import {DEFAULT_PLANS} from '../server/catalog.mjs';

const KEY='ssp_test_'+'0'.repeat(40),DAY=86400000,origin='https://site.example.test',backend='https://worker.example.test',secret='a'.repeat(64);

function setup(t,{consents=false,six7pay=false}={}){
 const DB=integrationDB({consents});t.after(()=>DB.sql.close());
 const env={DB,PUBLIC_ORIGIN:origin,VERCEL_ORIGIN_SECRET:secret,DEEPSEEK_API_KEY:'test-key',...(six7pay?{SIX7PAY_API_KEY:KEY,SIX7PAY_CHECKOUT:'on',SIX7PAY_ESTABLISHMENT:'440627'}:{})};
 const call=async(path,data,cookie,method,ip='203.0.113.7')=>{const r=await worker.fetch(new Request(backend+'/api/'+path,{method:method||(data?'POST':'GET'),headers:{Origin:origin,'x-mentra-origin-secret':secret,'x-vercel-forwarded-for':ip,...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const signup=async(email='legal@example.test',password='synthetic-legal-password')=>{const r=await call('register',{name:'Pessoa Teste',email,password,plan:'essencial',acceptTerms:true});assert.equal(r.status,200,JSON.stringify(r.body));return {...r,password,id:r.body.user.id};};
 return {DB,env,call,signup};
}
const activate=(DB,id,days=30)=>DB.sql.prepare("UPDATE subscriptions SET status='active',current_period_end=? WHERE user_id=?").run(Date.now()+days*DAY,id);
function paidOrder(DB,userId,{paidAt=Date.now(),amount=6700,days=30,tx='6aa5d6ac5f5fc577ba661748'}={}){
 const id='a'.repeat(23)+String(Math.floor(Math.random()*10));
 DB.sql.prepare("INSERT INTO six7pay_orders(id,user_id,plan,amount,days,promotional,status,created_at,expires_at,transaction_id,paid_at) VALUES(?,?,'essencial',?,?,1,'paid',?,?,?,?)").run(id,userId,amount,days,paidAt-60000,paidAt+3600000,tx,paidAt);
 DB.sql.prepare("INSERT INTO payment_events(event_id,user_id,payload,created_at) VALUES(?,?,?,?)").run('six7pay:'+tx,userId,JSON.stringify({provider:'six7pay',order:id,amount,days}),paidAt);
 DB.sql.prepare("UPDATE subscriptions SET status='active',current_period_end=? WHERE user_id=?").run(paidAt+days*DAY,userId);
 return id;
}
function six7payStub(t,{reversal=200}={}){
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  assert.equal(options.redirect,'manual');
  const {pathname}=new URL(url),method=options.method||'GET';calls.push(method+' '+pathname);
  if(/\/reversal$/.test(pathname))return reversal===200?Response.json({status:'REFUNDED'}):new Response('{}',{status:reversal});
  if(/^\/paytime\/transactions\/[^/]+$/.test(pathname))return Response.json({_id:'x',status:reversal===200?'REFUNDED':'PAID'});
  return new Response('{}',{status:404});
 });
 return calls;
}

test('cadastro exige aceite dos Termos e registra versão, prova do aceite e acesso (Marco Civil, art. 15)',async t=>{
 const {DB,call}=setup(t);
 const refused=await call('register',{name:'Sem aceite',email:'sem@example.test',password:'synthetic-legal-password',plan:'essencial'});
 assert.equal(refused.status,400);assert.match(refused.body.error,/Termos de Uso/);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
 const ok=await call('register',{name:'Com aceite',email:'com@example.test',password:'synthetic-legal-password',plan:'essencial',acceptTerms:'1'});
 assert.equal(ok.status,200);
 assert.equal(ok.body.user.termsAccepted,true);assert.equal(ok.body.user.aiConsent,false);assert.equal(ok.body.user.healthConsent,false);
 const row=DB.sql.prepare('SELECT terms_version,terms_accepted_at FROM users WHERE id=?').get(ok.body.user.id);
 assert.equal(row.terms_version,LEGAL.termsVersion);assert.ok(row.terms_accepted_at>0);
 assert.deepEqual({...DB.sql.prepare('SELECT kind,granted,version FROM consent_log WHERE user_id=?').get(ok.body.user.id)},{kind:'terms',granted:1,version:LEGAL.termsVersion});
 await call('login',{email:'com@example.test',password:'synthetic-legal-password'},null,'POST','198.51.100.9');
 assert.deepEqual(DB.sql.prepare('SELECT event,ip FROM access_log WHERE user_id=? ORDER BY created_at').all(ok.body.user.id).map(r=>({...r})),[{event:'register',ip:'203.0.113.7'},{event:'login',ip:'198.51.100.9'}]);
 const me=await call('me',null,ok.cookie);
 assert.equal(me.body.legal.termsVersion,LEGAL.termsVersion);assert.equal(me.body.withdrawal.eligible,null);
});

test('Mentra IA só recebe dados depois do consentimento específico; revogar bloqueia de novo',async t=>{
 const {DB,call,signup}=setup(t);const user=await signup();activate(DB,user.id);
 let sent=0;t.mock.method(globalThis,'fetch',async()=>{sent++;return new Response('{}',{status:500});});
 const ask=()=>call('chat',{requestId:'req_'+'1'.repeat(20),revision:0,messages:[{role:'user',content:'O que tenho amanhã?'}]},user.cookie);
 const blocked=await ask();
 assert.equal(blocked.status,428);assert.match(blocked.body.error,/Privacidade/);assert.equal(sent,0,'nada vai para a DeepSeek sem consentimento');
 const granted=await call('account/consents',{ai:true},user.cookie);
 assert.equal(granted.status,200);assert.equal(granted.body.user.aiConsent,true);
 assert.notEqual((await ask()).status,428);assert.ok(sent>0);
 const revoked=await call('account/consents',{ai:false},user.cookie);assert.equal(revoked.body.user.aiConsent,false);
 assert.equal((await ask()).status,428);
 assert.deepEqual(DB.sql.prepare("SELECT granted FROM consent_log WHERE user_id=? AND kind='ai' ORDER BY rowid").all(user.id).map(r=>r.granted),[1,0]);
 assert.equal((await call('account/consents',{terms:false},user.cookie)).status,400,'os Termos não são “revogados” por aqui');
 assert.equal((await call('account/consents',{health:'sim'},user.cookie)).status,400);
});

test('“Apagar meus dados” remove o conteúdo e mantém conta, plano, pagamentos e a sessão atual',async t=>{
 const {DB,call,signup}=setup(t);const user=await signup();const order=paidOrder(DB,user.id);
 const put=await call('state',{revision:0,data:{tasks:[{id:'t1',title:'Segredo'}],events:[],records:[],documents:[],inbox:[],messages:[],profile:{}}},user.cookie,'PUT');assert.equal(put.status,200,JSON.stringify(put.body));
 await call('feedback',{kind:'problema',page:'hoje',message:'um relato qualquer'},user.cookie);
 const other=await call('login',{email:'legal@example.test',password:user.password});
 assert.equal((await call('account/erase',{password:'senha-errada-123456',confirmed:true},user.cookie)).status,403);
 const erased=await call('account/erase',{password:user.password,confirmed:true},user.cookie);assert.equal(erased.status,200);
 for(const table of ['user_states','user_state_chunks','feedback'])assert.equal(DB.sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(user.id).n,0,table);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users WHERE id=?').get(user.id).n,1);
 assert.equal(DB.sql.prepare('SELECT status FROM subscriptions WHERE user_id=?').get(user.id).status,'active');
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM six7pay_orders WHERE id=?').get(order).n,1);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM payment_events WHERE user_id=?').get(user.id).n,1);
 assert.equal((await call('state',null,user.cookie)).body.data,null);
 assert.equal((await call('me',null,other.cookie)).status,401,'outros aparelhos são desconectados');
 assert.equal((await call('me',null,user.cookie)).status,200);
});

test('excluir a conta com acesso pago vigente funciona e guarda os pagamentos por 5 anos após o fim do ano',async t=>{
 const {DB,call,signup}=setup(t);const user=await signup();const paidAt=Date.UTC(2026,10,20);const order=paidOrder(DB,user.id,{paidAt});
 const deleted=await call('account',{password:user.password,confirmed:true},user.cookie,'DELETE');
 assert.equal(deleted.status,200,JSON.stringify(deleted.body));
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
 const kept=DB.sql.prepare('SELECT * FROM retained_payments WHERE former_user_id=? ORDER BY source').all(user.id);
 assert.deepEqual(kept.map(r=>r.source),['payment_event','six7pay_order']);
 const orderRow=kept.find(r=>r.source==='six7pay_order');
 assert.equal(orderRow.email,'legal@example.test');assert.equal(JSON.parse(orderRow.record).order,order);assert.equal(JSON.parse(orderRow.record).amount,6700);
 assert.equal(orderRow.delete_after,Date.UTC(2032,0,1));
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM access_log WHERE user_id=?').get(user.id).n,1,'registro de acesso sobrevive à exclusão');
});

test('PIX em aberto adia a exclusão sem deixar nada pela metade',async t=>{
 const {DB,signup}=setup(t);const user=await signup();paidOrder(DB,user.id);
 DB.sql.prepare("INSERT INTO six7pay_orders(id,user_id,plan,amount,days,status,created_at,expires_at) VALUES('b'||hex(randomblob(11)),?,'essencial',9990,30,'pending',?,?)").run(user.id,Date.now(),Date.now()+3600000);
 assert.equal(await deleteAccount(DB,{id:user.id},{waitOpenPix:true}),false);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM retained_payments').get().n,0);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM payment_events').get().n,1);
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
});

test('arrependimento em 7 dias: protocolo imediato, estorno integral e dias retirados; repetir não estorna de novo',async t=>{
 const {DB,call,signup}=setup(t,{six7pay:true});const user=await signup();const order=paidOrder(DB,user.id);
 const calls=six7payStub(t);
 const me=await call('me',null,user.cookie);
 assert.equal(me.body.withdrawal.eligible.orderId,order);assert.equal(me.body.withdrawal.eligible.amount,6700);
 assert.equal((await call('six7pay/withdraw',{},user.cookie)).status,400,'exige confirmação');
 const done=await call('six7pay/withdraw',{confirm:true},user.cookie);
 assert.equal(done.status,200);assert.equal(done.body.status,'refunded');assert.match(done.body.protocol,/^ARR-[A-F0-9]{10}$/);assert.equal(done.body.amount,6700);
 assert.equal(calls.filter(c=>c.endsWith('/reversal')).length,1);
 const order_=DB.sql.prepare('SELECT refunded_at,refund_amount FROM six7pay_orders WHERE id=?').get(order);assert.ok(order_.refunded_at);assert.equal(order_.refund_amount,6700);
 assert.equal(DB.sql.prepare('SELECT status FROM subscriptions WHERE user_id=?').get(user.id).status,'canceled');
 assert.equal(DB.sql.prepare('SELECT status FROM withdrawal_requests WHERE order_id=?').get(order).status,'refunded');
 const again=await call('six7pay/withdraw',{confirm:true},user.cookie);
 assert.equal(again.status,409);assert.match(again.body.error,new RegExp(done.body.protocol));
 assert.equal(calls.filter(c=>c.endsWith('/reversal')).length,1);
 assert.equal((await call('me',null,user.cookie)).body.withdrawal.request.status,'refunded');
});

test('arrependimento: se a Six7Pay não confirmar, o pedido fica registrado e o admin conclui',async t=>{
 const {DB,call,signup}=setup(t,{six7pay:true});const user=await signup();const order=paidOrder(DB,user.id);
 six7payStub(t,{reversal:500});
 const pending=await call('six7pay/withdraw',{confirm:true},user.cookie);
 assert.equal(pending.status,202);assert.equal(pending.body.status,'requested');
 assert.equal(DB.sql.prepare('SELECT status FROM subscriptions WHERE user_id=?').get(user.id).status,'active','acesso só sai com o estorno confirmado');
 const admin=await (async()=>{const a=await call('register',{name:'Admin',email:'admin@example.test',password:'synthetic-admin-password',plan:'essencial',acceptTerms:true});DB.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(a.body.user.id);return a;})();
 const list=await call('admin/payments',null,admin.cookie);
 assert.equal(list.body.items.find(i=>i.id===order).withdrawal_status,'requested');
 t.mock.restoreAll();six7payStub(t);
 assert.equal((await call('admin/payments/refund',{orderId:order,confirm:true},admin.cookie)).status,200);
 assert.equal(DB.sql.prepare('SELECT status FROM withdrawal_requests WHERE order_id=?').get(order).status,'refunded');
});

test('arrependimento fora do prazo de 7 dias é recusado sem chamar a Six7Pay',async t=>{
 const {DB,call,signup}=setup(t,{six7pay:true});const user=await signup();paidOrder(DB,user.id,{paidAt:Date.now()-8*DAY});
 const calls=six7payStub(t);
 assert.equal((await call('me',null,user.cookie)).body.withdrawal.eligible,null);
 const late=await call('six7pay/withdraw',{confirm:true},user.cookie);
 assert.equal(late.status,409);assert.match(late.body.error,/7 dias/);assert.equal(calls.length,0);
});

test('PIX só é gerado com os Termos vigentes aceitos, e o pedido guarda a versão aceita',async t=>{
 const {DB,call,signup}=setup(t,{six7pay:true});const user=await signup();
 DB.sql.prepare('UPDATE users SET terms_version=NULL WHERE id=?').run(user.id);
 t.mock.method(globalThis,'fetch',async(url,options={})=>{assert.equal(options.redirect,'manual');const {pathname}=new URL(url);if(/\/qrcode$/.test(pathname))return Response.json({qrcode:'data:image/png;base64,AA=='});return Response.json({_id:'6aa5d6ac5f5fc577ba661749',status:'PENDING',emv:'000201',establishment:{id:440627},amount:6700,original_amount:6700});});
 const refused=await call('six7pay/checkout',{plan:'essencial'},user.cookie);
 assert.equal(refused.status,428);assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM six7pay_orders').get().n,0);
 const ok=await call('six7pay/checkout',{plan:'essencial',acceptTerms:true},user.cookie);
 assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.equal(DB.sql.prepare('SELECT terms_version FROM six7pay_orders').get().terms_version,LEGAL.termsVersion);
 assert.equal(DB.sql.prepare('SELECT terms_version FROM users WHERE id=?').get(user.id).terms_version,LEGAL.termsVersion);
});

test('cron apaga pagamentos retidos vencidos e registros de acesso com mais de 6 meses',async t=>{
 const {DB,env}=setup(t);const now=Date.now();
 DB.sql.prepare("INSERT INTO retained_payments VALUES('six7pay_order:old','u','N','e','six7pay_order','{}',0,0,?)").run(now-1);
 DB.sql.prepare("INSERT INTO retained_payments VALUES('six7pay_order:new','u','N','e','six7pay_order','{}',0,0,?)").run(now+DAY);
 DB.sql.prepare("INSERT INTO access_log VALUES('a1','u','login','1.1.1.1',?)").run(now-190*DAY);
 DB.sql.prepare("INSERT INTO access_log VALUES('a2','u','login','1.1.1.1',?)").run(now-170*DAY);
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:404}));
 await worker.scheduled({},env);
 assert.deepEqual(DB.sql.prepare('SELECT id FROM retained_payments').all().map(r=>r.id),['six7pay_order:new']);
 assert.deepEqual(DB.sql.prepare('SELECT id FROM access_log').all().map(r=>r.id),['a2']);
});

test('exportação inclui pedidos, consentimentos e registros de acesso',async t=>{
 const {DB,call,signup}=setup(t);const user=await signup();paidOrder(DB,user.id);
 const data=(await call('account/export',null,user.cookie)).body;
 assert.equal(data.orders.length,1);assert.equal(data.consents[0].kind,'terms');assert.equal(data.accessLog[0].event,'register');
});

test('páginas legais publicadas estão em dia com dist/legal.mjs e cobrem as exigências',()=>{
 for(const [file,content] of Object.entries(legalPages()))assert.equal(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n'),content,file+' desatualizado: rode node scripts/legal-pages.mjs');
 const terms=termsSections({plans:DEFAULT_PLANS}).map(s=>s.title+s.body.join('')).join('').replace(/ /g,' ');
 for(const needle of ['art. 49','não renova sozinho','renova automaticamente','Teste grátis de 30 dias','Cancelar renovação automática','estornamos na mesma hora','App Store','Google Play','Desconectar calendário','myaccount.google.com/permissions','Apagar meus dados','Excluir minha conta','Contestação','Cobrança indevida','R$ 99,90','R$ 67,00','2.000 mensagens'])assert.ok(terms.includes(needle),needle);
 const privacy=privacySections().map(s=>s.title+s.body.join('')).join('');
 for(const needle of ['Encarregado','art. 11, I','art. 33','DeepSeek','China','Cloudflare','Six7Pay','art. 18','ANPD','Marco Civil'])assert.ok(privacy.includes(needle),needle);
 assert.match(readFileSync(new URL('../dist/excluir-conta.html',import.meta.url),'utf8'),/id="deletion-form"/);
});

test('identificação da empresa: campos obrigatórios e escape',()=>{
 assert.deepEqual(missingCompanyFields({legalName:'A',cnpj:'B',address:'C',email:'D',phone:'E',supportHours:'F'}),[]);
 assert.deepEqual(missingCompanyFields({...COMPANY,legalName:'',cnpj:' '}).slice(0,2),['nome empresarial','CNPJ']);
 const html=companyMarkup({company:{legalName:'<b>X</b>',cnpj:'00.000.000/0001-00',address:'Rua',email:'a@b.test',phone:'1',supportHours:'9h'}});
 assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));assert.ok(html.includes('00.000.000/0001-00'));assert.ok(!html.includes('a preencher'));
 assert.ok(!companyMarkup({links:false}).includes('href='),'versão para o app nativo sem links externos');
});
