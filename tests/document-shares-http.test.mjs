import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountState} from '../dist/account-state.mjs';
const base=process.env.MENTRA_TEST_URL;
test('links privados percorrem HTTP e D1 real com duas contas, bytes originais e revogação',{skip:!base},async()=>{
 const password='synthetic-sharing-http-2026',accounts=[];
 async function call(path,{cookie,method='GET',body}={}){const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer()),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
 try{
  for(const name of ['Owner','Recipient']){const user=await call('register',{method:'POST',body:{name,email:'share-http-'+crypto.randomUUID()+'@example.test',password,plan:'plus'}});assert.equal(user.status,200);accounts.push({...user.body.user,cookie:user.cookie});}
  const [a,b]=accounts,bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url)),state=accountState(null,a);state.documents=[{id:'shared-http',title:'Arquivo sintético HTTP',fileData:bytes.toString('base64'),originalName:'scan.png',mime:'image/png',ext:'PNG',trashed:false}];
  assert.equal((await call('state',{cookie:a.cookie,method:'PUT',body:{data:state,revision:0}})).status,200);
  const p=await call('document-shares/preview',{cookie:a.cookie,method:'POST',body:{documentId:'shared-http',recipientEmail:b.email,hours:1}});assert.equal(p.status,200);
  const created=await call('document-shares',{cookie:a.cookie,method:'POST',body:{documentId:'shared-http',recipientId:b.id,revision:p.body.revision,signature:p.body.signature,hours:1,confirmed:true}});assert.equal(created.status,201);const token=new URL(created.body.url).hash.slice(1);
  assert.equal((await call('document-shares/access',{cookie:a.cookie,method:'POST',body:{token}})).status,404);
  const downloaded=await call('document-shares/download',{cookie:b.cookie,method:'POST',body:{token,confirmed:true}});assert.equal(downloaded.status,200);assert.deepEqual(downloaded.body,bytes);assert.match(downloaded.headers.get('cache-control'),/no-store/);
  assert.equal((await call('document-shares/'+created.body.id,{cookie:a.cookie,method:'DELETE',body:{confirmed:true}})).status,200);
  assert.equal((await call('document-shares/download',{cookie:b.cookie,method:'POST',body:{token,confirmed:true}})).status,404);
  const page=await fetch(base+'/share');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert.match(page.headers.get('x-robots-tag'),/noindex/);
 }finally{for(const a of accounts)assert.equal((await call('account',{cookie:a.cookie,method:'DELETE',body:{password,confirmed:'on'}})).status,200);}
});
