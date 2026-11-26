import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {publicOrigins} from '../server/hosting.mjs';

// Production answers on mentralife.vercel.app (PUBLIC_ORIGIN) and on the custom domain mentralife.com.br.
// Signup and PIX checkout from the custom domain used to fail with "Origem inválida." (403).
const vercel='https://site.vercel.example',custom='https://site.example.com.br',backend='https://worker.example.test',secret='a'.repeat(64);
const KEY='ssp_test_'+'0'.repeat(40);

function setup(t,extra={}){
 const DB=integrationDB();t.after(()=>DB.sql.close());
 const env={DB,PUBLIC_ORIGIN:vercel,PUBLIC_ORIGIN_ALIASES:`${custom}, https://www.site.example.com.br`,VERCEL_ORIGIN_SECRET:secret,SIX7PAY_API_KEY:KEY,SIX7PAY_CHECKOUT:'on',SIX7PAY_ESTABLISHMENT:'440627',...extra};
 const call=async(path,data,{origin=custom,cookie}={})=>{
  const r=await worker.fetch(new Request(backend+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,'x-mentra-origin-secret':secret,'x-vercel-forwarded-for':'203.0.113.9',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined}),env);
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 return {DB,call};
}
const account={name:'Pessoa Teste',email:'origem@example.test',password:'synthetic-origin-password',plan:'essencial',acceptTerms:true};

test('cadastro e PIX funcionam pelo domínio próprio e pelo endereço da Vercel',async t=>{
 const {DB,call}=setup(t);
 t.mock.method(globalThis,'fetch',async(url,options={})=>{assert.equal(options.redirect,'manual');if(/\/qrcode$/.test(new URL(url).pathname))return Response.json({qrcode:'data:image/png;base64,AA=='});return Response.json({_id:'6aa5d6ac5f5fc577ba66174a',status:'PENDING',emv:'000201',establishment:{id:440627},amount:6700,original_amount:6700});});
 const user=await call('register',account);
 assert.equal(user.status,200,JSON.stringify(user.body));
 const pix=await call('six7pay/checkout',{plan:'essencial',acceptTerms:true},{cookie:user.cookie});
 assert.equal(pix.status,200,JSON.stringify(pix.body));
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM six7pay_orders').get().n,1);
 const other=await call('register',{...account,email:'vercel@example.test'},{origin:vercel});
 assert.equal(other.status,200,JSON.stringify(other.body));
 const www=await call('login',{email:account.email,password:account.password},{origin:'https://www.site.example.com.br'});
 assert.equal(www.status,200,JSON.stringify(www.body));
});

test('escritas de outros sites continuam recusadas',async t=>{
 const {DB,call}=setup(t);
 for(const origin of ['https://attacker.example','https://site.example.com.br.attacker.example','http://site.example.com.br','null']){
  const r=await call('register',{...account,email:`x${Math.random()}@example.test`},{origin});
  assert.equal(r.status,403);assert.equal(r.body.error,'Origem inválida.');
 }
 assert.equal(DB.sql.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
});

test('alias inválido falha a configuração em vez de liberar qualquer origem',()=>{
 const url=new URL(vercel+'/api/register');
 assert.deepEqual([...publicOrigins({},url)],[vercel]);
 assert.deepEqual([...publicOrigins({PUBLIC_ORIGIN_ALIASES:` ${custom}/ ,`},url)],[vercel,custom]);
 for(const value of ['*','http://site.example.com.br','https://site.example.com.br/path'])assert.throws(()=>publicOrigins({PUBLIC_ORIGIN_ALIASES:value},url),e=>e.status===503);
});
