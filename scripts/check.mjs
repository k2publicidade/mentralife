import {readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const directory of ['dist','server','scripts','mobile','whatsapp-gateway']){
 if(!existsSync(directory))continue;
 for(const file of readdirSync(directory,{withFileTypes:true})){
  if(file.isFile()&&/\.(?:mjs|js)$/.test(file.name))execFileSync(process.execPath,['--check',`${directory}/${file.name}`],{stdio:'inherit'});
 }
}
console.log('Sintaxe verificada: interface, API e scripts.');
execFileSync(process.execPath,['scripts/legal-pages.mjs','--check'],{stdio:'inherit'});
