// Real spoken WAV -> Workers AI -> DeepSeek -> ephemeral local D1. No production database binding.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {getPlatformProxy,unstable_splitSqlQuery as splitSqlQuery} from 'wrangler';
import {parseSecrets} from './readiness.mjs';
import {audioMessage} from '../dist/chat-audio.mjs';
import {readState} from '../server/state.mjs';
import worker from '../server/worker.mjs';

const folder=resolve('qa/ai-actions'),audioPath=resolve(process.argv[2]||folder+'/spoken-lunch.wav');
await mkdir(folder,{recursive:true});
await writeFile(folder+'/live-audio-result.json',JSON.stringify({passed:false,status:'running',startedAt:new Date().toISOString()}));
const bytes=await readFile(audioPath);assert.ok(bytes.length>44&&bytes.length<=2*1024*1024,'Use um WAV falado de até 2 MB com a frase do almoço de R$ 35,90.');
const key=process.env.DEEPSEEK_API_KEY||parseSecrets(await readFile('.dev.vars','utf8')).DEEPSEEK_API_KEY;
assert.ok(key,'Configure DEEPSEEK_API_KEY para o teste opcional.');
const configPath=folder+'/wrangler.audio.json';
await writeFile(configPath,JSON.stringify({name:'mentra-audio-verification',compatibility_date:'2026-10-28',ai:{binding:'AI',remote:true},d1_databases:[{binding:'DB',database_name:'mentra-audio-verification',database_id:'11111111-1111-4111-8111-111111111111',remote:false}]}));
let proxy;const user={id:'synthetic-audio',name:'Teste de áudio'},origin='https://mentra.synthetic.test',token='a'.repeat(64);
try{
 proxy=await getPlatformProxy({configPath,persist:false,remoteBindings:true,envFiles:[]});
 const DB=proxy.env.DB;
 for(const filename of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
  const statements=splitSqlQuery(await readFile('migrations/'+filename,'utf8'));
  await DB.batch(statements.map(sql=>DB.prepare(sql)));
 }
 let inferenceCalls=0;
 const env={DB,DEEPSEEK_API_KEY:key,AI:{run(...args){inferenceCalls++;return proxy.env.AI.run(...args);}}};
 for(const id of [user.id,'synthetic-other']){await DB.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').bind(id,id+'@local.invalid',id,'fixture','fixture',Date.now()).run();await DB.prepare("INSERT INTO subscriptions(user_id,plan,status) VALUES(?,'plus','active')").bind(id).run();}
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');await DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(hash,user.id,Date.now()+600000).run();
 const call=async(path,body,type='application/json')=>{const r=await worker.fetch(new Request(origin+'/api/'+path,{method:'POST',headers:{Origin:origin,Cookie:'mentra_session='+token,'Content-Type':type},body:type==='application/json'?JSON.stringify(body):body}),env);const result=await r.json();if(r.status!==200)throw Object.assign(Error('Falha em '+path),{status:r.status});return result;};
 const spoken=await audioMessage({size:bytes.length,type:'audio/wav'},{transcribe:()=>call('audio/transcribe',bytes,'audio/wav')});
 const payload={requestId:spoken.requestId,revision:0,messages:[{role:'user',content:spoken.text}]};
 const reply=await call('chat',payload);assert.equal(reply.actions.length,1);assert.equal(reply.actions[0].type,'record_transaction');
 const saved=await readState(DB,user.id),record=saved.data.records[0];
 await writeFile(folder+'/live-audio-attempt.json',JSON.stringify({transcription:spoken.text,record,actions:reply.actions},null,2));
 assert.equal(saved.data.records.length,1);assert.equal(record.cents,3590);assert.equal(record.type,'expense');
 assert.match(record.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),/almoc/,'A descrição deve reconhecer o almoço informado por voz.');
 await audioMessage({size:bytes.length,type:'audio/wav'},{transcribe:()=>call('audio/transcribe',bytes,'audio/wav')});
 const replay=await call('chat',payload);assert.equal(replay.reused,true);assert.equal(inferenceCalls,1);assert.equal((await readState(DB,user.id)).data.records.length,1);assert.equal((await readState(DB,'synthetic-other')).data,null);
 assert.equal((await DB.prepare('SELECT requests FROM ai_usage WHERE user_id=?').bind(user.id).first()).requests,1);
 const report={passed:true,verifiedAt:new Date().toISOString(),audioBytes:bytes.length,transcription:spoken.text,record:{title:record.title,category:record.category,cents:record.cents,date:record.date,type:record.type},recordCount:1,workersAI:true,deepseek:true,localD1:true,replay:true,isolated:true,productionWrites:false};
 await writeFile(folder+'/live-audio-result.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:true,audioBytes:bytes.length,cents:3590,recordCount:1,replay:true,isolated:true,productionWrites:false}));
}catch(error){const code=error.status||error.code||error.name;await writeFile(folder+'/live-audio-result.json',JSON.stringify({passed:false,verifiedAt:new Date().toISOString(),errorCode:code}));console.error('Verificação de áudio real não concluída:',code);if(error.code==='ERR_ASSERTION')console.error(error.message);process.exitCode=1;}finally{await proxy?.dispose();}
