import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
import {integrationDB} from './fixtures/integration-db.mjs';
import {verifySignature,processWhatsAppInbox} from '../server/whatsapp.mjs';
import {processPush,reconcileReminders,validPushEndpoint,retryAfter} from '../server/push.mjs';
import {zonedInstant,reminderPlan} from '../server/reminder-plan.mjs';
import {transcribeAudio} from '../server/audio.mjs';
import {accountState} from '../dist/account-state.mjs';
const origin='https://mentra.test';
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function environment(){const DB=integrationDB(),env={DB,WHATSAPP_APP_SECRET:'synthetic-secret',WHATSAPP_VERIFY_TOKEN:'synthetic-verify',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCESS_TOKEN:'synthetic-media-token',WHATSAPP_GRAPH_VERSION:'v24.0'};async function call(path,{method='GET',data,cookie,raw,headers={}}={}){const r=await worker.fetch(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:raw??(data?JSON.stringify(data):undefined)}),env);let body;try{body=await r.json();}catch{body=null;}return {status:r.status,body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const users=[];for(const name of ['A','B']){const r=await call('register',{method:'POST',data:{name,email:name+'@integration.test',password:'synthetic-integrations-password',plan:'plus'}});assert.equal(r.status,200);users.push({...r.body.user,cookie:r.cookie});}DB.sql.prepare("UPDATE subscriptions SET status='active'").run();
 async function webhook(messages,{phoneId=env.WHATSAPP_PHONE_NUMBER_ID,signature=true}={}){const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:phoneId},messages:messages.map(m=>({timestamp:String(Math.floor(Date.now()/1000)),...m}))}}]}]}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),signed=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');return call('whatsapp/webhook',{method:'POST',raw,headers:{'X-Hub-Signature-256':'sha256='+(signature?signed:'0'.repeat(64)),Origin:'https://meta.example'}});}
 return {DB,env,call,users,webhook};}
