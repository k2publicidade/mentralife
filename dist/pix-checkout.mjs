import {escapeHtml as esc} from './core.mjs';

// PIX checkout panel for Six7Pay. The server holds the API key; this only shows
// the code and asks the server for the order status until it is paid.
const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let timer=null;

function stop(){clearTimeout(timer);timer=null;}

function markup(order,plans){
 const plan=plans.find(p=>p.id===order.plan)?.name||order.plan;
 const head=`<span class="eyebrow">PAGAMENTO VIA PIX</span><h2>${esc(plan)} · ${money(order.amount)}</h2>`;
 if(order.status==='paid')return `${head}<p class="pix-status pix-ok" role="status">Pagamento confirmado. Seu acesso foi liberado por 30 dias.</p>`;
 if(order.status==='canceled'||order.status==='failed')return `${head}<p class="pix-status" role="status">${order.status==='failed'?'Não foi possível gerar este PIX.':'Este PIX expirou sem pagamento.'} Escolha o plano novamente para gerar um novo código.</p>`;
 if(!order.pixCode&&!order.qrImage)return `${head}<p class="pix-status" role="status">Gerando seu PIX. Isso leva alguns segundos…</p>`;
 return `${head}<div class="pix-body">${order.qrImage?`<img class="pix-qr" src="${esc(order.qrImage)}" width="220" height="220" alt="QR Code do PIX">`:''}<div class="pix-steps"><p>Abra o app do seu banco, escolha <b>PIX</b> e ${order.qrImage?'leia o QR Code ou ':''}use o código copia e cola.</p>${order.pixCode?`<label class="pix-code">PIX copia e cola<textarea readonly rows="4" spellcheck="false">${esc(order.pixCode)}</textarea></label><button type="button" class="primary" data-pix-copy>Copiar código PIX</button>`:''}<p class="pix-status" role="status">Aguardando o pagamento. Esta tela atualiza sozinha quando o banco confirmar.</p></div></div>`;
}

export function showPix(order,{plans,api,onPaid}){
 stop();
 const target=document.querySelector('#payment-pix');
 if(!target||!order)return;
 target.hidden=false;
 target.innerHTML=markup(order,plans);
 if(order.status==='paid'){setTimeout(onPaid,1800);return;}
 if(!['pending','unknown'].includes(order.status))return;
 if(!target.dataset.pixReady){
  target.dataset.pixReady='1';
  target.addEventListener('click',async event=>{
   if(!event.target.closest('[data-pix-copy]'))return;
   const code=target.querySelector('.pix-code textarea');if(!code)return;
   try{await navigator.clipboard.writeText(code.value);}catch{code.select();document.execCommand?.('copy');}
   event.target.textContent='Código copiado';
  });
 }
 const wait=order.pixCode||order.qrImage?5000:2500;
 timer=setTimeout(async()=>{
  if(!target.isConnected)return stop();
  try{const {order:next}=await api('six7pay/order');if(next&&next.id===order.id)showPix(next,{plans,api,onPaid});else showPix(order,{plans,api,onPaid});}
  catch{timer=setTimeout(()=>showPix(order,{plans,api,onPaid}),10000);}
 },wait);
}

// Shows an open PIX again when the person comes back to the plans page.
export async function resumePix({plans,api,onPaid}){
 if(!document.querySelector('#payment-pix'))return;
 try{const {order}=await api('six7pay/order');if(order&&['pending','unknown'].includes(order.status))showPix(order,{plans,api,onPaid});}catch{}
}
