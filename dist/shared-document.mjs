import {api,send} from './platform.mjs';
import {escapeHtml as esc} from './core.mjs';

export function createSharedDocumentUI({root,token,api:read=api,send:write=send,download}={}){
 let busy=false,access=null,user=null;
 const error=message=>{const target=root.querySelector('#shared-error');if(target)target.textContent=message;};
 const retry='<p id="shared-error" role="alert"></p><button type="button" class="outline" data-shared="retry">Conferir novamente</button><a class="text-link" href="/">Abrir meu painel</a>';
 function login(){root.innerHTML='<section class="card"><p class="eyebrow">CONTA DESTINATÁRIA</p><h1>Este documento tem um destino certo.</h1><p>Entre na conta que recebeu o acesso. O link sozinho não permite baixar o original.</p><form id="shared-login" class="shared-form"><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Senha<input name="password" type="password" minlength="12" maxlength="128" autocomplete="current-password" required></label><p id="shared-error" role="alert"></p><button type="submit" class="primary">Entrar e conferir acesso</button></form><a class="text-link" href="/">Recuperar meu acesso pelo painel</a></section>';}
 async function start(){if(busy)return;busy=true;access=null;
  try{
   if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('O endereço está incompleto. Peça o link original ao remetente.');
   try{const me=await read('me');user=me.user;}catch(e){if(e.status===401){login();return;}throw e;}
   access=await write('document-shares/access',{token});
   root.innerHTML=`<section class="card"><p class="eyebrow">COMPARTILHADO POR ${esc(access.ownerName)}</p><h1>${esc(access.title)}</h1><p>${esc(access.filename)} · ${Math.ceil(access.size/1024)} KB</p><p class="shared-note">Acesso pela conta ${esc(user.email)} até ${esc(new Date(access.expiresAt).toLocaleString('pt-BR'))}.</p><p>Você pode baixar o original. As anotações e os demais documentos do remetente permanecem privados.</p><p id="shared-error" role="alert"></p><button type="button" class="primary" data-shared="download">Baixar original</button><a class="text-link" href="/">Abrir meu painel</a></section>`;
  }catch(e){root.innerHTML=`<section class="card"><p class="eyebrow">DOCUMENTO PRIVADO</p><h1>Não foi possível abrir este acesso.</h1><p>${esc(e.message)}</p>${user?`<p class="shared-note">Conta atual: ${esc(user.email)}. Se o link foi enviado a outra conta, entre nela pelo painel e volte a este endereço.</p>`:''}${retry}</section>`;}
  finally{busy=false;}
 }
 root.addEventListener('submit',async event=>{if(event.target.id!=='shared-login')return;event.preventDefault();if(busy)return;const form=event.target;if(!form.checkValidity()){form.reportValidity();return;}busy=true;const button=form.querySelector('button');button.disabled=true;
  try{await write('login',Object.fromEntries(new FormData(form)));busy=false;await start();}catch(e){error(e.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
 });
 root.addEventListener('click',async event=>{const button=event.target.closest('[data-shared]');if(!button||busy)return;if(button.dataset.shared==='retry'){await start();return;}if(button.dataset.shared!=='download'||!access)return;busy=true;button.disabled=true;error('');
  try{await download(token,access.filename);error('Download solicitado. Novos downloads continuam sujeitos à validade e à revogação do acesso.');}catch(e){error(e.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
 });
 return {start};
}
export async function downloadSharedDocument(token,filename){
 const response=await fetch('/api/document-shares/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,confirmed:true}),credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
 if(!response.ok){let result;try{result=await response.json();}catch{}throw Error(result?.error||'Não foi possível baixar o original. Confira a conta e o acesso.');}
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.rel='noreferrer';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
if(typeof document!=='undefined'){
 const root=document.querySelector('#shared-document');if(root){const token=location.hash.slice(1);const ui=createSharedDocumentUI({root,token,download:downloadSharedDocument});void ui.start();}
}