test('WhatsApp: handshake, assinatura, vínculo único, isolamento, repetição, ACK seguro e opt-out',async()=>{const c=await environment(),[a,b]=c.users;const verification=await worker.fetch(new Request(origin+'/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=challenge-123'),c.env);assert.equal(verification.status,200);assert.equal(await verification.text(),'challenge-123');const denied=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:false}});assert.equal(denied.status,400);const linked=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:true}});assert.equal(linked.status,200);
 assert.equal((await c.webhook([{id:'link1',from:'5511999999999',type:'text',text:{body:linked.body.command}}],{signature:false})).status,401);await c.webhook([{id:'link1',from:'5511999999999',type:'text',text:{body:linked.body.command}}]);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links').get().n,1);
 const other=await c.call('whatsapp/link',{method:'POST',cookie:b.cookie,data:{consent:true}});await c.webhook([{id:'link2',from:'5511999999999',type:'text',text:{body:other.body.command}}]);assert.equal(c.DB.sql.prepare('SELECT user_id FROM whatsapp_links').get().user_id,a.id);
 const msg={id:'message1',from:'5511999999999',type:'text',text:{body:'Amanhã reunião às 14h'}};await c.webhook([msg]);await c.webhook([msg]);await c.webhook([{...msg,id:'unknown-sender',from:'5511888888888'}]);assert.equal((await c.call('integrations/inbox',{cookie:a.cookie})).body.items.length,1);assert.equal((await c.call('integrations/inbox',{cookie:b.cookie})).body.items.length,0);
 const item=(await c.call('integrations/inbox',{cookie:a.cookie})).body.items[0];assert.equal((await c.call('integrations/inbox/'+item.id+'/ack',{cookie:a.cookie,method:'POST',data:{}})).status,409);const state=accountState(null,a);state.inbox.push({id:'captured1',title:msg.text.body,type:'event',sourceInboxId:item.id});assert.equal((await c.call('state',{cookie:a.cookie,method:'PUT',data:{data:state,revision:0}})).status,200);await c.call('integrations/inbox/'+item.id+'/ack',{cookie:a.cookie,method:'POST',data:{}});assert.equal((await c.call('integrations/inbox',{cookie:a.cookie})).body.items.length,0);
 await c.webhook([{...msg,id:'message2'}]);await c.webhook([{id:'stop1',from:msg.from,type:'text',text:{body:'PARAR'}}]);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links').get().n,0);assert.equal((await c.call('integrations/inbox',{cookie:a.cookie})).body.items.length,0);
});
test('áudio: formato, assinatura ativa, transcrição revisável, reutilização e falha sem sucesso falso',async()=>{const c=await environment(),a=c.users[0];const bytes=new Uint8Array(48);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WAVE'),8);let requests=0;c.env.AI={run:async(model,input)=>{requests++;assert.equal(model,'@cf/openai/whisper');assert.deepEqual(input.audio,Array.from(bytes));return {text:'Amanhã reunião às 14 horas'};}};
 const send=()=>c.call('audio/transcribe',{cookie:a.cookie,method:'POST',raw:bytes,headers:{'Content-Type':'audio/wav'}});const first=await send();assert.equal(first.status,200);assert.equal(first.body.needsReview,true);assert.equal((await send()).body.reused,true);assert.equal(requests,1);assert.equal((await c.call('audio/transcribe',{cookie:a.cookie,method:'POST',raw:new Uint8Array([1,2,3]),headers:{'Content-Type':'audio/wav'}})).status,400);
 bytes[20]=1;c.env.AI.run=async()=>{throw Error('provider failure');};assert.equal((await send()).status,502);c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);assert.equal((await send()).status,403);
});
test('WhatsApp mídia: busca privada, validação de original e transcrição preservam inbox sem sobrescrever estado',async()=>{const c=await environment(),a=c.users[0],link=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:true}});await c.webhook([{id:'link',from:'5511999999999',type:'text',text:{body:link.body.command}}]);await c.webhook([{id:'image1',from:'5511999999999',type:'image',image:{id:'12345',mime_type:'image/png'}}]);const bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url)),prior=globalThis.fetch;let requests=0;globalThis.fetch=async(url,opts)=>{requests++;assert.equal(opts.headers.Authorization,'Bearer synthetic-media-token');if(String(url).startsWith('https://graph.facebook.com/'))return Response.json({url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=1',mime_type:'image/png',file_size:bytes.length});return new Response(bytes);};try{await processWhatsAppInbox(c.env);await processWhatsAppInbox(c.env);const item=(await c.call('integrations/inbox',{cookie:a.cookie})).body.items[0];assert.equal(item.status,'ready');assert.equal(item.payload.document.fileSize,bytes.length);assert.deepEqual(Buffer.from(item.payload.document.fileData,'base64'),bytes);assert.equal(requests,2);assert.equal((await c.call('state',{cookie:a.cookie})).body.data,null);}finally{globalThis.fetch=prior;}});
test('lembretes: DST inexistente não é inventado; ambíguo escolhe primeira ocorrência; silêncio/conclusão/cancelamento suprimem avisos',()=>{assert.equal(zonedInstant('2026-03-08','02:30','America/New_York'),null);assert.equal(zonedInstant('2026-11-01','01:30','America/New_York'),Date.parse('2026-11-01T05:30:00Z'));const now=Date.parse('2026-10-29T10:00:00Z'),state={profile:{timeZone:'America/Sao_Paulo'},tasks:[{id:'t',dueDate:'2026-10-29',done:true}],events:[{id:'e',date:'2026-10-29',time:'23:00',duration:30},{id:'c',date:'2026-10-29',time:'10:00',cancelled:true}]};assert.deepEqual(reminderPlan(state,{quietStart:'22:00',quietEnd:'07:00'},now),[]);assert.equal(validPushEndpoint('http://127.0.0.1/a'),false);assert.equal(validPushEndpoint('https://evil.example/push'),false);});
test('push: criptografia real, fila, aceite sem duplicidade e cancelamento antes de enviar',async()=>{const c=await environment(),a=c.users[0];const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),privateKey=await crypto.subtle.exportKey('jwk',vapid.privateKey),publicKey=await crypto.subtle.exportKey('raw',vapid.publicKey);Object.assign(c.env,{VAPID_PUBLIC_KEY:b64(publicKey),VAPID_PRIVATE_KEY:privateKey.d,VAPID_SUBJECT:'mailto:ops@example.test'});
 const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),clientPublic=new Uint8Array(await crypto.subtle.exportKey('raw',client.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16)),subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test-fixture',keys:{p256dh:b64(clientPublic),auth:b64(auth)}};
 assert.equal((await c.call('push/subscription',{method:'POST',cookie:a.cookie,data:subscription})).status,200);assert.equal((await c.call('push/subscription',{method:'POST',cookie:c.users[1].cookie,data:subscription})).status,409);
 const state=accountState(null,a),now=Date.now(),date=new Date(now+86400000).toISOString().slice(0,10);state.profile.timeZone='UTC';state.tasks=[{id:'task1',title:'Título privado não vai no push',category:'Pessoal',dueDate:date,done:false}];await c.call('state',{method:'PUT',cookie:a.cookie,data:{data:state,revision:0}});assert.equal((await c.call('push/settings',{method:'PUT',cookie:a.cookie,data:{enabled:true,settings:{timeZone:'UTC',taskTime:'09:00',quietStart:'00:00',quietEnd:'00:00'}}})).status,200);const job=c.DB.sql.prepare('SELECT * FROM reminder_jobs').get();assert.ok(job);
 const prior=globalThis.fetch;let sends=0;globalThis.fetch=async(url,payload)=>{sends++;assert.equal(url,subscription.endpoint);assert.equal(payload.headers['content-encoding'],'aes128gcm');assert.match(payload.headers.authorization,/^vapid /);assert.ok(payload.body.byteLength>=4096);assert.ok(!Buffer.from(payload.body).toString().includes('Título privado'));return new Response('',{status:201});};try{await processPush(c.env,{now:job.due_at+1000});await processPush(c.env,{now:job.due_at+2000});assert.equal(sends,1);assert.equal(c.DB.sql.prepare('SELECT status FROM push_deliveries').get().status,'accepted');
 state.tasks[0].dueDate=new Date(job.due_at+86400000).toISOString().slice(0,10);await c.call('state',{method:'PUT',cookie:a.cookie,data:{data:state,revision:1}});const pending=c.DB.sql.prepare("SELECT * FROM reminder_jobs WHERE status='pending' AND id!=?").get(job.id);assert.ok(pending);state.tasks[0].done=true;await c.call('state',{method:'PUT',cookie:a.cookie,data:{data:state,revision:2}});await processPush(c.env,{now:pending.due_at+1000});assert.equal(sends,1);
 }finally{globalThis.fetch=prior;}
});

test('áudio: limite diário atômico impede ultrapassagem com solicitações concorrentes',async()=>{const c=await environment(),a=c.users[0];let calls=0;c.env.AI={run:async()=>{calls++;return {text:'Texto sintético para revisão'};}};const results=await Promise.all(Array.from({length:21},(_,i)=>{const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WAVE'),8);bytes[32]=i;return c.call('audio/transcribe',{cookie:a.cookie,method:'POST',raw:bytes,headers:{'Content-Type':'audio/wav'}});}));assert.ok(results.every(r=>[200,429].includes(r.status)));assert.ok(calls<=20);for(let i=0;i<20;i++){if(results[i].status===200)continue;const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'),0);bytes.set(new TextEncoder().encode('WAVE'),8);bytes[32]=i;const retry=await c.call('audio/transcribe',{cookie:a.cookie,method:'POST',raw:bytes,headers:{'Content-Type':'audio/wav'}});assert.equal(retry.status,200);}assert.equal(calls,20);assert.equal(c.DB.sql.prepare('SELECT requests FROM transcription_usage WHERE user_id=?').get(a.id).requests,20);});
test('WhatsApp: destino de mídia malicioso é recusado antes do envio do token',async()=>{const c=await environment(),a=c.users[0],linked=await c.call('whatsapp/link',{method:'POST',cookie:a.cookie,data:{consent:true}});await c.webhook([{id:'link-safe',from:'5511999999999',type:'text',text:{body:linked.body.command}}]);await c.webhook([{id:'media-safe',from:'5511999999999',type:'document',document:{id:'123',mime_type:'application/pdf',filename:'teste.pdf'}}]);const prior=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;assert.ok(String(url).startsWith('https://graph.facebook.com/'));return Response.json({url:'https://127.0.0.1/private',mime_type:'application/pdf'});};try{await processWhatsAppInbox(c.env);assert.equal(calls,1);const row=c.DB.sql.prepare('SELECT status,error FROM integration_inbox').get();assert.equal(row.status,'pending');assert.match(row.error,/não autorizado/);}finally{globalThis.fetch=prior;}});

