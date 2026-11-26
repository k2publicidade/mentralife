// Cartão de crédito na Six7Pay: teste grátis de 30 dias com cartão vinculado e renovação automática.
//
// - O número do cartão passa pelo Worker só para ir à Six7Pay; nunca é gravado nem registrado em log.
// - A Six7Pay só devolve o token numa cobrança real: o cartão é verificado com R$ 1,00, estornado na hora.
// - No fim de cada período a renovação cobra o plano pelo token, com o mesmo pedido do PIX
//   (six7pay_orders, method='card'), que já cobre estorno, arrependimento, retenção e o /admin.
import {problem,randomCode} from './integration-utils.mjs';
import {chargeFor,promoEligible,loadPlans} from './catalog.mjs';
import {six7payInternals as S,six7payReady} from './six7pay.mjs';
import {LEGAL} from '../dist/legal.mjs';

const minute=60000,hour=60*minute,day=24*hour;
export const CARD={verifyCents:LEGAL.cardVerifyCents,trialDays:LEGAL.trialDays,retryDays:LEGAL.renewalRetryDays,leadMs:2*hour,attemptsPerHour:5};
export const cardConfigured=env=>six7payReady(env)&&env.SIX7PAY_CARD==='on';

// ---------------------------------------------------------------- validação
const digits=value=>String(value??'').replace(/\D/g,'');
const text=(value,max)=>String(value??'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function luhn(number){
 let sum=0;for(let i=0;i<number.length;i++){let d=Number(number[number.length-1-i]);if(i%2){d*=2;if(d>9)d-=9;}sum+=d;}
 return number.length>=13&&number.length<=19&&sum%10===0;
}
export function validCpf(value){
 const cpf=digits(value);if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return false;
 const check=n=>{let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);const r=sum*10%11;return r===10?0:r;};
 return check(9)===Number(cpf[9])&&check(10)===Number(cpf[10]);
}
export function cardBrand(number){
 if(/^(4011(78|79)|43(1274|8935)|45(1416|7393|763[12])|50(4175|6699|67[0-7]\d|9\d{3})|627780|63(6297|6368)|650(0[3-9]|[1-4]\d|5[0-2])|6516(5[2-9]|[6-7]\d)|6550([0-1]\d|2[0-5]))/.test(number))return 'Elo';
 if(/^(606282|3841)/.test(number))return 'Hipercard';
 if(/^3[47]/.test(number))return 'Amex';
 if(/^4/.test(number))return 'Visa';
 if(/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(number))return 'Mastercard';
 return null;
}
const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

/** Valida os dados do formulário e monta o pedido da Six7Pay (bandeira exige telefone, e-mail e endereço). */
export function parseCard(body,user,now=new Date()){
 const card=body?.card,client=body?.client,address=client?.address;
 if(!card||typeof card!=='object'||!client||typeof client!=='object'||!address||typeof address!=='object')problem('Preencha os dados do cartão e do titular.');
 const number=digits(card.number),cvv=digits(card.cvv),month=Number(card.expMonth),year=Number(String(card.expYear).length===2?'20'+card.expYear:card.expYear);
 if(!luhn(number))problem('Confira o número do cartão.');
 if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<now.getFullYear()||year>now.getFullYear()+20||(year===now.getFullYear()&&month<now.getMonth()+1))problem('Confira a validade do cartão.');
 if(!/^\d{3,4}$/.test(cvv))problem('Confira o código de segurança (CVV).');
 const holder=text(card.holderName,60).toUpperCase();if(holder.length<3||!/^[A-ZÀ-Ü' .-]+$/.test(holder))problem('Informe o nome impresso no cartão.');
 const name=text(client.name||user.name,120),parts=name.split(' ');if(parts.length<2)problem('Informe nome e sobrenome do titular.');
 const cpf=digits(client.cpf);if(!validCpf(cpf))problem('Confira o CPF do titular.');
 const phone=digits(client.phone);if(!/^[1-9]{2}9?\d{8}$/.test(phone))problem('Informe um telefone com DDD.');
 const zip=digits(address.zip);if(zip.length!==8)problem('Confira o CEP.');
 const street=text(address.street,120),num=text(address.number,20),neighborhood=text(address.neighborhood,80),city=text(address.city,80),state=text(address.state,2).toUpperCase(),complement=text(address.complement,60);
 if(!street||!num||!neighborhood||!city)problem('Preencha rua, número, bairro e cidade.');
 if(!UF.has(state))problem('Informe a UF com 2 letras.');
 return {
  number,cpf,
  card:{holder_name:holder,card_number:number,expiration_month:month,expiration_year:year,security_code:cvv},
  client:{first_name:parts[0],last_name:parts.slice(1).join(' '),document:cpf,phone,email:user.email,
   address:{street,number:num,...(complement?{complement}:{}),neighborhood,city,state,zip_code:zip}},
  view:{brand:cardBrand(number),last4:number.slice(-4),expMonth:month,expYear:year,holder}
 };
}

const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
/** HMAC para reconhecer o mesmo cartão ou CPF sem guardar o valor. */
async function fingerprint(env,value){
 const secret=env.CARD_FINGERPRINT_SECRET||env.SIX7PAY_API_KEY;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));
}
function tokenOf(value,depth=0){
 if(!value||typeof value!=='object'||depth>4)return null;
 for(const [key,item] of Object.entries(value)){
  if(/^(card_)?token$/i.test(key)&&typeof item==='string'&&/^[A-Za-z0-9_.:-]{8,512}$/.test(item))return item;
  const nested=tokenOf(item,depth+1);if(nested)return nested;
 }
 return null;
}
const providerMessage=data=>{const m=data?.error?.message??data?.message??data?.refusal_reason??data?.acquirer_message;return typeof m==='string'?m.replace(/[\u0000-\u001f]/g,' ').slice(0,160):'';};
const authPending=data=>String(data?.analyse_status??data?.transaction?.analyse_status??'').toUpperCase()==='WAITING_AUTH';

