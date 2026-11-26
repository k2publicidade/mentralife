// Popup "Ative seu plano": aparece em toda entrada na conta (login ou abertura do app)
// enquanto a conta não tiver um plano ativo. Leva à tela de planos (#/planos).
// No app nativo não mostra preço nem convite para comprar fora da loja (Apple 3.1.1 / 3.1.3).
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function planActive(subscription={},now=Date.now()){
 return subscription?.status==='active'&&(!subscription.current_period_end||subscription.current_period_end>now);
}

export function needsPlanPrompt(platform,now=Date.now()){
 if(!platform?.user||platform.user.role==='admin')return false;
 return !planActive(platform.subscription||{},now);
}

export function planPromptState(subscription={},now=Date.now()){
 const ended=subscription?.status==='expired'||(subscription?.status==='active'&&subscription.current_period_end&&subscription.current_period_end<=now);
 if(ended)return 'expired';
 if(subscription?.status==='canceled')return 'canceled';
 return 'pending';
}

export function planPromptMarkup({subscription={},native=false,now=Date.now(),name='',billing=null}={}){
 const state=planPromptState(subscription,now),first=String(name||'').trim().split(/\s+/)[0];
 // Site: conta nova com direito ao teste grátis ou renovação recusada no cartão.
 if(!native&&billing?.trialEligible){const days=Number(billing.trialDays)||30;return `<div class="plan-prompt-body"><p class="eyebrow">${days} DIAS GRÁTIS</p><h2 id="plan-prompt-title">${first?esc(first)+', ganhe':'Ganhe'} ${days} dias grátis</h2><p id="plan-prompt-text">Cadastre seu cartão e use a Mentra completa por ${days} dias. A primeira cobrança só acontece no fim do teste, e você pode cancelar antes sem pagar nada.</p><div class="plan-prompt-actions"><button type="button" class="primary" data-plan-prompt="activate">Quero meus ${days} dias grátis</button><button type="button" class="outline" data-plan-prompt="later">Agora não</button></div></div>`;}
 if(!native&&billing?.renewalError&&billing?.card)return `<div class="plan-prompt-body"><p class="eyebrow">SEU PLANO</p><h2 id="plan-prompt-title">Não conseguimos renovar seu plano</h2><p id="plan-prompt-text">A cobrança no cartão ${esc(billing.card.brand||'')} •••• ${esc(billing.card.last4)} não foi aprovada (${esc(billing.renewalError)}). Troque o cartão ou pague com PIX para voltar a usar todos os recursos. Seus dados continuam guardados.</p><div class="plan-prompt-actions"><button type="button" class="primary" data-plan-prompt="activate">Atualizar pagamento</button><button type="button" class="outline" data-plan-prompt="later">Agora não</button></div></div>`;
 const title=state==='pending'?`${first?esc(first)+', ative':'Ative'} seu plano para começar`:'Seu plano não está ativo';
 const web={
  pending:'Sua conta já foi criada. Para usar a Mentra por completo, escolha um plano e pague com PIX. A liberação é automática assim que o pagamento é confirmado.',
  expired:'O período do seu plano terminou. Renove com PIX para voltar a usar todos os recursos. Seus dados continuam guardados na sua conta.',
  canceled:'Seu plano foi cancelado. Escolha um plano e pague com PIX para voltar a usar todos os recursos. Seus dados continuam guardados na sua conta.'
 }[state];
 const app='Quando a assinatura estiver ativa na sua conta Mentra, todos os recursos do plano ficam disponíveis aqui automaticamente. Seus dados continuam guardados na sua conta.';
 return `<div class="plan-prompt-body"><p class="eyebrow">SEU PLANO</p><h2 id="plan-prompt-title">${title}</h2><p id="plan-prompt-text">${native?app:web}</p><div class="plan-prompt-actions"><button type="button" class="primary" data-plan-prompt="activate">${native?'Ver meu plano':state==='pending'?'Ativar meu plano':'Renovar meu plano'}</button><button type="button" class="outline" data-plan-prompt="later">Agora não</button></div></div>`;
}

export function installPlanPrompt(platform,{doc=globalThis.document,loc=globalThis.location,native=Boolean(globalThis.mentraNative)}={}){
 if(!doc||!needsPlanPrompt(platform))return null;
 // Quem já abriu a conta direto na tela de planos não precisa do aviso por cima dela.
 if(String(loc?.hash||'').startsWith('#/planos'))return null;
 doc.querySelector('#plan-prompt')?.remove();
 const dialog=doc.createElement('dialog');
 dialog.id='plan-prompt';dialog.className='plan-prompt';
 dialog.setAttribute('aria-labelledby','plan-prompt-title');dialog.setAttribute('aria-describedby','plan-prompt-text');
 dialog.innerHTML=planPromptMarkup({subscription:platform.subscription||{},native,name:platform.user?.name,billing:platform.billing});
 dialog.addEventListener('click',event=>{
  // Botões comuns (não um form): o app intercepta envios de formulário globalmente.
  if(event.target===dialog||event.target.closest('[data-plan-prompt="later"]')){dialog.close('later');return;}
  if(event.target.closest('[data-plan-prompt="activate"]')){dialog.close('activate');if(loc)loc.hash='#/planos';}
 });
 dialog.addEventListener('close',()=>dialog.remove());
 doc.body.append(dialog);
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
 dialog.querySelector('[data-plan-prompt="activate"]')?.focus();
 return dialog;
}
