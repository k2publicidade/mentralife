import {digest,integrationBody,problem,randomCode,response} from './integration-utils.mjs';

const day=86400000;
export const picpayConfigured=env=>Boolean(env.PICPAY_CLIENT_ID&&env.PICPAY_CLIENT_SECRET&&env.PICPAY_WEBHOOK_TOKEN);

function settings(env){
 const sandbox=env.PICPAY_ENV==='sandbox';
 return sandbox
  ? {host:'https://api.ms.qa.limbo.work',path:'/sandbox/v1',linkHost:'link.ppay.me'}
  : {host:'https://ecommerce-api.svc.picpay.com',path:'/v1',linkHost:'link.picpay.com'};
}

async function post(url,data,token){
 const operation=token?'create_link':'oauth_token';
 try{
  const result=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify(data)});
  if(result.ok)return await result.json();
  const ray=result.headers.get('cf-ray');
  console.warn('picpay_upstream_error',{operation,status:result.status,
   ...(ray&&/^[a-f0-9]{8,32}-[a-z0-9]{3,8}$/i.test(ray)?{ray}:{})});
 }catch{
  console.warn('picpay_upstream_unavailable',{operation});
 }
 problem('O PicPay está indisponível. Tente novamente em instantes.',502);
}

export async function picpayCheckout(env,user,plan,origin){
 if(!picpayConfigured(env))problem('Pagamento via PicPay indisponível.',503);
 if(!plan?.priceCents)problem('Este plano ainda não está disponível para compra.');
 const {DB:db}=env,now=Date.now();
 const orderId=randomCode().slice(0,15);
 const expiration=new Date(now+2*day).toISOString().slice(0,10);
 const expiresAt=Date.parse(expiration)+3*60*60*1000;
 const claim=await db.prepare(`INSERT INTO picpay_orders(id,user_id,plan,amount,expires_at)
  SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM subscriptions WHERE user_id=?
  AND (status!='active' OR current_period_end<=?))
  AND NOT EXISTS(SELECT 1 FROM picpay_orders WHERE user_id=? AND paid_at IS NULL AND expires_at>?)
  RETURNING id`).bind(orderId,user.id,plan.id,plan.priceCents,expiresAt,user.id,now,user.id,now).first();
 if(!claim){
  const pending=await db.prepare('SELECT plan,amount,checkout_url FROM picpay_orders WHERE user_id=? AND paid_at IS NULL AND expires_at>?').bind(user.id,now).first();
  if(pending?.plan===plan.id&&pending.amount!==plan.priceCents)problem('O preço deste plano mudou. Aguarde a expiração do link anterior para comprar pelo novo valor.',409);
  if(pending?.plan===plan.id&&pending.checkout_url)return {checkoutUrl:pending.checkout_url};
  problem(pending?'Você já tem uma compra em andamento. Abra o link do plano escolhido ou aguarde a expiração.':'Seu plano já está ativo.',409);
 }
 const {host,path,linkHost}=settings(env);
 try{
  const auth=await post(host+'/oauth2/token',{grant_type:'client_credentials',client_id:env.PICPAY_CLIENT_ID,client_secret:env.PICPAY_CLIENT_SECRET});
  if(typeof auth?.access_token!=='string'||!auth.access_token)problem('O PicPay não autorizou a criação do link.',502);
  const charge=await post(host+path+'/paymentlink/create',{
   charge:{name:plan.name,description:'30 dias de acesso ao '+plan.name,order_number:orderId,
    redirect_url:origin+'/#/planos',payment:{methods:['BRCODE','CREDIT_CARD'],brcode_arrangements:['PICPAY','PIX']},
    amounts:{product:plan.priceCents,delivery:0}},
   options:{allow_create_pix_key:false,card_max_installment_number:1,expired_at:expiration}
  },auth.access_token);
  const match=typeof charge?.link==='string'&&charge.link.match(/^https:\/\/(link\.picpay\.com|link\.ppay\.me)\/p\/([a-zA-Z0-9_-]{1,100})$/);
  if(!match||match[1]!==linkHost||charge.amount!==plan.priceCents)problem('O PicPay devolveu um link inválido.',502);
  const providerExpiry=Date.parse(charge.expirationDate);
  await db.prepare('UPDATE picpay_orders SET link_id=?,checkout_url=?,expires_at=? WHERE id=?')
   .bind(match[2],charge.link,providerExpiry>now?providerExpiry:expiresAt,orderId).run();
  return {checkoutUrl:charge.link};
 }catch(error){
  // A failed request can leave a link at PicPay, but no customer received it.
  await db.prepare('DELETE FROM picpay_orders WHERE id=? AND checkout_url IS NULL').bind(orderId).run();
  throw error;
 }
}

