import {mkdirSync,readFileSync,writeFileSync,cpSync,existsSync,unlinkSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {copyVercelAssets} from './build-vercel.mjs';
import {httpsOrigin} from '../server/hosting.mjs';

const origin=httpsOrigin(process.env.MENTRA_MOBILE_API_ORIGIN||'https://mentralife.vercel.app');
const androidPushAvailable=existsSync('android/app/google-services.json');
if(androidPushAvailable){
 const client=JSON.parse(readFileSync('android/app/google-services.json','utf8')),app=JSON.parse(readFileSync('capacitor.config.json','utf8'));
 if(!client.client?.some(value=>value.client_info?.android_client_info?.package_name===app.appId))throw Error('O arquivo cliente Firebase não corresponde ao identificador do aplicativo.');
}
execFileSync(process.execPath,['scripts/prepare-vendor.mjs'],{stdio:'inherit'});
// Reuse the public allowlist; secrets, downloads and handoff never enter the application.
copyVercelAssets(process.cwd());
const target=resolve('.mobile-public');mkdirSync(target,{recursive:true});
// Clear only the verified generated output so removed source files cannot survive a build.
const {readdirSync,rmSync,lstatSync}=await import('node:fs');
if(lstatSync(target).isSymbolicLink())throw Error('Saída mobile não pode ser link simbólico.');
for(const entry of readdirSync(target))rmSync(resolve(target,entry),{recursive:true,force:true});
cpSync('.vercel-public',target,{recursive:true});
// Android AAPT strips .gz and inflates it. Ship the same explicit uncompressed
// language file on both native platforms, with OCR configured accordingly.
const compressedLanguage=resolve(target,'vendor/tesseract/lang/por.traineddata.gz');
const language=gunzipSync(readFileSync(compressedLanguage),{maxOutputLength:32*1024*1024});
writeFileSync(resolve(target,'vendor/tesseract/lang/por.traineddata'),language);unlinkSync(compressedLanguage);
const vendorManifestPath=resolve(target,'vendor/manifest.json'),vendorManifest=JSON.parse(readFileSync(vendorManifestPath,'utf8'));
delete vendorManifest.files['tesseract/lang/por.traineddata.gz'];
vendorManifest.files['tesseract/lang/por.traineddata']=createHash('sha256').update(language).digest('hex');
writeFileSync(vendorManifestPath,JSON.stringify(vendorManifest,null,2)+'\n');
await build({absWorkingDir:process.cwd(),entryPoints:[resolve('mobile/native-runtime.mjs')],tsconfigRaw:{},outfile:resolve(target,'native-runtime.js'),bundle:true,format:'esm',target:'es2022',define:{MENTRA_API_ORIGIN:JSON.stringify(origin),MENTRA_ANDROID_PUSH_AVAILABLE:JSON.stringify(androidPushAvailable)}});
const entry=resolve(target,'entry.mjs');writeFileSync(entry,"await import('./native-runtime.js');\n"+readFileSync(entry,'utf8'));
const adminEntry=resolve(target,'admin.mjs');writeFileSync(adminEntry,"import './compat.mjs';\nimport './native-runtime.js';\n"+readFileSync(adminEntry,'utf8'));
const index=resolve(target,'index.html');
const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' "+origin+"; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
writeFileSync(index,readFileSync(index,'utf8').replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">'));
const adminPage=resolve(target,'admin.html');writeFileSync(adminPage,readFileSync(adminPage,'utf8').replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">').replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover').replace('</head>','<link rel="stylesheet" href="mobile.css"></head>'));
writeFileSync(resolve(target,'mobile-build.json'),JSON.stringify({apiOrigin:origin,appId:JSON.parse(readFileSync('capacitor.config.json')).appId},null,2));
if(!existsSync(resolve(target,'index.html')))throw Error('Entrada mobile ausente.');
console.log('App mobile empacotado em .mobile-public; API: '+origin);