// ---------------------------------------------------------------- verificação (R$ 1,00 estornado)
async function reverseVerification(env,row){
 const result=await S.call(env,'POST',`/paytime/transactions/${encodeURIComponent(row.transaction_id)}/reversal`,{amount:row.amount},'estorno-cv-'+row.id);
 const ok=result.status>=200&&result.status<300&&result.status!==202;
 await env.DB.prepare('UPDATE card_verifications SET status=?,updated_at=? WHERE id=?').bind(ok?'reversed':'reversal_pending',Date.now(),row.id).run();
 if(!ok)console.error(JSON.stringify({event:'card_verification_reversal_pending',id:row.id}));
 return ok;
}

async function verifyCard(env,user,parsed){
 const db=env.DB,now=Date.now(),id=randomCode().slice(0,24),ref='mentra-cv-'+id;
 const bucket=`card:${user.id}:${Math.floor(now/hour)}`,count=await db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+hour).first();
 if(count.count>CARD.attemptsPerHour)problem('Muitas tentativas com cartão. Aguarde uma hora ou pague com PIX.',429);
 await db.prepare("INSERT INTO card_verifications(id,user_id,amount,status,created_at,updated_at) VALUES(?,?,?,'creating',?,?)").bind(id,user.id,CARD.verifyCents,now,now).run();
 const result=await S.call(env,'POST','/paytime/transactions',{payment_type:'CREDIT',amount:CARD.verifyCents,installments:1,interest:'STORE',reference_id:ref,client:parsed.client,card:{...parsed.card,create_token:true}},ref);
 const mark=(status,extra={})=>db.prepare('UPDATE card_verifications SET status=?,transaction_id=COALESCE(?,transaction_id),detail=?,updated_at=? WHERE id=?').bind(status,extra.tx??null,extra.detail??null,Date.now(),id).run();
 if(result.status===0||result.status===202||result.status>=500){
  await mark('unknown');
  problem('Não conseguimos confirmar o cartão agora. Aguarde alguns minutos antes de tentar de novo. Se aparecer uma cobrança de R$ 1,00, ela será estornada.',502);
 }
 if(result.status===401||result.status===403){await mark('failed',{detail:'credencial recusada ('+result.status+')'});console.error(JSON.stringify({event:'six7pay_card_auth_failed',status:result.status}));problem('O pagamento com cartão está indisponível agora. Tente mais tarde ou pague com PIX.',503);}
 if(result.status>=400){const detail=providerMessage(result.data);await mark('failed',{detail});problem('O cartão foi recusado'+(detail?': '+detail:'.')+' Confira os dados ou use outro cartão.',402);}
 const tx=S.transactionId(result.data),status=S.statusOf(result.data),token=tokenOf(result.data);
 if(!S.PAID.includes(status)){
  const detail=authPending(result.data)?'autenticação 3DS pedida pelo banco':providerMessage(result.data)||status||'recusado';
  await mark('failed',{tx,detail});
  problem(authPending(result.data)?'Seu banco pediu uma autenticação extra que ainda não está disponível aqui. Use outro cartão ou pague com PIX.':'O cartão foi recusado. Confira os dados ou use outro cartão.',402);
 }
 await mark('approved',{tx});
 const row={id,transaction_id:tx,amount:CARD.verifyCents};
 if(tx)await reverseVerification(env,row);
 if(!token){await mark(tx?'reversal_pending':'failed',{tx,detail:'sem token'});console.error(JSON.stringify({event:'card_token_missing',id}));problem('Não foi possível vincular este cartão agora. Tente de novo em alguns minutos ou pague com PIX.',502);}
 return {token,transaction:tx};
}

