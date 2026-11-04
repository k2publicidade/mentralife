import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedRequest,httpsOrigin} from '../server/hosting.mjs';
import {vercelEnvironment,copyVercelAssets} from '../scripts/build-vercel.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deploymentConfig} from '../scripts/prepare-deployment.mjs';
const secret='a'.repeat(64),origin='https://mentra.example',backend='https://mentra-api.example',env={PUBLIC_ORIGIN:origin,VERCEL_ORIGIN_SECRET:secret};
test('hosting authenticates the proxy, preserves origin and body, and normalizes public URLs and visitor IP',async()=>{
 const req=new Request(backend+'/api/state?revision=2',{method:'PUT',headers:{origin,'x-mentra-origin-secret':secret,'x-real-ip':'203.0.113.5','CF-Connecting-IP':'192.0.2.1',cookie:'mentra_session=fixture'},body:'{"data":"test"}'});
 const r=await hostedRequest(req,env);
 assert.equal(r.url,origin+'/api/state?revision=2');assert.equal(r.headers.get('origin'),origin);assert.equal(r.headers.get('cookie'),'mentra_session=fixture');assert.equal(r.headers.get('CF-Connecting-IP'),'203.0.113.5');assert.equal(r.headers.get('x-mentra-origin-secret'),null);assert.equal(await r.text(),'{"data":"test"}');
});
test('hosting rejects bypass and spoofed headers before reading private data',async()=>{
 for(const headers of [{},{'x-mentra-origin-secret':'b'.repeat(64)},{'x-forwarded-host':'mentra.example','x-real-ip':'203.0.113.5'}])await assert.rejects(hostedRequest(new Request(backend+'/api/me',{headers}),env),e=>e.status===403);
 const r=await hostedRequest(new Request(backend+'/api/me',{headers:{'x-mentra-origin-secret':secret,origin:'https://attacker.example','CF-Connecting-IP':'fake','x-real-ip':'1.2.3.4, 5.6.7.8'}}),env);
 assert.equal(r.headers.get('origin'),'https://attacker.example');assert.equal(r.headers.get('CF-Connecting-IP'),null);
});
test('hosting validates configuration, keeps development unchanged, and permits the signed Meta webhook and health',async()=>{
 const request=new Request(backend+'/api/me');assert.equal(await hostedRequest(request,{}),request);
 for(const config of [{PUBLIC_ORIGIN:origin},{VERCEL_ORIGIN_SECRET:secret},{...env,PUBLIC_ORIGIN:'http://mentra.example'},{...env,VERCEL_ORIGIN_SECRET:'short'}])await assert.rejects(hostedRequest(request,config),e=>e.status===503);
 for(const path of ['/api/health','/api/whatsapp/webhook']){const r=new Request(backend+path);assert.equal(await hostedRequest(r,env),r);}
});
test('deployment requires distinct HTTPS origins and rejects credentials, paths and missing shared secret',()=>{
 assert.deepEqual(vercelEnvironment({...env,MENTRA_WORKER_ORIGIN:backend}),{workerOrigin:backend,publicOrigin:origin});
 for(const value of ['http://insecure.example','https://user:pass@host.example','https://host.example/path','https://host.example/?secret=value'])assert.throws(()=>httpsOrigin(value));
 assert.throws(()=>vercelEnvironment({...env,MENTRA_WORKER_ORIGIN:origin}));assert.throws(()=>vercelEnvironment({PUBLIC_ORIGIN:origin,MENTRA_WORKER_ORIGIN:backend}));
});
test('Cloudflare target uses the public Vercel origin for links and OAuth without storing secrets',()=>{
 const template=JSON.parse(readFileSync(new URL('../wrangler.production.example.jsonc',import.meta.url),'utf8'));
 const options={environment:'production',databaseId:'11111111-2222-4333-8444-555555555555',workerName:'mentra-api-production',origin,hosting:'vercel'};
 const config=deploymentConfig(template,options);assert.equal(config.vars.PUBLIC_ORIGIN,origin);assert.equal(config.vars.GOOGLE_CALENDAR_REDIRECT_URI,origin+'/calendar-callback');assert.equal(config.vars.VERCEL_ORIGIN_SECRET,undefined);
 assert.throws(()=>deploymentConfig(template,{...options,origin:undefined}));
});
test('Vercel static output omits source packages, handoff, secrets and unapproved directories',()=>{
 const root=mkdtempSync(join(tmpdir(),'mentra-vercel-'));
 try{
  mkdirSync(join(root,'dist'));for(const name of ['index.html','admin.html','share.html','calendar-callback.html','push-sw.js','skip-link.mjs'])writeFileSync(join(root,'dist',name),'public');
  for(const folder of ['downloads','handoff','unexpected','assets']){mkdirSync(join(root,'dist',folder));writeFileSync(join(root,'dist',folder,'file.json'),'fixture');}
  writeFileSync(join(root,'dist','.env'),'secret');writeFileSync(join(root,'dist','dump.sql'),'private');
  copyVercelAssets(root);const out=join(root,'.vercel-public');assert.ok(existsSync(join(out,'assets','file.json')));
  for(const name of ['downloads','handoff','unexpected','.env','dump.sql'])assert.equal(existsSync(join(out,name)),false,name);
  writeFileSync(join(out,'stale.txt'),'obsolete');copyVercelAssets(root);assert.equal(existsSync(join(out,'stale.txt')),false);
 }finally{rmSync(root,{recursive:true});}
});
test('Vercel routes proxy API with a server-only secret, disable caching and retain callback/share paths',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const api=config.routes.find(r=>r.src==='/api/(.*)');assert.equal(api.dest,'${MENTRA_WORKER_ORIGIN}/api/$1');assert.ok(api.env.includes('MENTRA_WORKER_ORIGIN'));
 assert.equal(api.transforms[0].args,'$VERCEL_ORIGIN_SECRET');assert.equal(api.transforms[0].op,'set');assert.deepEqual(api.transforms[0].env,['VERCEL_ORIGIN_SECRET']);
 assert.equal(config.routes[0].headers['Cache-Control'],'no-store');assert.equal(api.headers['x-vercel-enable-rewrite-caching'],'0');
 for(const path of ['admin','share','calendar-callback'])assert.ok(config.routes.some(r=>r.src==='/'+path&&r.dest==='/'+path+'.html'));
 assert.equal(config.outputDirectory,'.vercel-public');assert.equal(config.routes.at(-1).status,404);
});
