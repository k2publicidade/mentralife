import {saveFile} from './file-save.mjs';
import {accountRecoveryJson} from './backup.mjs';
import {setTimeZone} from './time.mjs';
import {startPlatform,api,send} from './platform.mjs';
import {accountState} from './account-state.mjs';
import {openDraftStore,memoryDraftStore} from './draft-store.mjs';
import {createSyncController} from './sync-controller.mjs';
import {installSyncUI} from './sync-ui.mjs';
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
  document.addEventListener('submit',async event=>{
   const form=event.target;if(!['platform-password','platform-delete'].includes(form.id))return;event.preventDefault();const payload=Object.fromEntries(new FormData(form));
   try{await syncUI.runAfterSync(async()=>{await send(form.id==='platform-password'?'account/password':'account',payload,form.id==='platform-password'?'POST':'DELETE');if(form.id==='platform-delete')await syncUI.clearCopies();location.reload();});}
   catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}
  },true);
  document.addEventListener('click',async event=>{
   if(event.target.closest('[data-account="backup"]')){try{await syncUI.runAfterSync(async()=>{const snapshot=await api('state');await saveFile('mentra-copia-restauracao.json',accountRecoveryJson(snapshot,platform.user),'application/json');});}catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}return;}
   if(event.target.closest('[data-account="export"]')){try{await syncUI.runAfterSync(async()=>{const data=await api('account/export');await saveFile('mentra-meus-dados.json',JSON.stringify(data,null,2),'application/json');});}catch(error){const target=document.querySelector('#account-error');if(target)target.textContent=error.message;}return;}
   const button=event.target.closest('[data-platform-plan]');if(!button)return;button.disabled=true;
   try{await syncUI.runAfterSync(async()=>{await send('subscription',{plan:button.dataset.platformPlan});location.reload();});}catch(error){document.querySelector('.sync-status').textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
  });
 }
}catch(error){document.querySelector('#app').textContent='Não foi possível abrir sua conta: '+error.message;}
