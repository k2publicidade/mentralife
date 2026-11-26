import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {nativePushConfigured,sendNativePush} from '../server/native-push-provider.mjs';
import {processNativePush,validNativeToken} from '../server/native-push.mjs';
import {validateReminderSettings,zonedInstant} from '../server/reminder-plan.mjs';
import {reconcileReminders} from '../server/push.mjs';
import {accountState} from '../dist/account-state.mjs';

const config={APNS_TEAM_ID:'ABCDEFGHIJ',APNS_KEY_ID:'KLMNOPQRST',APNS_TOPIC:'app.mentralife.mobile',APNS_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----',APNS_ENVIRONMENT:'sandbox'};
async function environment(){
 const DB=integrationDB(),env={DB,...config},origin='https://mentra.test';
 async function call(path,{method='GET',data,cookie,requestOrigin=origin}={}){
  const response=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const users=[];for(const name of ['native-a','native-b']){const result=await call('register',{method:'POST',data:{name,email:name+'@example.test',password:'native-test-password',plan:'plus',acceptTerms:true}});assert.equal(result.status,200);users.push({...result.body.user,cookie:result.cookie});}
 DB.sql.prepare("UPDATE subscriptions SET status='active'").run();return {DB,env,call,users};
}
test('registro nativo exige sessão, origem, provedor e assinatura e isola token por conta',async()=>{
 const c=await environment();try{
  const [a,b]=c.users,data={platform:'ios',token:'a'.repeat(64)};
  assert.equal((await c.call('push/native-device',{method:'POST',data})).status,401);
  assert.equal((await c.call('push/native-device',{method:'POST',data,cookie:a.cookie,requestOrigin:'https://bad.test'})).status,403);
  assert.equal((await c.call('push/native-device',{method:'POST',data,cookie:a.cookie})).status,200);
  assert.equal((await c.call('push/native-device',{method:'POST',data,cookie:a.cookie})).status,200);
  assert.equal((await c.call('push/native-device',{method:'POST',data,cookie:b.cookie})).status,409);
  await c.call('push/native-device',{method:'DELETE',data,cookie:b.cookie});assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices').get().n,1);
  const result=await c.call('push',{cookie:a.cookie});assert.equal(result.body.nativeConfigured.ios,true);assert.equal(result.body.nativeDevices,1);assert.equal(result.body.configured,false);
  c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);assert.equal((await c.call('push/native-device',{method:'POST',data,cookie:a.cookie})).status,403);
  await c.call('push/native-device',{method:'DELETE',data,cookie:a.cookie});assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices').get().n,0);
 }finally{c.DB.sql.close();}
});
test('rotação do token remove o anterior da mesma conta e senha revoga aparelhos nativos',async()=>{
 const c=await environment();try{const [a]=c.users;await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:'a'.repeat(64)}});
 await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:'b'.repeat(64),previousToken:'a'.repeat(64)}});
 assert.deepEqual(c.DB.sql.prepare('SELECT token FROM native_push_devices').all().map(x=>x.token),['b'.repeat(64)]);
 assert.equal((await c.call('account/password',{method:'POST',cookie:a.cookie,data:{currentPassword:'native-test-password',password:'native-new-password'}})).status,200);
 assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices').get().n,0);
 }finally{c.DB.sql.close();}
});
test('rotação no limite de aparelhos é atômica e token de outra conta não libera vaga',async()=>{
 const c=await environment();try{const [a,b]=c.users;
  for(let i=0;i<10;i++)assert.equal((await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:i.toString(16).padStart(64,'0')}})).status,200);
  const extra='a'.repeat(64);await c.call('push/native-device',{method:'POST',cookie:b.cookie,data:{platform:'ios',token:extra}});
  assert.equal((await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:'b'.repeat(64),previousToken:extra}})).status,429);
  const replacement=await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:'b'.repeat(64),previousToken:'0'.repeat(64)}});
  assert.equal(replacement.status,200);assert.equal(replacement.body.devices,10);
  assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices WHERE user_id=?').get(a.id).n,10);
  assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices WHERE token=?').get('0'.repeat(64)).n,0);
  assert.equal((await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:extra,previousToken:'b'.repeat(64)}})).status,409);
  assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices WHERE token=?').get('b'.repeat(64)).n,1);
 }finally{c.DB.sql.close();}
});
test('entrega nativa revalida tarefa, não duplica aceitação, retenta 429 e remove token revogado',async()=>{
 const c=await environment();try{
  const [a]=c.users,now=zonedInstant('2026-11-05','10:00','America/Sao_Paulo'),settings=validateReminderSettings({quietStart:'00:00',quietEnd:'00:00',taskTime:'10:00'}),state=accountState(null,a);
  state.tasks=[{id:'one',title:'Privado não deve sair',dueDate:'2026-11-05',done:false}];
  c.DB.sql.prepare('INSERT INTO user_states VALUES(?,?,1,?)').run(a.id,JSON.stringify(state),Date.now());
  await c.call('push/native-device',{method:'POST',cookie:a.cookie,data:{platform:'ios',token:'a'.repeat(64)}});
  c.DB.sql.prepare('INSERT INTO reminder_settings VALUES(?,?,?,?)').run(a.id,1,JSON.stringify(settings),now);
  // Reconcile uses wall time; choose today's actual task when the fixture clock differs.
  const {digest}=await import('../server/integration-utils.mjs');const key='task:one:'+now,id=await digest(a.id+':'+key);
  c.DB.sql.prepare("INSERT INTO reminder_jobs VALUES(?,?,?,?,'pending',?)").run(id,a.id,now,'/#/vida/tarefas',now);
  let sends=0;const delivered=async(_env,_device,payload)=>{sends++;assert.deepEqual(payload,{url:'/#/vida/tarefas',tag:id});return {response:new Response('',{status:429,headers:{'Retry-After':'120'}})};};
  await processNativePush(c.env,{now,deliver:delivered});assert.equal(sends,1);assert.equal(c.DB.sql.prepare('SELECT status FROM native_push_deliveries').get().status,'pending');
  await processNativePush(c.env,{now:now+60000,deliver:delivered});assert.equal(sends,1);
  await processNativePush(c.env,{now:now+120000,deliver:async()=>{sends++;return {response:new Response('',{status:200})};}});assert.equal(sends,2);
  await processNativePush(c.env,{now:now+180000,deliver:delivered});assert.equal(sends,2);
  c.DB.sql.prepare("UPDATE native_push_deliveries SET status='pending',next_attempt=0").run();state.tasks[0].done=true;c.DB.sql.prepare('UPDATE user_states SET data=? WHERE user_id=?').run(JSON.stringify(state),a.id);
  await processNativePush(c.env,{now:now+180000,deliver:delivered});assert.equal(sends,2);assert.equal(c.DB.sql.prepare('SELECT status FROM native_push_deliveries').get().status,'cancelled');
  state.tasks[0].done=false;c.DB.sql.prepare('UPDATE user_states SET data=? WHERE user_id=?').run(JSON.stringify(state),a.id);c.DB.sql.prepare("UPDATE native_push_deliveries SET status='pending'").run();
  await processNativePush(c.env,{now:now+180000,deliver:async()=>({response:new Response('',{status:410}),unregistered:true})});assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices').get().n,0);
 }finally{c.DB.sql.close();}
});
test('APNs assina JWT P-256 e envia banner genérico para destino fixo sem conteúdo privado',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const key=Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
 const env={...config,APNS_PRIVATE_KEY:`-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`};let sent;
 const {response}=await sendNativePush(env,{platform:'ios',token:'a'.repeat(64)},{tag:'b'.repeat(64),url:'/#/vida/agenda'},{fetcher:async(url,options)=>{sent={url,...options};return new Response('',{status:200});}});
 assert.equal(response.status,200);assert.equal(sent.url,'https://api.sandbox.push.apple.com/3/device/'+'a'.repeat(64));assert.equal(sent.headers['apns-topic'],'app.mentralife.mobile');assert.equal(JSON.parse(sent.body).aps.alert.body,'Você tem um lembrete na sua conta.');
 const jwt=sent.headers.authorization.split(' ')[1],parts=jwt.split('.');assert.equal(JSON.parse(Buffer.from(parts[0],'base64url')).alg,'ES256');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
 assert.equal(nativePushConfigured({},'android'),false);assert.equal(validNativeToken('ios','https://attacker.test'),false);
});
test('FCM usa OAuth RS256 e distingue token removido de erro de configuração',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
 const env={FCM_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',project_id:'mentra-mobile-test',client_email:'sender@mentra-mobile-test.iam.gserviceaccount.com',private_key:`-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`})};
 const calls=[];let removed=false;
 const fetcher=async(url,options)=>{calls.push({url,...options});if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access-token',expires_in:3600});return removed?Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404}):Response.json({name:'projects/mentra-mobile-test/messages/synthetic'});};
 const device={platform:'android',token:'synthetic-firebase-token-value-1234567890'},payload={tag:'a'.repeat(64),url:'/#/vida/tarefas'};
 assert.equal((await sendNativePush(env,device,payload,{fetcher})).response.status,200);
 const jwt=calls[0].body.get('assertion'),parts=jwt.split('.');assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://oauth2.googleapis.com/token');assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])),true);
 assert.equal(calls[1].url,'https://fcm.googleapis.com/v1/projects/mentra-mobile-test/messages:send');assert.equal(calls[1].headers.Authorization,'Bearer synthetic-access-token');assert.equal(JSON.parse(calls[1].body).message.android.notification.channel_id,'mentra-reminders');
 removed=true;assert.equal((await sendNativePush(env,device,payload,{fetcher})).unregistered,true);assert.equal(calls.filter(x=>x.url==='https://oauth2.googleapis.com/token').length,1);
 await assert.rejects(sendNativePush(env,device,{...payload,url:'https://attacker.test'},{fetcher}),/Destino/);
});
