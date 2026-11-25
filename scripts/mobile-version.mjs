// Applies mobile/version.json to the iOS project (Android's Gradle reads the JSON directly).
// Usage: node scripts/mobile-version.mjs            -> sync only
//        node scripts/mobile-version.mjs --bump     -> increment build number, then sync
//        node scripts/mobile-version.mjs --set 1.1.0 -> new marketing version, build +1, then sync
import {readFileSync,writeFileSync} from 'node:fs';

const versionPath='mobile/version.json',pbxPath='ios/App/App.xcodeproj/project.pbxproj';
const current=JSON.parse(readFileSync(versionPath,'utf8'));
const args=process.argv.slice(2),setIndex=args.indexOf('--set');
if(setIndex>=0){
 const next=args[setIndex+1];
 if(!/^\d+\.\d+\.\d+$/.test(next||''))throw Error('Use --set X.Y.Z');
 current.version=next;current.build+=1;
}else if(args.includes('--bump'))current.build+=1;
if(!/^\d+\.\d+\.\d+$/.test(current.version)||!Number.isInteger(current.build)||current.build<1||current.build>2100000000)throw Error('mobile/version.json inválido.');
writeFileSync(versionPath,JSON.stringify(current,null,2)+'\n');
const pbx=readFileSync(pbxPath,'utf8');
const updated=pbx.replace(/MARKETING_VERSION = [^;]+;/g,`MARKETING_VERSION = ${current.version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,`CURRENT_PROJECT_VERSION = ${current.build};`);
if(!/MARKETING_VERSION/.test(updated))throw Error('MARKETING_VERSION não encontrado no projeto iOS.');
writeFileSync(pbxPath,updated);
console.log(`Mobile ${current.version} (build ${current.build}) aplicado ao Android e iOS.`);