test('WhatsApp: repetição de PARAR antigo não desfaz um vínculo novo',async()=>{const c=await environment(),a=c.users[0];async function link(messageId){const r=await c.call('whatsapp/link',{cookie:a.cookie,method:'POST',data:{consent:true}});await c.webhook([{id:messageId,from:'5511999999999',type:'text',text:{body:r.body.command}}]);}await link('link-initial');const stop={id:'stop-original',from:'5511999999999',type:'text',text:{body:'PARAR'}};await c.webhook([stop]);await link('link-new');await c.webhook([stop]);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS total FROM whatsapp_links').get().total,1);});

test('push: 429 respeita retentativa e endpoint 410 é revogado',async()=>{const c=await environment(),a=c.users[0];const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);Object.assign(c.env,{VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',vapid.publicKey)),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',vapid.privateKey)).d,VAPID_SUBJECT:'mailto:ops@example.test'});const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),subscription={endpoint:'https://fcm.googleapis.com/fcm/send/retry-fixture',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',client.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};await c.call('push/subscription',{cookie:a.cookie,method:'POST',data:subscription});const state=accountState(null,a),day=new Date(Date.now()+86400000).toISOString().slice(0,10);state.tasks=[{id:'t',title:'Tarefa QA',category:'Pessoal',dueDate:day,done:false}];await c.call('state',{cookie:a.cookie,method:'PUT',data:{data:state,revision:0}});await c.call('push/settings',{cookie:a.cookie,method:'PUT',data:{enabled:true,settings:{timeZone:'UTC',quietStart:'00:00',quietEnd:'00:00'}}});const job=c.DB.sql.prepare('SELECT * FROM reminder_jobs').get(),prior=globalThis.fetch;let calls=0,status=429;globalThis.fetch=async()=>{calls++;return new Response('',{status});};try{await processPush(c.env,{now:job.due_at+1000});assert.equal(calls,1);assert.equal(c.DB.sql.prepare('SELECT status FROM push_deliveries').get().status,'pending');await processPush(c.env,{now:job.due_at+2000});assert.equal(calls,1);status=410;await processPush(c.env,{now:job.due_at+62000});assert.equal(calls,2);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM push_deliveries').get().n,0);}finally{globalThis.fetch=prior;}});

