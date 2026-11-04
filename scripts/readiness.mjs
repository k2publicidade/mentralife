import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';

export function parseSecrets(source){
 if(source.trimStart().startsWith('{'))return JSON.parse(source);
 const result={};
 for(const line of source.split(/\r?\n/)){const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!match)continue;let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);result[match[1]]=value;}
 return result;
}
export async function checkReadiness(config,secrets){
 const checks=[],add=(id,ok,message)=>checks.push({id,ok:Boolean(ok),message});
 add('production_config',config,'Criar wrangler.production.jsonc a partir do exemplo e escolher o ambiente alvo.');
 add('worker_entry',config?.main==='server/worker.mjs','Publicar o backend server/worker.mjs do projeto.');
 add('worker_name',/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(config?.name||''),'Definir o nome do Worker do alvo.');
 add('assets_directory',['dist','./dist'].includes(config?.assets?.directory),'Hospedar somente dist; nunca publicar a raiz do projeto.');
 add('api_routing',config?.assets?.run_worker_first?.includes('/api/*')&&config?.assets?.run_worker_first?.includes('/admin'),'Encaminhar /api/* e /admin ao Worker.');
 add('private_configuration',!Object.keys(config?.vars||{}).some(k=>/(?:API_KEY|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|PASSPHRASE|ENCRYPTION_KEY)$/i.test(k)),'Remover secrets do JSON de configuração; cadastrar pelo armazenamento de secrets do Worker.');
 add('log_privacy',config?.observability?.redact_query_string===true&&config?.observability?.logs?.invocation_logs===false,'Suprimir query strings e logs automáticos de invocação no alvo publicado.');
 add('d1_id',config?.d1_databases?.some(d=>d.binding==='DB'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(d.database_id)),'Definir o identificador real do D1 de staging/produção.');
 add('ai_binding',config?.ai?.binding==='AI','Habilitar o binding Workers AI AI na conta Cloudflare.');
 add('cron',config?.triggers?.crons?.includes('* * * * *'),'Configurar execução do scheduler a cada minuto.');
 if(config?.vars?.PUBLIC_ORIGIN){
  let valid=false;try{const u=new URL(config.vars.PUBLIC_ORIGIN);valid=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}catch{}
  add('vercel_public_origin',valid,'Definir PUBLIC_ORIGIN com a origem HTTPS estável do site Vercel.');
  add('VERCEL_ORIGIN_SECRET',/^[a-f0-9]{64}$/.test(secrets.VERCEL_ORIGIN_SECRET||''),'Cadastrar o mesmo segredo privado na Cloudflare e na Vercel.');
 }
 for(const name of ['WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_ACCESS_TOKEN'])add(name,typeof secrets[name]==='string'&&secrets[name].length>0,'Cadastrar '+name+' como secret do Worker.');
 add('WHATSAPP_GRAPH_VERSION',/^v\d+\.\d+$/.test(secrets.WHATSAPP_GRAPH_VERSION||config?.vars?.WHATSAPP_GRAPH_VERSION||''),'Escolher a versão Graph aceita pela aplicação Meta.');
 add('WHATSAPP_PHONE_NUMBER_ID',/^\d{5,30}$/.test(secrets.WHATSAPP_PHONE_NUMBER_ID||config?.vars?.WHATSAPP_PHONE_NUMBER_ID||''),'Cadastrar o ID do número empresarial Meta.');
 let pairValid=false;
 try{
  const pub=Buffer.from(secrets.VAPID_PUBLIC_KEY||'','base64url'),priv=Buffer.from(secrets.VAPID_PRIVATE_KEY||'','base64url');
  if(pub.length===65&&pub[0]===4&&priv.length===32){
   const key=await webcrypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url'),d:priv.toString('base64url')},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
   const publicKey=await webcrypto.subtle.importKey('raw',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify']),data=new TextEncoder().encode('Mentra local readiness');
   pairValid=await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,data),data);
  }
 }catch{}
 add('vapid_pair',pairValid,'Conferir o par VAPID privado e cadastrá-lo no Worker; não trocar chaves de dispositivos ativos.');
 let subjectValid=false;try{const value=secrets.VAPID_SUBJECT||'';subjectValid=/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||(new URL(value).protocol==='https:'&&!new URL(value).username&&!new URL(value).password);}catch{}
 add('VAPID_SUBJECT',subjectValid,'Informar um contato real mailto ou HTTPS do operador.');
 for(const name of ['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET'])add(name,Boolean(secrets[name]),'Configurar '+name+' no Worker e habilitar o aplicativo Google Calendar OAuth.');
 add('CALENDAR_ENCRYPTION_KEY',/^[a-f0-9]{64}$/.test(secrets.CALENDAR_ENCRYPTION_KEY||''),'Cadastrar a chave de criptografia de calendário já preparada no arquivo privado .dev.vars.calendar.');
 let redirectValid=false;try{const u=new URL(secrets.GOOGLE_CALENDAR_REDIRECT_URI||config?.vars?.GOOGLE_CALENDAR_REDIRECT_URI);redirectValid=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/calendar-callback';}catch{}
 add('GOOGLE_CALENDAR_REDIRECT_URI',redirectValid,'Cadastrar o endereço HTTPS do sistema seguido de /calendar-callback no Worker e no cliente OAuth Google.');
 add('backup_key',typeof secrets.MENTRA_BACKUP_PASSPHRASE==='string'&&secrets.MENTRA_BACKUP_PASSPHRASE.length>=24,'Guardar a chave privada preparada em .dev.vars.backup, com cópia segura fora dos backups. Não é secret do Worker.');
 return checks;
}

async function main(){
 const option=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;},configPath=resolve(option('--config')||'wrangler.production.jsonc'),secretsPath=option('--secrets')|| (existsSync('.dev.vars.push')?'.dev.vars.push':null);
 let config=null,secrets={...process.env};
 try{if(existsSync(configPath))config=JSON.parse(readFileSync(configPath,'utf8'));for(const file of option('--secrets')?[secretsPath]:['.dev.vars.push','.dev.vars.calendar','.dev.vars.backup','.dev.vars.vercel'].filter(existsSync))if(file)secrets={...parseSecrets(readFileSync(resolve(file),'utf8')),...secrets};}
 catch{console.error('Não foi possível ler a configuração/secrets. Use o formato JSON do exemplo ou um arquivo .dev.vars. Nenhum valor foi exibido.');process.exitCode=1;return;}
 const checks=await checkReadiness(config,secrets);
 const migrations=readdirSync('migrations').filter(f=>f.endsWith('.sql')).length;
 console.log('Pré-publicação local: '+migrations+' migrações. Valores de secrets não são exibidos.');
 for(const check of checks)console.log((check.ok?'OK ':'PENDENTE ')+check.id+(check.ok?'':': '+check.message));
 console.log('DeepSeek: penúltima etapa. Gateway: última etapa.');
 console.log('Este comando não autentica, publica ou comprova credenciais/serviços remotos. Aplicar migrações, cadastrar secrets e homologar HTTPS/aparelhos ainda são etapas de implantação.');
 if(checks.some(c=>!c.ok))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
