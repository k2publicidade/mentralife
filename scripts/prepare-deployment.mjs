import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function deploymentConfig(template,{environment,databaseId,workerName,origin,hosting='cloudflare'}){
 if(!['staging','production','restore-test'].includes(environment))throw Error('Escolha --environment staging, production ou restore-test.');
 if(!['cloudflare','vercel'].includes(hosting)||hosting==='vercel'&&!origin)throw Error('Para hospedar na Vercel, informe --hosting vercel e --origin com o endereço público HTTPS.');
 if(typeof databaseId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(databaseId))throw Error('Informe o ID real do D1, retornado pela Cloudflare.');
 if(typeof workerName!=='string'||!/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName))throw Error('Informe um nome de Worker com 3 a 63 letras minúsculas, números ou hífens.');
 if(Object.keys(template.vars||{}).some(k=>/(?:API_KEY|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|PASSPHRASE|ENCRYPTION_KEY)$/i.test(k)))throw Error('Remova secrets do modelo de configuração antes de preparar o alvo. Nenhum valor foi exibido.');
 const result=structuredClone(template);result.name=workerName;result.d1_databases=[{binding:'DB',database_name:workerName,database_id:databaseId,migrations_dir:'migrations'}];
 if(origin){let u;try{u=new URL(origin);}catch{throw Error('Informe a origem HTTPS do sistema.');}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.pathname!=='/')throw Error('Use somente a origem HTTPS, sem caminho, credenciais ou parâmetros.');result.vars={...result.vars,GOOGLE_CALENDAR_REDIRECT_URI:u.origin+'/calendar-callback'};}
 if(hosting==='vercel')result.vars.PUBLIC_ORIGIN=new URL(origin).origin;
 return result;
}
function configFile(path){try{return JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('Não foi possível ler a configuração JSON do alvo/modelo. Nenhum conteúdo foi exibido.');}}
function main(){
 const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 try{
  const environment=option('--environment'),config=deploymentConfig(configFile('wrangler.production.example.jsonc'),{environment,databaseId:option('--database-id'),workerName:option('--worker'),origin:option('--origin'),hosting:option('--hosting')||'cloudflare'}),path=resolve('wrangler.'+environment+'.jsonc');
  if(existsSync(path))throw Error('A configuração do alvo já existe; revise-a em vez de sobrescrever.');
  for(const name of ['staging','production','restore-test'])if(name!==environment){const other=resolve('wrangler.'+name+'.jsonc');if(existsSync(other)){const previous=configFile(other);if(previous.name===config.name||previous.d1_databases?.some(d=>d.database_id===config.d1_databases[0].database_id))throw Error('Os alvos precisam de Workers e D1 distintos.');}}
  writeFileSync(path,JSON.stringify(config,null,2)+'\n',{flag:'wx'});console.log('Configuração '+environment+' criada. Nenhum secret foi gravado. Confira o D1 escolhido antes de migrar/publicar.');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
