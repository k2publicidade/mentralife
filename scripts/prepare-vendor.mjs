import {mkdirSync,copyFileSync,cpSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const target=resolve('dist/vendor');mkdirSync(target,{recursive:true});
const files=[];
function copy(source,destination){mkdirSync(resolve(target,destination,'..'),{recursive:true});copyFileSync(source,resolve(target,destination));files.push(destination);}
for(const name of ['pdf.mjs','pdf.worker.mjs'])copy('node_modules/pdfjs-dist/legacy/build/'+name,'pdfjs/'+name);
for(const name of ['cmaps','standard_fonts','wasm','iccs']){cpSync('node_modules/pdfjs-dist/'+name,resolve(target,'pdfjs',name),{recursive:true});}
copy('node_modules/pdfjs-dist/LICENSE','pdfjs/LICENSE');
copy('node_modules/tesseract.js/dist/tesseract.esm.min.js','tesseract/tesseract.mjs');
copy('node_modules/tesseract.js/dist/worker.min.js','tesseract/worker.min.js');
copy('node_modules/tesseract.js/LICENSE.md','tesseract/LICENSE');
copy('node_modules/tesseract.js-core/LICENSE','tesseract/core/LICENSE');
for(const name of readdirSync('node_modules/tesseract.js-core'))if(/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))copy('node_modules/tesseract.js-core/'+name,'tesseract/core/'+name);
copy('node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz','tesseract/lang/por.traineddata.gz');
copy('node_modules/@tesseract.js-data/por/package.json','tesseract/lang/package.json');
copy('node_modules/@tesseract.js-data/por/README.md','tesseract/lang/README.md');
function scan(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())scan(resolve(dir,entry.name),relative+'/');else if(relative!=='manifest.json'&&!files.includes(relative))files.push(relative);}}
scan(target);const versions=Object.fromEntries(['pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/por'].map(name=>[name,JSON.parse(readFileSync('node_modules/'+name+'/package.json','utf8')).version]));
writeFileSync(resolve(target,'manifest.json'),JSON.stringify({versions,files:Object.fromEntries(files.sort().map(file=>[file,createHash('sha256').update(readFileSync(resolve(target,file))).digest('hex')]))},null,2)+'\n');
console.log('Bibliotecas PDF/OCR locais preparadas; versões e hashes registrados.');
