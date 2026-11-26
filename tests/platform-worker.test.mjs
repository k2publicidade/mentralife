import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
function database({consents=true}={}){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_platform.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0002_recovery.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0003_state_chunks.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0004_product_settings.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0005_integrations.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0006_whatsapp_receipts.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0007_audio_claims.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0008_document_shares.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0009_calendar.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0010_native_push.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0011_ai_requests.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0012_picpay.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0013_account_indexes_feedback.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../migrations/0014_six7pay.sql',import.meta.url),'utf8'));for(const m of ['0015_six7pay_refunds','0016_six7pay_periods','0017_legal'])sql.exec(readFileSync(new URL('../migrations/'+m+'.sql',import.meta.url),'utf8'));if(consents)sql.exec("CREATE TRIGGER test_default_consents AFTER INSERT ON users BEGIN UPDATE users SET ai_consent_at=1,health_consent_at=1 WHERE id=NEW.id; END;");return {sql,prepare(text){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};},async run(){if(/RETURNING/i.test(text))return {results:sql.prepare(text).all(...args)};const r=sql.prepare(text).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};}

test('Vercel proxy: cadastro/sessão/logout, origem e IP permanecem isolados no backend Cloudflare',async()=>{
 const DB=database(),origin='https://site.example.test',backend='https://api.example.test',secret='a'.repeat(64),env={DB,PUBLIC_ORIGIN:origin,VERCEL_ORIGIN_SECRET:secret};
 const call=(path,{method='GET',data,cookie,source=origin,key=secret,ip='203.0.113.25'}={})=>worker.fetch(new Request(backend+'/api/'+path,{method,headers:{Origin:source,'x-mentra-origin-secret':key,'x-real-ip':ip,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);
 try{
  assert.equal((await call('me',{key:''})).status,403);
  const registered=await call('register',{method:'POST',data:{name:'QA Vercel',email:'vercel@example.test',password:'synthetic-vercel-password',plan:'plus',acceptTerms:true}});
  assert.equal(registered.status,200);assert.match(registered.headers.get('set-cookie'),/HttpOnly.*Secure/);assert.equal(registered.headers.get('Access-Control-Allow-Origin'),null);
  const cookie=registered.headers.get('set-cookie').split(';')[0];assert.equal((await call('me',{cookie})).status,200);
  assert.ok(DB.sql.prepare("SELECT key FROM rate_limits WHERE key LIKE 'auth:203.0.113.25:%'").get());
  assert.equal((await call('logout',{method:'POST',cookie,source:'https://attacker.example'})).status,403);
  assert.equal((await call('me',{cookie})).status,200);
  assert.equal((await call('logout',{method:'POST',cookie})).status,200);assert.equal((await call('me',{cookie})).status,401);
 }finally{DB.sql.close();}
});
test('acesso administrativo exige senha e papel no servidor, sem promoção pelo cadastro',async t=>{
 const DB=database(),origin='https://mentra.test',env={DB};t.after(()=>DB.sql.close());
 const call=(path,data,cookie)=>worker.fetch(new Request(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)}),env);
 const password='synthetic-admin-password-2026',email='owner@admin.example.test';
 const registered=await call('register',{name:'Owner',email,password,plan:'plus',acceptTerms:true,role:'admin'});
 assert.equal(registered.status,200);assert.equal((await registered.json()).user.role,'user');
 const userCookie=registered.headers.get('set-cookie').split(';')[0];
 const overview=cookie=>worker.fetch(new Request(origin+'/api/admin/overview',{headers:{Cookie:cookie}}),env);
 assert.equal((await overview(userCookie)).status,403);
 DB.sql.prepare("UPDATE users SET role='admin' WHERE email=?").run(email);
 const wrong=await call('login',{email,password:'synthetic-wrong-password'});assert.equal(wrong.status,401);assert.equal(wrong.headers.get('set-cookie'),null);
 const unknown=await call('login',{email:'missing@admin.example.test',password});assert.equal(unknown.status,401);
 const login=await call('login',{email:email.toUpperCase(),password});assert.equal(login.status,200);assert.equal((await login.json()).user.role,'admin');assert.match(login.headers.get('set-cookie'),/HttpOnly.*Secure/);
 const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await overview(cookie)).status,200);
 DB.sql.prepare("UPDATE users SET role='user' WHERE email=?").run(email);assert.equal((await overview(cookie)).status,403);
 assert.equal((await call('logout',{},cookie)).status,200);assert.equal((await overview(cookie)).status,401);
});