// ---------------------------------------------------------------- teste grátis, troca e cancelamento
export async function trialEligible(db,userId){
 const sub=await db.prepare('SELECT status,current_period_end,trial_ends_at FROM subscriptions WHERE user_id=?').bind(userId).first();
 if(!sub||sub.trial_ends_at!=null)return false;
 if(sub.status==='active'&&(sub.current_period_end==null||sub.current_period_end>Date.now()))return false;
 return promoEligible(db,userId);
}

async function saveCard(env,user,parsed,token,now){
 return env.DB.prepare(`INSERT INTO payment_methods(user_id,token,brand,last4,exp_month,exp_year,holder_name,fingerprint,client,authorized_at,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,brand=excluded.brand,last4=excluded.last4,exp_month=excluded.exp_month,exp_year=excluded.exp_year,
  holder_name=excluded.holder_name,fingerprint=excluded.fingerprint,client=excluded.client,authorized_at=excluded.authorized_at,updated_at=excluded.updated_at`)
  .bind(user.id,token,parsed.view.brand,parsed.view.last4,parsed.view.expMonth,parsed.view.expYear,parsed.view.holder,await fingerprint(env,'card:'+parsed.number),JSON.stringify(parsed.client),now,now,now);
}

/** Cadastra o cartão (verificação de R$ 1,00 estornada) e libera 30 dias grátis com renovação automática. */
export async function cardTrial(env,user,body,plans){
 if(!cardConfigured(env))problem('O cadastro de cartão ainda não está disponível. Use o PIX.',503);
 const plan=plans.find(p=>p.id===body?.plan);if(!plan?.priceCents)problem('Escolha um plano disponível.');
 if(body?.authorizeRenewal!==true)problem('Para liberar o teste grátis, autorize a cobrança automática no fim dos 30 dias.');
 const db=env.DB;
 if(!await trialEligible(db,user.id))problem('Esta conta não tem direito ao teste grátis. Escolha um plano para continuar.',409);
 const parsed=parseCard(body,user);
 const keys=[await fingerprint(env,'trial-card:'+parsed.number),await fingerprint(env,'trial-cpf:'+parsed.cpf)];
 if(await db.prepare(`SELECT 1 FROM trial_claims WHERE key IN (?,?)`).bind(...keys).first())problem('Este cartão ou CPF já usou o teste grátis. Escolha um plano para continuar.',409);
 const {token}=await verifyCard(env,user,parsed);
 const now=Date.now(),end=now+CARD.trialDays*day;
 const [,started]=await db.batch([
  await saveCard(env,user,parsed,token,now),
  db.prepare(`UPDATE subscriptions SET plan=?,status='active',current_period_end=?,trial_ends_at=?,auto_renew=1,renewal_attempts=0,renewal_next_at=NULL,renewal_error=NULL
   WHERE user_id=? AND trial_ends_at IS NULL RETURNING current_period_end`).bind(plan.id,end,end,user.id),
  db.prepare('INSERT OR IGNORE INTO trial_claims(key,created_at) VALUES(?,?),(?,?)').bind(keys[0],now,keys[1],now),
  db.prepare("INSERT INTO audit_log(id,user_id,action,created_at) VALUES(?,?,'card_trial_started',?)").bind(crypto.randomUUID(),user.id,now)
 ]);
 if(!started?.results?.length)problem('O teste grátis já foi iniciado nesta conta.',409);
 return {trialEndsAt:end,plan:plan.id,card:parsed.view};
}

