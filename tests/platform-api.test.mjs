import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.MENTRA_TEST_URL;

test('painel administrativo abre com e sem extensão, sem ciclo de redirecionamentos', {skip:!base},async()=>{
 for(const path of ['/admin','/admin.html']){
  const response=await fetch(base+path);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.match(await response.text(),/id="admin-content"/);
 }
});
test('isolamento, login, persistência, concorrência, planos e autorização', {skip:!base},async()=>{
 async function call(path,{method='GET',body,cookie,origin=base}={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 assert.equal((await call('state')).status,401);
 assert.equal((await call('plans')).body.plans.length,3);
 const email=`integration-${crypto.randomUUID()}@example.com`,password='test-password-123456';
 assert.equal((await call('register',{method:'POST',origin:'https://attacker.example',body:{}})).status,403);
 const a=await call('register',{method:'POST',body:{name:'Teste A',email,password,plan:'plus'}});assert.equal(a.status,200);assert.ok(a.cookie);
 const b=await call('register',{method:'POST',body:{name:'Teste B',email:'b-'+email,password,plan:'essencial'}});assert.equal(b.status,200);
 assert.equal((await call('me',{cookie:a.cookie})).body.subscription.status,'pending');
 const state={version:5,profile:{name:'Teste'},tasks:[{id:'private',title:'Privado'}],events:[],records:[],documents:[],inbox:[],messages:[]};
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:9}})).status,409);
 const operationId=crypto.randomUUID();
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:0,operationId}})).body.revision,1);
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:0,operationId}})).body.revision,1);
 const changed=structuredClone(state);changed.tasks[0].title='Conteúdo diferente';assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:changed,revision:1,operationId}})).status,409);
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:1,operationId:'inválido'}})).status,400);
 assert.equal((await call('state',{cookie:b.cookie})).body.data,null);
 assert.equal((await call('state',{cookie:a.cookie})).body.data.tasks[0].title,'Privado');
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:0}})).status,409);
 const large=structuredClone(state);large.documents=[{id:'large',text:'A'.repeat(250000)+'🌱'.repeat(600000)}];
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:large,revision:1}})).body.revision,2);
 assert.equal((await call('state',{cookie:a.cookie})).body.data.documents[0].text,large.documents[0].text);
 assert.equal((await call('state',{method:'PUT',cookie:a.cookie,body:{data:state,revision:1}})).status,409);
 assert.equal((await call('state',{cookie:a.cookie})).body.data.documents[0].text,large.documents[0].text);
 assert.equal((await call('admin/users',{cookie:a.cookie})).status,403);
 assert.equal((await call('chat',{method:'POST',cookie:a.cookie,body:{messages:[{role:'user',content:'Olá'}]}})).status,403);
 assert.equal((await call('subscription',{method:'POST',cookie:a.cookie,body:{plan:'premium'}})).status,200);
 assert.equal((await call('me',{cookie:a.cookie})).body.subscription.plan,'premium');
 assert.equal((await call('login',{method:'POST',body:{email,password:'incorrect-password'}})).status,401);
 assert.equal((await call('login',{method:'POST',body:{email,password}})).status,200);
 assert.equal((await call('logout',{method:'POST',cookie:a.cookie,body:{}})).status,200);
 assert.equal((await call('state',{cookie:a.cookie})).status,401);
 const login=await call('login',{method:'POST',body:{email,password}});
 assert.equal((await call('account',{method:'DELETE',cookie:login.cookie,body:{password}})).status,200);
 assert.equal((await call('account',{method:'DELETE',cookie:b.cookie,body:{password}})).status,200);
});
