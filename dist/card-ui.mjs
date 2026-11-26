// Tela de cartão em Planos (site; nunca no app das lojas): teste grátis de 30 dias com cartão,
// cartão cadastrado com próxima cobrança, cancelar ou reativar a renovação, trocar ou remover o cartão.
import {escapeHtml as esc} from './core.mjs';
import {LEGAL,LEGAL_LINKS} from './legal.mjs';

const brl=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=ms=>new Date(ms).toLocaleDateString('pt-BR');
const period=days=>({30:'mês',90:'trimestre',365:'ano'})[days||30]||`período de ${days} dias`;
const charge=p=>p.chargeCents??p.priceCents;
const UF='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export function renewalConsentText(mode,trialDays=LEGAL.trialDays,verifyCents=LEGAL.cardVerifyCents){
 const verify=`Para verificar o cartão, cobramos ${brl(verifyCents)} e estornamos na hora.`;
 if(mode==='trial')return `Autorizo a cobrança automática do plano escolhido neste cartão ao fim dos ${trialDays} dias grátis e a cada novo período, até eu cancelar a renovação. Cancelando antes do fim do teste, nada é cobrado. ${verify}`;
 if(mode==='subscribe')return `Autorizo a cobrança do plano escolhido neste cartão agora e a cada novo período, até eu cancelar a renovação. ${verify}`;
 return `Autorizo a cobrança automática da minha assinatura neste cartão a cada novo período, até eu cancelar a renovação. ${verify}`;
}

const field=(label,name,attrs='',help='')=>`<label class="card-field card-field-${name}"><span>${label}</span><input name="${name}" ${attrs}>${help?`<small>${help}</small>`:''}</label>`;

export function cardFormMarkup({mode,plans=[],selected,needsTerms=false,user={},billing={}}){
 const trial=mode==='trial',days=billing.trialDays||LEGAL.trialDays;
 const planChoice=mode==='update'?'':`<fieldset class="card-plans"><legend>${trial?'Plano depois do teste grátis':'Plano'}</legend>${plans.filter(p=>charge(p)).map(p=>`<label class="card-plan"><input type="radio" name="plan" value="${esc(p.id)}" ${p.id===selected?'checked':''} required><span><strong>${esc(p.name)}</strong><small>${trial?`${days} dias grátis, depois ${brl(charge(p))}${p.promotional?` no primeiro ${period(p.days)}`:` por ${period(p.days)}`}`:`${brl(charge(p))} agora${p.promotional?` (primeiro ${period(p.days)})`:''}, renovação a cada ${period(p.days)}`}</small></span></label>`).join('')}</fieldset>`;
 return `<form id="card-form" class="card-form" data-mode="${mode}" autocomplete="on" novalidate>
${planChoice}
<fieldset><legend>Cartão de crédito</legend><div class="card-grid">
${field('Número do cartão','number','inputmode="numeric" autocomplete="cc-number" maxlength="23" required placeholder="0000 0000 0000 0000"')}
${field('Nome impresso no cartão','holderName','autocomplete="cc-name" maxlength="60" required')}
${field('Validade','exp','inputmode="numeric" autocomplete="cc-exp" maxlength="7" required placeholder="MM/AA"')}
${field('Código de segurança','cvv','inputmode="numeric" autocomplete="cc-csc" maxlength="4" required placeholder="CVV"')}
</div></fieldset>
<fieldset><legend>Titular do cartão</legend><p class="form-help">A operadora exige CPF, telefone e endereço do titular para cobranças online.</p><div class="card-grid">
${field('Nome completo','name',`autocomplete="name" maxlength="120" required value="${esc(user.name||'')}"`)}
${field('CPF','cpf','inputmode="numeric" maxlength="14" required placeholder="000.000.000-00"')}
${field('Celular com DDD','phone','type="tel" autocomplete="tel-national" maxlength="16" required placeholder="(21) 90000-0000"')}
${field('CEP','zip','inputmode="numeric" autocomplete="postal-code" maxlength="9" required placeholder="00000-000"')}
${field('Rua','street','autocomplete="address-line1" maxlength="120" required')}
${field('Número','addressNumber','maxlength="20" required')}
${field('Complemento','complement','autocomplete="address-line2" maxlength="60"','Opcional')}
${field('Bairro','neighborhood','maxlength="80" required')}
${field('Cidade','city','autocomplete="address-level2" maxlength="80" required')}
<label class="card-field card-field-state"><span>UF</span><select name="state" autocomplete="address-level1" required><option value="">UF</option>${UF.map(u=>`<option>${u}</option>`).join('')}</select></label>
</div></fieldset>
<label class="legal-accept"><input type="checkbox" name="authorizeRenewal" required><span>${esc(renewalConsentText(mode,days,billing.verifyCents||LEGAL.cardVerifyCents))}</span></label>
${needsTerms?`<label class="legal-accept"><input type="checkbox" name="acceptTerms" required><span>Li e aceito os <a href="${LEGAL_LINKS.terms}" target="_blank" rel="noopener">Termos de Uso</a> (versão ${esc(LEGAL.termsVersion)}) e li o <a href="${LEGAL_LINKS.privacy}" target="_blank" rel="noopener">Aviso de Privacidade</a>.</span></label>`:''}
<p id="card-error" class="form-error" role="alert"></p>
<button type="submit" class="primary full">${trial?`Começar meus ${days} dias grátis`:mode==='subscribe'?'Assinar com cartão':'Salvar novo cartão'}</button>
<p class="form-help">Os dados do cartão seguem com criptografia para a Six7Pay, que processa os pagamentos. A Mentra não guarda o número nem o código de segurança: só a bandeira, os 4 últimos números e a validade.</p>
</form>`;
}

