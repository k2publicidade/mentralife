import {saveFile} from './file-save.mjs';
import {accountRecoveryJson} from './backup.mjs';
import {setTimeZone} from './time.mjs';
import {startPlatform,api,send} from './platform.mjs';
import {accountState} from './account-state.mjs';
import {openDraftStore,memoryDraftStore} from './draft-store.mjs';
import {createSyncController} from './sync-controller.mjs';
import {installSyncUI} from './sync-ui.mjs';
import {showPix,resumePix} from './pix-checkout.mjs';
import {installPlanPrompt} from './plan-prompt.mjs';
try{
 const platform=await startPlatform();
 if(platform){
  platform.data=accountState(platform.data,platform.user);window.mentraPlatform=platform;void globalThis.mentraNativeCalendar?.resume().catch(()=>{});void globalThis.mentraNativePush?.resume().catch(()=>{});setTimeZone(platform.data.profile.timeZone||'');
  let store;try{store=await openDraftStore();}catch{store=memoryDraftStore();}
  let syncUI;
  const sync=createSyncController({userId:platform.user.id,revision:platform.revision,store,write:payload=>api('state',{method:'PUT',body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)}),onStatus:value=>syncUI?.update(value)});
  window.mentraSave=sync;
  await import('./app.js');
  syncUI=await installSyncUI({sync,store,platform,api,send});syncUI.update(sync.status());
  // Confirmação de ações que recarregam a página sem sair da conta (arrependimento, apagar dados).
  try{const raw=sessionStorage.getItem('mentra-account-notice');if(raw){sessionStorage.removeItem('mentra-account-notice');const note=JSON.parse(raw);if(Date.now()-note.at<120000)setTimeout(()=>{const box=document.querySelector('#account-error');if(box){box.textContent=note.message;box.classList.add('form-success');}},300);}}catch{}
  // Sem plano ativo, toda entrada na conta (login ou abertura do app) mostra o convite para ativar o plano.
  installPlanPrompt(platform);
  const pix={plans:platform.plans||[],api,onPaid:()=>location.reload()};
  const resume=()=>{if(platform.paymentsConfigured&&!globalThis.mentraNative&&location.hash.startsWith('#/planos'))setTimeout(()=>resumePix(pix),60);};
  window.addEventListener('hashchange',resume);resume();
  document.addEventListener('submit',async event=>{
   const form=event.target;
   if(form.id==='platform-withdraw'){event.preventDefault();const target=document.querySelector('#account-error');try{const result=await send('six7pay/withdraw',{confirm:true});try{sessionStorage.setItem('mentra-account-notice',JSON.stringify({message:`Pedido de arrependimento registrado. Protocolo ${result.protocol}. ${result.status==='refunded'?'O estorno foi feito.':'O estorno será concluído pela nossa equipe.'}`,at:Date.now()}));}catch{}location.reload();}catch(error){if(target)target.textContent=error.message;}return;}
   if(form.id==='platform-erase'){event.preventDefault();const payload={password:new FormData(form).get('password'),confirmed:true};try{await syncUI.runAfterSync(async()=>{await send('account/erase',payload,'POST');await syncUI.clearCopies();await globalThis.mentraNativeClearCache?.();try{sessionStorage.setItem('mentra-account-notice',JSON.stringify({message:'Seus dados foram apagados. A conta continua ativa.',at:Date.now()}));}catch{}location.reload();});}catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}return;}
   if(!['platform-password','platform-delete'].includes(form.id))return;event.preventDefault();const payload=Object.fromEntries(new FormData(form));if(form.id==='platform-delete')payload.confirmed=true;
   try{await syncUI.runAfterSync(async()=>{await send(form.id==='platform-password'?'account/password':'account',payload,form.id==='platform-password'?'POST':'DELETE');await syncUI.clearCopies();if(form.id==='platform-delete')await globalThis.mentraNativeClearCache?.();try{sessionStorage.setItem('mentra-auth-notice',JSON.stringify({message:form.id==='platform-password'?'Senha alterada. Entre com a nova senha.':'Conta excluída. Obrigado por ter usado a Mentra.',at:Date.now()}));}catch{}location.reload();});}
   catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}
  },true);
  document.addEventListener('click',async event=>{
   if(event.target.closest('[data-account="backup"]')){try{await syncUI.runAfterSync(async()=>{const snapshot=await api('state');await saveFile('mentra-copia-restauracao.json',accountRecoveryJson(snapshot,platform.user),'application/json');});}catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}return;}
   if(event.target.closest('[data-account="export"]')){try{await syncUI.runAfterSync(async()=>{const data=await api('account/export');await saveFile('mentra-meus-dados.json',JSON.stringify(data,null,2),'application/json');});}catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}return;}
   const consent=event.target.closest('[data-consent]');
   if(consent){const target=document.querySelector('#account-error');consent.disabled=true;try{const result=await send('account/consents',{[consent.dataset.consent]:consent.dataset.value==='true'},'POST');Object.assign(platform.user,result.user);window.dispatchEvent(new HashChangeEvent('hashchange'));}catch(error){if(target)target.textContent=error.message;else alert(error.message);}finally{if(consent.isConnected)consent.disabled=false;}return;}
   if(event.target.closest('[data-account="erase-health"]')){const target=document.querySelector('#account-error');if(!confirm('Apagar todos os registros de saúde e bem-estar? Esta ação não pode ser desfeita.'))return;try{if(!globalThis.mentraEraseHealth?.())throw Error('Não foi possível apagar agora. Tente novamente.');if(target)target.textContent='Registros de saúde apagados.';}catch(error){if(target)target.textContent=error.message;}return;}
   const button=event.target.closest('[data-platform-plan]');if(!button)return;button.disabled=true;
   const feedback=document.querySelector('#payment-error');if(feedback)feedback.textContent='';
   try{await syncUI.runAfterSync(async()=>{
    const payload={plan:button.dataset.platformPlan};
    const terms=document.querySelector('#plans-accept-terms');if(terms&&!terms.checked)throw Error('Para pagar, marque que leu e aceita os Termos de Uso.');if(terms)payload.acceptTerms=true;
    if(!platform.paymentsConfigured){await send('subscription',payload);location.reload();return;}
    if(globalThis.mentraNative)throw Error('A contratação não está disponível no aplicativo.');
    const {order}=await send('six7pay/checkout',payload);if(payload.acceptTerms){platform.user.termsAccepted=true;terms?.closest('label')?.remove();}
    showPix(order,pix);
    document.querySelector('#payment-pix')?.scrollIntoView({behavior:'smooth',block:'center'});
   });}catch(error){if(feedback)feedback.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
  });
 }
}catch(error){document.querySelector('#app').textContent='Não foi possível abrir sua conta: '+error.message;}