test('WhatsApp: lote acima do limite não recebe sucesso parcial nem descarta mensagens silenciosamente',async()=>{const c=await environment();const messages=Array.from({length:51},(_,i)=>({id:'batch-'+i,from:'5511999999999',type:'text',text:{body:'Texto '+i}}));const result=await c.webhook(messages);assert.equal(result.status,413);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS total FROM integration_inbox').get().total,0);});

function wav(seed=0){const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);bytes[32]=seed;return bytes;}
async function linkedInbox(c,message){const a=c.users[0],link=await c.call('whatsapp/link',{cookie:a.cookie,method:'POST',data:{consent:true}});await c.webhook([{id:'link-for-fixture',from:'5511999999999',type:'text',text:{body:link.body.command}}]);await c.webhook([{from:'5511999999999',...message}]);return (await c.call('integrations/inbox',{cookie:a.cookie})).body.items[0];}

test('WhatsApp: descarte exige confirmação, isola contas e conserva recibo contra replay',async()=>{
 const c=await environment(),[a,b]=c.users,msg={id:'discard-msg',type:'unsupported'};
 const item=await linkedInbox(c,msg),path='integrations/inbox/'+item.id;
 assert.equal((await c.call(path,{cookie:a.cookie,method:'DELETE',data:{}})).status,400);
 assert.equal((await c.call(path,{cookie:b.cookie,method:'DELETE',data:{confirmed:true}})).status,404);
 assert.equal((await c.call(path,{cookie:a.cookie,method:'DELETE',data:{confirmed:true}})).status,200);
 assert.equal((await c.call(path,{cookie:a.cookie,method:'DELETE',data:{confirmed:true}})).status,200);
 await c.webhook([{from:'5511999999999',...msg}]);
 assert.equal((await c.call('integrations/inbox',{cookie:a.cookie})).body.items.length,0);
 assert.equal(c.DB.sql.prepare('SELECT payload FROM integration_inbox').get().payload,'{}');
});

test('WhatsApp: assinatura vencida entre gerar e usar código não ganha vínculo',async()=>{
 const c=await environment(),a=c.users[0],link=await c.call('whatsapp/link',{cookie:a.cookie,method:'POST',data:{consent:true}});
 c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);
 await c.webhook([{id:'link-expired',from:'5511999999999',type:'text',text:{body:link.body.command}}]);
 assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM whatsapp_links').get().n,0);
});

