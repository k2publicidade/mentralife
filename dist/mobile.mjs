export function keyboardVisible(layoutHeight, viewportHeight, focusedTag){
 return /^(INPUT|TEXTAREA|SELECT)$/.test(focusedTag||'') && layoutHeight-viewportHeight>150;
}

export function installMobileShell(){
 const root=document.documentElement;
 const standalone=()=>Boolean(globalThis.mentraNative||navigator.standalone||matchMedia('(display-mode: standalone)').matches);
 const viewport=()=>{
  const view=window.visualViewport;
  root.style.setProperty('--app-height',`${view?.height||window.innerHeight}px`);
  root.style.setProperty('--viewport-top',`${view?.offsetTop||0}px`);
  root.classList.toggle('keyboard-open',keyboardVisible(window.innerHeight,view?.height||window.innerHeight,document.activeElement?.tagName));
 };
 viewport();window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
 window.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>setTimeout(viewport,0));
 const notice=document.createElement('div');notice.className='connection-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 notice.textContent='Sem conexão. Alterações nesta sessão ficam pendentes de sincronização. Mantenha o app aberto até reconectar.';
 const connection=()=>{notice.hidden=navigator.onLine!==false;};connection();document.body.prepend(notice);
 window.addEventListener('online',connection);window.addEventListener('offline',connection);
 let prompt;
 const button=document.createElement('button');button.type='button';button.className='mobile-install';button.textContent='Instalar app';
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 function place(){root.classList.toggle('app-installed',standalone());button.hidden=standalone()||(!prompt&&!ios);const target=document.querySelector('.top-actions, .portal-nav');if(target&&button.parentElement!==target)target.append(button);}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;place();});
 window.addEventListener('appinstalled',()=>{prompt=null;place();});
 matchMedia('(display-mode: standalone)').addEventListener('change',place);
 button.addEventListener('click',async()=>{
  if(prompt){const deferred=prompt;prompt=null;try{await deferred.prompt();await deferred.userChoice;}catch{}place();return;}
  const previous=document.activeElement,backdrop=document.createElement('div');backdrop.className='install-help';
  backdrop.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="install-title"><h2 id="install-title">Mentra na sua tela inicial</h2><p>No Safari, abra o menu Compartilhar e escolha “Adicionar à Tela de Início”. Confirme em “Adicionar”. Se estiver em outro navegador, abra este endereço no Safari.</p><p>Depois, abra a Mentra pelo ícone na tela inicial. Os lembretes dependem da permissão e da configuração da sua conta.</p><button type="button" class="primary">Entendi</button></section>';
  const close=()=>{backdrop.remove();previous?.focus();};backdrop.querySelector('button').onclick=close;
  backdrop.addEventListener('keydown',event=>{if(event.key==='Escape')close();if(event.key==='Tab'){event.preventDefault();backdrop.querySelector('button').focus();}});
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});document.body.append(backdrop);backdrop.querySelector('button').focus();
 });
 new MutationObserver(place).observe(document.querySelector('#app'),{childList:true,subtree:true});place();
 // One registration serves installation, offline fallback and existing push subscriptions.
 if(!globalThis.mentraNative&&globalThis.isSecureContext&&'serviceWorker' in navigator){
  navigator.serviceWorker.register('/push-sw.js',{scope:'/'}).catch(()=>{});
 }
}
