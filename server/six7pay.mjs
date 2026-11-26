import {problem,randomCode} from './integration-utils.mjs';
import {chargeFor,promoEligible} from './catalog.mjs';

// Six7Pay (Paytime) PIX checkout. The API has no payment link and no webhook yet,
// so the Worker creates the PIX, shows the code in the app and polls the status.
const minute=60000,hour=60*minute,day=24*hour;
const BASE='https://painel.six7pay.com.br';
const OPEN=['creating','pending','unknown'];
const PAID=['PAID','APPROVED'];
const CLOSED=['CANCELED','CANCELLED','EXPIRED','FAILED','ABANDONED','REFUSED','UPSTREAM_ERROR'];

export const six7payReady=env=>Boolean(env.SIX7PAY_API_KEY);
// The key alone keeps reconciliation running; SIX7PAY_CHECKOUT=on also shows the purchase button.
export const six7payConfigured=env=>six7payReady(env)&&env.SIX7PAY_CHECKOUT==='on';

const route=path=>path.replace(/\?.*$/,'').replace(/\/(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{12,}(?=\/|$)/g,'/:id');
async function call(env,method,path,body,idempotencyKey){
 let res;
 try{
  // Workers reject redirect:'error' (it throws on every call); 'manual' plus the check below
  // keeps the API key from ever being sent to another host.
  res=await fetch(BASE+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),
   headers:{Accept:'application/json','x-api-key':env.SIX7PAY_API_KEY,
    ...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
   body:body?JSON.stringify(body):undefined});
 }catch(error){
  // The reason (timeout, refused connection, redirect) is logged; never the key or the body.
  console.warn('six7pay_unavailable',{method,path:route(path),reason:String(error?.name||'')+': '+String(error?.message||'').slice(0,160)});
  return {status:0,data:null};
 }
 if(res.status>=300&&res.status<400){
  console.warn('six7pay_redirect',{method,path:route(path),status:res.status});
  return {status:0,data:null};
 }
 let data=null;
 try{data=await res.json();}catch{}
 if(!res.ok||res.status===202){
  const requestId=data?.error?.requestId;
  console.warn('six7pay_response',{method,path:route(path),status:res.status,code:String(data?.error?.code||data?.status||'').slice(0,40),
   ...(typeof requestId==='string'&&/^[a-f0-9-]{8,64}$/i.test(requestId)?{requestId}:{})});
 }
 return {status:res.status,data};
}

function find(value,test,depth=0){
 if(value==null||depth>5)return;
 if(typeof value==='string')return test(value)?value:undefined;
 if(typeof value!=='object')return;
 for(const item of Array.isArray(value)?value:Object.values(value)){const hit=find(item,test,depth+1);if(hit)return hit;}
}
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{6,64}$/.test(value);
const transactionId=data=>[data?._id,data?.paytime_id,data?.transaction?._id,data?.data?._id].find(validId);
const statusOf=data=>String(data?.status??data?.transaction?.status??data?.data?.status??'').toUpperCase();
// With interest STORE the payer is charged original_amount; amount is the net after fees.
const amountOf=data=>[data?.original_amount,data?.amount,data?.transaction?.original_amount,data?.transaction?.amount].find(Number.isInteger);
const establishmentOf=data=>data?.establishment?.id??data?.establishment_id;
const pixCode=data=>find(data,value=>value.length<=1024&&/^000201[\x20-\x7e]+$/.test(value))||null;
function qrImage(data){
 const uri=find(data,value=>value.length<=300000&&/^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/.test(value));
 if(uri)return uri;
 const raw=find(data,value=>value.length<=300000&&/^(iVBORw0KGgo|\/9j\/)[A-Za-z0-9+/]+=*$/.test(value));
 return raw?(raw.startsWith('iVBOR')?'data:image/png;base64,':'data:image/jpeg;base64,')+raw:null;
}

const reference=order=>'mentra-'+order.id;
// Orders created before periods existed granted 30 days.
const daysOf=order=>Number.isInteger(order.days)&&order.days>0?order.days:30;
const view=order=>order&&{id:order.id,plan:order.plan,amount:order.amount,days:daysOf(order),promotional:Boolean(order.promotional),
 status:order.status==='creating'?'unknown':order.status,pixCode:order.pix_code||null,qrImage:order.qr_image||null,paidAt:order.paid_at||null};
const load=(db,id)=>db.prepare('SELECT * FROM six7pay_orders WHERE id=?').bind(id).first();
const close=(db,id,status)=>db.prepare(`UPDATE six7pay_orders SET status=? WHERE id=? AND status IN ('creating','pending','unknown')`).bind(status,id).run();

