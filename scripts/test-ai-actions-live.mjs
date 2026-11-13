// Opt-in provider check. Synthetic account and ephemeral SQLite only; no production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSecrets} from './readiness.mjs';
import {integrationDB} from '../tests/fixtures/integration-db.mjs';
import {chat} from '../server/chat.mjs';
import {readState} from '../server/state.mjs';
const key=process.env.DEEPSEEK_API_KEY||parseSecrets(readFileSync('.dev.vars','utf8')).DEEPSEEK_API_KEY;
if(!key)throw Error('Configure DEEPSEEK_API_KEY para este teste opcional.');
const DB=integrationDB(),user={id:'synthetic-live',name:'Teste sintético'},env={DB,DEEPSEEK_API_KEY:key},plans=[{id:'plus',monthlyRequests:20}];
DB.sql.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run(user.id,'synthetic@local.invalid',user.name,'fixture','fixture',Date.now());
DB.sql.prepare("INSERT INTO subscriptions(user_id,plan,status) VALUES(?,'plus','active')").run(user.id);
try{
 let revision=0;
 for(const [question,type] of [['Gastei R$ 35,90 no almoço hoje. Registre na gestão financeira.','record_transaction'],['Cadastre uma tarefa: revisar meu orçamento amanhã.','create_task'],['Tenho um compromisso amanhã às 14h por 30 minutos chamado Reunião de planejamento. Coloque na minha agenda.','create_event'],['Gastei no jantar, pode registrar?','clarification']]){
  const reply=await chat(env,user,{requestId:crypto.randomUUID(),revision,messages:[{role:'user',content:question}]},plans);
  if(type==='clarification'){assert.equal(reply.actions.length,0);assert.ok(reply.text.length>0);}else{assert.ok(reply.actions.some(a=>a.type===type));revision=reply.state.revision;}
  console.log(JSON.stringify({scenario:type,passed:true,actions:reply.actions.length}));
 }
 const saved=await readState(DB,user.id);assert.equal(saved.data.records[0].cents,3590);assert.equal(saved.data.records.length,1);assert.equal(saved.data.tasks.length,1);assert.equal(saved.data.events.length,1);
 console.log('DeepSeek real: 4 cenários sintéticos aprovados; banco temporário.');
}catch(error){console.error('Falha na homologação sintética:',error.status||error.name);process.exitCode=1;}finally{DB.sql.close();}
