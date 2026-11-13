import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationDB} from './fixtures/integration-db.mjs';
import {chat} from '../server/chat.mjs';
import {readState} from '../server/state.mjs';
import {accountState} from '../dist/account-state.mjs';
import {audioMessage} from '../dist/chat-audio.mjs';
import {transcribeAudio} from '../server/audio.mjs';
import worker from '../server/worker.mjs';

const plans=[{id:'plus',monthlyRequests:100}],user={id:'a',name:'Ana'};
const tool=(name,args)=>({type:'function',id:crypto.randomUUID(),function:{name,arguments:JSON.stringify(args)}});
const task=(title='Revisar orçamento')=>tool('create_task',{title,category:'Dinheiro',dueDate:null});
const expense=(overrides={})=>tool('record_transaction',{title:'Almoço',type:'expense',cents:3590,date:'2026-11-06',category:'Alimentação',accountName:null,paymentMethod:'other',...overrides});
const request=(overrides={})=>({requestId:crypto.randomUUID(),revision:0,messages:[{role:'user',content:'Gastei 35,90 no almoço'}],...overrides});
function setup(t){const DB=integrationDB();t.after(()=>DB.sql.close());for(const id of ['a','b']){DB.sql.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run(id,id+'@test.test',id,'fixture','fixture',Date.now());DB.sql.prepare("INSERT INTO subscriptions(user_id,plan,status) VALUES(?,'plus','active')").run(id);}return {DB,DEEPSEEK_API_KEY:'synthetic-only'};}
const provider=calls=>async(_url,options)=>{const p=JSON.parse(options.body);assert.equal(p.tools.length,4);return Response.json({choices:[{finish_reason:'tool_calls',message:{content:'Registrei algo inventado',tool_calls:calls}}]});};

test('DeepSeek registra almoço no banco, sem adivinhar banco/método, e replay não duplica nem consome cota',async t=>{
 const env=setup(t),body=request();let calls=0;const fetcher=async(...args)=>{calls++;return provider([expense(),task()])(...args);};
 const reply=await chat(env,user,body,plans,{fetcher});
 assert.equal(reply.state.revision,1);assert.equal(reply.actions.length,2);assert.match(reply.text,/35,90/);assert.doesNotMatch(reply.text,/inventado/);
 const state=(await readState(env.DB,'a')).data;assert.equal(state.records.length,1);assert.equal(state.records[0].cents,3590);assert.equal(state.accounts[0].name,'Conta não informada');assert.equal(state.records[0].paymentMethod,'other');assert.equal(state.tasks[0].done,false);assert.equal(state.messages.at(-2).role,'user');assert.equal(state.messages.at(-1).role,'assistant');
 const again=await chat(env,user,body,plans,{fetcher});assert.equal(again.reused,true);assert.equal(calls,1);assert.equal(again.state.data.records.length,1);assert.equal(env.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get('a').requests,1);
 assert.equal((await readState(env.DB,'b')).data,null);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE user_id=?').get('a').n,1);
 await assert.rejects(chat(env,user,{...body,messages:[{role:'user',content:'Outro pedido'}]},plans,{fetcher}),{status:409});assert.equal(calls,1);
});

test('mesma chave é isolada por usuário e chamadas paralelas executam uma única vez',async t=>{
 const env=setup(t),body=request();let release;const gate=new Promise(r=>release=r);let entered;const ready=new Promise(r=>entered=r);
 const first=chat(env,user,body,plans,{fetcher:async(...args)=>{entered();await gate;return provider([task()])(...args);}});await ready;
 await assert.rejects(chat(env,user,body,plans,{fetcher:provider([task()])}),{status:409});release();await first;
 const second=await chat(env,{id:'b',name:'B'},body,plans,{fetcher:provider([task('Outra conta')])});assert.equal(second.state.data.tasks[0].title,'Outra conta');assert.equal((await readState(env.DB,'a')).data.tasks[0].title,'Revisar orçamento');
});

test('lote inteiro é recusado em ferramenta, valor, conta ou data inválidos; falha devolve cota e permite nova tentativa',async t=>{
 const env=setup(t);
 for(const bad of [expense({cents:35.9}),expense({accountName:'Banco que não existe'}),expense({date:'2026-02-30'}),expense({userId:'b'}),tool('delete_account',{}),task('x'.repeat(101)),tool('create_event',{title:'Reunião',date:'2026-11-07',time:'25:00',duration:30})]){
  const body=request();await assert.rejects(chat(env,user,body,plans,{fetcher:provider([task(),bad])}),{status:422});assert.equal((await readState(env.DB,'a')).data,null);assert.equal(env.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get('a').requests,0);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM ai_requests').get().n,0);
 }
 const body=request();await assert.rejects(chat(env,user,body,plans,{fetcher:async()=>new Response('',{status:503})}),{status:502});assert.equal((await chat(env,user,body,plans,{fetcher:provider([task()])})).state.data.tasks.length,1);
});

test('resposta parcial ou interrompida do provedor nunca executa ferramentas',async t=>{
 const env=setup(t);
 for(const finish_reason of ['length','aborted','insufficient_system_resource','content_filter']){
  await assert.rejects(chat(env,user,request(),plans,{fetcher:async()=>Response.json({choices:[{finish_reason,message:{tool_calls:[expense()]}}]})}),{status:502});
  assert.equal((await readState(env.DB,'a')).data,null);
 }
});

