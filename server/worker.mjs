import {nativePushRoutes,processNativePush} from './native-push.mjs';
import {limitedBytes} from './integration-utils.mjs';
import {chat} from './chat.mjs';
import {hostedRequest} from './hosting.mjs';
import {calendarRoutes} from './calendar.mjs';
import {documentShareRoutes,shareRevocationStatement} from './document-shares.mjs';
import {whatsappWebhook,whatsappRoutes,processWhatsAppInbox,whatsappConfigured} from './whatsapp.mjs';
import {audioRoute} from './audio.mjs';
import {pushRoutes,reconcileReminders,processPush} from './push.mjs';
import {readState} from './state.mjs';
import {loadPlans,validateCatalog} from './catalog.mjs';
import {picpayCheckout,picpayConfigured,picpayWebhook} from './picpay.mjs';
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));

async function password(value,salt){const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const FEEDBACK_KINDS=['sugestao','problema','elogio'],FEEDBACK_STATUS=['novo','lido','resolvido'];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
async function body(req){let raw;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(await limitedBytes(req,6000000));}catch(error){if(error.status===413)fail('Conteúdo muito grande.',413);fail('JSON inválido.');}try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))fail('JSON inválido.');return value;}catch{fail('JSON inválido.');}}
const cookie=(token,req,age=604800)=>`mentra_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
async function audit(db,user,action){await db.prepare('INSERT INTO audit_log VALUES (?,?,?,?)').bind(crypto.randomUUID(),user,action,Date.now()).run();}
async function session(req,db){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)mentra_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return db.prepare('SELECT u.id,u.email,u.name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),Date.now()).first();}
async function rate(db,key,limit){const bucket=`${key}:${Math.floor(Date.now()/900000)}`;const row=await db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,Date.now()+900000).first();if(row.count>limit)fail('Muitas tentativas. Tente novamente em 15 minutos.',429);}
export async function handle(req,env){
 req=await hostedRequest(req,env);
 const url=new URL(req.url),path=url.pathname,db=env.DB;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!db)return json({error:'Banco de dados não configurado.'},503);
 if(path==='/api/health'){
  if(req.method!=='GET')return json({error:'Método inválido.'},405);
  try{
   const tables=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name));
   const required=['users','sessions','subscriptions','user_states','user_state_chunks','ai_usage','product_settings','audit_log','rate_limits','whatsapp_links','whatsapp_link_codes','whatsapp_control_receipts','integration_inbox','audio_requests','audio_daily_claims','transcription_usage','reminder_settings','push_subscriptions','reminder_jobs','push_deliveries','document_shares','calendar_oauth','calendar_connections','native_push_devices','native_push_deliveries','ai_requests','feedback',...(picpayConfigured(env)?['picpay_orders']:[])];
   const columns=(await db.prepare('PRAGMA table_info(audio_requests)').all()).results;
   if(required.some(name=>!tables.has(name))||!columns.some(c=>c.name==='claim_token'))return json({status:'not_ready',checks:{schema:'pending_migrations'}},503);
   if(await db.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return json({status:'not_ready',checks:{database:'ok',recovery:'quarantine'}},503);
   return json({status:'ok',checks:{database:'ok',schema:'integrations-v2'}});
  }catch{return json({status:'not_ready',checks:{database:'unavailable'}},503);}
 }
 if(await db.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return json({error:'Sistema em recuperação. Tente novamente mais tarde.'},503,{'Retry-After':'300'});
 if(path==='/api/whatsapp/webhook')return whatsappWebhook(req,env);
 if(path==='/api/picpay/webhook')return picpayWebhook(req,env);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==url.origin) return json({error:'Origem inválida.'},403);
 const catalog=await loadPlans(db),PLANS=catalog.plans;
 if(path==='/api/plans'&&req.method==='GET')return json({plans:PLANS,paymentsConfigured:picpayConfigured(env)});
 if(path==='/api/recover'&&req.method==='POST'){
  await rate(db,`recovery:${req.headers.get('CF-Connecting-IP')||'local'}`,10);const b=await body(req),email=String(b.email||'').trim().toLowerCase();
  if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||typeof b.recoveryCode!=='string'||!/^[a-f0-9]{64}$/.test(b.recoveryCode))fail('Dados de recuperação inválidos.');
  const record=await db.prepare('SELECT id,recovery_hash FROM users WHERE email=?').bind(email).first();if(!record?.recovery_hash||record.recovery_hash!==await hash(b.recoveryCode))fail('E-mail ou código de recuperação incorreto.',403);
  const salt=random(),digest=await password(b.password,salt),recoveryCode=random();
  const changed=await db.prepare('UPDATE users SET salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id').bind(salt,digest,await hash(recoveryCode),record.id,record.recovery_hash).first();if(!changed)fail('Código já utilizado.',409);
  await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM native_push_devices WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM calendar_connections WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM calendar_oauth WHERE user_id=?').bind(record.id),db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?').bind(Date.now(),record.id)]);await audit(db,record.id,'account_recovered');return json({ok:true,recoveryCode});
 }
 if(['/api/register','/api/login'].includes(path)&&req.method==='POST'){
  await rate(db,`auth:${req.headers.get('CF-Connecting-IP')||'local'}`,30);
  const b=await body(req),email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||pw.length<12||pw.length>128)fail('Informe e-mail válido e senha entre 12 e 128 caracteres.');
  let user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first(),recoveryCode;
  if(path==='/api/register'){
   const name=String(b.name||'').trim().slice(0,80);if(!name||!PLANS.some(p=>p.id===b.plan))fail('Informe seu nome e escolha um plano.');
   if(user)fail('Não foi possível cadastrar este e-mail.',409);
   const id=crypto.randomUUID(),salt=random(),digest=await password(pw,salt);recoveryCode=random();
   await db.batch([db.prepare('INSERT INTO users(id,email,name,password_hash,salt,created_at,recovery_hash) VALUES(?,?,?,?,?,?,?)').bind(id,email,name,digest,salt,Date.now(),await hash(recoveryCode)),db.prepare('INSERT INTO subscriptions(user_id,plan) VALUES(?,?)').bind(id,b.plan)]);
   user={id,email,name,role:'user'};await audit(db,id,'register');
  }else{const digest=await password(pw,user?.salt||'unknown-account-salt');if(!user||digest!==user.password_hash)fail('E-mail ou senha incorretos.',401);}
  const token=random();await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),user.id,Date.now()+604800000).run();
  return json({user:{id:user.id,email:user.email,name:user.name,role:user.role},...(recoveryCode?{recoveryCode}:{})},200,{'Set-Cookie':cookie(token,req)});
 }
 const user=await session(req,db);if(!user)fail('Entre na sua conta para continuar.',401);
 if(path==='/api/feedback'&&req.method==='POST'){
  const b=await body(req),kind=b.kind,page=typeof b.page==='string'?b.page.trim().slice(0,80):'',message=typeof b.message==='string'?b.message.trim():'';
  if(!FEEDBACK_KINDS.includes(kind)||!page||message.length<3||message.length>2000)fail('Escreva entre 3 e 2.000 caracteres e escolha o tipo do relato.');
  await rate(db,'feedback:'+user.id,10);
  const id=crypto.randomUUID();await db.prepare('INSERT INTO feedback(id,user_id,kind,page,message,created_at) VALUES(?,?,?,?,?,?)').bind(id,user.id,kind,page,message,Date.now()).run();
  return json({ok:true,id},201);
 }
 if(path==='/api/feedback'&&req.method==='GET')return json({items:(await db.prepare('SELECT id,kind,page,message,status,created_at FROM feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results});
 if(path==='/api/admin/feedback'&&req.method==='GET'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const status=url.searchParams.get('status')||'';if(status&&!FEEDBACK_STATUS.includes(status))fail('Filtro inválido.');
  const rows=(await db.prepare(`SELECT f.id,f.kind,f.page,f.message,f.status,f.created_at,u.name,u.email FROM feedback f JOIN users u ON u.id=f.user_id ${status?'WHERE f.status=?':''} ORDER BY f.created_at DESC LIMIT 200`).bind(...(status?[status]:[])).all()).results;
  return json({items:rows});
 }
 if(path==='/api/admin/feedback'&&req.method==='POST'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const b=await body(req);if(typeof b.id!=='string'||!FEEDBACK_STATUS.includes(b.status))fail('Relato inválido.');
  const updated=await db.prepare('UPDATE feedback SET status=? WHERE id=? RETURNING id').bind(b.status,b.id).first();if(!updated)fail('Relato não encontrado.',404);
  await audit(db,user.id,'feedback_status');return json({ok:true});
 }
 if(path==='/api/picpay/checkout'&&req.method==='POST'){
  await rate(db,`picpay:${user.id}`,10);
  const b=await body(req);
  return json(await picpayCheckout(env,user,PLANS.find(p=>p.id===b.plan),url.origin));
 }
 const integration=await calendarRoutes(req,env,user)||await documentShareRoutes(req,env,user)||await audioRoute(req,env,user)||await whatsappRoutes(req,env,user)||await pushRoutes(req,env,user)||await nativePushRoutes(req,env,user);if(integration)return integration;
 if(path==='/api/me'&&req.method==='GET'){const subscription=await db.prepare('SELECT plan,status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();if(subscription?.status==='active'&&subscription.current_period_end&&subscription.current_period_end<Date.now())subscription.status='expired';const month=new Date().toISOString().slice(0,7),usage=await db.prepare('SELECT requests FROM ai_usage WHERE user_id=? AND month=?').bind(user.id,month).first();return json({user,subscription,plans:PLANS,paymentsConfigured:picpayConfigured(env),usage:{month,requests:usage?.requests||0}});}
 if(path==='/api/account/password'&&req.method==='POST'){
  await rate(db,`password:${user.id}`,10);const b=await body(req),record=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||typeof b.currentPassword!=='string')fail('A nova senha deve ter entre 12 e 128 caracteres.');
  if(await password(b.currentPassword,record.salt)!==record.password_hash)fail('Senha atual incorreta.',403);
  const salt=random(),digest=await password(b.password,salt);await db.batch([db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,digest,user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM native_push_devices WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM calendar_connections WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM calendar_oauth WHERE user_id=?').bind(user.id),db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?').bind(Date.now(),user.id)]);await audit(db,user.id,'password_changed');return json({ok:true},200,{'Set-Cookie':cookie('',req,0)});
 }
 if(path==='/api/account'&&req.method==='DELETE'){
  const b=await body(req),record=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();if(typeof b.password!=='string'||await password(b.password,record.salt)!==record.password_hash)fail('Senha incorreta.',403);
  if((await db.prepare('SELECT status FROM subscriptions WHERE user_id=?').bind(user.id).first())?.status==='active')fail('Cancele sua assinatura com o atendimento antes de excluir a conta.',409);
  if(await db.prepare('SELECT event_id FROM payment_events WHERE user_id=? LIMIT 1').bind(user.id).first())fail('Esta conta possui registros de pagamento. A exclusão depende da política de retenção do atendimento.',409);
  const deleted=picpayConfigured(env)
   ? await db.prepare('DELETE FROM users WHERE id=? AND NOT EXISTS(SELECT 1 FROM picpay_orders WHERE user_id=? AND expires_at>?)').bind(user.id,user.id,Date.now()).run()
   : await db.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
  if(!deleted.meta.changes)fail('Aguarde a expiração do link de pagamento antes de excluir a conta.',409);
  return json({ok:true},200,{'Set-Cookie':cookie('',req,0)});
 }
 if(path==='/api/account/export'&&req.method==='GET'){const state=await readState(db,user.id);const subscription=await db.prepare('SELECT plan,status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();return json({format:'mentra-life-account-v1',ownerId:user.id,exportedAt:new Date().toISOString(),baseRevision:state.revision,user:{name:user.name,email:user.email},subscription,usage:(await db.prepare('SELECT month,requests FROM ai_usage WHERE user_id=? ORDER BY month').bind(user.id).all()).results,activity:(await db.prepare('SELECT action,created_at FROM audit_log WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,integrations:{calendar:await db.prepare('SELECT id,connected_at FROM calendar_connections WHERE user_id=?').bind(user.id).first(),whatsapp:await db.prepare('SELECT phone,linked_at FROM whatsapp_links WHERE user_id=?').bind(user.id).first(),inbox:(await db.prepare('SELECT id,source,kind,payload,status,error,created_at FROM integration_inbox WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,audio:(await db.prepare('SELECT audio_hash,status,text,created_at FROM audio_requests WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,nativePushDevices:(await db.prepare('SELECT id,platform,created_at FROM native_push_devices WHERE user_id=?').bind(user.id).all()).results,pushSettings:await db.prepare('SELECT enabled,settings FROM reminder_settings WHERE user_id=?').bind(user.id).first(),pushDevices:(await db.prepare('SELECT id,endpoint,created_at FROM push_subscriptions WHERE user_id=?').bind(user.id).all()).results},feedback:(await db.prepare('SELECT id,kind,page,message,status,created_at FROM feedback WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,documentShares:{outgoing:(await db.prepare('SELECT id,document_id,recipient_id,title,filename,created_at,expires_at,revoked_at FROM document_shares WHERE owner_id=?').bind(user.id).all()).results,incoming:(await db.prepare('SELECT id,owner_id,title,filename,created_at,expires_at,revoked_at FROM document_shares WHERE recipient_id=?').bind(user.id).all()).results},data:state.data});}
 if(path==='/api/logout'&&req.method==='POST'){const token=req.headers.get('cookie')?.match(/mentra_session=([a-f0-9]{64})/)?.[1];if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',req,0)});}
 if(path==='/api/state'&&req.method==='GET')return json(await readState(db,user.id));
 if(path==='/api/state'&&req.method==='PUT'){
  const b=await body(req);if(!b.data||typeof b.data!=='object'||!Number.isInteger(b.revision)||!['tasks','events','records','documents','inbox','messages'].every(k=>Array.isArray(b.data[k]))||!b.data.profile)fail('Estado inválido.');
  const data=JSON.stringify(b.data);if(enc.encode(data).length>5000000)fail('Limite de armazenamento atingido.',413);
  if(b.operationId!==undefined&&(typeof b.operationId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.operationId)))fail('Identificador de gravação inválido.');
  const checksum=await hash(data),current=await db.prepare('SELECT data,revision FROM user_states WHERE user_id=?').bind(user.id).first();
  if(current&&b.operationId){const previous=JSON.parse(current.data);if(previous.writeId===b.operationId){if(previous.checksum!==checksum)fail('Este identificador já foi usado para outro conteúdo.',409);try{await reconcileReminders(env,user.id,{data:b.data,revision:current.revision});}catch{console.error('reminder_reconcile_deferred');}return json({revision:current.revision});}}
  if(b.revision<0||(!current&&b.revision!==0))fail('Dados atualizados em outra aba. Resolva o conflito antes de continuar.',409);
  const writeId=b.operationId||crypto.randomUUID(),manifest=JSON.stringify({__mentraChunks:true,writeId,checksum}),chunks=[];for(let i=0;i<data.length;){let end=Math.min(i+250000,data.length);if(end<data.length&&data.charCodeAt(end-1)>=0xD800&&data.charCodeAt(end-1)<=0xDBFF)end--;chunks.push(data.slice(i,end));i=end;}
  const guard='EXISTS(SELECT 1 FROM user_states WHERE user_id=? AND data=?)';
  const statements=[db.prepare('INSERT INTO user_states VALUES(?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,revision=user_states.revision+1,updated_at=excluded.updated_at WHERE user_states.revision=? RETURNING revision').bind(user.id,manifest,Date.now(),b.revision),db.prepare(`DELETE FROM user_state_chunks WHERE user_id=? AND ${guard}`).bind(user.id,user.id,manifest),...chunks.map((chunk,slot)=>db.prepare(`INSERT INTO user_state_chunks(user_id,slot,data) SELECT ?,?,? WHERE ${guard}`).bind(user.id,slot,chunk,user.id,manifest))];
  statements.push(await shareRevocationStatement(db,user.id,b.data,manifest));
  const result=await db.batch(statements),row=result[0].results?.[0];if(!row){if(b.operationId){const latest=await db.prepare('SELECT data,revision FROM user_states WHERE user_id=?').bind(user.id).first(),meta=latest?JSON.parse(latest.data):null;if(meta?.writeId===b.operationId&&meta.checksum===checksum)return json({revision:latest.revision});}fail('Dados atualizados em outra aba. Resolva o conflito antes de continuar.',409);}try{await reconcileReminders(env,user.id,{data:b.data,revision:row.revision});}catch{console.error('reminder_reconcile_deferred');}return json({revision:row.revision});
 }
 if(path==='/api/subscription'&&req.method==='POST'){const b=await body(req);if(!PLANS.some(p=>p.id===b.plan))fail('Plano inválido.');const changed=await db.prepare("UPDATE subscriptions SET plan=?,status='pending',current_period_end=NULL WHERE user_id=? AND (status!='active' OR (current_period_end IS NOT NULL AND current_period_end<=?)) RETURNING plan").bind(b.plan,user.id,Date.now()).first();if(!changed)fail('Alteração de plano ativo depende do gateway de pagamento.',409);return json({ok:true,status:'pending'});}
 if(path==='/api/chat'&&req.method==='POST')return json(await chat(env,user,await body(req),PLANS));
 if(path==='/api/admin/users'&&req.method==='GET'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const page=Number(url.searchParams.get('page')||1),q=(url.searchParams.get('q')||'').trim(),status=url.searchParams.get('status')||'';if(!Number.isInteger(page)||page<1||page>1000000||q.length>200||(status&&!['active','pending','canceled','expired'].includes(status)))fail('Filtro inválido.');
  const now=Date.now(),month=new Date().toISOString().slice(0,7),byStatus={active:["s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>?)",[now]],expired:["s.status='active' AND s.current_period_end IS NOT NULL AND s.current_period_end<=?",[now]],pending:['s.status=?',['pending']],canceled:['s.status=?',['canceled']]}[status]||['1=1',[]];
  const filter=`(instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0) AND ${byStatus[0]}`,args=[q,q,...byStatus[1]],total=(await db.prepare(`SELECT COUNT(*) AS total FROM users u JOIN subscriptions s ON s.user_id=u.id WHERE ${filter}`).bind(...args).first()).total;
  const users=(await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.created_at,s.plan,s.status,s.current_period_end,COALESCE(a.requests,0) AS requests FROM users u JOIN subscriptions s ON s.user_id=u.id LEFT JOIN ai_usage a ON a.user_id=u.id AND a.month=? WHERE ${filter} ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?`).bind(month,...args,(page-1)*50).all()).results;
  return json({users,total,page,pageSize:50});
 }
 if(path==='/api/admin/plans'&&req.method==='GET'){if(user.role!=='admin')fail('Acesso restrito.',403);return json(catalog);}
 if(path==='/api/admin/plans'&&req.method==='PUT'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const b=await body(req);let plans;try{plans=validateCatalog(b.plans);}catch(error){fail(error.message);}
  if(!Number.isInteger(b.revision)||b.revision<0)fail('Revisão inválida.');if(b.revision!==catalog.revision)fail('Os planos foram alterados em outra sessão. Atualize o painel antes de editar.',409);
  const nextRevision=Math.max(Date.now(),b.revision+1),result=await db.prepare("INSERT INTO product_settings(key,value,updated_at) VALUES('plans',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE product_settings.updated_at=? RETURNING updated_at").bind(JSON.stringify(plans),nextRevision,b.revision).first();
  if(!result)fail('Os planos foram alterados em outra sessão. Atualize o painel antes de editar.',409);await audit(db,user.id,'plan_catalog_updated');return json({plans,revision:nextRevision});
 }
 if(path==='/api/admin/overview'&&req.method==='GET'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const counts=await db.prepare("SELECT COUNT(*) AS users,SUM(CASE WHEN s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>?) THEN 1 ELSE 0 END) AS active FROM users u JOIN subscriptions s ON s.user_id=u.id").bind(Date.now()).first();const month=new Date().toISOString().slice(0,7),usage=await db.prepare('SELECT COALESCE(SUM(requests),0) AS requests FROM ai_usage WHERE month=?').bind(month).first();
  const now=Date.now(),pipeline=await db.prepare("SELECT SUM(CASE WHEN s.status='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN s.status='canceled' THEN 1 ELSE 0 END) AS canceled,SUM(CASE WHEN s.status='active' AND s.current_period_end IS NOT NULL AND s.current_period_end<=? THEN 1 ELSE 0 END) AS expired,SUM(CASE WHEN s.status='active' AND s.current_period_end>? AND s.current_period_end<=? THEN 1 ELSE 0 END) AS expiringSoon,SUM(CASE WHEN u.created_at>=? THEN 1 ELSE 0 END) AS newThisWeek FROM users u JOIN subscriptions s ON s.user_id=u.id").bind(now,now,now+7*86400000,now-7*86400000).first(),feedback=await db.prepare("SELECT COUNT(*) AS total FROM feedback WHERE status='novo'").first(),plans=(await db.prepare("SELECT s.plan,COUNT(*) AS total FROM subscriptions s WHERE s.status='active' AND (s.current_period_end IS NULL OR s.current_period_end>?) GROUP BY s.plan").bind(now).all()).results;
  return json({counts:{users:counts.users,active:counts.active||0,monthlyRequests:usage.requests},insights:{pending:pipeline.pending||0,canceled:pipeline.canceled||0,expired:pipeline.expired||0,expiringSoon:pipeline.expiringSoon||0,newThisWeek:pipeline.newThisWeek||0,feedbackNew:feedback.total||0,activeByPlan:Object.fromEntries(plans.map(p=>[p.plan,p.total]))},integrations:{database:true,deepseek:Boolean(env.DEEPSEEK_API_KEY),payments:picpayConfigured(env),whatsapp:whatsappConfigured(env),audio:Boolean(env.AI),push:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)},month});
 }
 if(path==='/api/admin/activity'&&req.method==='GET'){
  if(user.role!=='admin')fail('Acesso restrito.',403);
  const rows=(await db.prepare("SELECT a.id,a.action,a.created_at,u.name,u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.action IN ('plan_catalog_updated','feedback_status') OR a.action LIKE 'subscription:%' ORDER BY a.created_at DESC LIMIT 30").all()).results;
  const ids=[...new Set(rows.map(r=>r.action.startsWith('subscription:')?r.action.split(':')[1]:null).filter(Boolean))],targets=ids.length?Object.fromEntries((await db.prepare(`SELECT id,name,email FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results.map(t=>[t.id,t])):{};
  return json({items:rows.map(r=>{const [kind,target,plan,status]=r.action.split(':');return {id:r.id,kind:kind==='subscription'?'subscription':r.action,createdAt:r.created_at,actor:r.email?{name:r.name,email:r.email}:null,...(kind==='subscription'?{plan,status,target:targets[target]?{name:targets[target].name,email:targets[target].email}:null}:{})};})});
 }
 if(path==='/api/admin/subscription'&&req.method==='POST'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const b=await body(req);if(typeof b.userId!=='string'||!PLANS.some(p=>p.id===b.plan)||!['active','pending','canceled'].includes(b.status)||!Number.isInteger(b.days)||b.days<1||b.days>366)fail('Assinatura inválida.');
  const result=await db.prepare('UPDATE subscriptions SET plan=?,status=?,current_period_end=? WHERE user_id=?').bind(b.plan,b.status,b.status==='active'?Date.now()+b.days*86400000:null,b.userId).run();if(!result.meta.changes)fail('Usuário não encontrado.',404);await audit(db,user.id,`subscription:${b.userId}:${b.plan}:${b.status}`);return json({ok:true});
 }
 fail('Rota não encontrada.',404);
}
export default {async fetch(req,env){let response;try{response=await handle(req,env);}catch(error){response=json({error:error.status?error.message:'Erro interno. Tente novamente.'},error.status||500);}const result=new Response(response.body,response);result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy',new URL(req.url).pathname.startsWith('/api/calendar')||(new URL(req.url).pathname.startsWith('/api/document-shares')||new URL(req.url).pathname.startsWith('/calendar-callback'))?'no-referrer':'same-origin');if(new URL(req.url).pathname.startsWith('/api/calendar')||new URL(req.url).pathname.startsWith('/api/document-shares')){result.headers.set('Cache-Control','no-store, private');result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');}result.headers.set('X-Frame-Options','DENY');result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'");return result;},async scheduled(event,env){if(await env.DB.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return;const results=await Promise.allSettled([processWhatsAppInbox(env),processPush(env),processNativePush(env)]);for(let i=0;i<results.length;i++)if(results[i].status==='rejected')console.error(['whatsapp_job_failed','push_job_failed','native_push_job_failed'][i]);const now=Date.now(),cutoff=now-30*86400000;await env.DB.batch([env.DB.prepare('DELETE FROM calendar_oauth WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM whatsapp_link_codes WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM whatsapp_control_receipts WHERE created_at<?').bind(cutoff),env.DB.prepare('DELETE FROM audio_requests WHERE created_at<?').bind(cutoff),env.DB.prepare('DELETE FROM audio_daily_claims WHERE day<?').bind(new Date(cutoff).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM transcription_usage WHERE day<?').bind(new Date(cutoff).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM integration_inbox WHERE updated_at<?').bind(cutoff),env.DB.prepare('DELETE FROM reminder_jobs WHERE due_at<?').bind(cutoff),env.DB.prepare('DELETE FROM document_shares WHERE expires_at<? OR revoked_at<?').bind(cutoff,cutoff),env.DB.prepare('DELETE FROM ai_requests WHERE created_at<? AND lease_until<?').bind(cutoff,now)]);}};