async function saveQr(env,order,data){
 let code=pixCode(data),image=qrImage(data);
 if(!image){const qr=await call(env,'GET',`/paytime/transactions/${order.transaction_id}/qrcode`);if(qr.status===200){code=code||pixCode(qr.data);image=qrImage(qr.data);}}
 if(code||image)await env.DB.prepare('UPDATE six7pay_orders SET pix_code=COALESCE(?,pix_code),qr_image=COALESCE(?,qr_image) WHERE id=?').bind(code,image,order.id).run();
}

// Adds the order's days to the later of now and the current end, so renewing early loses nothing.
async function activate(db,order,now){
 const id='six7pay:'+order.transaction_id;
 await db.batch([
  db.prepare(`UPDATE subscriptions SET plan=?,current_period_end=CASE WHEN status='active' THEN MAX(COALESCE(current_period_end,0),?) ELSE ? END+?,status='active'
   WHERE user_id=? AND (status!='active' OR current_period_end IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM payment_events WHERE event_id=?)`)
   .bind(order.plan,now,now,daysOf(order)*day,order.user_id,id),
  db.prepare(`INSERT OR IGNORE INTO payment_events(event_id,user_id,payload,created_at)
   SELECT ?,?,json_object('provider','six7pay','order',?,'transaction',?,'status','PAID','amount',CAST(? AS INTEGER),'days',CAST(? AS INTEGER),'promotional',CAST(? AS INTEGER),'periodEnd',current_period_end),? FROM subscriptions WHERE user_id=?`)
   .bind(id,order.user_id,order.id,order.transaction_id,order.amount,daysOf(order),order.promotional?1:0,now,order.user_id),
  db.prepare(`UPDATE six7pay_orders SET status='paid',paid_at=COALESCE(paid_at,?) WHERE id=?`).bind(now,order.id),
  // Um pagamento confirmado (PIX ou cartão) zera as tentativas de renovação automática.
  db.prepare('UPDATE subscriptions SET renewal_attempts=0,renewal_next_at=NULL,renewal_error=NULL WHERE user_id=?').bind(order.user_id)
 ]);
}

// Reads the order's state at Six7Pay. Never creates or resends a charge.
async function refresh(env,order,minGap=10000){
 const {DB:db}=env,now=Date.now();
 if(!six7payReady(env)||!OPEN.includes(order.status))return order;
 if(order.status==='creating'&&now-order.created_at<minute)return order;
 const slot=await db.prepare(`UPDATE six7pay_orders SET checked_at=? WHERE id=? AND status IN ('creating','pending','unknown') AND (checked_at IS NULL OR checked_at<=?) RETURNING *`)
  .bind(now,order.id,now-minGap).first();
 if(!slot)return order;
 order=slot;
 if(!order.transaction_id){
  // The charge request had no definite answer: find the attempt by our unique reference.
  const found=await call(env,'GET','/paytime/dashboard/transactions?q='+encodeURIComponent(reference(order)));
  if(found.status!==200)return order;
  const entry=(Array.isArray(found.data?.data)?found.data.data:[]).find(item=>item?.reference_id===reference(order)
   &&(!env.SIX7PAY_ESTABLISHMENT||String(item.establishment_id)===env.SIX7PAY_ESTABLISHMENT));
  if(!entry||!validId(entry.paytime_id)){
   if((entry&&CLOSED.includes(String(entry.status).toUpperCase()))||(!entry&&now-order.created_at>15*minute)){await close(db,order.id,'failed');return load(db,order.id);}
   return order;
  }
  await db.prepare(`UPDATE six7pay_orders SET transaction_id=?,status='pending' WHERE id=?`).bind(entry.paytime_id,order.id).run();
  order={...order,transaction_id:entry.paytime_id,status:'pending'};
 }
 const result=await call(env,'GET','/paytime/transactions/'+encodeURIComponent(order.transaction_id));
 if(result.status!==200)return order;
 const status=statusOf(result.data),amount=amountOf(result.data),establishment=establishmentOf(result.data);
 if(env.SIX7PAY_ESTABLISHMENT&&establishment!=null&&String(establishment)!==env.SIX7PAY_ESTABLISHMENT){console.warn('six7pay_establishment_mismatch',{order:order.id});return order;}
 if(PAID.includes(status)){
  if(amount!==undefined&&amount!==order.amount){console.warn('six7pay_amount_mismatch',{order:order.id});return order;}
  await activate(db,order,now);
 }else if(CLOSED.includes(status))await close(db,order.id,'canceled');
 else if(!order.pix_code&&!order.qr_image)await saveQr(env,order,result.data);
 return load(db,order.id);
}