test('esclarecimento não cadastra; conta ativa explícita e compromisso são validados pelos módulos existentes',async t=>{
 const env=setup(t),body=request();
 const advice=await chat(env,user,body,plans,{fetcher:async()=>Response.json({choices:[{message:{content:'Qual o valor do almoço?'}}]})});assert.equal(advice.actions.length,0);assert.equal((await readState(env.DB,'a')).data,null);
 const state=accountState(null,user);state.accounts.push({id:'bank1',name:'Banco A',kind:'bank',archived:false});state.profile.timeZone='America/Sao_Paulo';env.DB.sql.prepare('INSERT INTO user_states VALUES(?,?,1,?)').run('a',JSON.stringify(state),Date.now());
 const result=await chat(env,user,request({revision:1}),plans,{fetcher:provider([expense({accountName:'Banco A',paymentMethod:'pix'}),tool('create_event',{title:'Reunião',date:'2026-11-07',time:'14:00',duration:30})])});assert.equal(result.state.revision,2);assert.equal(result.state.data.records[0].accountId,'bank1');assert.equal(result.state.data.events[0].timeZone,'America/Sao_Paulo');assert.equal(result.state.data.accounts.length,1);
});

test('alteração concorrente ou assinatura revogada durante inferência impede qualquer gravação da IA',async t=>{
 const env=setup(t);
 await assert.rejects(chat(env,user,request(),plans,{fetcher:async(...args)=>{const state=accountState(null,user);state.tasks.push({id:'manual',title:'Tarefa em outra aba',done:false});env.DB.sql.prepare('INSERT INTO user_states VALUES(?,?,1,?)').run('a',JSON.stringify(state),Date.now());return provider([expense()])(...args);}}),{status:409});
 assert.equal((await readState(env.DB,'a')).data.tasks[0].id,'manual');assert.equal((await readState(env.DB,'a')).data.records.length,0);
 await assert.rejects(chat(env,user,request({revision:1}),plans,{fetcher:async(...args)=>{env.DB.sql.prepare("UPDATE subscriptions SET status='canceled' WHERE user_id='a'").run();return provider([task()])(...args);}}),{status:409});assert.equal((await readState(env.DB,'a')).revision,1);
 assert.equal(env.DB.sql.prepare('SELECT requests FROM ai_usage WHERE user_id=?').get('a').requests,0);
});

test('conta criada pela IA mantém saldo desconhecido, aceita lançamento posterior e rejeita duplicidade',async t=>{
 const env=setup(t),body=request({messages:[{role:'user',content:'Cadastre uma conta Banco A'}]});
 const created=await chat(env,user,body,plans,{fetcher:provider([tool('create_account',{name:'Banco A',kind:'bank'})])});assert.equal(created.state.data.accounts[0].openingBalanceCents,null);
 const paid=await chat(env,user,request({revision:1}),plans,{fetcher:provider([expense({accountName:'Banco A'})])});assert.equal(paid.state.data.records[0].accountId,created.state.data.accounts[0].id);
 await assert.rejects(chat(env,user,request({revision:2}),plans,{fetcher:provider([tool('create_account',{name:'Banco A',kind:'bank'})])}),{status:422});assert.equal((await readState(env.DB,'a')).data.accounts.length,1);
});

test('transcrição do binding simulado entra no DeepSeek e gera lançamento; reenvio de áudio não duplica',async t=>{
 const env=setup(t);env.AI={run:async()=>({text:'Gastei trinta e cinco reais e noventa centavos no almoço'})};
 const bytes=Uint8Array.from(Buffer.from('RIFF1234WAVE-synthetic-audio'));
 const file={size:bytes.length,type:'audio/wav'};
 const spoken=await audioMessage(file,{transcribe:async()=>({...await transcribeAudio(env,'a',bytes,'audio/wav')})});
 const body=request({requestId:spoken.requestId,messages:[{role:'user',content:spoken.text}]});
 const reply=await chat(env,user,body,plans,{fetcher:provider([expense()])});assert.equal(reply.state.data.records[0].cents,3590);
 const replay=await chat(env,user,{...body,revision:1,messages:[{role:'assistant',content:'Conversa anterior diferente'},...body.messages]},plans,{fetcher:async()=>{throw Error('Não deve consultar novamente');}});assert.equal(replay.reused,true);assert.equal(replay.state.data.records.length,1);
 await assert.rejects(audioMessage({size:3*1024*1024},{transcribe:async()=>{throw Error('Não enviar');}}),/2 MB/);
});

test('snapshot grande com emoji é preservado em chunks e replay não retorna uma revisão antiga',async t=>{
 const env=setup(t),state=accountState(null,user);state.documents=[{id:'doc',title:'Arquivo privado',fileData:'a'.repeat(249000)+'💡'.repeat(1000)}];env.DB.sql.prepare('INSERT INTO user_states VALUES(?,?,1,?)').run('a',JSON.stringify(state),Date.now());const body=request({revision:1});
 const reply=await chat(env,user,body,plans,{fetcher:provider([task()])});assert.equal(reply.state.data.documents[0].fileData,state.documents[0].fileData);assert.ok(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM user_state_chunks').get().n>1);
 env.DB.sql.prepare('UPDATE user_states SET revision=revision+1 WHERE user_id=?').run('a');const repeated=await chat(env,user,body,plans,{fetcher:provider([task()])});assert.equal(repeated.state.revision,3);
});

test('rota autenticada recusa dono forjado, assinatura inativa e origem externa antes de executar',async t=>{
 const env=setup(t),origin='https://mentra.test';const token='a'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');env.DB.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash,'a',Date.now()+100000);
 const call=(source=origin)=>worker.fetch(new Request(origin+'/api/chat',{method:'POST',headers:{Origin:source,Cookie:'mentra_session='+token,'Content-Type':'application/json'},body:JSON.stringify({...request(),userId:'b'})}),env);
 assert.equal((await call('https://other.test')).status,403);env.DB.sql.prepare("UPDATE subscriptions SET status='pending' WHERE user_id='a'").run();assert.equal((await call()).status,403);assert.equal((await readState(env.DB,'b')).data,null);
});
