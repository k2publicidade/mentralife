import {hostedRequest} from './hosting.mjs';
import {calendarRoutes} from './calendar.mjs';
import {documentShareRoutes,shareRevocationStatement} from './document-shares.mjs';
import {whatsappWebhook,whatsappRoutes,processWhatsAppInbox,whatsappConfigured} from './whatsapp.mjs';
import {audioRoute} from './audio.mjs';
import {pushRoutes,reconcileReminders,processPush} from './push.mjs';
import {readState} from './state.mjs';
import {loadPlans,validateCatalog} from './catalog.mjs';
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));

async function password(value,salt){const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
async function body(req){if(Number(req.headers.get('content-length'))>6000000)fail('Conteúdo muito grande.',413);const raw=await req.text();if(raw.length>6000000)fail('Conteúdo muito grande.',413);try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))fail('JSON inválido.');return value;}catch{fail('JSON inválido.');}}
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
   const required=['users','sessions','subscriptions','user_states','user_state_chunks','ai_usage','product_settings','audit_log','rate_limits','whatsapp_links','whatsapp_link_codes','whatsapp_control_receipts','integration_inbox','audio_requests','audio_daily_claims','transcription_usage','reminder_settings','push_subscriptions','reminder_jobs','push_deliveries','document_shares','calendar_oauth','calendar_connections'];
   const columns=(await db.prepare('PRAGMA table_info(audio_requests)').all()).results;
   if(required.some(name=>!tables.has(name))||!columns.some(c=>c.name==='claim_token'))return json({status:'not_ready',checks:{schema:'pending_migrations'}},503);
   if(await db.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return json({status:'not_ready',checks:{database:'ok',recovery:'quarantine'}},503);
   return json({status:'ok',checks:{database:'ok',schema:'integrations-v2'}});
  }catch{return json({status:'not_ready',checks:{database:'unavailable'}},503);}
 }
 if(await db.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return json({error:'Sistema em recuperação. Tente novamente mais tarde.'},503,{'Retry-After':'300'});
 if(path==='/api/whatsapp/webhook')return whatsappWebhook(req,env);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==url.origin) return json({error:'Origem inválida.'},403);
 const catalog=await loadPlans(db),PLANS=catalog.plans;
 if(path==='/api/plans'&&req.method==='GET')return json({plans:PLANS,paymentsConfigured:false});
 if(path==='/api/recover'&&req.method==='POST'){
  await rate(db,`recovery:${req.headers.get('CF-Connecting-IP')||'local'}`,10);const b=await body(req),email=String(b.email||'').trim().toLowerCase();
  if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||typeof b.recoveryCode!=='string'||!/^[a-f0-9]{64}$/.test(b.recoveryCode))fail('Dados de recuperação inválidos.');
  const record=await db.prepare('SELECT id,recovery_hash FROM users WHERE email=?').bind(email).first();if(!record?.recovery_hash||record.recovery_hash!==await hash(b.recoveryCode))fail('E-mail ou código de recuperação incorreto.',403);
  const salt=random(),digest=await password(b.password,salt),recoveryCode=random();
  const changed=await db.prepare('UPDATE users SET salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id').bind(salt,digest,await hash(recoveryCode),record.id,record.recovery_hash).first();if(!changed)fail('Código já utilizado.',409);
  await db.batch([db.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM calendar_connections WHERE user_id=?').bind(record.id),db.prepare('DELETE FROM calendar_oauth WHERE user_id=?').bind(record.id),db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?').bind(Date.now(),record.id)]);await audit(db,record.id,'account_recovered');return json({ok:true,recoveryCode});
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
 const integration=await calendarRoutes(req,env,user)||await documentShareRoutes(req,env,user)||await audioRoute(req,env,user)||await whatsappRoutes(req,env,user)||await pushRoutes(req,env,user);if(integration)return integration;
 if(path==='/api/me'&&req.method==='GET'){const subscription=await db.prepare('SELECT plan,status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();if(subscription?.status==='active'&&subscription.current_period_end&&subscription.current_period_end<Date.now())subscription.status='expired';const month=new Date().toISOString().slice(0,7),usage=await db.prepare('SELECT requests FROM ai_usage WHERE user_id=? AND month=?').bind(user.id,month).first();return json({user,subscription,plans:PLANS,usage:{month,requests:usage?.requests||0}});}
 if(path==='/api/account/password'&&req.method==='POST'){
  await rate(db,`password:${user.id}`,10);const b=await body(req),record=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
  if(typeof b.password!=='string'||b.password.length<12||b.password.length>128||typeof b.currentPassword!=='string')fail('A nova senha deve ter entre 12 e 128 caracteres.');
  if(await password(b.currentPassword,record.salt)!==record.password_hash)fail('Senha atual incorreta.',403);
  const salt=random(),digest=await password(b.password,salt);await db.batch([db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,digest,user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM calendar_connections WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM calendar_oauth WHERE user_id=?').bind(user.id),db.prepare('UPDATE document_shares SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?').bind(Date.now(),user.id)]);await audit(db,user.id,'password_changed');return json({ok:true},200,{'Set-Cookie':cookie('',req,0)});
 }
 if(path==='/api/account'&&req.method==='DELETE'){
  const b=await body(req),record=await db.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();if(typeof b.password!=='string'||await password(b.password,record.salt)!==record.password_hash)fail('Senha incorreta.',403);
  if((await db.prepare('SELECT status FROM subscriptions WHERE user_id=?').bind(user.id).first())?.status==='active')fail('Cancele sua assinatura com o atendimento antes de excluir a conta.',409);
  if(await db.prepare('SELECT event_id FROM payment_events WHERE user_id=? LIMIT 1').bind(user.id).first())fail('Esta conta possui registros de pagamento. A exclusão depende da política de retenção do atendimento.',409);
  await db.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();return json({ok:true},200,{'Set-Cookie':cookie('',req,0)});
 }
 if(path==='/api/account/export'&&req.method==='GET'){const state=await readState(db,user.id);const subscription=await db.prepare('SELECT plan,status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();return json({format:'mentra-life-account-v1',ownerId:user.id,exportedAt:new Date().toISOString(),baseRevision:state.revision,user:{name:user.name,email:user.email},subscription,usage:(await db.prepare('SELECT month,requests FROM ai_usage WHERE user_id=? ORDER BY month').bind(user.id).all()).results,activity:(await db.prepare('SELECT action,created_at FROM audit_log WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,integrations:{calendar:await db.prepare('SELECT id,connected_at FROM calendar_connections WHERE user_id=?').bind(user.id).first(),whatsapp:await db.prepare('SELECT phone,linked_at FROM whatsapp_links WHERE user_id=?').bind(user.id).first(),inbox:(await db.prepare('SELECT id,source,kind,payload,status,error,created_at FROM integration_inbox WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,audio:(await db.prepare('SELECT audio_hash,status,text,created_at FROM audio_requests WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results,pushSettings:await db.prepare('SELECT enabled,settings FROM reminder_settings WHERE user_id=?').bind(user.id).first(),pushDevices:(await db.prepare('SELECT id,endpoint,created_at FROM push_subscriptions WHERE user_id=?').bind(user.id).all()).results},documentShares:{outgoing:(await db.prepare('SELECT id,document_id,recipient_id,title,filename,created_at,expires_at,revoked_at FROM document_shares WHERE owner_id=?').bind(user.id).all()).results,incoming:(await db.prepare('SELECT id,owner_id,title,filename,created_at,expires_at,revoked_at FROM document_shares WHERE recipient_id=?').bind(user.id).all()).results},data:state.data});}
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
 if(path==='/api/chat'&&req.method==='POST'){
  const sub=await db.prepare('SELECT * FROM subscriptions WHERE user_id=?').bind(user.id).first();if(sub?.status!=='active'||(sub.current_period_end&&sub.current_period_end<Date.now()))fail('Sua assinatura precisa estar ativa para usar a IA.',403);
  if(!env.DEEPSEEK_API_KEY)fail('A conexão com a Mentra IA ainda está sendo configurada.',503);
  const b=await body(req);if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>30||b.messages.some(m=>!m||typeof m!=='object'||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>4000))fail('Conversa inválida.');
  const personal=await readState(db,user.id),profile=personal.data?.profile,memory=profile?.memoryEnabled===true&&typeof profile.aiMemory==='string'?profile.aiMemory.slice(0,2000):'';
  const month=new Date().toISOString().slice(0,7),limit=PLANS.find(p=>p.id===sub.plan).monthlyRequests;
  const usage=await db.prepare('INSERT INTO ai_usage VALUES(?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET requests=requests+1 WHERE requests<? RETURNING requests').bind(user.id,month,limit).first();if(!usage)fail('Limite mensal de mensagens atingido.',429);
  try{const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.DEEPSEEK_MODEL||'deepseek-flash',messages:[{role:'system',content:'Você é Mentra, assistente de organização pessoal. Responda em português brasileiro. Ajude com tarefas, finanças pessoais e projetos. Não afirme executar ações. Não forneça diagnósticos ou prescrições. Não invente informações do usuário. Quando data, horário, valor, destinatário ou contexto estiverem ausentes ou ambíguos, peça esclarecimento. Sugestões não são confirmações de execução.'},...(memory?[{role:'user',content:'Notas pessoais que escolhi compartilhar como contexto (não representam ações concluídas): '+memory}]:[]),...b.messages],max_tokens:1800}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('upstream');const result=await response.json(),text=result.choices?.[0]?.message?.content;if(typeof text!=='string'||!text)throw Error('empty');return json({text,usage:{month,requests:usage.requests}});}catch{await db.prepare('UPDATE ai_usage SET requests=MAX(0,requests-1) WHERE user_id=? AND month=?').bind(user.id,month).run();fail('Não foi possível consultar a IA. Tente novamente.',502);}
 }
 if(path==='/api/admin/users'&&req.method==='GET'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const page=Number(url.searchParams.get('page')||1),q=(url.searchParams.get('q')||'').trim();if(!Number.isInteger(page)||page<1||page>1000000||q.length>200)fail('Filtro inválido.');
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%',filter="(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')",total=(await db.prepare(`SELECT COUNT(*) AS total FROM users u WHERE ${filter}`).bind(pattern,pattern).first()).total;
  const users=(await db.prepare(`SELECT u.id,u.name,u.email,u.created_at,s.plan,s.status,s.current_period_end FROM users u JOIN subscriptions s ON s.user_id=u.id WHERE ${filter} ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?`).bind(pattern,pattern,(page-1)*50).all()).results;
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
  return json({counts:{users:counts.users,active:counts.active||0,monthlyRequests:usage.requests},integrations:{database:true,deepseek:Boolean(env.DEEPSEEK_API_KEY),payments:false,whatsapp:whatsappConfigured(env),audio:Boolean(env.AI),push:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT)},month});
 }
 if(path==='/api/admin/subscription'&&req.method==='POST'){
  if(user.role!=='admin')fail('Acesso restrito.',403);const b=await body(req);if(typeof b.userId!=='string'||!PLANS.some(p=>p.id===b.plan)||!['active','pending','canceled'].includes(b.status)||!Number.isInteger(b.days)||b.days<1||b.days>366)fail('Assinatura inválida.');
  const result=await db.prepare('UPDATE subscriptions SET plan=?,status=?,current_period_end=? WHERE user_id=?').bind(b.plan,b.status,b.status==='active'?Date.now()+b.days*86400000:null,b.userId).run();if(!result.meta.changes)fail('Usuário não encontrado.',404);await audit(db,user.id,`subscription:${b.userId}:${b.plan}:${b.status}`);return json({ok:true});
 }
 fail('Rota não encontrada.',404);
}
export default {async fetch(req,env){let response;try{response=await handle(req,env);}catch(error){response=json({error:error.status?error.message:'Erro interno. Tente novamente.'},error.status||500);}const result=new Response(response.body,response);result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy',new URL(req.url).pathname.startsWith('/api/calendar')||new URL(req.url).pathname.startsWith('/api/document-shares')?'no-referrer':'same-origin');if(new URL(req.url).pathname.startsWith('/api/calendar')||new URL(req.url).pathname.startsWith('/api/document-shares')){result.headers.set('Cache-Control','no-store, private');result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');}result.headers.set('X-Frame-Options','DENY');result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'");return result;},async scheduled(event,env){if(await env.DB.prepare("SELECT key FROM product_settings WHERE key='restore_quarantine'").first())return;const results=await Promise.allSettled([processWhatsAppInbox(env),processPush(env)]);for(let i=0;i<results.length;i++)if(results[i].status==='rejected')console.error(i===0?'whatsapp_job_failed':'push_job_failed');const now=Date.now(),cutoff=now-30*86400000;await env.DB.batch([env.DB.prepare('DELETE FROM calendar_oauth WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM whatsapp_link_codes WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM whatsapp_control_receipts WHERE created_at<?').bind(cutoff),env.DB.prepare('DELETE FROM audio_requests WHERE created_at<?').bind(cutoff),env.DB.prepare('DELETE FROM audio_daily_claims WHERE day<?').bind(new Date(cutoff).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM transcription_usage WHERE day<?').bind(new Date(cutoff).toISOString().slice(0,10)),env.DB.prepare('DELETE FROM integration_inbox WHERE updated_at<?').bind(cutoff),env.DB.prepare('DELETE FROM reminder_jobs WHERE due_at<?').bind(cutoff),env.DB.prepare('DELETE FROM document_shares WHERE expires_at<? OR revoked_at<?').bind(cutoff,cutoff)]);}};
