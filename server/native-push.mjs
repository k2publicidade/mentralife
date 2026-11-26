import {readState} from './state.mjs';
import {activeAccount,digest,integrationBody,problem,response} from './integration-utils.mjs';
import {reminderPlan,isQuietTime} from './reminder-plan.mjs';
import {reconcileReminders,retryAfter} from './push.mjs';
import {nativePushConfigured,sendNativePush} from './native-push-provider.mjs';

export function validNativeToken(platform,token){return typeof token==='string'&&(platform==='ios'?/^[a-fA-F0-9]{64}$/.test(token):platform==='android'&&/^[a-zA-Z0-9_:\-]{32,4096}$/.test(token));}
export async function nativePushRoutes(req,env,user){
 const path=new URL(req.url).pathname;if(path!=='/api/push/native-device')return null;
 if(!['POST','DELETE'].includes(req.method))return response({error:'Método inválido.'},405);
 const body=await integrationBody(req);if(!validNativeToken(body.platform,body.token))problem('Dispositivo inválido.');
 const token=body.platform==='ios'?body.token.toLowerCase():body.token,id=await digest(body.platform+':'+token);
 const deviceCount=async()=>(await env.DB.prepare('SELECT COUNT(*) AS total FROM native_push_devices WHERE user_id=?').bind(user.id).first()).total;
 if(req.method==='DELETE'){await env.DB.prepare('DELETE FROM native_push_devices WHERE id=? AND user_id=?').bind(id,user.id).run();return response({ok:true,devices:await deviceCount()});}
 if(!nativePushConfigured(env,body.platform)||!await activeAccount(env.DB,user.id))problem('Avisos nativos exigem configuração e assinatura ativa.',403);
 // One token has one owner. Never silently move a device across accounts.
 if(body.previousToken!==undefined&&!validNativeToken(body.platform,body.previousToken))problem('Dispositivo anterior inválido.');
 const previous=body.platform==='ios'?body.previousToken?.toLowerCase():body.previousToken;
 const [registration]=await env.DB.batch([
  env.DB.prepare(`INSERT INTO native_push_devices(id,user_id,platform,token,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM native_push_devices WHERE user_id=?)<10 OR EXISTS(SELECT 1 FROM native_push_devices WHERE id=? AND user_id=?) OR EXISTS(SELECT 1 FROM native_push_devices WHERE user_id=? AND platform=? AND token=?) ON CONFLICT(id) DO UPDATE SET token=excluded.token WHERE native_push_devices.user_id=excluded.user_id RETURNING id`).bind(id,user.id,body.platform,token,Date.now(),user.id,id,user.id,user.id,body.platform,previous||''),
  env.DB.prepare('DELETE FROM native_push_devices WHERE user_id=? AND platform=? AND token=? AND id<>? AND EXISTS(SELECT 1 FROM native_push_devices WHERE id=? AND user_id=?)').bind(user.id,body.platform,previous||'',id,id,user.id)
 ]);
 const saved=registration.results?.[0];
 if(!saved){const owner=await env.DB.prepare('SELECT user_id FROM native_push_devices WHERE id=?').bind(id).first();if(owner&&owner.user_id!==user.id)problem('Dispositivo vinculado a outra conta. Desative os avisos nela antes de trocar.',409);problem('Limite de dez aparelhos nativos por conta atingido.',429);}
 return response({ok:true,id,devices:await deviceCount()});
}

export async function processNativePush(env,{now=Date.now(),limit=30,deliver=sendNativePush}={}){
 if(!nativePushConfigured(env))return {accepted:0};
 const started=Date.now(),db=env.DB;
 const accounts=(await db.prepare('SELECT user_id FROM reminder_settings WHERE enabled=1 AND last_reconciled<? ORDER BY last_reconciled LIMIT 20').bind(now-3600000).all()).results;
 for(const row of accounts)try{await reconcileReminders(env,row.user_id);}catch{console.error('native_reminder_reconcile_failed');}
 await db.prepare("UPDATE reminder_jobs SET status='expired' WHERE status='pending' AND due_at<?").bind(now-3600000).run();
 await db.prepare("INSERT OR IGNORE INTO native_push_deliveries(job_id,device_id) SELECT j.id,d.id FROM reminder_jobs j JOIN native_push_devices d ON d.user_id=j.user_id JOIN reminder_settings r ON r.user_id=j.user_id WHERE j.status='pending' AND r.enabled=1 AND j.due_at<=? AND j.due_at>=?").bind(now,now-3600000).run();
 const rows=(await db.prepare("SELECT x.*,j.user_id,j.url,d.platform,d.token FROM native_push_deliveries x JOIN reminder_jobs j ON j.id=x.job_id JOIN native_push_devices d ON d.id=x.device_id JOIN reminder_settings r ON r.user_id=j.user_id WHERE j.status='pending' AND r.enabled=1 AND j.due_at<=? AND j.due_at>=? AND x.attempts<5 AND ((x.status='pending' AND x.next_attempt<=?) OR (x.status='sending' AND x.lease_until<?)) ORDER BY j.due_at LIMIT ?").bind(now,now-3600000,now,now,limit).all()).results;
 let accepted=0;
 for(const row of rows){
  if(!nativePushConfigured(env,row.platform))continue;
  const lease=Date.now()+60000;
  const lock=await db.prepare("UPDATE native_push_deliveries SET status='sending',attempts=attempts+1,lease_until=? WHERE job_id=? AND device_id=? AND attempts<5 AND ((status='pending' AND next_attempt<=?) OR (status='sending' AND lease_until<?)) RETURNING job_id").bind(lease,row.job_id,row.device_id,now,now).first();if(!lock)continue;
  const finish=async(status,lastStatus=0,nextAttempt=0)=>db.prepare('UPDATE native_push_deliveries SET status=?,last_status=?,next_attempt=?,lease_until=0 WHERE job_id=? AND device_id=? AND lease_until=?').bind(status,lastStatus,nextAttempt,row.job_id,row.device_id,lease).run();
  try{
   const settings=await db.prepare('SELECT enabled,settings FROM reminder_settings WHERE user_id=?').bind(row.user_id).first();
   const device=await db.prepare('SELECT id FROM native_push_devices WHERE id=? AND user_id=? AND token=?').bind(row.device_id,row.user_id,row.token).first();
   if(!settings?.enabled||!device||!await activeAccount(db,row.user_id)){await finish('cancelled');continue;}
   const preferences=JSON.parse(settings.settings),current=await readState(db,row.user_id);let live=false;
   for(const candidate of reminderPlan(current.data,preferences,now))if(await digest(row.user_id+':'+candidate.key)===row.job_id){live=true;break;}
   if(!live||isQuietTime(preferences,now+Math.max(0,Date.now()-started))){await finish('cancelled');continue;}
   const {response:sent,unregistered}=await deliver(env,row,{url:row.url,tag:row.job_id});
   if(unregistered){await db.prepare('DELETE FROM native_push_devices WHERE id=? AND user_id=?').bind(row.device_id,row.user_id).run();continue;}
   if(sent.ok){accepted++;await finish('accepted',sent.status);}
   else{const retry=(sent.status===429||sent.status>=500)&&row.attempts+1<5;await finish(retry?'pending':'failed',sent.status,Math.max(now+60000*2**row.attempts,retryAfter(sent.headers.get('retry-after'),now)));}
  }catch{await finish(row.attempts+1<5?'pending':'failed',0,now+60000*2**row.attempts);}
 }
 return {accepted};
}
