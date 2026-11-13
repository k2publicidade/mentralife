import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plansMarkup} from '../dist/platform.mjs';

const plans=[{id:'free',name:'Começo',description:'Base',monthlyRequests:30,priceCents:0},{id:'plus',name:'Impulso',description:'Mais',monthlyRequests:600,priceCents:2990}];
const subscription={plan:'free',status:'pending'};

test('app nativo não exibe preço nem inicia checkout externo (App Store 3.1.1 / Play Billing)',()=>{
 globalThis.mentraNative=true;
 try{
  const html=plansMarkup(subscription,plans,{},true);
  assert.doesNotMatch(html,/PicPay|R\$|data-platform-plan|<button|href=/);
  assert.match(html,/não é contratada pelo aplicativo/);
 }finally{delete globalThis.mentraNative;}
});

test('web mantém o fluxo de pagamento',()=>{
 assert.match(plansMarkup(subscription,plans,{},true),/Pagar com PicPay/);
});

test('runtime nativo e bootstrap não abrem checkout',()=>{
 assert.doesNotMatch(readFileSync('mobile/native-runtime.mjs','utf8'),/OpenCheckout/);
 assert.match(readFileSync('dist/bootstrap.mjs','utf8'),/if\(globalThis\.mentraNative\)throw Error\('A contratação não está disponível no aplicativo\.'\)/);
});

test('manifestos nativos declaram microfone e build de loja iOS',()=>{
 const manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8'),plist=readFileSync('ios/App/App/Info.plist','utf8');
 assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
 assert.match(manifest,/android:allowBackup="false"/);
 assert.match(manifest,/android:usesCleartextTraffic="false"/);
 assert.match(plist,/NSMicrophoneUsageDescription/);
 assert.match(plist,/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
 assert.match(plist,/<string>arm64<\/string>/);
 assert.doesNotMatch(plist,/armv7/);
});

test('versão mobile única aplicada ao Android e iOS',()=>{
 const {version,build}=JSON.parse(readFileSync('mobile/version.json','utf8'));
 const gradle=readFileSync('android/app/build.gradle','utf8'),pbx=readFileSync('ios/App/App.xcodeproj/project.pbxproj','utf8');
 assert.match(gradle,/versionCode mobileVersion\.build/);
 assert.match(gradle,/versionName mobileVersion\.version/);
 assert.deepEqual([...new Set(pbx.match(/MARKETING_VERSION = [^;]+;/g))],[`MARKETING_VERSION = ${version};`]);
 assert.deepEqual([...new Set(pbx.match(/CURRENT_PROJECT_VERSION = [^;]+;/g))],[`CURRENT_PROJECT_VERSION = ${build};`]);
 assert.match(gradle,/throw new GradleException\('Upload key ausente/);
});