/**
 * Vincula ou troca o cartão (nova verificação de R$ 1,00 estornada) e liga a renovação automática.
 * Sem acesso ativo (cliente antigo, sem direito ao teste), cobra o plano escolhido na hora.
 */
export async function cardUpdate(env,user,body,plans=[]){
 if(!cardConfigured(env))problem('O cadastro de cartão ainda não está disponível. Use o PIX.',503);
 if(body?.authorizeRenewal!==true)problem('Autorize a cobrança automática para vincular o cartão.');
 const db=env.DB,sub=await db.prepare('SELECT status,current_period_end FROM subscriptions WHERE user_id=?').bind(user.id).first();
 if(sub?.status==='active'&&sub.current_period_end==null)problem('Seu acesso foi liberado pela administração e não precisa de pagamento.',409);
 const active=sub?.status==='active'&&sub.current_period_end>Date.now(),plan=body?.plan===undefined?null:plans.find(p=>p.id===body.plan);
 if(!active&&!plan?.priceCents)problem('Escolha um plano disponível.');
 if(!active&&await db.prepare("SELECT 1 FROM six7pay_orders WHERE user_id=? AND status IN ('creating','pending','unknown')").bind(user.id).first())problem('Há um pagamento em andamento nesta conta. Aguarde a confirmação antes de usar o cartão.',409);
 const parsed=parseCard(body,user),{token}=await verifyCard(env,user,parsed),now=Date.now();
 await db.batch([
  await saveCard(env,user,parsed,token,now),
  db.prepare('UPDATE subscriptions SET auto_renew=1,renewal_attempts=0,renewal_next_at=NULL,renewal_error=NULL WHERE user_id=?').bind(user.id),
  ...(active?[]:[db.prepare("UPDATE subscriptions SET plan=?,current_period_end=CASE WHEN status='active' THEN MAX(COALESCE(current_period_end,0),?) ELSE ? END WHERE user_id=?").bind(plan.id,now,now,user.id)]),
  db.prepare("INSERT INTO audit_log(id,user_id,action,created_at) VALUES(?,?,'card_updated',?)").bind(crypto.randomUUID(),user.id,now)
 ]);
 if(active)return {card:parsed.view};
 // Sem acesso: a primeira cobrança sai agora, pelo mesmo caminho da renovação.
 const row=await db.prepare('SELECT s.user_id,s.plan,p.token,p.client FROM subscriptions s JOIN payment_methods p ON p.user_id=s.user_id WHERE s.user_id=?').bind(user.id).first();
 await chargeRenewal(env,row,plans,now);
 const after=await db.prepare('SELECT status,current_period_end,renewal_error FROM subscriptions WHERE user_id=?').bind(user.id).first();
 const paid=after.status==='active'&&after.current_period_end>now;
 if(!paid&&after.renewal_error&&!/análise|conferindo/.test(after.renewal_error))problem(after.renewal_error+' O cartão ficou salvo; troque-o ou pague com PIX.',402);
 return {card:parsed.view,charged:paid,pending:!paid};
}

