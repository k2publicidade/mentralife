import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseOrigin,smokeRelease} from '../scripts/smoke-release.mjs';
test('smoke é somente leitura, verifica três planos/isolamento básico e não segue redirecionamentos',async()=>{
 const requests=[];const checks=await smokeRelease('https://staging.example.test',{fetcher:async(url,options)=>{requests.push({url,options});const path=new URL(url).pathname,body=path==='/api/health'?{status:'ok',checks:{database:'ok'}}:path==='/api/plans'?{plans:[{id:'a'},{id:'b'},{id:'c'}],paymentsConfigured:false}:{};return Response.json(body,{status:path==='/'||['/api/health','/api/plans'].includes(path)?200:path.startsWith('/api/')?401:404,headers:{'Cache-Control':'no-store'}});}});
 assert.ok(checks.every(c=>c.ok));assert.ok(requests.every(r=>r.options.method==='GET'&&r.options.redirect==='manual'&&!r.options.body&&!r.options.headers.Cookie));
});
test('smoke recusa origens inseguras e reporta schema, exposição e cobrança inesperados',async()=>{
 for(const value of ['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test/?secret=value'])assert.throws(()=>releaseOrigin(value));
 assert.equal(releaseOrigin('http://127.0.0.1:8787'),'http://127.0.0.1:8787');
 const checks=await smokeRelease('https://staging.example.test',{fetcher:async()=>Response.json({plans:[{id:'a'},{id:'a'},{id:'c'}],paymentsConfigured:true},{headers:{'Cache-Control':'public'}})});assert.equal(checks.find(c=>c.id==='schema').ok,false);assert.equal(checks.find(c=>c.id==='source_not_public').ok,false);assert.equal(checks.find(c=>c.id==='three_plans').ok,false);
});
