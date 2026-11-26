// Explicit release verification: synthetic accounts only, removed in finally.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {chromium,expect} from '@playwright/test';

if(!process.argv.includes('--allow-production'))throw Error('Este teste exige autorização de publicação e --allow-production.');
const config=JSON.parse(await readFile('wrangler.production.jsonc','utf8')),origin=config.vars.PUBLIC_ORIGIN;
assert.equal(origin,'https://mentralife.vercel.app');
const folder=resolve('qa/ai-actions'),privateFolder=resolve('.mentra-private/release-ai-actions');
await mkdir(folder,{recursive:true});await mkdir(privateFolder,{recursive:true});
const reportPath=folder+'/production-result.json',startedAt=new Date().toISOString(),accounts=[],execute=promisify(execFile),stamp=Date.now();
await writeFile(reportPath,JSON.stringify({passed:false,status:'running',startedAt,origin}));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
async function sql(command){const {stdout}=await execute(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--remote','--config','wrangler.production.jsonc','--command',command,'--json'],{cwd:process.cwd(),env:{...process.env,WRANGLER_LOG_PATH:privateFolder+'/verification-wrangler.log'},windowsHide:true,maxBuffer:2*1024*1024});return JSON.parse(stdout);}
const browser=await chromium.launch(),errors=[];let report,error,stage='register';
try{
 const a=await browser.newContext({viewport:{width:390,height:844}}),b=await browser.newContext();
 async function register(context,label){
  const email=`qa-ai-release-${stamp}-${label}@example.invalid`,password=randomBytes(24).toString('base64url');
  const response=await context.request.post(origin+'/api/register',{headers:{Origin:origin},data:{name:'Verificação IA '+label,email,password,plan:'plus'}});assert.equal(response.status(),200,'Cadastro sintético');
  const {user}=await response.json();assert.match(user.id,/^[a-f0-9-]{36}$/i);accounts.push({id:user.id,email});
  await writeFile(privateFolder+'/temporary-accounts.json',JSON.stringify({origin,accounts}));
  const result=await sql(`UPDATE subscriptions SET status='active',current_period_end=${Date.now()+3600000} WHERE user_id IN(SELECT id FROM users WHERE id=${quote(user.id)} AND email=${quote(email)})`);assert.equal(result[0].meta.changes,1,'Ativação limitada à conta sintética');
  return user;
 }
 const userA=await register(a,'a');await register(b,'b');stage='browser_audio';
 const page=await a.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#/mentra');await expect(page.locator('#chat-form')).toBeVisible();
 const chatResponse=()=>page.waitForResponse(r=>r.url()===origin+'/api/chat'&&r.request().method()==='POST',{timeout:150000});
 const audio=await readFile('qa/ai-actions/spoken-lunch.wav'),waitingAudio=chatResponse();
 await page.locator('#chat-audio').setInputFiles({name:'despesa-ficticia.wav',mimeType:'audio/wav',buffer:audio});
 const audioResponse=await waitingAudio;assert.equal(audioResponse.status(),200,'Pedido por áudio online');const reply=await audioResponse.json(),payload=JSON.parse(audioResponse.request().postData());
 await writeFile(folder+'/production-audio-attempt.json',JSON.stringify({verifiedAt:new Date().toISOString(),reply},null,2));
 assert.equal(reply.actions.length,1);assert.equal(reply.actions[0].type,'record_transaction');assert.equal(reply.state.data.records.length,1);assert.equal(reply.state.data.records[0].cents,3590);
 const record=reply.state.data.records[0];assert.equal(record.type,'expense');assert.match(record.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),/almoc/);
 await expect(page.locator('#chat-text')).toBeEnabled();
 stage='replay';const before=await (await a.request.get(origin+'/api/me')).json();
 const transcription=await a.request.post(origin+'/api/audio/transcribe',{headers:{Origin:origin,'Content-Type':'audio/wav'},data:audio});assert.equal(transcription.status(),200);assert.equal((await transcription.json()).reused,true);
 const duplicate=await a.request.post(origin+'/api/chat',{headers:{Origin:origin},data:payload});assert.equal(duplicate.status(),200);const duplicateBody=await duplicate.json();assert.equal(duplicateBody.reused,true);assert.equal(duplicateBody.state.data.records.length,1);
 const after=await (await a.request.get(origin+'/api/me')).json();assert.equal(after.usage.requests,before.usage.requests);
 stage='task';const waitingTask=chatResponse();await page.locator('#chat-text').fill('Cadastre uma tarefa: revisar meu orçamento amanhã.');await page.locator('#chat-form button').click();const taskResponse=await waitingTask;assert.equal(taskResponse.status(),200);const taskReply=await taskResponse.json();assert.equal(taskReply.state.data.tasks.length,1);assert.ok(taskReply.actions.some(action=>action.type==='create_task'));
 stage='isolation';const bState=await (await b.request.get(origin+'/api/state')).json();assert.equal(bState.data,null);
 const forged=await b.request.post(origin+'/api/chat',{headers:{Origin:origin},data:{requestId:crypto.randomUUID(),revision:bState.revision,userId:userA.id,messages:[{role:'user',content:'Gastei R$ 12,34 no café hoje, registre.'}]}});assert.equal(forged.status(),200);const forgedBody=await forged.json();assert.equal(forgedBody.state.data.records.length,1);assert.equal(forgedBody.state.data.records[0].cents,1234);
 const aState=await (await a.request.get(origin+'/api/state')).json();assert.equal(aState.data.records.length,1);assert.equal(aState.data.records[0].cents,3590);assert.equal(aState.data.tasks.length,1);
 stage='reload';await page.reload();await expect(page.locator('.messages')).toContainText('35,90');await expect(page.locator('.messages')).toContainText('Tarefa cadastrada');await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});document.querySelector('.messages')?.scrollTo({top:999999,behavior:'instant'});});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.evaluate(()=>window.mentraSave.status().blocked),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:folder+'/production-chat-mobile.png',fullPage:true});
 report={passed:true,verifiedAt:new Date().toISOString(),origin,checks:{spokenAudio:true,workersAI:true,deepseek:true,remoteD1:true,expenseCents:3590,expenseTitle:record.title,category:record.category,task:true,reload:true,replay:true,quotaUnchangedOnReplay:true,accountIsolation:true,mobile:true},syntheticAccounts:accounts.length};
}catch(caught){error=caught;report={passed:false,verifiedAt:new Date().toISOString(),origin,stage,error:caught.message,location:String(caught.stack).split('\n').find(line=>line.includes('test-ai-actions-production.mjs:'))};}
finally{
 try{
  if(accounts.length){const condition=accounts.map(account=>`(id=${quote(account.id)} AND email=${quote(account.email)})`).join(' OR ');await sql('DELETE FROM users WHERE '+condition);const rows=await sql('SELECT COUNT(*) AS remaining FROM users WHERE '+condition);assert.equal(rows[0].results[0].remaining,0);}
  report={...report,temporaryAccountsRemoved:true};await writeFile(privateFolder+'/temporary-accounts.json',JSON.stringify({origin,accounts:[],cleanedAt:new Date().toISOString()}));
 }catch(cleanupError){report={...report,passed:false,temporaryAccountsRemoved:false,cleanupError:cleanupError.message};error=error||cleanupError;}
 await browser.close();await writeFile(reportPath,JSON.stringify(report,null,2));
}
if(error){console.error('Homologação online não concluída:',error.message);process.exitCode=1;}else console.log(JSON.stringify(report));