test('admin, assinatura, IA, cotas, falhas do provedor e revogação de sessões',async()=>{
 const DB=database(),env={DB,DEEPSEEK_API_KEY:'fake-test-key',DEEPSEEK_MODEL:'test-model'},origin='https://mentra.test';
 async function call(path,{method='GET',data,cookie}={}){const response=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);return {status:response.status,body:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0],headers:response.headers};}
 const password='a-long-test-password',a=await call('register',{method:'POST',data:{name:'Admin',email:'admin@example.test',password,plan:'premium',acceptTerms:true}}),b=await call('register',{method:'POST',data:{name:'User',email:'user@example.test',password,plan:'essencial',acceptTerms:true}});
 assert.equal(a.status,200);assert.match(a.headers.get('Set-Cookie'),/HttpOnly.*Secure/);assert.equal(a.headers.get('X-Frame-Options'),'DENY');
 DB.sql.prepare("UPDATE users SET role='admin' WHERE email=?").run('admin@example.test');
 assert.equal((await call('admin/users',{cookie:a.cookie})).body.users.length,2);
 assert.equal((await call('admin/subscription',{method:'POST',cookie:b.cookie,data:{userId:b.body.user.id,plan:'premium',status:'active',days:30}})).status,403);
 assert.equal((await call('admin/subscription',{method:'POST',cookie:a.cookie,data:{userId:b.body.user.id,plan:'essencial',status:'active',days:30}})).status,200);
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer fake-test-key');const payload=JSON.parse(options.body);assert.equal(payload.model,'test-model');assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(payload.messages[0].role,'system');return Response.json({choices:[{message:{content:'Resposta de teste'}}]});};
 try{
  const chat=()=>call('chat',{method:'POST',cookie:b.cookie,data:{messages:[{role:'user',content:'Me ajude a organizar o dia'}]}});
  assert.equal((await chat()).body.text,'Resposta de teste');
  const month=new Date().toISOString().slice(0,7);DB.sql.prepare('UPDATE ai_usage SET requests=2000 WHERE user_id=? AND month=?').run(b.body.user.id,month);assert.equal((await chat()).status,429);assert.equal(calls,1);
  DB.sql.prepare('UPDATE ai_usage SET requests=0 WHERE user_id=?').run(b.body.user.id);globalThis.fetch=async()=>new Response('failure',{status:503});assert.equal((await chat()).status,502);assert.equal(DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get(b.body.user.id).requests,0);
  const catalog=(await call('admin/plans',{cookie:a.cookie})).body;
  assert.equal((await call('admin/plans',{cookie:b.cookie})).status,403);
  assert.equal((await call('admin/plans',{method:'PUT',cookie:b.cookie,data:catalog})).status,403);
  assert.equal((await call('admin/plans',{method:'PUT',cookie:a.cookie,data:{plans:[],revision:0}})).status,400);
  catalog.plans[0].monthlyRequests=1;catalog.plans[0].priceCents=12990;catalog.plans[0].name='Essencial atualizado';
  const updated=await call('admin/plans',{method:'PUT',cookie:a.cookie,data:catalog});assert.equal(updated.status,200);assert.ok(updated.body.revision>0);
  assert.equal((await call('plans')).body.plans[0].priceCents,12990);assert.equal((await call('me',{cookie:b.cookie})).body.plans[0].name,'Essencial atualizado');
  assert.equal((await call('admin/plans',{method:'PUT',cookie:a.cookie,data:catalog})).status,409);
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:'Uma mensagem permitida'}}]});assert.equal((await chat()).status,200);assert.equal((await chat()).status,429);
  assert.equal((await call('me',{cookie:b.cookie})).body.usage.requests,1);
  const overview=await call('admin/overview',{cookie:a.cookie});assert.deepEqual(overview.body.counts,{users:2,active:1,monthlyRequests:1});assert.equal(overview.body.integrations.deepseek,true);
  assert.equal((await call('admin/overview',{cookie:b.cookie})).status,403);
  assert.equal(overview.body.insights.pending,1);assert.equal(overview.body.insights.newThisWeek,2);assert.equal(overview.body.insights.feedbackNew,0);assert.deepEqual(overview.body.insights.activeByPlan,{essencial:1});
  const actives=await call('admin/users?status=active',{cookie:a.cookie});assert.equal(actives.body.total,1);assert.equal(actives.body.users[0].email,'user@example.test');assert.equal(actives.body.users[0].requests,1);
  assert.equal((await call('admin/users?status=pending',{cookie:a.cookie})).body.users[0].email,'admin@example.test');assert.equal((await call('admin/users?status=qualquer',{cookie:a.cookie})).status,400);
  const activity=await call('admin/activity',{cookie:a.cookie});assert.equal(activity.status,200);assert.equal((await call('admin/activity',{cookie:b.cookie})).status,403);
  const granted=activity.body.items.find(i=>i.kind==='subscription');assert.equal(granted.target.email,'user@example.test');assert.equal(granted.status,'active');assert.equal(granted.actor.email,'admin@example.test');assert.ok(activity.body.items.some(i=>i.kind==='plan_catalog_updated'));
  assert.equal((await call('admin/users?q=admin%40',{cookie:a.cookie})).body.total,1);
  assert.equal((await call('admin/users?q=%25',{cookie:a.cookie})).body.total,0);
  assert.equal((await call('admin/users?q='+encodeURIComponent('x'.repeat(190)+'@mail.test'),{cookie:a.cookie})).status,200);
  assert.equal((await call('admin/users?q='+encodeURIComponent('á'.repeat(200)),{cookie:a.cookie})).status,200);
  assert.equal((await call('admin/users?page=-1',{cookie:a.cookie})).status,400);
  for(let i=0;i<55;i++){DB.sql.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run('bulk-'+i,`bulk-${i}@example.test`,'Bulk '+i,'fixture','fixture',i);DB.sql.prepare('INSERT INTO subscriptions(user_id,plan) VALUES(?,?)').run('bulk-'+i,'essencial');}
  const first=await call('admin/users',{cookie:a.cookie}),second=await call('admin/users?page=2',{cookie:a.cookie});assert.equal(first.body.total,57);assert.equal(first.body.users.length,50);assert.equal(second.body.users.length,7);assert.equal(new Set([...first.body.users,...second.body.users].map(u=>u.id)).size,57);
  delete env.DEEPSEEK_API_KEY;assert.equal((await chat()).status,503);
  DB.sql.prepare('UPDATE subscriptions SET current_period_end=1 WHERE user_id=?').run(b.body.user.id);assert.equal((await chat()).status,403);assert.equal((await call('me',{cookie:b.cookie})).body.subscription.status,'expired');
  assert.equal((await call('subscription',{method:'POST',cookie:b.cookie,data:{plan:'plus'}})).status,200);assert.equal((await call('me',{cookie:b.cookie})).body.subscription.status,'pending');
 }finally{globalThis.fetch=originalFetch;}
 assert.equal((await call('account/password',{method:'POST',cookie:b.cookie,data:{currentPassword:password,password:'a-new-long-password'}})).status,200);
 assert.equal((await call('me',{cookie:b.cookie})).status,401);
 assert.equal((await call('login',{method:'POST',data:{email:'user@example.test',password}})).status,401);
 assert.equal((await call('login',{method:'POST',data:{email:'user@example.test',password:'a-new-long-password'}})).status,200);
 const recovered=await call('recover',{method:'POST',data:{email:'user@example.test',recoveryCode:b.body.recoveryCode,password:'a-recovered-long-password'}});assert.equal(recovered.status,200);assert.notEqual(recovered.body.recoveryCode,b.body.recoveryCode);
 assert.equal((await call('recover',{method:'POST',data:{email:'user@example.test',recoveryCode:b.body.recoveryCode,password:'another-long-password'}})).status,403);
 assert.equal((await call('login',{method:'POST',data:{email:'user@example.test',password:'a-recovered-long-password'}})).status,200);
 DB.sql.close();
});

