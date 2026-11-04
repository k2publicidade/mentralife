import {api as platformApi,send as platformSend} from './platform.mjs';
import {escapeHtml as esc} from './core.mjs';

const action=(label,key,style='outline',extra='')=>`<button type="button" class="${style}" data-action="share-${key}" ${extra}>${label}</button>`;
const stamp=value=>new Date(value).toLocaleString('pt-BR');
export function createDocumentSharesUI(ctx){
 const api=ctx.api||platformApi,send=ctx.send||platformSend;
 let generation=0,current=null,busy=false;
 const find=id=>ctx.getState().documents.find(d=>d.id===id&&!d.trashed);
 const error=message=>{const el=document.querySelector('#share-error');if(el)el.textContent=message;};
 function cancelPending(){generation++;current=null;busy=false;}
 function show(body){ctx.modal('Acessos privados ao documento',body+'<p id="share-error" class="form-error" role="alert" tabindex="-1"></p>');}
 async function run(work){if(busy)return;busy=true;const version=generation;error('');const form=document.querySelector('#share-create-form'),buttons=document.querySelectorAll?.('.modal [data-action^="share-"]')||[];for(const b of buttons)b.disabled=true;if(form?.querySelector)form.querySelector('button[type=submit]').disabled=true;
  try{await work(()=>version===generation);}catch(e){if(version===generation)error(e.message);}finally{if(version===generation){busy=false;for(const b of document.querySelectorAll?.('.modal [data-action^="share-"]')||[])b.disabled=false;const submit=document.querySelector('#share-create-form button[type=submit]');if(submit)submit.disabled=false;}}
 }
 function listMarkup(doc,shares){return `<p><strong>${esc(doc.title)}</strong></p><p class="form-help">Somente o original será compartilhado. Anotações, texto de busca e os demais dados da conta ficam privados.</p><form id="share-create-form" data-id="${esc(doc.id)}" class="form-stack"><label>E-mail da conta destinatária<input type="email" name="recipientEmail" autocomplete="off" maxlength="254" required></label><label>Validade do acesso<select name="hours"><option value="1">Uma hora</option><option value="24" selected>Um dia</option><option value="168">Sete dias</option></select></label><button type="submit" class="primary">Revisar destinatário e acesso</button></form><section class="share-history"><h3>Acessos deste documento</h3>${shares.length?shares.map(s=>`<article><div><strong>${esc(s.recipient_name)}</strong><p>${esc(s.recipient_email)}</p><small>${esc(({active:'Ativo',expired:'Expirado',revoked:'Revogado'})[s.status])} · até ${esc(stamp(s.expires_at))}</small></div>${s.status==='active'?action('Revogar','revoke-review','outline',`data-id="${esc(s.id)}"`):''}</article>`).join(''):'<p class="muted">Nenhum acesso criado.</p>'}</section><p class="form-help">A pessoa precisa ter uma conta Mentra e entrar nela para baixar. A posse do link não permite acesso por outra conta. Confira a identidade por um canal de confiança: o cadastro ainda não verifica titularidade de e-mail.</p>`;}
 async function open(documentId){cancelPending();const doc=find(documentId);if(!doc||!(doc.fileData||doc.pdfData))return;current={kind:'list',documentId,shares:[]};show('<p role="status">Carregando os acessos deste documento…</p>');await run(async valid=>{if(!await ctx.flush())throw Error('Resolva a sincronização antes de compartilhar.');const result=await api('document-shares?documentId='+encodeURIComponent(documentId));if(!valid())return;current={kind:'list',documentId,shares:result.shares};show(listMarkup(doc,result.shares));});}
 function reviewMarkup(p){return `<div class="share-review"><p class="eyebrow">CONFIRA O DESTINO</p><h3>${esc(p.document.title)}</h3><p>${esc(p.document.filename)} · ${Math.ceil(p.document.size/1024)} KB</p><dl><div><dt>Conta destinatária</dt><dd>${esc(p.recipient.name)}<br>${esc(p.recipient.email)}</dd></div><div><dt>Permissão</dt><dd>Baixar o original, sem editar seus dados</dd></div><div><dt>Validade</dt><dd>${p.hours===1?'Uma hora':p.hours===24?'Um dia':'Sete dias'} após criar o link</dd></div></dl><p class="form-help">Revogar impede novos downloads. Cópias já baixadas não podem ser recolhidas. Mover para a lixeira, excluir ou alterar o original revoga estes links, mesmo se restaurar depois.</p><div class="modal-actions">${action('Voltar','back')}${action('Confirmar e criar link','confirm','primary')}</div></div>`;}
 function handleClick(key,data){if(!key.startsWith('share-'))return false;
  if(key==='share-open'){void open(data.id);return true;}
  if(key==='share-close'){ctx.closeModal();return true;}
  if(key==='share-back'&&current){void open(current.documentId);return true;}
  if(key==='share-copy'&&current?.kind==='created'){void run(async valid=>{if(!navigator.clipboard?.writeText)throw Error('Selecione o link e copie pelo menu do aparelho.');await navigator.clipboard.writeText(current.link);if(valid())error('Link copiado. Envie apenas à pessoa destinatária.');});return true;}
  if(key==='share-revoke-review'&&current?.kind==='list'){const row=current.shares.find(s=>s.id===data.id&&s.status==='active');if(!row)return true;current={kind:'revoke',documentId:current.documentId,shareId:row.id};show(`<p>Revogar o acesso de <strong>${esc(row.recipient_name)}</strong> (${esc(row.recipient_email)})?</p><p>Isso impede novos downloads pelo link. Cópias já baixadas permanecem com a pessoa.</p><div class="modal-actions">${action('Voltar','back')}${action('Confirmar revogação','revoke-confirm','primary')}</div>`);return true;}
  if(key==='share-revoke-confirm'&&current?.kind==='revoke'){const chosen={...current};void run(async valid=>{await send('document-shares/'+chosen.shareId,{confirmed:true},'DELETE');if(!valid())return;busy=false;await open(chosen.documentId);});return true;}
  if(key==='share-confirm'&&current?.kind==='review'){
   const selection=current;
   if(!selection.attempt){const bytes=crypto.getRandomValues(new Uint8Array(32));selection.attempt={requestId:crypto.randomUUID(),clientToken:Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')};}
   void run(async valid=>{if(!await ctx.flush())throw Error('Resolva a sincronização antes de criar o acesso.');const p=selection.preview,created=await send('document-shares',{documentId:p.document.id,recipientId:p.recipient.id,signature:p.signature,revision:p.revision,hours:p.hours,confirmed:true,...selection.attempt});if(!valid())return;
    const link=new URL(created.url);if(link.origin!==location.origin||link.pathname!=='/share')throw Error('Endereço de compartilhamento inválido.');current={kind:'created',documentId:selection.documentId,link:created.url};
    show(`<p>Acesso criado para <strong>${esc(created.recipient.name)}</strong> (${esc(created.recipient.email)}).</p><p class="form-help">Expira em ${esc(stamp(created.expiresAt))}. A pessoa precisa entrar na conta destinatária para baixar.</p><label>Link privado<input class="share-link" readonly value="${esc(created.url)}" aria-label="Link privado"></label><div class="modal-actions">${action('Copiar link','copy','primary')}${action('Ver acessos','back')}</div><p class="form-help">O endereço fica disponível nesta janela. Se perdê-lo, revogue o acesso e crie outro link.</p>`);
   });return true;
  }
  return true;
 }
 function handleSubmit(form){if(form.id!=='share-create-form')return false;if(!form.checkValidity()){form.reportValidity();return true;}if(!current||current.documentId!==form.dataset.id||current.kind!=='list')return true;const values=Object.fromEntries(new FormData(form));
  void run(async valid=>{if(!await ctx.flush())throw Error('Resolva a sincronização antes de revisar.');const preview=await send('document-shares/preview',{documentId:form.dataset.id,recipientEmail:values.recipientEmail,hours:Number(values.hours)});if(!valid())return;current={kind:'review',documentId:form.dataset.id,preview};show(reviewMarkup(preview));});return true;
 }
 return {handleClick,handleSubmit,cancelPending,open};
}
