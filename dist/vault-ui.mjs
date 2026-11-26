import {escapeHtml as esc,id as newId} from './core.mjs';
import {isVault,createVault,unlockVault,encryptEntry,decryptEntry,changeMaster,checkMaster,generatePassword,passwordStrength,MIN_MASTER_LENGTH} from './vault-core.mjs';

const IDLE_LOCK_MS=5*60*1000,HIDDEN_LOCK_MS=60*1000;
const btn=(label,action,itemId='',style='outline',extra='')=>`<button type="button" class="${style}" data-action="vault-${action}" ${itemId?`data-id="${esc(itemId)}"`:''} ${extra}>${label}</button>`;
const pwField=(name,label,extra='')=>`<label for="vault-${name}">${label}</label><div class="vault-pw-field"><input id="vault-${name}" name="${name}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" ${extra}><button type="button" class="outline small-button" data-action="vault-toggle-field" data-target="vault-${name}" aria-pressed="false">Mostrar</button></div>`;

export function createVaultUI(ctx){
 const {getState,setState,save,toast,render,modal,closeModal,isActive=()=>true}=ctx;
 let key=null,cache=new Map(),revealed=new Set(),query='',busy=false,pending=null,idleTimer=0,hiddenAt=0,decrypting=false,generation=0;
 const vault=()=>{const v=getState().vault;return isVault(v)?v:null;};
 const fail=message=>{const target=document.querySelector('#vault-error');if(target&&target.isConnected!==false)target.textContent=message;else toast(message);};
 const unlocked=()=>Boolean(key&&vault());

 function lock(silent=false){const was=Boolean(key);key=null;cache=new Map();revealed=new Set();pending=null;generation++;clearTimeout(idleTimer);if(was&&!silent){if(isActive())render();toast('Cofre trancado. Suas senhas continuam guardadas e cifradas.');}}
 function touch(){if(!key)return;clearTimeout(idleTimer);idleTimer=setTimeout(()=>lock(),IDLE_LOCK_MS);}
 if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(key&&hiddenAt&&Date.now()-hiddenAt>HIDDEN_LOCK_MS)lock();});

 function commit(next,message){
  if(new TextEncoder().encode(JSON.stringify(next)).length>4950000){fail('Sua conta atingiu o limite atual de 5 MB. Remova arquivos antes de continuar.');return false;}
  const previous=getState();setState(next);if(save()===false){setState(previous);fail('Não foi possível salvar. Seus dados anteriores foram mantidos.');return false;}
  closeModal();render();if(message)toast(message);return true;
 }
 const withVault=v=>({...getState(),vault:v});

 // Decifra em segundo plano os itens novos ou alterados (por outro aparelho, por exemplo).
 async function refreshCache(){
  if(decrypting||!unlocked())return;decrypting=true;const gen=generation,k=key;let changed=false;
  try{const items=vault().items;const ids=new Set(items.map(i=>i.id));for(const id of [...cache.keys()])if(!ids.has(id)){cache.delete(id);changed=true;}
   for(const item of items){const hit=cache.get(item.id);if(hit&&hit.iv===item.iv)continue;let data=null;try{data=await decryptEntry(k,item);}catch{data=null;}if(gen!==generation)return;cache.set(item.id,{iv:item.iv,data});changed=true;}
  }finally{decrypting=false;}
  if(changed&&gen===generation&&isActive())render();
 }
 const stale=()=>unlocked()&&(vault().items.some(i=>cache.get(i.id)?.iv!==i.iv)||cache.size!==vault().items.length);

 function setupMarkup(){return `<section class="card vault-card"><div class="section-head"><div><span class="eyebrow">COFRE DE SENHAS</span><h2>Suas senhas, trancadas com uma chave só sua.</h2><p class="muted small">Crie uma senha mestra. Ela cifra tudo neste aparelho antes de salvar: a Mentra, o servidor e a Mentra IA só enxergam texto embaralhado.</p></div></div>
 <form id="vault-setup-form" class="vault-form" novalidate>${pwField('master','Senha mestra',`required minlength="${MIN_MASTER_LENGTH}" maxlength="200"`)}<p class="small muted">Pelo menos ${MIN_MASTER_LENGTH} caracteres. Uma frase curta funciona bem, como “café forte às sete da manhã”.</p>${pwField('confirm','Repita a senha mestra',`required maxlength="200"`)}
 <label class="vault-check"><input type="checkbox" name="understood" required><span>Entendo que, se eu esquecer a senha mestra, <strong>ninguém consegue recuperar</strong> as senhas guardadas — nem a equipe Mentra.</span></label>
 <p id="vault-error" class="form-error" role="alert"></p><button type="submit" class="primary" ${busy?'disabled':''}>${busy?'Criando cofre…':'Criar meu cofre'}</button></form></section>`;}

 function lockedMarkup(v){const n=v.items.length;return `<section class="card vault-card"><div class="section-head"><div><span class="eyebrow">COFRE DE SENHAS · TRANCADO</span><h2>Digite sua senha mestra para abrir.</h2><p class="muted small">${n} ${n===1?'senha guardada':'senhas guardadas'} · cifradas neste aparelho. O cofre tranca sozinho após 5 minutos sem uso.</p></div></div>
 <form id="vault-unlock-form" class="vault-form" novalidate>${pwField('master','Senha mestra',`required maxlength="200" autofocus`)}<p id="vault-error" class="form-error" role="alert"></p><div class="vault-actions"><button type="submit" class="primary" ${busy?'disabled':''}>${busy?'Abrindo…':'Abrir cofre'}</button>${btn('Esqueci a senha mestra','request-reset','','text-link')}</div></form></section>`;}

 function entryMarkup(item){
  const hit=cache.get(item.id);if(!hit||hit.iv!==item.iv)return `<li class="vault-item muted">Abrindo…</li>`;
  if(!hit.data)return `<li class="vault-item"><div><strong>Item ilegível</strong><p class="small muted">Não foi possível decifrar este item com a senha mestra atual.</p></div><div class="vault-item-actions">${btn('Excluir','request-delete',item.id)}</div></li>`;
  const d=hit.data,show=revealed.has(item.id),strength=passwordStrength(d.password);
  const site=d.url?`<a class="small" href="${esc(/^https?:\/\//i.test(d.url)?d.url:'https://'+d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.url)}</a>`:'';
  return `<li class="vault-item"><div class="vault-item-main"><strong>${esc(d.title)}</strong>${d.username?`<span class="small">${esc(d.username)}</span>`:''}${site}<code class="vault-secret" aria-label="${show?'Senha visível':'Senha oculta'}">${show?esc(d.password):'••••••••••'}</code>${d.note?`<p class="small muted">${esc(d.note)}</p>`:''}<span class="vault-strength s${strength.score}">${esc(strength.label)}</span></div>
  <div class="vault-item-actions">${btn(show?'Ocultar':'Mostrar','reveal',item.id,'outline small-button',`aria-pressed="${show}"`)}${btn('Copiar senha','copy-password',item.id,'outline small-button')}${d.username?btn('Copiar usuário','copy-username',item.id,'outline small-button'):''}${btn('Editar','edit',item.id,'outline small-button')}${btn('Excluir','request-delete',item.id,'outline small-button')}</div></li>`;
 }

 function openMarkup(v){
  const words=query.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/\s+/).filter(Boolean);
  const items=[...v.items].sort((a,b)=>String(cache.get(a.id)?.data?.title||'').localeCompare(String(cache.get(b.id)?.data?.title||''),'pt-BR')).filter(i=>{if(!words.length)return true;const d=cache.get(i.id)?.data;if(!d)return false;const text=[d.title,d.username,d.url,d.note].join(' ').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();return words.every(w=>text.includes(w));});
  return `<section class="card vault-card"><div class="section-head"><div><span class="eyebrow">COFRE DE SENHAS · ABERTO</span><h2>Suas senhas</h2><p class="muted small">${v.items.length} ${v.items.length===1?'senha guardada':'senhas guardadas'} · cifradas neste aparelho · tranca sozinho após 5 minutos sem uso</p></div><div class="vault-actions">${btn('+ Nova senha','add','','primary small-button')}${btn('Trancar','lock','','outline small-button')}</div></div>
  <div class="document-toolbar vault-toolbar"><label class="search-field"><input id="vault-search" type="search" maxlength="200" placeholder="Buscar por nome, usuário ou site" aria-label="Buscar no cofre" value="${esc(query)}" autocomplete="off"></label>${btn('Gerar senha forte','generate','','outline small-button')}${btn('Trocar senha mestra','change-master','','outline small-button')}</div>
  ${items.length?`<ul class="vault-list">${items.map(entryMarkup).join('')}</ul>`:`<div class="empty-state"><p><strong>${v.items.length?'Nada encontrado.':'Nenhuma senha guardada ainda.'}</strong></p><p class="small muted">${v.items.length?'Tente outra palavra.':'Comece pelas que você mais esquece: banco, e-mail, Wi-Fi de casa.'}</p></div>`}</section>`;
 }

 function renderPage(){
  const v=vault();if(!v){if(key)lock(true);return setupMarkup();}
  if(!key)return lockedMarkup(v);
  if(stale())void refreshCache();
  return openMarkup(v);
 }

 function entryModal(itemId=''){
  const d=itemId?cache.get(itemId)?.data:null;if(itemId&&!d){toast('Este item não está disponível.');return;}
  pending={kind:'entry',id:itemId,gen:generation};
  modal(itemId?'Editar senha':'Guardar nova senha',`<form id="vault-entry-form" class="vault-form" novalidate>
  <label for="vault-title">Nome</label><input id="vault-title" name="title" required maxlength="120" placeholder="Ex.: Banco, E-mail pessoal, Wi-Fi de casa" value="${esc(d?.title||'')}" autocomplete="off">
  <label for="vault-username">Usuário ou e-mail <span class="muted small">(opcional)</span></label><input id="vault-username" name="username" maxlength="200" value="${esc(d?.username||'')}" autocomplete="off" autocapitalize="off" spellcheck="false">
  ${pwField('password','Senha','required maxlength="500"')}<div class="vault-inline"><span id="vault-strength" class="vault-strength small" aria-live="polite"></span>${btn('Gerar senha forte','fill-generated','','outline small-button')}</div>
  <label for="vault-url">Site ou app <span class="muted small">(opcional)</span></label><input id="vault-url" name="url" maxlength="500" placeholder="Ex.: meubanco.com.br" value="${esc(d?.url||'')}" autocomplete="off" autocapitalize="off" spellcheck="false">
  <label for="vault-note">Anotação <span class="muted small">(opcional)</span></label><textarea id="vault-note" name="note" maxlength="2000" rows="3">${esc(d?.note||'')}</textarea>
  <p id="vault-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="submit" class="primary">${itemId?'Salvar alterações':'Guardar senha'}</button></div></form>`);
  const input=document.querySelector('#vault-password');if(input&&d){input.value=d.password;updateStrength(d.password);}
 }
 function updateStrength(pw){const el=document.querySelector('#vault-strength');if(el){const s=passwordStrength(pw);el.textContent=s.label?'Força: '+s.label:'';el.className='vault-strength small s'+s.score;}}

 async function copy(text,label){try{await navigator.clipboard.writeText(text);toast(label+' copiado.');}catch{toast('Não foi possível copiar automaticamente. Toque em Mostrar e copie manualmente.');}}

 function handleClick(action,data){
  if(!action.startsWith('vault-'))return false;const k=action.slice(6),itemId=data.id||'';touch();
  if(k==='toggle-field'){const input=document.querySelector('#'+data.target),b=document.querySelector(`[data-target="${data.target}"]`);if(input){const show=input.type==='password';input.type=show?'text':'password';if(b){b.textContent=show?'Ocultar':'Mostrar';b.setAttribute('aria-pressed',String(show));}}return true;}
  if(k==='request-reset'){const v=vault();if(!v)return true;pending={kind:'reset'};modal('Apagar o cofre e começar de novo?',`<p>Sem a senha mestra, as <strong>${v.items.length} ${v.items.length===1?'senha guardada':'senhas guardadas'}</strong> não podem ser lidas por ninguém. Você pode apagar o cofre e criar um novo, vazio.</p><p class="small muted">Esta ação não pode ser desfeita. Se lembrar a senha depois, ela não trará os itens de volta.</p><div class="modal-actions">${btn('Cancelar','cancel')}${btn('Apagar cofre','confirm-reset','','primary danger')}</div>`);return true;}
  if(k==='confirm-reset'){if(pending?.kind!=='reset')return true;pending=null;lock(true);commit(withVault(null),'Cofre apagado. Crie uma nova senha mestra para começar.');return true;}
  if(k==='cancel'){pending=null;closeModal();return true;}
  if(!unlocked()){if(k!=='generate'){toast('Abra o cofre primeiro.');return true;}}
  if(k==='lock'){lock();return true;}
  if(k==='add'){entryModal();return true;}
  if(k==='edit'){entryModal(itemId);return true;}
  if(k==='reveal'){if(revealed.has(itemId))revealed.delete(itemId);else revealed.add(itemId);render();return true;}
  if(k==='copy-password'||k==='copy-username'){const d=cache.get(itemId)?.data;if(d)void copy(k==='copy-password'?d.password:d.username,k==='copy-password'?'Senha':'Usuário');return true;}
  if(k==='fill-generated'){const input=document.querySelector('#vault-password');if(input){input.value=generatePassword();input.type='text';const b=document.querySelector('[data-target="vault-password"]');if(b){b.textContent='Ocultar';b.setAttribute('aria-pressed','true');}updateStrength(input.value);}return true;}
  if(k==='generate'){const pw=generatePassword();modal('Senha forte gerada',`<p class="small muted">20 caracteres aleatórios, gerados neste aparelho.</p><p><code class="vault-secret vault-generated">${esc(pw)}</code></p><div class="modal-actions">${btn('Copiar','copy-generated','','primary',`data-value="${esc(pw)}"`)}</div>`);return true;}
  if(k==='copy-generated'){void copy(data.value||'','Senha');return true;}
  if(k==='request-delete'){const d=cache.get(itemId)?.data;pending={kind:'delete',id:itemId,gen:generation};modal('Excluir esta senha?',`<p>${d?`<strong>${esc(d.title)}</strong> será removida do cofre.`:'Este item será removido do cofre.'}</p><p class="small muted">Esta ação não pode ser desfeita.</p><div class="modal-actions">${btn('Cancelar','cancel')}${btn('Excluir','confirm-delete',itemId,'primary danger')}</div>`);return true;}
  if(k==='confirm-delete'){if(pending?.kind!=='delete'||pending.id!==itemId||pending.gen!==generation)return true;pending=null;const v=vault();cache.delete(itemId);revealed.delete(itemId);commit(withVault({...v,items:v.items.filter(i=>i.id!==itemId)}),'Senha excluída do cofre.');return true;}
  if(k==='change-master'){pending={kind:'master',gen:generation};modal('Trocar senha mestra',`<form id="vault-master-form" class="vault-form" novalidate>${pwField('current','Senha mestra atual','required maxlength="200"')}${pwField('next','Nova senha mestra',`required minlength="${MIN_MASTER_LENGTH}" maxlength="200"`)}${pwField('confirm2','Repita a nova senha mestra','required maxlength="200"')}<p class="small muted">Todas as senhas são cifradas de novo com a nova chave, neste aparelho.</p><p id="vault-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="submit" class="primary">Trocar senha mestra</button></div></form>`);return true;}
  return true;
 }

 function handleSubmit(form){
  if(!form?.id?.startsWith('vault-'))return false;touch();
  const values=Object.fromEntries(new FormData(form));
  if(busy)return true;
  const run=async(task)=>{busy=true;const submit=form.querySelector?.('button[type="submit"]');if(submit)submit.disabled=true;try{await task();}catch(error){fail(error.message||'Não foi possível concluir.');}finally{busy=false;if(submit&&submit.isConnected!==false)submit.disabled=false;}};
  if(form.id==='vault-setup-form'){void run(async()=>{if(vault())throw Error('Você já tem um cofre. Abra-o com sua senha mestra.');checkMaster(values.master,values.confirm);if(values.understood!=='on')throw Error('Confirme que entendeu que a senha mestra não pode ser recuperada.');const {vault:v,key:k}=await createVault(values.master);if(commit(withVault(v),'Cofre criado e aberto. Guarde sua senha mestra em um lugar seguro.')){key=k;cache=new Map();touch();render();}});return true;}
  if(form.id==='vault-unlock-form'){void run(async()=>{const v=vault();if(!v)throw Error('Cofre não encontrado.');const k=await unlockVault(v,values.master);key=k;cache=new Map();revealed=new Set();generation++;touch();await refreshCache();render();});return true;}
  if(form.id==='vault-entry-form'){const p=pending;void run(async()=>{if(!unlocked()||p?.kind!=='entry'||p.gen!==generation)throw Error('O cofre foi trancado. Abra-o de novo para salvar.');const v=vault(),old=p.id?v.items.find(i=>i.id===p.id):null;if(p.id&&!old)throw Error('Este item foi removido em outro aparelho.');const item=await encryptEntry(key,values,{id:p.id||newId(),createdAt:old?.createdAt});const now=vault();const items=p.id?now.items.map(i=>i.id===p.id?item:i):[...now.items,item];pending=null;if(commit(withVault({...now,items}),p.id?'Senha atualizada no cofre.':'Senha guardada no cofre.'))void refreshCache();else pending=p;});return true;}
  if(form.id==='vault-master-form'){void run(async()=>{if(!unlocked())throw Error('Abra o cofre primeiro.');const v=vault();const current=await unlockVault(v,values.current);checkMaster(values.next,values.confirm2);const {vault:fresh,key:k}=await changeMaster(v,current,values.next);if(commit(withVault(fresh),'Senha mestra trocada. Use a nova senha da próxima vez.')){key=k;cache=new Map();touch();void refreshCache();}});return true;}
  return true;
 }

 function handleInput(event){
  const t=event.target;if(t?.id==='vault-search'){touch();query=t.value;const pos=t.selectionStart;render();const next=document.querySelector('#vault-search');if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch{}}return true;}
  if(t?.id==='vault-password'){touch();updateStrength(t.value);return true;}
  return false;
 }

 return {renderPage,handleClick,handleSubmit,handleInput,lock,cancelPending(){pending=null;},isUnlocked:unlocked};
}
