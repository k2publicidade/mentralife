import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReadiness,parseSecrets} from '../scripts/readiness.mjs';
import {readFileSync} from 'node:fs';

test('pré-publicação verifica par VAPID sem expor valores e identifica configuração incompleta',async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),secret={VAPID_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',pair.privateKey)).d,VAPID_SUBJECT:'mailto:ops@example.test',WHATSAPP_APP_SECRET:'synthetic-meta',WHATSAPP_VERIFY_TOKEN:'synthetic-verify',WHATSAPP_ACCESS_TOKEN:'synthetic-access',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_GRAPH_VERSION:'v24.0'};
 Object.assign(secret,{GOOGLE_CALENDAR_CLIENT_ID:'synthetic-client',GOOGLE_CALENDAR_CLIENT_SECRET:'synthetic-client-secret',CALENDAR_ENCRYPTION_KEY:'a'.repeat(64),GOOGLE_CALENDAR_REDIRECT_URI:'https://mentra.test/calendar-callback'});
 secret.MENTRA_BACKUP_PASSPHRASE='synthetic-backup-passphrase-2026';
 const config={...JSON.parse(readFileSync(new URL('../wrangler.production.example.jsonc',import.meta.url),'utf8')),d1_databases:[{binding:'DB',database_id:'12345678-1234-1234-1234-123456789abc'}]};
 assert.ok((await checkReadiness(config,secret)).every(c=>c.ok));
 const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const invalid=await checkReadiness(null,{...secret,VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',other.privateKey)).d});
 assert.equal(invalid.find(c=>c.id==='vapid_pair').ok,false);
 assert.equal(invalid.find(c=>c.id==='d1_id').ok,false);
 assert.ok(!JSON.stringify(invalid).includes(secret.VAPID_PRIVATE_KEY));
 assert.ok(!JSON.stringify(invalid).includes(secret.WHATSAPP_ACCESS_TOKEN));
});
test('pré-publicação recusa raiz pública, rota faltante, logs com query e secrets em vars sem revelar valores',async()=>{
 const checks=await checkReadiness({name:'mentra-life',main:'server/worker.mjs',assets:{directory:'.',run_worker_first:['/admin']},vars:{DEEPSEEK_API_KEY:'synthetic-sensitive-value'},observability:{logs:{invocation_logs:true}}},{});
 for(const id of ['assets_directory','api_routing','private_configuration','log_privacy'])assert.equal(checks.find(c=>c.id===id).ok,false);
 assert.ok(!JSON.stringify(checks).includes('synthetic-sensitive-value'));
});
test('leitura de secrets não interpola ou executa conteúdo',()=>{
 assert.deepEqual(parseSecrets('# comentário\nTOKEN="literal$()=value"\nKEY=abc\n'),{TOKEN:'literal$()=value',KEY:'abc'});
 assert.deepEqual(parseSecrets('{"KEY":"literal"}'),{KEY:'literal'});
});
