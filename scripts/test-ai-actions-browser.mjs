import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import worker from '../server/worker.mjs';
import {integrationDB} from '../tests/fixtures/integration-db.mjs';
import {readState} from '../server/state.mjs';

// In-memory database and simulated providers; never writes accounts in a deployed environment.
const DB=integrationDB(),root=resolve('dist'),realFetch=globalThis.fetch,errors=[];
const env={DB,DEEPSEEK_API_KEY:'synthetic-browser',AI:{run:async()=>({text:'Gastei 18 reais no lanche'})},ASSETS:{async fetch(req){const path=resolve(root,'.'+decodeURIComponent(new URL(req.url).pathname==='/'?'/index.html':new URL(req.url).pathname));if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/'))return new Response('',{status:404});try{const bytes=await readFile(path),mime={'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(path)]||'application/octet-stream';return new Response(bytes,{headers:{'Content-Type':mime}});}catch{return new Response('',{status:404});}}}};
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://api.deepseek.com/chat/completions')return realFetch(url,options);
 const payload=JSON.parse(options.body),q=payload.messages.at(-1).content,task=/tarefa/i.test(q);
 const args=task?{title:'Revisar orçamento',category:'Dinheiro',dueDate:null}:{title:/lanche/.test(q)?'Lanche':'Almoço',type:'expense',cents:/lanche/.test(q)?1800:3590,date:'2026-11-06',category:'Alimentação',accountName:null,paymentMethod:'other'};
 return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'test',type:'function',function:{name:task?'create_task':'record_transaction',arguments:JSON.stringify(args)}}]}}]});
};
const server=createServer(async(req,res)=>{try{const bytes=[];for await(const chunk of req)bytes.push(chunk);const r=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(bytes)}:{})}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500);res.end('Synthetic test error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const registration=await context.request.post(origin+'/api/register',{headers:{Origin:origin},data:{name:'Teste IA',email:'browser@local.invalid',password:'synthetic-browser-password',plan:'plus'}});assert.equal(registration.status(),200);const {user}=await registration.json();DB.sql.prepare("UPDATE subscriptions SET status='active' WHERE user_id=?").run(user.id);
 await page.goto(origin+'/#/mentra');await expect(page.locator('#chat-form')).toBeVisible();
 const send=async text=>{await page.locator('#chat-text').fill(text);await page.locator('#chat-form button').click();};
 await send('Gastei 35,90 no almoço');await expect(page.locator('.messages')).toContainText('Registrei Almoço');assert.equal((await readState(DB,user.id)).data.records[0].cents,3590);
 await send('Crie uma tarefa para revisar orçamento');await expect(page.locator('.messages')).toContainText('Tarefa cadastrada: Revisar orçamento');assert.equal((await readState(DB,user.id)).data.tasks.length,1);
 const wave=Buffer.from('RIFF1234WAVE-synthetic-audio');await page.locator('#chat-audio').setInputFiles({name:'pedido.wav',mimeType:'audio/wav',buffer:wave});await expect(page.locator('.messages')).toContainText('Registrei Lanche');assert.equal((await readState(DB,user.id)).data.records.length,2);
 await page.locator('#chat-audio').setInputFiles({name:'pedido.wav',mimeType:'audio/wav',buffer:wave});await expect(page.locator('#chat-text')).toBeEnabled();assert.equal((await readState(DB,user.id)).data.records.length,2);
 await send('Crie outra tarefa para revisar orçamento');await expect(page.locator('#chat-text')).toBeEnabled();assert.equal((await readState(DB,user.id)).data.tasks.length,2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.evaluate(()=>window.mentraSave.status().blocked),false);assert.ok(await page.locator('.messages').evaluate(el=>el.clientHeight)>=200);
 await mkdir('qa/ai-actions',{recursive:true});await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});document.querySelector('.messages')?.scrollTo({top:999999,behavior:'instant'});});await page.screenshot({path:'qa/ai-actions/chat-mobile.png',fullPage:true});
 await page.reload();await expect(page.locator('.messages')).toContainText('Registrei Almoço');await expect(page.locator('.messages')).toContainText('Registrei Lanche');assert.equal((await readState(DB,user.id)).data.records.length,2);
 await page.locator('.chat-audio summary').click();await page.getByRole('button',{name:'Gravar áudio',exact:true}).click();await expect(page.getByRole('button',{name:'Parar e enviar áudio',exact:true})).toBeVisible();await page.waitForTimeout(1100);await page.getByRole('button',{name:'Parar e enviar áudio',exact:true}).click();await expect.poll(async()=>(await readState(DB,user.id)).data.records.length).toBe(3);await expect(page.locator('#chat-text')).toBeEnabled();
 await page.setViewportSize({width:1366,height:900});await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});document.querySelector('.messages')?.scrollTo({top:999999,behavior:'instant'});});await page.screenshot({path:'qa/ai-actions/chat-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Navegador: chat, áudio, replay, revisão, recarga e layout móvel aprovados.');
}finally{await browser.close();await new Promise(r=>server.close(r));DB.sql.close();globalThis.fetch=realFetch;}