test('WhatsApp: descarte durante download impede que mídia seja ressuscitada',async()=>{
 const c=await environment(),a=c.users[0],item=await linkedInbox(c,{id:'cancel-download',type:'image',image:{id:'123',mime_type:'image/png'}}),bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url)),prior=globalThis.fetch;
 globalThis.fetch=async url=>{if(String(url).startsWith('https://graph.facebook.com/'))return Response.json({url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/?id=1',mime_type:'image/png'});await c.call('integrations/inbox/'+item.id,{cookie:a.cookie,method:'DELETE',data:{confirmed:true}});return new Response(bytes);};
 try{await processWhatsAppInbox(c.env);assert.deepEqual(c.DB.sql.prepare('SELECT status,payload FROM integration_inbox').get(),Object.assign(Object.create(null),{status:'discarded',payload:'{}'}));}finally{globalThis.fetch=prior;}
});

test('WhatsApp: assinatura desativada durante download não confirma arquivo pronto',async()=>{
 const c=await environment(),a=c.users[0];await linkedInbox(c,{id:'expiry-download',type:'image',image:{id:'123',mime_type:'image/png'}});const bytes=readFileSync(new URL('fixtures/document-scan.png',import.meta.url)),prior=globalThis.fetch;
 globalThis.fetch=async url=>{if(String(url).startsWith('https://graph.facebook.com/'))return Response.json({url:'https://lookaside.fbsbx.com/a',mime_type:'image/png'});c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);return new Response(bytes);};
 try{await processWhatsAppInbox(c.env);const row=c.DB.sql.prepare('SELECT status,payload FROM integration_inbox').get();assert.notEqual(row.status,'ready');assert.equal(JSON.parse(row.payload).document,undefined);}finally{globalThis.fetch=prior;}
});

test('áudio: recusa por cota não consome tentativa nem impede o mesmo arquivo no próximo dia UTC',async()=>{
 const c=await environment(),a=c.users[0],originalNow=Date.now,now=originalNow(),today=new Date(now).toISOString().slice(0,10),tomorrow=new Date(now+86400000).toISOString().slice(0,10);c.env.AI={run:async()=>({text:'Transcrição sintética'})};
 c.DB.sql.prepare('INSERT INTO transcription_usage VALUES(?,?,20)').run(a.id,today);
 await assert.rejects(transcribeAudio(c.env,a.id,wav(21),'audio/wav'),e=>e.status===429);
 assert.equal(c.DB.sql.prepare('SELECT attempts FROM audio_requests').get().attempts,0);
 try{Date.now=()=>now+86400000;assert.equal((await transcribeAudio(c.env,a.id,wav(21),'audio/wav')).text,'Transcrição sintética');assert.equal(c.DB.sql.prepare('SELECT requests FROM transcription_usage WHERE day=?').get(tomorrow).requests,1);}finally{Date.now=originalNow;}
});

test('áudio: retentativa no próximo dia conta nesse dia e o cache não volta a consumir cota',async()=>{
 const c=await environment(),a=c.users[0],originalNow=Date.now,now=originalNow();let calls=0;c.env.AI={run:async()=>{calls++;if(calls===1)throw Error('synthetic failure');return {text:'Texto revisável'};}};
 await assert.rejects(transcribeAudio(c.env,a.id,wav(22),'audio/wav'),e=>e.status===502);
 try{Date.now=()=>now+86400000;await transcribeAudio(c.env,a.id,wav(22),'audio/wav');assert.equal((await transcribeAudio(c.env,a.id,wav(22),'audio/wav')).reused,true);assert.deepEqual(c.DB.sql.prepare('SELECT requests FROM transcription_usage ORDER BY day').all().map(r=>r.requests),[1,1]);assert.equal(calls,2);}finally{Date.now=originalNow;}
});

test('áudio: resposta de processamento antigo não sobrescreve uma nova reserva',async()=>{
 const c=await environment(),a=c.users[0];let finish,started;const ready=new Promise(r=>started=r);c.env.AI={run:()=>{started();return new Promise(r=>finish=r);}};
 const pending=transcribeAudio(c.env,a.id,wav(23),'audio/wav');await ready;
 c.DB.sql.prepare("UPDATE audio_requests SET claim_token='replacement-claim',attempts=attempts+1").run();finish({text:'Resposta antiga'});
 await assert.rejects(pending,e=>e.status===409);const row=c.DB.sql.prepare('SELECT status,text,claim_token FROM audio_requests').get();assert.equal(row.claim_token,'replacement-claim');assert.equal(row.status,'processing');assert.equal(row.text,null);
});