export async function picpayWebhook(req,env){
 if(req.method!=='POST')problem('Método inválido.',405);
 const token=env.PICPAY_WEBHOOK_TOKEN,supplied=req.headers.get('authorization')||'';
 if(!token||supplied.length!==token.length)problem('Webhook não autorizado.',401);
 const [actual,expected]=await Promise.all([digest(supplied),digest(token)]);
 let difference=0;
 for(let i=0;i<expected.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(difference)problem('Webhook não autorizado.',401);
 const eventType=req.headers.get('event-type')??req.headers.get('event_type');
 if(eventType!=='TransactionPaymentMessage')return response({ok:true});
 const event=await integrationBody(req),transaction=event.data?.transaction,charge=event.data?.charge;
 const paid=event.type==='PAYMENT'&&transaction?.status==='PAYED';
 const refund=event.type==='REFUND'&&['REFUNDED','PARTREFUNDED'].includes(transaction?.status);
 if(!paid&&!refund)return response({ok:true});
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
 if(!validId(transaction.id)||!validId(charge?.paymentLinkId)||(refund&&!validId(transaction.originalTransactionId)))problem('Evento PicPay inválido.');
 const {DB:db}=env;
 const order=await db.prepare('SELECT * FROM picpay_orders WHERE link_id=?').bind(charge.paymentLinkId).first();
 if(!order)return response({ok:true}); // The merchant may use other links on the same account.
 if(charge.amount!==order.amount||(paid&&transaction.amount!==order.amount))problem('Valor da cobrança divergente.',409);
 const now=Date.now(),id='picpay:'+transaction.id;
 if(paid){
  const alreadyRefunded=`EXISTS(SELECT 1 FROM payment_events WHERE event_id LIKE 'picpay-refund:%'
   AND user_id=? AND json_extract(payload,'$.original')=? AND json_extract(payload,'$.status')='REFUNDED')`;
  await db.batch([
   db.prepare(`UPDATE subscriptions SET plan=?,status='active',current_period_end=MAX(COALESCE(current_period_end,0),?)+?
    WHERE user_id=? AND (status!='active' OR current_period_end IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM payment_events WHERE event_id=?) AND NOT ${alreadyRefunded}`)
    .bind(order.plan,now,30*day,order.user_id,id,order.user_id,id),
   db.prepare(`INSERT OR IGNORE INTO payment_events(event_id,user_id,payload,created_at)
    SELECT ?,?,json_object('link',?,'status','PAYED','amount',?,'periodEnd',current_period_end),?
    FROM subscriptions WHERE user_id=? AND NOT ${alreadyRefunded}`)
    .bind(id,order.user_id,order.link_id,order.amount,now,order.user_id,order.user_id,id),
   db.prepare('UPDATE picpay_orders SET paid_at=COALESCE(paid_at,?) WHERE id=?').bind(now,order.id)
  ]);
 }else{
  const refundId='picpay-refund:'+transaction.id,original='picpay:'+transaction.originalTransactionId;
  const receipt=JSON.stringify({link:order.link_id,status:transaction.status,original,amount:transaction.amount});
  await db.batch([
   db.prepare(`UPDATE subscriptions SET
    status=CASE WHEN current_period_end-?>? THEN 'active' ELSE 'canceled' END,
    current_period_end=CASE WHEN current_period_end-?>? THEN current_period_end-? ELSE NULL END
    WHERE user_id=? AND plan=? AND status='active' AND ?='REFUNDED'
    AND current_period_end=(SELECT json_extract(payload,'$.periodEnd') FROM payment_events
    WHERE event_id=? AND user_id=? AND json_extract(payload,'$.link')=?)
    AND NOT EXISTS(SELECT 1 FROM payment_events WHERE event_id=?)`)
    .bind(30*day,now,30*day,now,30*day,order.user_id,order.plan,transaction.status,original,order.user_id,order.link_id,refundId),
   db.prepare('INSERT OR IGNORE INTO payment_events(event_id,user_id,payload,created_at) VALUES(?,?,?,?)')
    .bind(refundId,order.user_id,receipt,now)
  ]);
 }
 return response({ok:true});
}
