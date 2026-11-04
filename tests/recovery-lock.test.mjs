import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
test('quarentena de restauração bloqueia API, autenticação e webhook; saúde acusa bloqueio',async t=>{
 const DB=integrationDB();t.after(()=>DB.sql.close());DB.sql.exec(readFileSync(new URL('../scripts/restore-quarantine.sql',import.meta.url),'utf8'));
 for(const [path,method]of [['/api/health','GET'],['/api/state','GET'],['/api/login','POST'],['/api/register','POST'],['/api/whatsapp/webhook','GET'],['/api/whatsapp/webhook','POST']]){const r=await worker.fetch(new Request('https://mentra.test'+path,{method,headers:{Origin:'https://mentra.test','Content-Type':'application/json'},body:method==='POST'?'{}':undefined}),{DB});assert.equal(r.status,503);const body=await r.json();assert.ok(body.error||body.checks?.recovery==='quarantine');}
 DB.sql.prepare("DELETE FROM product_settings WHERE key='restore_quarantine'").run();assert.equal((await worker.fetch(new Request('https://mentra.test/api/health'),{DB})).status,200);assert.equal((await worker.fetch(new Request('https://mentra.test/api/state'),{DB})).status,401);
});
test('scheduler fica parado durante quarentena sem consultar jobs ou acionar provedores',async t=>{
 const DB=integrationDB();t.after(()=>DB.sql.close());DB.sql.exec(readFileSync(new URL('../scripts/restore-quarantine.sql',import.meta.url),'utf8'));const queries=[],original=DB.prepare;DB.prepare=sql=>{queries.push(sql);return original(sql);};
 await worker.scheduled({}, {DB});assert.equal(queries.length,1);assert.match(queries[0],/restore_quarantine/);
});