/** Bloco da tela Planos. Vazio quando o cartão está desligado e não há cartão salvo. */
export function billingMarkup({billing,plans=[],subscription={},user={}}){
 if(!billing||(!billing.cardEnabled&&!billing.card))return '';
 const needsTerms=Boolean(user&&!user.termsAccepted),days=billing.trialDays||LEGAL.trialDays;
 if(billing.card){
  const c=billing.card,lines=[];
  if(billing.inTrial&&billing.trialEndsAt)lines.push(`Teste grátis até <strong>${dateBR(billing.trialEndsAt)}</strong>.`);
  if(billing.nextCharge)lines.push(`Próxima cobrança: <strong>${brl(billing.nextCharge.cents)}</strong> em ${dateBR(billing.nextCharge.at)}${billing.nextCharge.promotional?' (valor promocional do primeiro período)':''}.`);
  else if(!billing.autoRenew&&subscription.current_period_end&&subscription.current_period_end>Date.now())lines.push(`Renovação automática desligada: seu acesso termina em <strong>${dateBR(subscription.current_period_end)}</strong> e nada mais será cobrado.`);
  const error=billing.renewalError?`<div class="notice warm" role="status"><strong>Não conseguimos cobrar a renovação.</strong> <span>${esc(billing.renewalError)}</span> Troque o cartão abaixo ou pague com PIX.</div>`:'';
  return `<section class="card billing-card" aria-labelledby="billing-title"><p class="eyebrow">CARTÃO E RENOVAÇÃO</p><h2 id="billing-title">${esc(c.brand||'Cartão')} •••• ${esc(c.last4)}</h2><p class="form-help">Validade ${String(c.expMonth).padStart(2,'0')}/${c.expYear}</p>${lines.map(l=>`<p>${l}</p>`).join('')}${error}
<div class="billing-actions">${billing.autoRenew?`<button type="button" class="outline" data-card-action="renew-off">Cancelar renovação automática</button>`:`<button type="button" class="primary" data-card-action="renew-on">Reativar renovação automática</button>`}<button type="button" class="text-link" data-card-action="remove">Remover cartão</button></div>
<p id="billing-error" class="form-error" role="alert"></p>
<details class="billing-change"><summary>Trocar cartão</summary>${cardFormMarkup({mode:billing.renewalError&&!(subscription.status==='active'&&subscription.current_period_end>Date.now())?'subscribe':'update',plans,selected:subscription.plan,needsTerms,user,billing})}</details></section>`;
 }
 if(billing.trialEligible)return `<section class="card billing-card billing-trial" aria-labelledby="trial-title"><p class="eyebrow">${days} DIAS GRÁTIS</p><h2 id="trial-title">Use a Mentra completa por ${days} dias, sem pagar agora.</h2><p>Cadastre seu cartão para liberar o teste. A primeira cobrança só acontece no fim dos ${days} dias, no valor do plano escolhido. Cancele quando quiser em Planos ou em Meu espaço; cancelando antes do fim do teste, nada é cobrado.</p>${cardFormMarkup({mode:'trial',plans,selected:subscription.plan,needsTerms,user,billing})}</section>`;
 return `<details class="card billing-card billing-subscribe"><summary><strong>Assinar com cartão de crédito</strong> <span>renovação automática, cancele quando quiser</span></summary>${cardFormMarkup({mode:'subscribe',plans,selected:subscription.plan,needsTerms,user,billing})}</details>`;
}

/** Lê o formulário no formato aceito por /api/card/trial e /api/card. */
export function cardPayload(form){
 const v=name=>form.elements[name]?.value??'',[month,year]=v('exp').split('/').map(x=>x.trim());
 return {
  ...(form.elements.plan?{plan:(form.querySelector('input[name="plan"]:checked')||{}).value}:{}),
  authorizeRenewal:Boolean(form.elements.authorizeRenewal?.checked),
  ...(form.elements.acceptTerms?{acceptTerms:Boolean(form.elements.acceptTerms.checked)}:{}),
  card:{number:v('number'),holderName:v('holderName'),expMonth:Number(month),expYear:Number(year&&year.length===2?'20'+year:year),cvv:v('cvv')},
  client:{name:v('name'),cpf:v('cpf'),phone:v('phone'),address:{zip:v('zip'),street:v('street'),number:v('addressNumber'),complement:v('complement'),neighborhood:v('neighborhood'),city:v('city'),state:v('state')}}
 };
}

/** Máscaras simples enquanto digita (número, validade, CPF, CEP e telefone). */
export function maskCardInput(input){
 const d=input.value.replace(/\D/g,'');
 const masks={number:()=>d.slice(0,19).replace(/(\d{4})(?=\d)/g,'$1 '),exp:()=>d.length>2?d.slice(0,2)+'/'+d.slice(2,4):d,cvv:()=>d.slice(0,4),
  cpf:()=>d.slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'),
  zip:()=>d.slice(0,8).replace(/(\d{5})(\d)/,'$1-$2'),phone:()=>d.slice(0,11).replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d)(\d{4})$/,'$1-$2')};
 const mask=masks[input.name];if(mask)input.value=mask();
}