test('DeepSeek recebe contexto exclusivo de cada conta e ignora proprietário forjado no pedido',async()=>{
 const DB=database(),env={DB,DEEPSEEK_API_KEY:'synthetic-only'},origin='https://mentra.test';
 async function call(path,{method='GET',data,cookie}={}){const r=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const users=[];
 for(const label of ['ALFA','BETA']){
  const u=await call('register',{method:'POST',data:{name:label,email:label+'@context.example.test',password:'context-test-password-2026',plan:'plus',acceptTerms:true}});assert.equal(u.status,200);users.push(u);
  const data={version:5,profile:{name:label,goal:'META-'+label},tasks:[{title:'TAREFA-'+label,done:false}],events:[],records:[{title:'DESPESA-'+label,cents:100,type:'expense'}],documents:[{title:'ARQUIVO-SECRETO-'+label}],health:{note:'SAUDE-SECRETA-'+label},journeys:[{id:'j-'+label,title:'PLANO-'+label,barrier:'DIFICULDADE-'+label,time:5,status:'paused',steps:[{title:'ETAPA-'+label,status:'doing'}]}],inbox:[],messages:[]};
  assert.equal((await call('state',{method:'PUT',cookie:u.cookie,data:{data,revision:0}})).status,200);
 }
 DB.sql.prepare("UPDATE subscriptions SET status='active'").run();
 const original=globalThis.fetch,payloads=[];globalThis.fetch=async(url,options)=>{payloads.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'Resposta sintética'}}]});};
 try{
  for(const [index,label,other] of [[0,'ALFA','BETA'],[1,'BETA','ALFA'],[0,'ALFA','BETA']]){
   const r=await call('chat',{method:'POST',cookie:users[index].cookie,data:{userId:users[1-index].body.user.id,journeyId:'j-'+label,messages:[{role:'user',content:'Analise minha rotina'}]}});assert.equal(r.status,200);
   const payload=JSON.stringify(payloads.at(-1));assert.ok(payload.includes('TAREFA-'+label));assert.ok(payload.includes('DESPESA-'+label));assert.ok(!payload.includes('TAREFA-'+other));assert.ok(!payload.includes('DESPESA-'+other));assert.ok(!payload.includes('SECRETO'));assert.ok(!payload.includes('SECRETA'));assert.ok(payload.includes('DIFICULDADE-'+label));assert.ok(payload.includes('ETAPA-'+label));assert.ok(!payload.includes('PLANO-'+other));
  }
  const calls=payloads.length;for(const journeyId of ['j-BETA','missing',42]){const r=await call('chat',{method:'POST',cookie:users[0].cookie,data:{journeyId,messages:[{role:'user',content:'Analise este plano'}]}});assert.equal(r.status,journeyId===42?400:404);}assert.equal(payloads.length,calls);
  const month=new Date().toISOString().slice(0,7);assert.equal(DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=? AND month=?').get(users[0].body.user.id,month).requests,2);assert.equal(DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=? AND month=?').get(users[1].body.user.id,month).requests,1);
 }finally{globalThis.fetch=original;DB.sql.close();}
});