// The server alone decides the amount: regular price, or the promotional one for a first payment.
// Amount, days and the promotional flag are stored in the order, so confirming it later grants
// exactly what was sold even if the catalog changes in the meantime.
export async function six7payCheckout(env,user,plan,{termsVersion=null}={}){
 if(!six7payConfigured(env))problem('Pagamento indisponível no momento.',503);
 if(!plan?.priceCents)problem('Este plano ainda não está disponível para compra.');
 const {DB:db}=env,now=Date.now(),id=randomCode().slice(0,24);
 const {chargeCents,promotional}=chargeFor(plan,await promoEligible(db,user.id));
 // Early renewal is allowed; only accounts granted access with no end date cannot buy.
 const claim=await db.prepare(`INSERT INTO six7pay_orders(id,user_id,plan,amount,days,promotional,created_at,expires_at,terms_version)
  SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE user_id=? AND (status!='active' OR current_period_end IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM six7pay_orders WHERE user_id=? AND status IN ('creating','pending','unknown') AND expires_at>?)
  AND (?=0 OR NOT EXISTS(SELECT 1 FROM six7pay_orders WHERE user_id=? AND (status='paid' OR paid_at IS NOT NULL)))
  RETURNING *`).bind(id,user.id,plan.id,chargeCents,plan.days,promotional?1:0,now,now+hour,termsVersion,user.id,user.id,now,promotional?1:0,user.id).first();
 if(!claim){
  const open=await db.prepare(`SELECT * FROM six7pay_orders WHERE user_id=? AND status IN ('creating','pending','unknown') AND expires_at>? ORDER BY created_at DESC`).bind(user.id,now).first();
  if(open?.plan===plan.id&&(open.amount!==chargeCents||daysOf(open)!==plan.days))problem('O preço deste plano mudou. Aguarde alguns minutos para gerar uma nova cobrança.',409);
  if(open?.plan===plan.id)return {order:view(await refresh(env,open))};
  if(open)problem('Você já tem um PIX em aberto para outro plano. Pague-o ou aguarde alguns minutos.',409);
  const sub=await db.prepare('SELECT status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();
  problem(sub?.status==='active'&&sub.current_period_end==null?'Seu acesso foi liberado pela administração e não precisa de pagamento.':'O valor desta cobrança mudou. Atualize a página e tente novamente.',409);
 }
 // Idempotency-Key makes an accidental repeat return the original charge instead of a second one.
 // interest is required by the API even for PIX; STORE keeps the price shown to the customer.
 const created=await call(env,'POST','/paytime/transactions',{payment_type:'PIX',amount:claim.amount,interest:'STORE',reference_id:reference(claim)},reference(claim));
 if(created.status>=400&&created.status<500){
  await close(db,id,'failed');
  problem('A Six7Pay não gerou o PIX agora. Tente novamente em alguns minutos.',502);
 }
 const transaction=created.status>=200&&created.status<300&&created.status!==202?transactionId(created.data):undefined;
 if(!transaction){
  // 202 UNKNOWN, timeout or 5xx: the charge may exist. Never resend; reconcile by reference.
  await db.prepare(`UPDATE six7pay_orders SET status='unknown' WHERE id=? AND status='creating'`).bind(id).run();
  return {order:view(await load(db,id))};
 }
 await db.prepare(`UPDATE six7pay_orders SET status='pending',transaction_id=?,checked_at=? WHERE id=?`).bind(transaction,now,id).run();
 await saveQr(env,{...claim,transaction_id:transaction},created.data);
 return {order:view(await load(db,id))};
}

export async function six7payOrder(env,user){
 const order=await env.DB.prepare('SELECT * FROM six7pay_orders WHERE user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').bind(user.id,Date.now()-day).first();
 return {order:order?view(await refresh(env,order)):null};
}

// A full refund removes the days that payment granted, once, whatever started it.
async function applyRefund(db,order,amount,source,now=Date.now()){
 const id='six7pay-refund:'+order.transaction_id,period=daysOf(order)*day;
 await db.batch([
  db.prepare("UPDATE withdrawal_requests SET status='refunded',resolved_at=? WHERE order_id=? AND status='requested'").bind(now,order.id),
  db.prepare(`UPDATE subscriptions SET
   status=CASE WHEN current_period_end-?>? THEN 'active' ELSE 'canceled' END,
   current_period_end=CASE WHEN current_period_end-?>? THEN current_period_end-? ELSE NULL END
   WHERE user_id=? AND status='active' AND current_period_end IS NOT NULL
   AND EXISTS(SELECT 1 FROM payment_events WHERE event_id=?) AND NOT EXISTS(SELECT 1 FROM payment_events WHERE event_id=?)`)
   .bind(period,now,period,now,period,order.user_id,'six7pay:'+order.transaction_id,id),
  db.prepare(`INSERT OR IGNORE INTO payment_events(event_id,user_id,payload,created_at)
   VALUES(?,?,json_object('provider','six7pay','order',?,'transaction',?,'status','REFUNDED','amount',CAST(? AS INTEGER),'source',?),?)`)
   .bind(id,order.user_id,order.id,order.transaction_id,amount,source,now),
  db.prepare('UPDATE six7pay_orders SET refunded_at=COALESCE(refunded_at,?),refund_amount=COALESCE(refund_amount,?) WHERE id=?').bind(now,amount,order.id)
 ]);
}

const REFUNDED=['REFUNDED','REVERSED','CHARGEBACK','CHARGEBACKED'];
// Refund started by the admin. Idempotency-Key makes a retry return the first answer, never a second refund.
export async function six7payRefund(env,orderId){
 if(!six7payReady(env))problem('Pagamentos indisponíveis.',503);
 const {DB:db}=env;
 const order=typeof orderId==='string'&&/^[a-f0-9]{24}$/.test(orderId)?await load(db,orderId):null;
 if(!order)problem('Pagamento não encontrado.',404);
 return refundOrder(env,order,'admin');
}
async function refundOrder(env,order,source){
 const {DB:db}=env;
 if(order.status!=='paid'||!order.transaction_id)problem('Só um pagamento confirmado pode ser estornado.',409);
 if(order.refunded_at)problem('Este pagamento já foi estornado.',409);
 const result=await call(env,'POST',`/paytime/transactions/${encodeURIComponent(order.transaction_id)}/reversal`,{amount:order.amount},'estorno-'+order.id);
 if(result.status===0||result.status===202||result.status>=500)
  problem('A Six7Pay não confirmou o estorno agora. Tente de novo: a repetição não gera um segundo estorno.',502);
 if(result.status>=400){
  const message=typeof result.data?.error?.message==='string'?result.data.error.message.slice(0,200):'';
  problem('A Six7Pay recusou o estorno'+(message?': '+message:'.'),502);
 }
 await applyRefund(db,order,order.amount,source);
 const after=await call(env,'GET','/paytime/transactions/'+encodeURIComponent(order.transaction_id));
 return {ok:true,providerStatus:after.status===200?statusOf(after.data)||null:null};
}

// Direito de arrependimento (CDC, art. 49): 7 dias corridos desde a confirmação do pagamento.
const WITHDRAWAL_WINDOW=7*day;
async function withdrawable(db,userId,now){
 return db.prepare(`SELECT * FROM six7pay_orders WHERE user_id=? AND status='paid' AND refunded_at IS NULL AND transaction_id IS NOT NULL AND paid_at>? ORDER BY paid_at DESC LIMIT 1`).bind(userId,now-WITHDRAWAL_WINDOW).first();
}
/** O que Meu espaço mostra: um pagamento ainda dentro do prazo, ou o pedido já feito. */
export async function six7payWithdrawalInfo(env,user,now=Date.now()){
 const {DB:db}=env;
 const request=await db.prepare('SELECT id,order_id,amount,status,requested_at,resolved_at FROM withdrawal_requests WHERE user_id=? ORDER BY requested_at DESC LIMIT 1').bind(user.id).first();
 const order=await withdrawable(db,user.id,now);
 const open=order&&!(request&&request.order_id===order.id);
 return {
  eligible:open?{orderId:order.id,amount:order.amount,paidAt:order.paid_at,deadline:order.paid_at+WITHDRAWAL_WINDOW}:null,
  request:request?{protocol:request.id,orderId:request.order_id,amount:request.amount,status:request.status,requestedAt:request.requested_at,resolvedAt:request.resolved_at}:null
 };
}
/**
 * Registra o pedido de arrependimento (confirmação imediata com protocolo) e pede o estorno integral
 * à Six7Pay na hora. Se a Six7Pay não confirmar, o pedido fica 'requested' para a equipe concluir pelo /admin.
 */
export async function six7payWithdraw(env,user,now=Date.now()){
 const {DB:db}=env;
 const order=await withdrawable(db,user.id,now);
 if(!order){
  const last=await db.prepare('SELECT id,status FROM withdrawal_requests WHERE user_id=? ORDER BY requested_at DESC LIMIT 1').bind(user.id).first();
  if(last)problem(`Seu pedido de arrependimento já foi registrado (protocolo ${last.id}).`,409);
  problem('Não há pagamento confirmado nos últimos 7 dias para desistir.',409);
 }
 const protocol='ARR-'+randomCode().slice(0,10).toUpperCase();
 await db.prepare(`INSERT INTO withdrawal_requests(id,user_id,order_id,name,email,amount,requested_at,status) VALUES(?,?,?,?,?,?,?,'requested') ON CONFLICT(order_id) DO NOTHING`)
  .bind(protocol,user.id,order.id,user.name,user.email,order.amount,now).run();
 const request=await db.prepare('SELECT * FROM withdrawal_requests WHERE order_id=?').bind(order.id).first();
 let detail=null;
 if(request.status==='requested'){
  try{if(!six7payReady(env))problem('Pagamentos indisponíveis.',503);await refundOrder(env,order,'withdrawal');}
  catch(error){detail=String(error.message||'falha').slice(0,200);await db.prepare('UPDATE withdrawal_requests SET detail=? WHERE id=?').bind(detail,request.id).run();console.error(JSON.stringify({event:'six7pay_withdrawal_pending',order:order.id}));}
 }
 const fresh=await db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').bind(request.id).first();
 return {protocol:fresh.id,status:fresh.status,amount:fresh.amount,requestedAt:fresh.requested_at};
}

export async function six7payAdminList(env){
 const {DB:db}=env;
 const items=(await db.prepare(`SELECT o.id,o.plan,o.amount,o.days,o.promotional,o.status,o.created_at,o.paid_at,o.refunded_at,o.refund_amount,o.transaction_id,u.name,u.email,w.id AS withdrawal_id,w.status AS withdrawal_status,w.requested_at AS withdrawal_requested_at
  FROM six7pay_orders o LEFT JOIN users u ON u.id=o.user_id LEFT JOIN withdrawal_requests w ON w.order_id=o.id ORDER BY o.created_at DESC LIMIT 100`).all()).results;
 let balance=null;
 if(six7payReady(env)){const b=await call(env,'GET','/paytime/establishments/balance');if(b.status===200&&Number.isInteger(b.data?.balance))balance={available:b.data.balance,blocked:b.data.blocked_balance??0,total:b.data.total_balance??b.data.balance};}
 return {items,balance,checkout:six7payConfigured(env)};
}

// Refunds made in the Six7Pay panel have no webhook: paid orders are re-read every 6 h for 35 days.
async function watchRefunds(env,now){
 const {DB:db}=env;
 const rows=(await db.prepare(`SELECT * FROM six7pay_orders WHERE status='paid' AND refunded_at IS NULL AND paid_at>? AND (checked_at IS NULL OR checked_at<?) ORDER BY COALESCE(checked_at,0) LIMIT 5`)
  .bind(now-35*day,now-6*hour).all()).results;
 for(const order of rows){
  await db.prepare('UPDATE six7pay_orders SET checked_at=? WHERE id=?').bind(now,order.id).run();
  const result=await call(env,'GET','/paytime/transactions/'+encodeURIComponent(order.transaction_id));
  if(result.status===200&&REFUNDED.includes(statusOf(result.data)))await applyRefund(db,order,order.amount,'provider',now);
 }
}

export async function six7payReconcile(env){
 if(!six7payReady(env))return;
 const {DB:db}=env,now=Date.now();
 await db.prepare(`UPDATE six7pay_orders SET status='canceled' WHERE status IN ('creating','pending','unknown') AND created_at<?`).bind(now-8*hour).run();
 // Recent orders every 30 s, older ones every 5 min, at most 10 upstream lookups per run.
 const rows=(await db.prepare(`SELECT * FROM six7pay_orders WHERE status IN ('creating','pending','unknown')
  AND (checked_at IS NULL OR checked_at<CASE WHEN created_at>? THEN ? ELSE ? END) ORDER BY COALESCE(checked_at,0) LIMIT 10`)
  .bind(now-hour,now-30000,now-5*minute).all()).results;
 for(const row of rows){try{await refresh(env,row,0);}catch{console.warn('six7pay_reconcile_failed',{order:row.id});}}
 try{await watchRefunds(env,now);}catch{console.warn('six7pay_refund_watch_failed');}
}

// Usado pela cobrança no cartão (server/card.mjs): mesma chamada, conferência e ativação do PIX.
export const six7payInternals={call,statusOf,transactionId,amountOf,establishmentOf,activate,refresh,load,daysOf,reference,validId,PAID,CLOSED,OPEN};
