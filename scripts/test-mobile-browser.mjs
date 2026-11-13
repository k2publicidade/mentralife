import {chromium,webkit} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';

const packaged=process.argv.includes('--packaged');
const root=resolve(packaged?'.mobile-public':'dist'),types={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
 if(!path.startsWith(root+sep))throw Error('path');
 const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('qa/mobile',{recursive:true});
const user={id:'mobile-fixture',name:'Pessoa de teste',email:'mobile@example.test',role:'user'};
const plans=[{id:'essencial',name:'Essencial',description:'Organização',priceCents:1990,monthlyRequests:100}];
let checks=0;
try{for(const [name,engine] of [['android-chromium',chromium],['ios-webkit',webkit]]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  if(packaged)await context.addInitScript(()=>{window.mentraNative=true;window.mentraNativeApi=(path,options)=>fetch('/api/'+path,options);});
  if(name==='ios-webkit')await context.addInitScript(()=>{
   // Exercise the API fallbacks needed by the declared iOS 15.0 target.
   window.structuredClone=undefined;Object.hasOwn=undefined;Array.prototype.at=undefined;
   Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
   AbortSignal.timeout=undefined;AbortSignal.prototype.throwIfAborted=undefined;
  });
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const request=route.request();
   const revision=path==='/api/state'&&request.method()==='PUT'?request.postDataJSON().revision+1:0;
   const body=path==='/api/me'?{user,plans,subscription:{status:'pending'},usage:{requests:0}}:path==='/api/state'?{data:null,revision}:path==='/api/plans'?{plans}:{};
   return route.fulfill({json:body});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/perfil');await page.locator('.mobile-nav').waitFor();
  for(const width of [320,390,430,844]){
   await page.setViewportSize({width,height:width===844?390:844});
   for(const route of ['hoje','vida/agenda','vida/tarefas','arquivos/documentos','dinheiro','dinheiro/contas','caminhos','saude','momentos','perfil','menu']){
    await page.evaluate(route=>location.hash='/'+route,route);
    await page.waitForFunction(route=>location.hash==='#/'+route&&document.activeElement?.id==='main-content',route);
    await page.locator('#main-content h1').waitFor();
    const layout=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth,main:!!document.querySelector('#main-content h1')}));
    assert.ok(layout.content<=layout.width+1,`${name} ${width} ${route}: overflow ${layout.content}`);assert.ok(layout.main);checks++;
   }
   if(width===390){await page.evaluate(()=>location.hash='/hoje');await page.getByRole('heading',{name:/Seu dia/}).waitFor();await page.screenshot({path:`qa/mobile/${packaged?'packaged-':''}${name}-home.png`,fullPage:true});}
  }
  await page.evaluate(()=>location.hash='/perfil');
  const input=page.locator('input').first();if(await input.count())assert.ok(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/#/vida/tarefas');
  const newTask=page.getByRole('button',{name:'Nova tarefa'});
  await newTask.press('Enter');
  const taskDialog=page.getByRole('dialog');
  await taskDialog.waitFor();
  assert.ok(await taskDialog.evaluate(dialog=>document.activeElement===dialog));
  assert.ok(await page.locator('#app').evaluate(app=>app.inert));
  await page.keyboard.press('Shift+Tab');
  assert.equal(await taskDialog.getByRole('button',{name:'Salvar tarefa'}).evaluate(button=>document.activeElement===button),true);
  await page.keyboard.press('Tab');
  assert.equal(await taskDialog.getByRole('button',{name:'Fechar janela'}).evaluate(button=>document.activeElement===button),true);
  await page.keyboard.press('Escape');
  assert.ok(await newTask.evaluate(button=>document.activeElement===button));
  await newTask.click();
  await taskDialog.getByLabel('O que você quer fazer?').fill('Revisar o planejamento');
  await taskDialog.getByRole('button',{name:'Salvar tarefa'}).click();
  const task=page.getByRole('checkbox',{name:'Concluir Revisar o planejamento'});
  await task.press('Space');
  const completedTask=page.getByRole('checkbox',{name:'Reabrir Revisar o planejamento'});
  assert.ok(await completedTask.evaluate(button=>document.activeElement===button));
  checks+=2;
  await page.setViewportSize({width:1440,height:960});
  await page.goto(origin+'/?visual-check#/hoje');
  await page.getByRole('heading',{name:/Seu dia/}).waitFor();
  assert.ok(await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Hoje',exact:true}).evaluate(a=>a.getAttribute('aria-current')==='page'));
  assert.ok(await page.evaluate(async()=>{
   const faces=await Promise.all([document.fonts.load('16px Outfit'),document.fonts.load('450 32px Fraunces')]);
   return faces.every(matches=>matches.some(face=>face.status==='loaded'));
  }));
  await page.locator('.hero-mascot-image').evaluate(image=>image.decode());
  await page.screenshot({path:`qa/mobile/${packaged?'packaged-':''}${name}-desktop-home.png`});
  checks++;
  if(packaged){
   const image=(await readFile(resolve('tests/fixtures/document-scan.png'))).toString('base64');
   const ocrText=await page.evaluate(async fileData=>{
    const {extractDocumentText}=await import('/extraction.mjs'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{return (await extractDocumentText({mime:'image/png',fileData},{signal:controller.signal})).text;}finally{clearTimeout(timer);}
   },image);
   assert.match(ocrText,/4812/);assert.match(ocrText,/Pagamento confirmado/i);checks++;
   const pdfText=await page.evaluate(async()=>{
    const {createRecordPdf,loadPdfFonts}=await import('/pdf.mjs'),{extractDocumentText}=await import('/extraction.mjs');await loadPdfFonts();
    const bytes=createRecordPdf({title:'Contrato mobile 7319',cents:2990,date:'2026-11-06',category:'Teste',note:'Palavra pesquisável: jabuticaba'});let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return (await extractDocumentText({mime:'application/pdf',fileData:btoa(binary)},{ocr:false})).text;
   });assert.match(pdfText,/7319/);assert.match(pdfText,/jabuticaba/);checks++;
  }
  assert.deepEqual(errors,[],`${name}: erros de execução`);await context.close();
  const callbackContext=await browser.newContext();let exchanges=0;
  await callbackContext.route('**/api/**',route=>{exchanges++;return route.fulfill({status:401,json:{error:'Sessão de navegador diferente'}});});
  const callback=await callbackContext.newPage();await callback.goto(origin+'/calendar-callback.html?state=native.'+'a'.repeat(64)+'&code=synthetic-native-code');
  const returnLink=callback.getByRole('link',{name:'Voltar ao app Mentra'});await returnLink.waitFor();
  assert.match(await returnLink.getAttribute('href'),/^mentralife:\/\/calendar\/complete\?/);assert.equal(exchanges,0);assert.equal(new URL(callback.url()).search,'');checks++;
  await callbackContext.close();
  if(packaged){
   const administration=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await administration.addInitScript(()=>{window.mentraNative=true;window.mentraNativeApi=(path,options)=>fetch('/api/'+path,options);});
   await administration.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path==='/api/me'?{user:{...user,role:'admin'}}:path==='/api/admin/plans'?{plans,revision:1}:path==='/api/admin/users'?{users:[],total:0,page:1,pageSize:20}:{counts:{users:0,active:0,monthlyRequests:0},integrations:{},month:'2026-11'};
    return route.fulfill({json:body});
   });
   const admin=await administration.newPage(),adminErrors=[];admin.on('pageerror',error=>adminErrors.push(error.message));await admin.goto(origin+'/admin.html');
   await admin.locator('#admin-session:not([hidden])').waitFor();assert.match(await admin.locator('#admin-session .am-me').getAttribute('title'),/ADMIN MASTER/);
   assert.equal(await admin.evaluate(()=>globalThis.mentraNativeUserId),'mobile-fixture');assert.deepEqual(adminErrors,[]);checks++;
   await administration.close();
  }else{
   const guest=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await guest.route('**/api/**',route=>new URL(route.request().url()).pathname==='/api/plans'
    ?route.fulfill({json:{plans}})
    :route.fulfill({status:401,json:{error:'Sessão necessária'}}));
   const portal=await guest.newPage();
   await portal.goto(origin);
   await portal.getByRole('heading',{name:/Sua vida/}).waitFor();
   const skipLink=portal.getByRole('link',{name:'Pular para o conteúdo'});
   await skipLink.press('Enter');
   assert.ok(await portal.getByRole('main').evaluate(main=>document.activeElement===main));
   assert.equal(await portal.locator('.portal-hero').evaluate(hero=>getComputedStyle(hero).animationName),'none');
   await guest.close();
   checks++;
   // Test the real web worker separately, without request interception.
   const offline=await browser.newContext();const offlinePage=await offline.newPage();await offlinePage.goto(origin);
   await offlinePage.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker não ficou pronto em 10s')),10000))]);});
   await offlinePage.reload();await offline.setOffline(true);await offlinePage.goto(origin+'/?offline-test#/hoje');
   assert.match(await offlinePage.locator('h1').innerText(),/retomar/);checks++;
   await offline.close();
  }
 }finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
console.log(`${checks} verificações mobile ${packaged?'do pacote (adaptador simulado) ':''}passaram em Chromium e WebKit; capturas em qa/mobile.`);
