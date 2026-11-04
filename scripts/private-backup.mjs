import {createReadStream,createWriteStream,existsSync,realpathSync,mkdirSync,openSync,readSync,closeSync,writeFileSync,appendFileSync,linkSync,unlinkSync,statSync,readFileSync} from 'node:fs';
import {resolve,dirname,basename,relative,join,sep,isAbsolute} from 'node:path';
import {createCipheriv,createDecipheriv,scrypt,randomBytes,randomUUID} from 'node:crypto';
import {createGzip,createGunzip} from 'node:zlib';
import {Transform,Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {parseSecrets} from './readiness.mjs';
const magic=Buffer.from('MENTRA-D1-BACKUP-1\n'),headerLength=magic.length+16+12,tagLength=16;
const derive=promisify(scrypt),execute=promisify(execFile);
const within=(parent,path)=>{const r=relative(parent,path);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};
function physical(path){if(existsSync(path))return realpathSync(path);return join(physical(dirname(path)),basename(path));}
export function privateOutput(path,{root=process.cwd()}={}){
 const target=resolve(path),canonical=physical(target),assets=physical(resolve(root,'dist'));
 if(within(assets,canonical)||within(resolve(root,'dist'),target))throw Error('Backup e SQL restaurado não podem ser gravados em dist/assets públicos.');
 if(within(physical(resolve(root)),canonical)&&!within(physical(resolve(root,'.mentra-private')),canonical))throw Error('Dentro do projeto, use apenas .mentra-private para backups e SQL restaurado.');
 if(existsSync(target))throw Error('O destino já existe. Escolha outro nome; arquivos não serão sobrescritos.');
 mkdirSync(dirname(target),{recursive:true,mode:0o700});return target;
}
function passphrase(value){if(typeof value!=='string'||value.length<24||value.length>1024)throw Error('Configure MENTRA_BACKUP_PASSPHRASE com 24 a 1024 caracteres no ambiente ou arquivo privado .dev.vars.backup.');return value;}
const secretKey=(value,salt)=>derive(passphrase(value),salt,32,{N:32768,r:8,p:1,maxmem:128*1024*1024});
const clean=path=>{if(path&&existsSync(path))unlinkSync(path);};
function publish(partial,target){linkSync(partial,target);unlinkSync(partial);}
export async function encryptBackup(input,output,password,{root=process.cwd(),metadata={}}={}){
 if(resolve(input)===resolve(output))throw Error('Escolha um destino diferente do SQL original.');
 const target=privateOutput(output,{root}),partial=target+'.partial-'+randomUUID(),salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]);
 const info=JSON.stringify({...metadata,format:'mentra-d1-sql-v1',createdAt:new Date().toISOString()});if(info.length>1024||/[\r\n]/.test(info))throw Error('Metadados inválidos.');
 const cipher=createCipheriv('aes-256-gcm',await secretKey(password,salt),iv);cipher.setAAD(header);
 async function* source(){yield Buffer.from('-- mentra-backup-metadata: '+info+'\n');for await(const chunk of createReadStream(input))yield chunk;}
 try{writeFileSync(partial,header,{flag:'wx',mode:0o600});await pipeline(Readable.from(source()),createGzip(),cipher,createWriteStream(partial,{flags:'a',mode:0o600}));appendFileSync(partial,cipher.getAuthTag());publish(partial,target);return {path:target,bytes:statSync(target).size};}finally{clean(partial);}
}
export async function decryptBackup(input,output,password,{root=process.cwd(),maxBytes=500*1024*1024}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024*1024)throw Error('Limite de restauração inválido.');
 const size=statSync(input).size;if(size<headerLength+tagLength+1)throw Error('Backup incompleto ou formato inválido.');
 const header=Buffer.alloc(headerLength),tag=Buffer.alloc(tagLength),fd=openSync(input,'r');try{readSync(fd,header,0,header.length,0);readSync(fd,tag,0,tag.length,size-tagLength);}finally{closeSync(fd);}
 if(!header.subarray(0,magic.length).equals(magic))throw Error('Formato de backup inválido.');
 const target=privateOutput(output,{root}),partial=target+'.partial-'+randomUUID(),salt=header.subarray(magic.length,magic.length+16),iv=header.subarray(magic.length+16);
 const decipher=createDecipheriv('aes-256-gcm',await secretKey(password,salt),iv);decipher.setAAD(header);decipher.setAuthTag(tag);let bytes=0;
 const limit=new Transform({transform(chunk,encoding,next){bytes+=chunk.length;if(bytes>maxBytes)next(Error('O SQL restaurado ultrapassa o limite permitido.'));else next(null,chunk);}});
 try{await pipeline(createReadStream(input,{start:headerLength,end:size-tagLength-1}),decipher,createGunzip(),limit,createWriteStream(partial,{flags:'wx',mode:0o600}));publish(partial,target);return {path:target,bytes};}catch{throw Error('Restauração recusada: senha incorreta, backup adulterado/incompleto ou limite de tamanho excedido. Nenhum SQL final foi liberado.');}finally{clean(partial);}
}
export async function exportBackup({config,mode,output,password,root=process.cwd(),run=execute}){
 if(!['local','remote'].includes(mode))throw Error('Escolha explicitamente --local ou --remote.');
 const configPath=resolve(config);let settings;try{settings=JSON.parse(readFileSync(configPath,'utf8'));}catch{throw Error('Não foi possível ler a configuração JSON do alvo. Nenhum conteúdo foi exibido.');}const database=settings.d1_databases?.find(d=>d.binding==='DB');
 if(!database||mode==='remote'&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(database.database_id))throw Error('Configuração D1 inválida para o alvo escolhido.');
 passphrase(password);privateOutput(output,{root});
 const temporary=privateOutput(join(resolve(root,'.mentra-private'),'export-'+randomUUID()+'.sql'),{root});
 try{
  const childEnv={...process.env};delete childEnv.MENTRA_BACKUP_PASSPHRASE;
  try{await run(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','export','DB','--'+mode,'--config',configPath,'--output',temporary],{cwd:root,env:childEnv,maxBuffer:2*1024*1024,windowsHide:true});}catch{throw Error('A exportação D1 não foi concluída. Confira autenticação, configuração e disponibilidade Cloudflare. Nenhum backup foi publicado.');}
  return await encryptBackup(temporary,output,password,{root,metadata:{worker:settings.name||'',databaseId:database.database_id,location:mode}});
 }finally{clean(temporary);}
}
async function main(){
 const args=process.argv.slice(2),operation=args.shift(),option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
 try{
  const privateKey=resolve('.dev.vars.backup');let password=process.env.MENTRA_BACKUP_PASSPHRASE;if(!password&&existsSync(privateKey)){try{password=parseSecrets(readFileSync(privateKey,'utf8')).MENTRA_BACKUP_PASSPHRASE;}catch{throw Error('Não foi possível ler o arquivo privado de recuperação. Nenhum valor foi exibido.');}}
  let result;
  if(operation==='export')result=await exportBackup({config:option('--config')||'wrangler.production.jsonc',mode:args.includes('--remote')&&!args.includes('--local')?'remote':args.includes('--local')&&!args.includes('--remote')?'local':null,output:option('--out')||resolve('.mentra-private','backup-'+Date.now()+'.mlbk'),password});
  else if(operation==='decrypt'){if(!option('--input')||!option('--out'))throw Error('Informe --input do backup e --out privado para o SQL restaurado.');result=await decryptBackup(resolve(option('--input')),resolve(option('--out')),password,{maxBytes:Number(option('--max-mb')||500)*1024*1024});}
  else throw Error('Use export --local|--remote --config ARQUIVO --out BACKUP.mlbk ou decrypt --input BACKUP.mlbk --out SQL-PRIVADO.sql.');
  console.log('Operação concluída: '+result.bytes+' bytes em arquivo privado. Nenhum valor, SQL ou chave foi exibido.');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
