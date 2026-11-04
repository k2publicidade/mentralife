import {existsSync,lstatSync,mkdirSync,readdirSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {httpsOrigin} from '../server/hosting.mjs';

export function vercelEnvironment(env){
 const workerOrigin=httpsOrigin(env.MENTRA_WORKER_ORIGIN),publicOrigin=httpsOrigin(env.PUBLIC_ORIGIN);
 if(workerOrigin===publicOrigin)throw Error('O backend Cloudflare e o site Vercel precisam de origens distintas.');
 if(!/^[a-f0-9]{64}$/.test(env.VERCEL_ORIGIN_SECRET||''))throw Error('Cadastre VERCEL_ORIGIN_SECRET como variável privada nas duas plataformas.');
 return {workerOrigin,publicOrigin};
}
export function copyVercelAssets(root){
 const base=realpathSync(root),source=join(base,'dist'),target=resolve(base,'.vercel-public');
 if(dirname(target)!==base||lstatSync(source).isSymbolicLink())throw Error('Diretório público inválido.');
 // The only recursively removed directory is this verified, generated workspace folder.
 if(existsSync(target)){if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isDirectory())throw Error('A saída Vercel precisa ser um diretório real.');rmSync(target,{recursive:true});}
 mkdirSync(target);
 const extensions=new Set(['.html','.js','.mjs','.css','.json','.webmanifest','.wasm','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2','.ttf','.txt','.gz','.bcmap','.pfb','.icc','.otf','.md']);
 let count=0;
 function copy(from,to,depth=0){
  for(const entry of readdirSync(from,{withFileTypes:true})){
   if(entry.name.startsWith('.')||['downloads','handoff'].includes(entry.name))continue;
   const src=join(from,entry.name),dst=join(to,entry.name);
   if(entry.isSymbolicLink())throw Error('Links simbólicos não são permitidos no pacote público.');
   if(entry.isDirectory()){
    if(depth===0&&!['assets','vendor'].includes(entry.name))continue;
    mkdirSync(dst);copy(src,dst,depth+1);
   }else if(entry.isFile()&&(extensions.has(extname(entry.name).toLowerCase())||/^LICENSE(?:_|$)/.test(entry.name))){copyFileSync(src,dst);count++;}
  }
 }
 copy(source,target);
 for(const file of ['index.html','admin.html','share.html','calendar-callback.html','push-sw.js','skip-link.mjs'])if(!existsSync(join(target,file)))throw Error('Arquivo público obrigatório ausente: '+file);
 return count;
}
function main(){try{
 vercelEnvironment(process.env);
 execFileSync(process.execPath,['scripts/prepare-vendor.mjs'],{stdio:'inherit'});
 execFileSync(process.execPath,['scripts/check.mjs'],{stdio:'inherit'});
 console.log('Vercel: '+copyVercelAssets(process.cwd())+' arquivos públicos preparados. Nenhum secret foi escrito na saída.');
}catch(error){console.error(error.message);process.exitCode=1;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
