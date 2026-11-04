import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encryptBackup,decryptBackup,exportBackup,privateOutput} from '../scripts/private-backup.mjs';
import {deploymentConfig} from '../scripts/prepare-deployment.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
const password='synthetic-recovery-passphrase-2026';
function files(t){const directory=mkdtempSync(join(tmpdir(),'mentra-backup-test-'));t.after(()=>{const canonical=realpathSync(directory),r=relative(realpathSync(tmpdir()),canonical);assert.ok(r&&!r.startsWith('..'+sep)&&!r.startsWith(sep));rmSync(canonical,{recursive:true});});const root=join(directory,'project');mkdirSync(join(root,'.mentra-private'),{recursive:true});mkdirSync(join(root,'dist'));const source=join(root,'.mentra-private','source.sql'),backup=join(root,'.mentra-private','copy.mlbk'),restored=join(root,'.mentra-private','restored.sql');writeFileSync(source,"CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT);\nINSERT INTO sample VALUES(1,'Sintético: João, ''aspas'', acentuação');\n");return {root,source,backup,restored};}
test('backup criptografado restaura SQL e dados; IV/salt variam a cada execução',async t=>{
 const f=files(t);await encryptBackup(f.source,f.backup,password,{root:f.root});await encryptBackup(f.source,f.backup+'.second',password,{root:f.root});assert.notDeepEqual(readFileSync(f.backup),readFileSync(f.backup+'.second'));assert.ok(!readFileSync(f.backup).includes(Buffer.from('João')));
 await decryptBackup(f.backup,f.restored,password,{root:f.root});const restored=readFileSync(f.restored,'utf8');assert.ok(restored.endsWith(readFileSync(f.source,'utf8')));const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec(restored);assert.equal(sql.prepare('SELECT value FROM sample').get().value,"Sintético: João, 'aspas', acentuação");
});
test('senha errada, adulteração, truncamento e limite não liberam SQL nem deixam parcial',async t=>{
 const f=files(t);await encryptBackup(f.source,f.backup,password,{root:f.root});const original=readFileSync(f.backup);
 await assert.rejects(decryptBackup(f.backup,f.restored,'different-synthetic-password-2026',{root:f.root}),/recusada/);assert.equal(existsSync(f.restored),false);
 const damaged=Buffer.from(original);damaged[damaged.length-1]^=1;writeFileSync(f.backup,damaged);await assert.rejects(decryptBackup(f.backup,f.restored,password,{root:f.root}),/recusada/);
 writeFileSync(f.backup,original.subarray(0,original.length-8));await assert.rejects(decryptBackup(f.backup,f.restored,password,{root:f.root}));
 writeFileSync(f.backup,original);await assert.rejects(decryptBackup(f.backup,f.restored,password,{root:f.root,maxBytes:10}),/recusada/);assert.ok(readdirSync(join(f.root,'.mentra-private')).every(n=>!n.includes('.partial-')));assert.equal(existsSync(f.restored),false);
});
test('não sobrescreve arquivos nem permite saída na área pública ou fontes do projeto',async t=>{
 const f=files(t);assert.throws(()=>privateOutput(join(f.root,'dist','dump.sql'),{root:f.root}),/públicos/);assert.throws(()=>privateOutput(join(f.root,'dump.sql'),{root:f.root}),/mentra-private/);
 await assert.rejects(encryptBackup(f.source,f.source,password,{root:f.root}));await encryptBackup(f.source,f.backup,password,{root:f.root});await assert.rejects(encryptBackup(f.source,f.backup,password,{root:f.root}),/existe/);
 const alias=join(f.root,'public-alias');symlinkSync(join(f.root,'dist'),alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>privateOutput(join(alias,'dump.sql'),{root:f.root}),/públicos/);
});
test('exportação usa argv sem shell, alvo explícito e remove SQL temporário após sucesso/falha',async t=>{
 const f=files(t),config=join(f.root,'wrangler.jsonc');writeFileSync(config,JSON.stringify({name:'synthetic',d1_databases:[{binding:'DB',database_id:'local-synthetic'}]}));let args;
 const run=async(command,argv,options)=>{args=argv;assert.equal(command,process.execPath);assert.equal(options.windowsHide,true);writeFileSync(argv[argv.indexOf('--output')+1],readFileSync(f.source));};
 await exportBackup({config,mode:'local',output:f.backup,password,root:f.root,run});assert.ok(args.includes('--local'));assert.ok(!args.includes('--remote'));assert.ok(readdirSync(join(f.root,'.mentra-private')).every(n=>!n.startsWith('export-')));
 await assert.rejects(exportBackup({config,mode:'remote',output:f.backup+'.remote',password,root:f.root,run}),/D1/);
 await assert.rejects(exportBackup({config,mode:null,output:f.backup+'.bad',password,root:f.root,run}),/explicitamente/);
 await assert.rejects(exportBackup({config,mode:'local',output:f.backup+'.failed',password,root:f.root,run:async(_command,argv)=>{writeFileSync(argv.at(-1),'sensitive SQL');throw Error('provider error sensitive SQL');}}),/exportação D1/);assert.ok(readdirSync(join(f.root,'.mentra-private')).every(n=>!n.startsWith('export-')));assert.equal(existsSync(f.backup+'.failed'),false);
});
test('quarentena de restauração invalida sessões, links, conexões e envios sem apagar originais',t=>{
 const db=integrationDB();t.after(()=>db.sql.close());const s=db.sql;
 s.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run('owner','synthetic@backup.test','Synthetic','hash','salt',1);
 s.prepare('INSERT INTO user_states VALUES(?,?,?,?)').run('owner','{"documents":[{"id":"private","fileData":"synthetic"}]}',1,1);
 s.prepare('INSERT INTO sessions VALUES(?,?,?)').run('synthetic-session','owner',Date.now()+99999);
 s.prepare('INSERT INTO calendar_connections VALUES(?,?,?,?)').run('owner','connection','encrypted-credentials',1);
 s.prepare('INSERT INTO document_shares VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('grant','owner','owner','private','hash','sig','sha','Title','file.png','image/png',10,1,9999999999999,null);
 s.prepare('INSERT INTO whatsapp_links VALUES(?,?,?)').run('owner','5511999999999',1);
 s.prepare('INSERT INTO reminder_settings VALUES(?,?,?,?)').run('owner',1,'{}',1);
 s.prepare('INSERT INTO reminder_jobs VALUES(?,?,?,?,?,?)').run('job','owner',1,'/#/hoje','pending',1);
 s.prepare('INSERT INTO integration_inbox(id,user_id,source,kind,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('inbox','owner','whatsapp','text','{"text":"synthetic pending message"}','pending',1,1);
 const before=s.prepare('SELECT data FROM user_states').get().data;s.exec(readFileSync(new URL('../scripts/restore-quarantine.sql',import.meta.url),'utf8'));
 assert.equal(s.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);assert.equal(s.prepare('SELECT COUNT(*) AS n FROM calendar_connections').get().n,0);assert.equal(s.prepare('SELECT COUNT(*) AS n FROM whatsapp_links').get().n,0);assert.ok(s.prepare('SELECT revoked_at FROM document_shares').get().revoked_at);assert.equal(s.prepare('SELECT enabled FROM reminder_settings').get().enabled,0);assert.equal(s.prepare('SELECT status FROM reminder_jobs').get().status,'cancelled');assert.equal(s.prepare('SELECT data FROM user_states').get().data,before);
 assert.equal(s.prepare('SELECT status FROM integration_inbox').get().status,'discarded');assert.equal(s.prepare('SELECT payload FROM integration_inbox').get().payload,'{"text":"synthetic pending message"}');
});
test('preparo de alvo exige ID, ambiente e origem seguros sem mudar o desenvolvimento',()=>{
 const template=JSON.parse(readFileSync(new URL('../wrangler.production.example.jsonc',import.meta.url),'utf8')),before=structuredClone(template),options={environment:'staging',databaseId:crypto.randomUUID(),workerName:'mentra-life-staging',origin:'https://staging.example.test'};
 const config=deploymentConfig(template,options);assert.deepEqual(template,before);assert.equal(config.vars.GOOGLE_CALENDAR_REDIRECT_URI,'https://staging.example.test/calendar-callback');assert.equal(config.d1_databases[0].database_id,options.databaseId);
 for(const patch of [{environment:'local'},{databaseId:'local-synthetic'},{workerName:'../bad'},{origin:'http://example.test'},{origin:'https://user:pass@example.test'},{origin:'https://example.test/path'}])assert.throws(()=>deploymentConfig(template,{...options,...patch}));
 assert.throws(()=>deploymentConfig({...template,vars:{SECRET:'synthetic-private'}},options),/secrets/);
});
test('CLIs impedem compartilhar D1 entre alvos/sobrescrever configuração e não vazam chave em arquivo inválido',t=>{
 const f=files(t),prepare=fileURLToPath(new URL('../scripts/prepare-deployment.mjs',import.meta.url)),backup=fileURLToPath(new URL('../scripts/private-backup.mjs',import.meta.url));
 writeFileSync(join(f.root,'wrangler.production.example.jsonc'),readFileSync(new URL('../wrangler.production.example.jsonc',import.meta.url)));const id=crypto.randomUUID();
 const run=args=>spawnSync(process.execPath,[prepare,...args],{cwd:f.root,encoding:'utf8',windowsHide:true});
 assert.equal(run(['--environment','staging','--database-id',id,'--worker','synthetic-staging']).status,0);
 const original=readFileSync(join(f.root,'wrangler.staging.jsonc'),'utf8');assert.equal(run(['--environment','staging','--database-id',crypto.randomUUID(),'--worker','another-worker']).status,1);assert.equal(readFileSync(join(f.root,'wrangler.staging.jsonc'),'utf8'),original);
 assert.equal(run(['--environment','production','--database-id',id,'--worker','synthetic-production']).status,1);assert.equal(existsSync(join(f.root,'wrangler.production.jsonc')),false);
 assert.equal(run(['--environment','restore-test','--database-id',crypto.randomUUID(),'--worker','synthetic-restore']).status,0);
 writeFileSync(join(f.root,'.dev.vars.backup'),'{"MENTRA_BACKUP_PASSPHRASE":"synthetic-sensitive-value');const env={...process.env};delete env.MENTRA_BACKUP_PASSPHRASE;
 const result=spawnSync(process.execPath,[backup,'decrypt','--input','missing.mlbk','--out','.mentra-private/missing.sql'],{cwd:f.root,env,encoding:'utf8',windowsHide:true});assert.equal(result.status,1);assert.ok(!(result.stderr+result.stdout).includes('synthetic-sensitive-value'));
});