export async function cardRenewal(env,user,enabled){
 if(typeof enabled!=='boolean')problem('Escolha ativar ou cancelar a renovação.');
 if(enabled&&!await env.DB.prepare('SELECT 1 FROM payment_methods WHERE user_id=?').bind(user.id).first())problem('Cadastre um cartão para ativar a renovação automática.',409);
 await env.DB.batch([
  env.DB.prepare('UPDATE subscriptions SET auto_renew=?,renewal_attempts=0,renewal_next_at=NULL,renewal_error=NULL WHERE user_id=?').bind(enabled?1:0,user.id),
  env.DB.prepare('INSERT INTO audit_log(id,user_id,action,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user.id,enabled?'auto_renew_on':'auto_renew_off',Date.now())
 ]);
 return {autoRenew:enabled};
}

export async function cardRemove(env,user){
 await env.DB.batch([
  env.DB.prepare('DELETE FROM payment_methods WHERE user_id=?').bind(user.id),
  env.DB.prepare('UPDATE subscriptions SET auto_renew=0,renewal_next_at=NULL WHERE user_id=?').bind(user.id),
  env.DB.prepare("INSERT INTO audit_log(id,user_id,action,created_at) VALUES(?,?,'card_removed',?)").bind(crypto.randomUUID(),user.id,Date.now())
 ]);
 return {ok:true};
}

/** O que Planos e Meu espaço mostram sobre cartão, teste e próxima cobrança. */
export async function billingInfo(env,user,plans){
 const db=env.DB,[sub,card]=await Promise.all([
  db.prepare('SELECT plan,status,current_period_end,trial_ends_at,auto_renew,renewal_attempts,renewal_next_at,renewal_error FROM subscriptions WHERE user_id=?').bind(user.id).first(),
  db.prepare('SELECT brand,last4,exp_month,exp_year FROM payment_methods WHERE user_id=?').bind(user.id).first()]);
 const plan=plans.find(p=>p.id===sub?.plan),renews=Boolean(sub?.auto_renew&&card&&sub.current_period_end);
 const charge=renews&&plan?.priceCents?chargeFor(plan,await promoEligible(db,user.id)):null;
 return {
  cardEnabled:cardConfigured(env),trialEligible:cardConfigured(env)&&await trialEligible(db,user.id),trialDays:CARD.trialDays,verifyCents:CARD.verifyCents,
  inTrial:Boolean(sub?.trial_ends_at&&sub.current_period_end&&sub.current_period_end<=sub.trial_ends_at&&sub.current_period_end>Date.now()),
  trialEndsAt:sub?.trial_ends_at??null,autoRenew:Boolean(sub?.auto_renew),
  card:card?{brand:card.brand,last4:card.last4,expMonth:card.exp_month,expYear:card.exp_year}:null,
  nextCharge:renews&&charge?{at:Math.max(Date.now(),sub.current_period_end-CARD.leadMs),cents:charge.chargeCents,promotional:charge.promotional,plan:plan.id}:null,
  renewalError:sub?.renewal_error??null,renewalAttempts:sub?.renewal_attempts??0
 };
}

// ---------------------------------------------------------------- renovação automática (cron)
async function chargeRenewal(env,row,plans,now){
 const db=env.DB,plan=plans.find(p=>p.id===row.plan);
 const lock=await db.prepare(`UPDATE subscriptions SET renewal_next_at=?,renewal_attempts=renewal_attempts+1 WHERE user_id=? AND auto_renew=1 AND (renewal_next_at IS NULL OR renewal_next_at<=?) RETURNING renewal_attempts`)
  .bind(now+hour,row.user_id,now).first();
 if(!lock)return;
 const retry=async error=>{const wait=CARD.retryDays[lock.renewal_attempts-1];await db.prepare('UPDATE subscriptions SET renewal_next_at=?,renewal_error=? WHERE user_id=?').bind(wait?now+wait*day:null,error,row.user_id).run();};
 if(!plan?.priceCents){await db.prepare("UPDATE subscriptions SET auto_renew=0,renewal_error='Plano indisponível para renovação.' WHERE user_id=?").bind(row.user_id).run();return;}
 const {chargeCents,promotional}=chargeFor(plan,await promoEligible(db,row.user_id)),id=randomCode().slice(0,24);
 const order=await db.prepare(`INSERT INTO six7pay_orders(id,user_id,plan,amount,days,promotional,created_at,expires_at,terms_version,method)
  SELECT ?,?,?,?,?,?,?,?,(SELECT terms_version FROM users WHERE id=?),'card' WHERE NOT EXISTS(SELECT 1 FROM six7pay_orders WHERE user_id=? AND status IN ('creating','pending','unknown')) RETURNING *`)
  .bind(id,row.user_id,plan.id,chargeCents,plan.days,promotional?1:0,now,now+hour,row.user_id,row.user_id).first();
 if(!order)return;
 let client;try{client=JSON.parse(row.client);}catch{client=null;}
 const result=await S.call(env,'POST','/paytime/transactions',{payment_type:'CREDIT',amount:order.amount,installments:1,interest:'STORE',reference_id:S.reference(order),...(client?{client}:{}),card:{token:row.token}},S.reference(order));
 if(result.status===0||result.status===202||result.status>=500){
  // Sem resposta definitiva: nunca reenviar. A conciliação do PIX procura pelo reference_id.
  await db.prepare("UPDATE six7pay_orders SET status='unknown' WHERE id=? AND status='creating'").bind(id).run();
  await retry('A operadora não respondeu; conferindo a cobrança.');return;
 }
 if(result.status===401||result.status===403){await db.prepare("UPDATE six7pay_orders SET status='failed' WHERE id=?").bind(id).run();console.error(JSON.stringify({event:'six7pay_card_auth_failed',status:result.status}));await retry('A operadora está indisponível; tentaremos de novo.');return;}
 if(result.status>=400){await db.prepare("UPDATE six7pay_orders SET status='failed' WHERE id=?").bind(id).run();await retry('Cartão recusado'+(providerMessage(result.data)?': '+providerMessage(result.data):'.'));return;}
 const tx=S.transactionId(result.data),status=S.statusOf(result.data),amount=S.amountOf(result.data);
 if(tx)await db.prepare("UPDATE six7pay_orders SET transaction_id=?,status='pending',checked_at=? WHERE id=?").bind(tx,now,id).run();
 if(S.PAID.includes(status)&&tx&&(amount===undefined||amount===order.amount)){await S.activate(db,{...order,transaction_id:tx},now);return;}
 if(!tx||S.CLOSED.includes(status)||status==='REFUSED'){await db.prepare("UPDATE six7pay_orders SET status='failed' WHERE id=? AND status IN ('creating','pending')").bind(id).run();await retry('Cartão recusado'+(providerMessage(result.data)?': '+providerMessage(result.data):'.'));return;}
 // PENDING (por exemplo, análise antifraude): a conciliação conclui; a próxima tentativa só depois do intervalo.
 await retry('Cobrança em análise pela operadora.');
}

export async function cardRenewals(env,now=Date.now()){
 if(!cardConfigured(env))return;
 const db=env.DB;
 // Verificações de R$ 1,00 cujo estorno não foi confirmado: tenta de novo.
 const pending=(await db.prepare(`SELECT * FROM card_verifications WHERE status IN ('approved','reversal_pending') AND transaction_id IS NOT NULL AND updated_at<? LIMIT 5`).bind(now-minute).all()).results;
 for(const row of pending){try{await reverseVerification(env,row);}catch{console.warn('card_reversal_retry_failed',{id:row.id});}}
 // Verificação sem resposta: procura pela referência e estorna se tiver sido aprovada.
 const unknown=(await db.prepare(`SELECT * FROM card_verifications WHERE status IN ('creating','unknown') AND created_at<? LIMIT 3`).bind(now-2*minute).all()).results;
 for(const row of unknown){
  const ref='mentra-cv-'+row.id,found=await S.call(env,'GET','/paytime/dashboard/transactions?q='+encodeURIComponent(ref));
  const entry=found.status===200?(Array.isArray(found.data?.data)?found.data.data:[]).find(i=>i?.reference_id===ref&&(!env.SIX7PAY_ESTABLISHMENT||String(i.establishment_id)===env.SIX7PAY_ESTABLISHMENT)):null;
  if(entry&&S.validId(entry.paytime_id)&&S.PAID.includes(String(entry.status).toUpperCase())){await db.prepare("UPDATE card_verifications SET transaction_id=?,status='approved',updated_at=? WHERE id=?").bind(entry.paytime_id,now,row.id).run();await reverseVerification(env,{...row,transaction_id:entry.paytime_id});}
  else if((entry&&S.CLOSED.includes(String(entry.status).toUpperCase()))||(!entry&&now-row.created_at>day))await db.prepare("UPDATE card_verifications SET status='failed',updated_at=? WHERE id=?").bind(now,row.id).run();
 }
 const plans=(await loadPlans(db)).plans;
 const due=(await db.prepare(`SELECT s.user_id,s.plan,p.token,p.client FROM subscriptions s JOIN payment_methods p ON p.user_id=s.user_id
  WHERE s.auto_renew=1 AND s.current_period_end IS NOT NULL AND s.current_period_end<=? AND (s.renewal_next_at IS NULL OR s.renewal_next_at<=?)
  AND s.renewal_attempts<=? ORDER BY s.current_period_end LIMIT 5`).bind(now+CARD.leadMs,now,CARD.retryDays.length).all()).results;
 for(const row of due){try{await chargeRenewal(env,row,plans,now);}catch(error){console.warn('card_renewal_failed',{user:row.user_id,reason:String(error?.message||'').slice(0,80)});}}
 await db.prepare('DELETE FROM trial_claims WHERE created_at<?').bind(now-730*day).run();
}