test('memória opcional é privada e revogável; exportação identifica proprietário sem credenciais',async()=>{
 const DB=database(),env={DB,DEEPSEEK_API_KEY:'synthetic-only'},origin='https://mentra.test';
 async function call(path,{method='GET',data,cookie,raw}={}){const r=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:raw!==undefined?raw:data?JSON.stringify(data):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 assert.equal((await call('register',{method:'POST',raw:'null'})).status,400);
 const a=await call('register',{method:'POST',data:{name:'A',email:'a-memory@example.test',password:'memory-test-password-2026',plan:'plus',acceptTerms:true}}),b=await call('register',{method:'POST',data:{name:'B',email:'b-memory@example.test',password:'memory-test-password-2026',plan:'plus',acceptTerms:true}});
 DB.sql.prepare("UPDATE subscriptions SET status='active'").run();
 let revision=0;const data={version:5,profile:{name:'A',memoryEnabled:true,aiMemory:'Prefiro passos curtos'},tasks:[],events:[],records:[],documents:[],inbox:[],messages:[]};
 async function save(){const r=await call('state',{method:'PUT',cookie:a.cookie,data:{data,revision}});assert.equal(r.status,200);revision=r.body.revision;}
 await save();const original=globalThis.fetch;const payloads=[];globalThis.fetch=async(url,options)=>{payloads.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'Orientação de teste'}}]});};
 try{const chat=cookie=>call('chat',{method:'POST',cookie,data:{messages:[{role:'user',content:'Ajude-me'}]}});assert.equal((await chat(a.cookie)).status,200);assert.ok(JSON.stringify(payloads.at(-1)).includes('Prefiro passos curtos'));await chat(b.cookie);assert.ok(!JSON.stringify(payloads.at(-1)).includes('Prefiro passos curtos'));data.profile.memoryEnabled=false;await save();await chat(a.cookie);assert.ok(!JSON.stringify(payloads.at(-1)).includes('Prefiro passos curtos'));assert.equal((await call('chat',{method:'POST',cookie:a.cookie,data:{messages:[null]}})).status,400);
 const exported=await call('account/export',{cookie:a.cookie});assert.equal(exported.body.ownerId,a.body.user.id);assert.equal(exported.body.format,'mentra-life-account-v1');assert.equal(exported.body.baseRevision,revision);assert.equal(exported.body.subscription.plan,'plus');assert.ok(!JSON.stringify(exported.body).includes('password_hash'));assert.ok(Array.isArray(exported.body.usage));assert.ok(exported.body.activity.some(a=>a.action==='register'));DB.sql.prepare("UPDATE subscriptions SET status='canceled' WHERE user_id=?").run(a.body.user.id);DB.sql.prepare('INSERT INTO payment_events VALUES(?,?,?,?)').run('event-synthetic',a.body.user.id,'{}',Date.now());assert.equal((await call('account',{method:'DELETE',cookie:a.cookie,data:{password:'memory-test-password-2026'}})).status,200);assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM retained_payments WHERE former_user_id=?').get(a.body.user.id).n,1);assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM payment_events WHERE user_id=?').get(a.body.user.id).n,0);
 }finally{globalThis.fetch=original;}
});