test('áudio: timeout não libera capacidade de inferências ainda em execução nem cobra quem encontra fila ocupada',async()=>{
 const c=await environment(),a=c.users[0],finish=[];c.env.AI={run:()=>new Promise(resolve=>finish.push(resolve))};
 try{const responses=await Promise.allSettled([transcribeAudio(c.env,a.id,wav(24),'audio/wav',{timeoutMs:5}),transcribeAudio(c.env,a.id,wav(25),'audio/wav',{timeoutMs:5})]);assert.ok(responses.every(r=>r.status==='rejected'&&r.reason.status===502));
 await assert.rejects(transcribeAudio(c.env,a.id,wav(26),'audio/wav'),e=>e.status===429);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM audio_requests').get().n,2);assert.equal(c.DB.sql.prepare('SELECT requests FROM transcription_usage').get().requests,2);
 }finally{for(const resolve of finish)resolve({text:'Resposta após timeout'});await new Promise(r=>setImmediate(r));}
 c.env.AI.run=async()=>({text:'Terceiro áudio'});assert.equal((await transcribeAudio(c.env,a.id,wav(26),'audio/wav')).text,'Terceiro áudio');
 assert.equal(c.DB.sql.prepare("SELECT COUNT(*) AS n FROM audio_requests WHERE text='Resposta após timeout'").get().n,0);
});

async function pushFixture({taskTime='09:00',quietStart='00:00',quietEnd='00:00'}={}){
 const c=await environment(),a=c.users[0],vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 Object.assign(c.env,{VAPID_PUBLIC_KEY:b64(await crypto.subtle.exportKey('raw',vapid.publicKey)),VAPID_PRIVATE_KEY:(await crypto.subtle.exportKey('jwk',vapid.privateKey)).d,VAPID_SUBJECT:'mailto:ops@example.test'});
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/edge-fixture',keys:{p256dh:b64(await crypto.subtle.exportKey('raw',client.publicKey)),auth:b64(crypto.getRandomValues(new Uint8Array(16)))}};
 await c.call('push/subscription',{cookie:a.cookie,method:'POST',data:subscription});const state=accountState(null,a),day=new Date(Date.now()+86400000).toISOString().slice(0,10);state.tasks=[{id:'edge-task',title:'Privado',category:'Pessoal',dueDate:day,done:false}];
 await c.call('state',{cookie:a.cookie,method:'PUT',data:{data:state,revision:0}});await c.call('push/settings',{cookie:a.cookie,method:'PUT',data:{enabled:true,settings:{timeZone:'UTC',taskTime,quietStart,quietEnd}}});
 return {...c,subscription,job:c.DB.sql.prepare('SELECT * FROM reminder_jobs').get(),client};
}

test('push: retentativa atravessando silêncio é suprimida sem envio tardio',async()=>{
 const c=await pushFixture({taskTime:'21:59',quietStart:'22:00',quietEnd:'07:00'}),prior=globalThis.fetch;let sends=0;
 globalThis.fetch=async()=>{sends++;return new Response('',{status:429,headers:{'Retry-After':'120'}});};
 try{await processPush(c.env,{now:c.job.due_at+1000});assert.equal(sends,1);await processPush(c.env,{now:c.job.due_at+122000});assert.equal(sends,1);assert.equal(c.DB.sql.prepare('SELECT status FROM push_deliveries').get().status,'cancelled');}finally{globalThis.fetch=prior;}
});

test('push: Retry-After é respeitado além do backoff e aceita segundos ou data HTTP',async()=>{
 const c=await pushFixture(),prior=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return new Response('',{status:sends===1?503:201,headers:{'Retry-After':'600'}});};
 try{await processPush(c.env,{now:c.job.due_at+1000});await processPush(c.env,{now:c.job.due_at+62000});assert.equal(sends,1);await processPush(c.env,{now:c.job.due_at+602000});assert.equal(sends,2);assert.equal(c.DB.sql.prepare('SELECT status FROM push_deliveries').get().status,'accepted');}finally{globalThis.fetch=prior;}
 const now=Date.parse('2026-10-29T12:00:00Z');assert.equal(retryAfter('120',now),now+120000);assert.equal(retryAfter('Thu, 29 Oct 2026 12:10:00 GMT',now),now+600000);assert.equal(retryAfter('invalid',now),now);
});

test('push: concorrência mantém dez dispositivos e uma conta por endpoint',async()=>{
 const c=await pushFixture(),a=c.users[0],b=c.users[1];c.DB.sql.prepare('DELETE FROM push_subscriptions').run();
 const replies=await Promise.all(Array.from({length:11},(_,i)=>c.call('push/subscription',{cookie:a.cookie,method:'POST',data:{...c.subscription,endpoint:c.subscription.endpoint+i}})));
 assert.equal(replies.filter(r=>r.status===200).length,10);assert.equal(replies.filter(r=>r.status===429).length,1);
 assert.equal((await c.call('push/subscription',{cookie:a.cookie,method:'POST',data:{...c.subscription,endpoint:c.subscription.endpoint+'0'}})).status,200);
 c.DB.sql.prepare('DELETE FROM push_subscriptions').run();const race=await Promise.all([a,b].map(u=>c.call('push/subscription',{cookie:u.cookie,method:'POST',data:c.subscription})));
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(c.DB.sql.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,1);
});

test('push: receptor sintético consegue autenticar e descriptografar o payload RFC 8291',async()=>{
 const c=await pushFixture(),prior=globalThis.fetch;let decoded;
 const bytes=s=>new TextEncoder().encode(s),join=(...parts)=>Buffer.concat(parts.map(p=>Buffer.from(p)));
 const hkdf=async(ikm,salt,info,length)=>crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),length*8);
 globalThis.fetch=async(url,payload)=>{
  const body=new Uint8Array(payload.body),salt=body.slice(0,16),keyLength=body[20],sender=body.slice(21,21+keyLength),receiver=await crypto.subtle.exportKey('raw',c.client.publicKey);
  const peer=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=await crypto.subtle.deriveBits({name:'ECDH',public:peer},c.client.privateKey,256);
  const ikm=await hkdf(shared,Buffer.from(c.subscription.keys.auth,'base64url'),join(bytes('WebPush: info\0'),receiver,sender),32);
  const cek=await hkdf(ikm,salt,bytes('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,bytes('Content-Encoding: nonce\0'),12);
  const clear=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),body.slice(21+keyLength)));
  let end=clear.length-1;while(clear[end]===0)end--;assert.equal(clear[end],2);decoded=JSON.parse(new TextDecoder().decode(clear.slice(0,end)));
  return new Response('',{status:201});
 };
 try{await processPush(c.env,{now:c.job.due_at+1000});assert.deepEqual(decoded,{title:'Mentra Life',body:'Você tem um lembrete na sua conta.',url:'/#/vida/tarefas',tag:c.job.id});assert.ok(!JSON.stringify(decoded).includes('Privado'));}finally{globalThis.fetch=prior;}
});

test('push: API informa elegibilidade e contagem; revogação continua disponível após vencimento',async()=>{
 const c=await pushFixture(),a=c.users[0];let current=(await c.call('push',{cookie:a.cookie})).body;assert.equal(current.eligible,true);assert.equal(current.devices,1);
 c.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id=?").run(a.id);current=(await c.call('push',{cookie:a.cookie})).body;assert.equal(current.eligible,false);
 assert.equal((await c.call('push/subscription',{cookie:a.cookie,method:'POST',data:c.subscription})).status,403);
 const removed=await c.call('push/subscription',{cookie:a.cookie,method:'DELETE',data:{endpoint:c.subscription.endpoint}});assert.equal(removed.status,200);assert.equal(removed.body.devices,0);
});

test('saúde operacional informa schema incompleto sem expor conteúdo privado ou erro SQL',async()=>{const c=await environment();const ready=await c.call('health');assert.equal(ready.status,200);assert.equal(ready.body.checks.schema,'integrations-v2');c.DB.sql.exec('DROP TABLE audio_daily_claims');const pending=await c.call('health');assert.equal(pending.status,503);assert.equal(pending.body.checks.schema,'pending_migrations');assert.ok(!JSON.stringify(pending.body).includes('integration.test'));assert.equal((await c.call('health',{method:'POST',data:{}})).status,405);});
