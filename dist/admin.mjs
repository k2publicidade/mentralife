// Admin Master — painel de administração da Mentra Life.
// Navegação por hash (#/inicio, #/contas?status=pending, #/planos, #/feedback, #/atividade).
// Toda permissão é conferida no Worker; esta tela só organiza as ações.
import {api,send,subscriptionLabel} from './platform.mjs';
import {escapeHtml as esc,parseMoney} from './core.mjs';
import {adminSession,showAdminLogin,showAdminDenied} from './admin-access.mjs';

const app=document.querySelector('#admin-app'),root=document.querySelector('#admin-content'),status=document.querySelector('#admin-status');
const navigation=document.querySelector('.admin-sections'),identity=document.querySelector('#admin-session'),topbar=document.querySelector('.am-top');
const titleEl=document.querySelector('#am-title'),subtitleEl=document.querySelector('#am-subtitle'),refreshBtn=document.querySelector('#am-refresh');

/* ---------- Ícones ---------- */
const P={
 home:'<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
 tag:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
 pulse:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4m0 3v.5"/>',
 spark:'<path d="m12 3 2.3 6.2L20.5 12l-6.2 2.3L12 20.5l-2.3-6.2L3.5 12l6.2-2.8z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
 logout:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3"/>',
 inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
 card:'<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
};
const ico=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]||''}</svg>`;

/* ---------- Formatação ---------- */
const fmtNum=n=>Number(n||0).toLocaleString('pt-BR');
const fmtDate=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
const fmtMoney=c=>c===null||c===undefined?'Preço a definir':(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const periodName=d=>({30:'mês',90:'trimestre',365:'ano'})[d]||`${fmtNum(d)} dias`;
const pricePreview=(regular,promo,days)=>regular===null||regular===undefined?'Preço a definir':promo!==null&&promo!==undefined&&promo<regular?`De ${fmtMoney(regular)} por ${fmtMoney(promo)} no 1º ${periodName(days)}`:`${fmtMoney(regular)} / ${periodName(days)}`;
const plural=(n,one,many)=>`${fmtNum(n)} ${n===1?one:many}`;
const initials=name=>String(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
const rtf=new Intl.RelativeTimeFormat('pt-BR',{numeric:'auto'});
function ago(ts){const s=(ts-Date.now())/1000,a=Math.abs(s);if(a<60)return 'agora mesmo';if(a<3600)return rtf.format(Math.round(s/60),'minute');if(a<86400)return rtf.format(Math.round(s/3600),'hour');if(a<86400*7)return rtf.format(Math.round(s/86400),'day');return new Date(ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});}
const effective=u=>u.status==='active'&&u.current_period_end&&u.current_period_end<Date.now()?'expired':u.status;
const TONE={active:'ok',pending:'warn',canceled:'danger',expired:'danger'};
const statusPill=s=>`<span class="am-pill ${TONE[s]||''}">${esc(subscriptionLabel(s))}</span>`;
const planName=id=>state.catalog.plans.find(p=>p.id===id)?.name||id||'—';
const planLimit=id=>state.catalog.plans.find(p=>p.id===id)?.monthlyRequests||0;

/* ---------- Estado ---------- */
const VIEWS={
 inicio:{label:'Visão geral',icon:'home',title:'Visão geral',sub:'O pulso da Mentra hoje e o que pede sua atenção.'},
 contas:{label:'Contas',icon:'users',title:'Contas e acessos',sub:'Encontre uma conta e libere o acesso em poucos cliques.'},
 planos:{label:'Planos',icon:'tag',title:'Planos',sub:'Nomes, preços e limites de IA exibidos no site.'},
 pagamentos:{label:'Pagamentos',icon:'card',title:'Pagamentos',sub:'Cobranças PIX da Six7Pay, saldo e estornos.'},
 cerebro:{label:'Cérebro da IA',icon:'spark',title:'Cérebro da Mentra',sub:'Oriente como a Mentra deve responder, no app e no WhatsApp.'},
 feedback:{label:'Feedback',icon:'chat',title:'Feedback dos testers',sub:'Relatos enviados pelo botão “Feedback” do app.'},
 atividade:{label:'Atividade',icon:'pulse',title:'Atividade',sub:'Tudo o que a administração alterou, em ordem.'},
};
const state={user:null,view:'inicio',catalog:{plans:[],revision:0},overview:null,users:{page:1,q:'',status:'',data:null},feedback:'novo',plansDirty:false};
let busy=false,toastTimer=0,drawer=null;

/* ---------- Avisos ---------- */
function notice(message,tone='ok'){clearTimeout(toastTimer);status.textContent=message;status.className='am-toast show'+(tone==='error'?' error':'');toastTimer=setTimeout(()=>{status.className='am-toast';},tone==='error'?7000:4200);}
function setBusy(button,on){if(!button)return;button.disabled=on;if(on)button.setAttribute('aria-busy','true');else button.removeAttribute('aria-busy');}

/* ---------- Sessão ---------- */
function hideAdministration(){navigation.hidden=true;identity.hidden=true;topbar.hidden=true;identity.replaceChildren();app.dataset.state='auth';closeDrawer(true);}
function accessError(error){
 if(error.status===401){hideAdministration();showAdminLogin(root,start,'Sua sessão terminou. Entre novamente para continuar.');return;}
 if(error.status===403){void start();return;}
 notice(error.message||'Algo deu errado. Tente novamente.','error');
}

/* ---------- Navegação ---------- */
function parseHash(){const m=location.hash.match(/^#\/([a-z]+)(?:\?(.*))?$/);const view=m&&VIEWS[m[1]]?m[1]:'inicio';return {view,params:new URLSearchParams(m?.[2]||'')};}
function renderNav(){
 const i=state.overview?.insights||{};const badges={contas:i.pending,feedback:i.feedbackNew};
 navigation.innerHTML=Object.entries(VIEWS).map(([id,v])=>`<a href="#/${id}" data-nav="${id}"${id===state.view?' aria-current="page"':''}>${ico(v.icon)}<span class="am-nav-label">${v.label}</span><span class="am-badge" aria-label="${badges[id]?plural(badges[id],'pendência','pendências'):''}">${badges[id]?fmtNum(badges[id]):''}</span></a>`).join('');
}
async function route(){
 if(!state.user)return;
 const {view,params}=parseHash();
 if(state.view==='planos'&&view!=='planos'&&state.plansDirty&&!confirm('Há alterações não salvas nos planos. Sair mesmo assim?')){history.replaceState(null,'','#/planos');return;}
 if(view!=='planos')state.plansDirty=false;
 closeDrawer(true);
 state.view=view;
 if(view==='contas'){const s=params.get('status')||'';state.users.status=['active','pending','canceled','expired'].includes(s)?s:'';if(params.has('q'))state.users.q=params.get('q');state.users.page=1;}
 for(const section of root.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==view;
 titleEl.textContent=VIEWS[view].title;subtitleEl.textContent=VIEWS[view].sub;document.title=`${VIEWS[view].title} · Admin Master · Mentra Life`;
 renderNav();
 await load(view);
}
async function load(view){
 try{
  if(view==='inicio')await renderOverview();
  else if(view==='contas')await renderUsers();
  else if(view==='planos')renderPlans();
  else if(view==='pagamentos')await renderPayments();
  else if(view==='cerebro')await renderBrain();
  else if(view==='feedback')await renderFeedback();
  else if(view==='atividade')await renderActivity();
 }catch(error){accessError(error);}
}
async function refreshOverview(){state.overview=await api('admin/overview');renderNav();}

/* ---------- Visão geral ---------- */
const skeleton=(rows=3,h=18)=>Array.from({length:rows},()=>`<div class="am-skel" style="height:${h}px;margin:10px 0"></div>`).join('');
async function renderOverview(){
 const el=root.querySelector('#admin-overview');
 if(!state.overview)el.innerHTML=`<div class="am-kpis">${'<div class="am-card am-kpi">'+skeleton(2,22)+'</div>'.repeat(1)}${'<div class="am-card am-kpi">'+skeleton(2,22)+'</div>'}${'<div class="am-card am-kpi">'+skeleton(2,22)+'</div>'}${'<div class="am-card am-kpi">'+skeleton(2,22)+'</div>'}</div>`;
 const [overview,activity]=await Promise.all([api('admin/overview'),api('admin/activity').catch(()=>({items:[]}))]);
 state.overview=overview;renderNav();
 const d=overview,i=d.insights||{},hour=new Date().getHours(),hello=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';
 const kpis=[
  [d.counts.users,'contas cadastradas','users','#/contas'],
  [d.counts.active,'assinaturas ativas','check','#/contas?status=active'],
  [i.newThisWeek,'novas contas em 7 dias','plus','#/contas'],
  [d.counts.monthlyRequests,'mensagens de IA no mês','spark','#/planos'],
 ];
 const todo=[
  i.pending&&{tone:'warn',icon:'key',title:plural(i.pending,'conta aguardando ativação','contas aguardando ativação'),text:'Novos cadastros começam aguardando. Ative para liberar a Mentra IA.',cta:'Revisar',href:'#/contas?status=pending'},
  i.feedbackNew&&{tone:'info',icon:'chat',title:plural(i.feedbackNew,'relato novo dos testers','relatos novos dos testers'),text:'Leia e marque como lido ou resolvido.',cta:'Ler relatos',href:'#/feedback'},
  i.expiringSoon&&{tone:'warn',icon:'clock',title:plural(i.expiringSoon,'acesso vence em até 7 dias','acessos vencem em até 7 dias'),text:'Renove antes do prazo para não interromper o uso.',cta:'Ver ativas',href:'#/contas?status=active'},
  i.expired&&{tone:'danger',icon:'alert',title:plural(i.expired,'acesso expirado','acessos expirados'),text:'Essas contas perderam o acesso à IA.',cta:'Ver expiradas',href:'#/contas?status=expired'},
 ].filter(Boolean);
 const activeTotal=Math.max(1,d.counts.active||0);
 const conn=[['Banco de dados',true,'Conectado'],['DeepSeek (IA)',d.integrations.deepseek,d.integrations.deepseek?'Chave configurada':'Aguardando chave'],['WhatsApp',d.integrations.whatsapp,d.integrations.whatsapp?'Configurado':'Aguardando conexão'],['Áudio',d.integrations.audio,d.integrations.audio?'Workers AI vinculado':'Aguardando Workers AI'],['Notificações push',d.integrations.push,d.integrations.push?'Chaves configuradas':'Aguardando configuração'],['Pagamentos',d.integrations.payments,d.integrations.payments?'Gateway configurado':'Aguardando gateway']];
 el.innerHTML=`
 <div class="am-greet"><div><h2>${hello}, ${esc(String(state.user.name||'').split(' ')[0]||'admin')}.</h2><p>${todo.length?`Você tem ${plural(todo.length,'item','itens')} para revisar.`:'Tudo em dia por aqui.'}</p></div><a class="am-btn ghost" href="#/contas">${ico('search')}Encontrar uma conta</a></div>
 <div class="am-kpis">${kpis.map(([n,t,ic,href])=>`<a class="am-card am-kpi" href="${href}"><span class="am-kpi-top">${esc(t)}${ico(ic)}</span><strong>${fmtNum(n)}</strong></a>`).join('')}</div>
 <div class="am-grid-2">
  <div class="am-stack">
   <section class="am-card" aria-labelledby="todo-title"><div class="am-card-head"><h2 id="todo-title">Precisa da sua atenção</h2></div><div class="am-card-body">
   ${todo.length?`<ul class="am-todo">${todo.map(t=>`<li><span class="am-todo-icon ${t.tone}">${ico(t.icon)}</span><span class="am-todo-text"><b>${t.title}</b><span>${t.text}</span></span><a class="am-btn ghost sm" href="${t.href}">${t.cta}</a></li>`).join('')}</ul>`:`<div class="am-alldone"><span class="am-todo-icon">${ico('check')}</span><div><b>Nada pendente.</b><p class="am-muted am-small">Contas, acessos e relatos estão em dia.</p></div></div>`}
   </div></section>
   <section class="am-card" aria-labelledby="recent-title"><div class="am-card-head"><h2 id="recent-title">Atividade recente</h2><a class="am-btn quiet sm" href="#/atividade">Ver tudo</a></div><div class="am-card-body">${feedMarkup(activity.items.slice(0,5))}</div></section>
  </div>
  <div class="am-stack">
   <section class="am-card" aria-labelledby="mix-title"><div class="am-card-head"><h2 id="mix-title">Assinantes ativos por plano</h2></div><div class="am-card-body"><div class="am-bars">
   ${state.catalog.plans.map(p=>{const n=i.activeByPlan?.[p.id]||0;return `<div class="am-bar-row"><div><span>${esc(p.name)}</span><b class="num">${fmtNum(n)}</b></div><div class="am-bar"><i style="width:${Math.round(n/activeTotal*100)}%"></i></div></div>`;}).join('')}
   </div></div></section>
   <section class="am-card" aria-labelledby="wa-title"><div class="am-card-head"><h2 id="wa-title">WhatsApp da Mentra</h2></div><div class="am-card-body" id="wa-gateway-body">${skeleton(2,20)}</div></section>
   <section class="am-card" aria-labelledby="conn-title"><div class="am-card-head"><h2 id="conn-title">Conexões da operação</h2></div><div class="am-card-body"><ul class="am-conn">${conn.map(([name,ok,label])=>`<li><span>${name}</span><span class="am-pill ${ok?'ok':'warn'}">${label}</span></li>`).join('')}</ul><p class="am-small am-muted" style="margin-top:12px">Uso contabilizado em ${esc(d.month)} (UTC). Chave configurada ainda precisa ser validada com o provedor.</p></div></section>
  </div>
 </div>`;
 void renderGateway();
}

/* ---------- WhatsApp da Mentra (sessão por QR Code) ---------- */
let gatewayTimer=null;
async function renderGateway(){
 clearTimeout(gatewayTimer);if(!root.querySelector('#wa-gateway-body'))return;
 let g;try{g=await api('admin/whatsapp');}catch{g=null;}
 const el=root.querySelector('#wa-gateway-body');if(!el)return;
 const line=(ok,label,text)=>`<p style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 10px"><span class="am-pill ${ok?'ok':'warn'}">${label}</span><span>${text}</span></p>`;
 if(!g)el.innerHTML='<p class="am-small am-muted">Não foi possível consultar o WhatsApp agora. Nova tentativa em instantes.</p>';
 else if(!g.configured)el.innerHTML=line(false,'Aguardando configuração','O segredo do gateway ainda não foi cadastrado no servidor.');
 else if(g.state==='open')el.innerHTML=line(true,'Conectado',`Número <b>+${esc(g.number||'')}</b>`)+`<p class="am-small am-muted">${plural(g.links,'conta conversa','contas conversam')} com a Mentra por este número. Cada pessoa é atendida somente com os dados da própria conta.</p><button type="button" class="am-btn danger sm" id="wa-gateway-logout" ${g.pendingCommand?'disabled':''}>${g.pendingCommand?'Desconectando…':'Desconectar e trocar número'}</button>`;
 else if(g.qr)el.innerHTML=line(false,'Aguardando leitura','Leia o QR Code com o celular da Mentra.')+`<img src="${esc(g.qr)}" width="240" height="240" alt="QR Code para conectar o WhatsApp da Mentra" style="display:block;margin:6px auto 12px;border-radius:12px;background:#fff;padding:8px"><p class="am-small am-muted">No celular: WhatsApp › Configurações › Dispositivos conectados › Conectar dispositivo. O código se renova sozinho.</p>`;
 else if(g.online)el.innerHTML=line(false,'Preparando','Gerando o QR Code de conexão…');
 else el.innerHTML=line(false,'Gateway desligado','O serviço que mantém o WhatsApp conectado não está respondendo.')+'<p class="am-small am-muted">Ligue o gateway no servidor. O QR Code aparece aqui assim que ele iniciar.</p>';
 const out=el.querySelector('#wa-gateway-logout');
 if(out)out.onclick=async()=>{if(!confirm('Desconectar o WhatsApp da Mentra? As pessoas deixam de ser atendidas até um novo QR Code ser lido.'))return;setBusy(out,true);try{await send('admin/whatsapp',{action:'logout'});}catch(error){alert(error.message);}void renderGateway();};
 gatewayTimer=setTimeout(renderGateway,g?.state==='open'&&!g.pendingCommand?30000:4000);
}

/* ---------- Cérebro da Mentra (orientações de resposta) ---------- */
async function renderBrain(){
 const el=root.querySelector('#admin-brain');el.innerHTML=`<section class="am-card"><div class="am-card-body">${skeleton(4,26)}</div></section>`;
 const g=await api('admin/brain');
 const area=(name,label,help,value,placeholder)=>`<label class="am-field"><span class="am-field-label">${label}</span><span class="am-help">${help}</span><textarea name="${name}" rows="8" maxlength="${g.limit}" placeholder="${esc(placeholder)}">${esc(value)}</textarea><span class="am-help" data-count="${name}"></span></label>`;
 el.innerHTML=`<form class="am-form" id="brain-form"><section class="am-card"><div class="am-card-head"><h2>Como a Mentra deve responder</h2></div><div class="am-card-body" style="display:grid;gap:22px">
  <p class="am-muted" style="margin:0">Escreva em linguagem simples, como orientaria uma pessoa da equipe. Vale para todas as contas a partir da próxima mensagem.</p>
  ${area('general','Orientações gerais','Tom de voz, tamanho das respostas, o que priorizar e o que evitar. Vale no aplicativo e no WhatsApp.',g.general,'Exemplo: Fale de forma acolhedora e direta, tratando a pessoa por você. Respostas curtas, com no máximo três parágrafos. Termine sugerindo um próximo passo quando fizer sentido.')}
  ${area('whatsapp','Somente no WhatsApp','Ajustes extras para as conversas pelo número de atendimento.',g.whatsapp,'Exemplo: Use frases curtas e, no máximo, um emoji por mensagem. Não use listas longas.')}
  <p class="am-small am-muted" style="margin:0">Estas orientações mudam o estilo das respostas. As proteções da Mentra continuam valendo sempre: cada pessoa só recebe dados da própria conta, nada de diagnósticos de saúde e os registros seguem as regras de confirmação.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="am-btn">Salvar orientações</button><button type="button" class="am-btn ghost" data-brain-reset>Descartar alterações</button></div>
 </div></section></form>`;
 const form=el.querySelector('#brain-form'),count=()=>{for(const t of form.querySelectorAll('textarea'))form.querySelector(`[data-count="${t.name}"]`).textContent=`${fmtNum(t.value.length)} de ${fmtNum(g.limit)} caracteres`;};
 form.addEventListener('input',count);count();
 form.querySelector('[data-brain-reset]').onclick=()=>{void renderBrain().catch(accessError);};
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button[type="submit"]');if(button.disabled)return;setBusy(button,true);
  try{const v=Object.fromEntries(new FormData(form));const saved=await send('admin/brain',{general:v.general,whatsapp:v.whatsapp,revision:g.revision},'PUT');g.revision=saved.revision;notice('Orientações salvas. A Mentra já responde com o novo estilo.');}
  catch(error){if(error.status===409)notice(error.message,'error');else accessError(error);}
  finally{if(button.isConnected)setBusy(button,false);}};
}

/* ---------- Atividade ---------- */
function describe(item){
 const who=item.actor?esc(item.actor.name||item.actor.email):'Uma conta removida';
 if(item.kind==='subscription'){const target=item.target?`<b>${esc(item.target.name)}</b> <span class="am-muted">(${esc(item.target.email)})</span>`:'<b>uma conta removida</b>';return {icon:'key',text:`${who} definiu ${target} como <b>${esc(subscriptionLabel(item.status))}</b> no plano ${esc(planName(item.plan))}.`};}
 if(item.kind==='payment_refund')return {icon:'card',text:`${who} estornou um pagamento PIX.`};
 if(item.kind==='plan_catalog_updated')return {icon:'tag',text:`${who} atualizou o catálogo de planos.`};
 if(item.kind==='brain_guidance_updated')return {icon:'spark',text:`${who} atualizou as orientações do cérebro da Mentra.`};
 if(item.kind==='feedback_status')return {icon:'chat',text:`${who} alterou a situação de um relato de feedback.`};
 if(item.kind==='whatsapp_gateway_logout')return {icon:'logout',text:`${who} desconectou a sessão do WhatsApp da Mentra.`};
 return {icon:'pulse',text:`${who} realizou uma ação administrativa.`};
}
function feedMarkup(items,grouped=false){
 if(!items.length)return `<div class="am-empty">${ico('pulse')}<b>Nenhuma ação registrada ainda.</b><span>Liberações de acesso e mudanças de planos aparecem aqui.</span></div>`;
 let lastDay='';
 return `<ul class="am-feed">${items.map(item=>{const d=describe(item),day=new Date(item.createdAt).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});const head=grouped&&day!==lastDay?`<li class="am-feed-day">${esc(day)}</li>`:'';lastDay=day;return `${head}<li><span class="am-feed-dot">${ico(d.icon)}</span><p>${d.text}</p><time datetime="${new Date(item.createdAt).toISOString()}" title="${new Date(item.createdAt).toLocaleString('pt-BR')}">${ago(item.createdAt)}</time></li>`;}).join('')}</ul>`;
}
async function renderActivity(){
 const el=root.querySelector('#admin-activity');el.innerHTML=`<section class="am-card"><div class="am-card-body">${skeleton(5,26)}</div></section>`;
 const {items}=await api('admin/activity');
 el.innerHTML=`<section class="am-card"><div class="am-card-body">${feedMarkup(items,true)}</div></section><p class="am-small am-muted" style="margin-top:12px">Mostrando as 30 ações administrativas mais recentes. Cada alteração fica registrada com quem a fez.</p>`;
}

/* ---------- Contas ---------- */
function usersShell(){
 const i=state.overview?.insights||{},c=state.overview?.counts||{};
 const chips=[['','Todas',c.users],['pending','Aguardando',i.pending],['active','Ativas',c.active],['expired','Expiradas',i.expired],['canceled','Canceladas',i.canceled]];
 return `<div class="am-toolbar">
  <div class="am-chips" role="group" aria-label="Filtrar por situação">${chips.map(([id,label,n])=>`<button type="button" class="am-chip" data-user-filter="${id}" aria-pressed="${id===state.users.status}">${label}${n===undefined?'':`<span class="n">${fmtNum(n)}</span>`}</button>`).join('')}</div>
  <form id="admin-search" class="am-search" role="search"><label>${ico('search')}<span>Buscar por nome ou e-mail</span><input name="query" type="search" maxlength="200" placeholder="Buscar por nome ou e-mail" aria-label="Buscar por nome ou e-mail" value="${esc(state.users.q)}"></label><button class="am-btn" type="submit">Buscar contas</button></form>
 </div><div id="admin-users"></div>`;
}
async function renderUsers(){
 const view=root.querySelector('#admin-accounts');
 if(!state.overview)await refreshOverview().catch(()=>{});
 view.innerHTML=usersShell();
 await loadUsers();
}
async function loadUsers(){
 const box=root.querySelector('#admin-users');if(!box)return;
 box.innerHTML=`<div class="am-card am-table-wrap"><div class="am-card-body">${skeleton(6,30)}</div></div>`;
 const {page,q,status:st}=state.users;
 const result=await api('admin/users?'+new URLSearchParams({page:String(page),q,...(st?{status:st}:{})}));
 state.users.data=result;
 const pages=Math.max(1,Math.ceil(result.total/result.pageSize));
 const label=st?` · filtro: ${({pending:'aguardando ativação',active:'ativas',expired:'expiradas',canceled:'canceladas'})[st]}`:'';
 box.innerHTML=`<p class="am-result">${result.total===1?'1 conta encontrada':`${fmtNum(result.total)} contas encontradas`}${q?` para “${esc(q)}”`:''}${label}</p>
 ${result.users.length?`<div class="am-card am-table-wrap"><table class="am-table"><thead><tr><th scope="col">Conta</th><th scope="col">Plano</th><th scope="col">Situação</th><th scope="col">Acesso até</th><th scope="col" class="am-col-usage">IA no mês</th><th scope="col" class="am-col-act"><span class="am-sr">Ações</span></th></tr></thead><tbody>
 ${result.users.map(u=>{const s=effective(u),limit=planLimit(u.plan),pct=limit?Math.min(100,Math.round(u.requests/limit*100)):0;return `<tr data-open-user="${esc(u.id)}" tabindex="0">
  <td class="am-col-who"><div class="am-who"><span class="am-avatar">${esc(initials(u.name))}</span><div><b>${esc(u.name)}${u.role==='admin'?'<span class="am-tag-admin">Admin</span>':''}</b><span>${esc(u.email)}</span></div></div></td>
  <td class="am-col-plan">${esc(planName(u.plan))}</td>
  <td class="am-col-status">${statusPill(s)}</td>
  <td class="am-col-end num">${s==='active'?fmtDate(u.current_period_end):s==='expired'?`venceu ${fmtDate(u.current_period_end)}`:'—'}</td>
  <td class="am-col-usage"><div class="am-usage"><span class="num">${fmtNum(u.requests)} de ${fmtNum(limit)}</span><div class="am-bar${pct>=100?' danger':pct>=80?' warn':''}"><i style="width:${pct}%"></i></div></div></td>
  <td class="am-col-act"><button type="button" class="am-btn ghost sm" data-open-user="${esc(u.id)}">Gerenciar</button></td>
 </tr>`;}).join('')}
 </tbody></table></div>
 <nav class="am-pager admin-pagination" aria-label="Páginas de contas"><span>Página ${result.page} de ${pages}</span><div><button type="button" class="am-btn ghost sm" data-admin-page="${page-1}" ${page<=1?'disabled':''}>← Anterior</button><button type="button" class="am-btn ghost sm" data-admin-page="${page+1}" ${page>=pages?'disabled':''}>Próxima →</button></div></nav>`
 :`<div class="am-card am-empty">${ico('users')}<b>Nenhuma conta corresponde à busca.</b><span>Confira a grafia do e-mail ou limpe os filtros.</span>${q||st?'<button type="button" class="am-btn ghost sm" data-clear-users>Limpar busca e filtros</button>':''}</div>`}`;
}

/* ---------- Gaveta de conta ---------- */
const PRESETS=[7,30,90,180,365];
function openDrawer(user){
 closeDrawer(true);
 const s=effective(user),opener=document.activeElement;
 const scrim=document.createElement('div');scrim.className='am-scrim';
 const panel=document.createElement('aside');panel.className='am-drawer';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','drawer-title');
 const limit=planLimit(user.plan),quickLabel=s==='active'?'Renovar por 30 dias':'Ativar por 30 dias';
 panel.innerHTML=`<header class="am-drawer-head"><span class="am-avatar lg">${esc(initials(user.name))}</span><div><h2 id="drawer-title">${esc(user.name)}</h2><p>${esc(user.email)}</p></div><button type="button" class="am-icon-btn" data-close-drawer aria-label="Fechar">${ico('close')}</button></header>
 <form data-user="${esc(user.id)}" class="am-form admin-user-form" style="display:contents">
 <div class="am-drawer-body">
  <dl class="am-facts">
   <div><dt>Situação</dt><dd>${statusPill(s)}</dd></div>
   <div><dt>Plano</dt><dd>${esc(planName(user.plan))}</dd></div>
   <div><dt>Acesso até</dt><dd class="num">${s==='active'||s==='expired'?fmtDate(user.current_period_end):'—'}</dd></div>
   <div><dt>IA neste mês</dt><dd class="num">${fmtNum(user.requests)} de ${fmtNum(limit)}</dd></div>
   <div><dt>Cadastro</dt><dd class="num">${fmtDate(user.created_at)}</dd></div>
   <div><dt>Tipo</dt><dd>${user.role==='admin'?'Administrador':'Assinante'}</dd></div>
  </dl>
  <div class="am-quick"><div><b>${quickLabel}</b><p>Mantém o plano ${esc(planName(user.plan))} e libera até ${fmtDate(Date.now()+30*86400000)}.</p></div><button type="button" class="am-btn sm" data-quick-activate>${s==='active'?'Renovar':'Ativar'}</button></div>
  <fieldset class="am-field"><legend>Plano</legend><div class="am-seg">${state.catalog.plans.map(p=>`<label class="am-opt"><input type="radio" name="plan" value="${esc(p.id)}" ${p.id===user.plan?'checked':''}><span>${esc(p.name)}<small>${fmtNum(p.monthlyRequests)} msgs/mês</small></span></label>`).join('')}</div></fieldset>
  <fieldset class="am-field"><legend>Situação</legend><div class="am-seg">${[['active','Ativo','Libera a IA'],['pending','Aguardando','Sem IA'],['canceled','Cancelado','Encerra']].map(([v,l,h])=>`<label class="am-opt st-${v}"><input type="radio" name="status" value="${v}" ${v===(s==='expired'?'active':user.status)?'checked':''}><span>${l}<small>${h}</small></span></label>`).join('')}</div></fieldset>
  <fieldset class="am-field" data-days-field><legend>Duração do acesso, a partir de hoje</legend><div class="am-seg wrap">${PRESETS.map(n=>`<label class="am-opt"><input type="radio" name="preset" value="${n}" ${n===30?'checked':''}><span>${n===365?'1 ano':`${n} dias`}</span></label>`).join('')}<label class="am-opt"><input type="radio" name="preset" value="custom"><span>Outro</span></label></div>
   <label class="am-custom-days" data-custom-days hidden>Quantidade de dias <input class="am-input" name="days" type="number" min="1" max="366" value="30" inputmode="numeric"></label></fieldset>
  <p class="am-preview" data-preview aria-live="polite"></p>
  <p class="am-note">${ico('info')}<span>Liberações manuais servem para homologação ou acesso concedido pela administração e não confirmam pagamento. Toda alteração fica registrada na Atividade.</span></p>
 </div>
 <footer class="am-drawer-foot"><button type="button" class="am-btn ghost" data-close-drawer>Cancelar</button><button class="am-btn" type="submit">Salvar acesso</button></footer>
 </form>`;
 document.body.append(scrim,panel);document.body.style.overflow='hidden';const shellEl=document.querySelector('.am');if(shellEl)shellEl.inert=true;
 const form=panel.querySelector('form');
 const update=()=>{
  const v=Object.fromEntries(new FormData(form)),active=v.status==='active',custom=v.preset==='custom';
  panel.querySelector('[data-days-field]').hidden=!active;panel.querySelector('[data-custom-days]').hidden=!(active&&custom);
  const days=custom?Number(v.days):Number(v.preset),plan=planName(v.plan);
  panel.querySelector('[data-preview]').textContent=active?(Number.isInteger(days)&&days>=1&&days<=366?`Ao salvar: ${plan}, ativo até ${fmtDate(Date.now()+days*86400000)}.`:'Informe entre 1 e 366 dias.'):v.status==='pending'?`Ao salvar: ${plan}, aguardando ativação. A conta fica sem acesso à IA.`:`Ao salvar: acesso cancelado. A conta fica sem acesso à IA.`;
 };
 form.addEventListener('change',update);form.addEventListener('input',update);update();
 drawer={scrim,panel,opener,user};
 requestAnimationFrame(()=>{scrim.classList.add('open');panel.classList.add('open');panel.querySelector('.am-drawer-head [data-close-drawer]').focus({preventScroll:true});});
 scrim.addEventListener('click',()=>closeDrawer());
 panel.addEventListener('click',e=>{if(e.target.closest('[data-close-drawer]'))closeDrawer();if(e.target.closest('[data-quick-activate]'))saveAccess(form,e.target.closest('button'),{plan:user.plan,status:'active',days:30});});
 panel.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeDrawer();return;}
  if(e.key!=='Tab')return;const f=[...panel.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.offsetParent!==null);if(!f.length)return;
  if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}
 });
 form.addEventListener('submit',e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));const days=v.status!=='active'?30:v.preset==='custom'?Number(v.days):Number(v.preset);if(v.status==='active'&&(!Number.isInteger(days)||days<1||days>366)){notice('Informe uma duração entre 1 e 366 dias.','error');return;}saveAccess(form,form.querySelector('[type="submit"]'),{plan:v.plan,status:v.status,days});});
}
function closeDrawer(instant=false){
 if(!drawer)return;const {scrim,panel,opener}=drawer;drawer=null;document.body.style.overflow='';const shellEl=document.querySelector('.am');if(shellEl)shellEl.inert=false;
 if(instant){scrim.remove();panel.remove();return;}
 scrim.classList.remove('open');panel.classList.remove('open');setTimeout(()=>{scrim.remove();panel.remove();},260);
 if(opener?.isConnected)opener.focus({preventScroll:true});
}
async function saveAccess(form,button,{plan,status:st,days}){
 if(busy)return;busy=true;setBusy(button,true);
 try{
  await send('admin/subscription',{userId:form.dataset.user,plan,status:st,days});
  const name=drawer?.user?.name||'a conta';closeDrawer();
  await Promise.all([refreshOverview(),loadUsers()]);
  const shell=root.querySelector('#admin-accounts .am-chips');if(shell){const holder=document.createElement('div');holder.innerHTML=usersShell();shell.replaceWith(holder.querySelector('.am-chips'));}
  notice(st==='active'?`Acesso de ${name} liberado até ${fmtDate(Date.now()+days*86400000)}.`:`Acesso atualizado. A alteração foi registrada na auditoria.`);
 }catch(error){accessError(error);}finally{busy=false;if(button?.isConnected)setBusy(button,false);}
}

/* ---------- Planos ---------- */
function renderPlans(){
 const el=root.querySelector('#admin-plans'),i=state.overview?.insights||{};
 el.innerHTML=`<div class="am-callout">${ico('info')}<span>Os valores aparecem no site assim que você salva. O preço promocional vale só para quem nunca teve um pagamento confirmado; os demais pagam o preço regular. Cada pagamento libera os dias do período, somados ao fim do acesso atual. Pedidos já gerados mantêm o valor e os dias com que foram criados.</span></div>
 <form id="catalog-form" class="am-form" novalidate>
 <div class="am-plans">${state.catalog.plans.map(p=>`<fieldset class="am-card am-plan" data-plan="${esc(p.id)}">
  <div class="am-plan-head"><h2 data-plan-title>${esc(p.name)}</h2><span class="am-pill plain">${fmtNum(i.activeByPlan?.[p.id]||0)} ativos</span></div>
  <label>Nome <input name="${p.id}.name" value="${esc(p.name)}" maxlength="60" required></label>
  <label>Descrição <small>Até 240 caracteres. Aparece no cartão do plano.</small><textarea name="${p.id}.description" maxlength="240" rows="3" required>${esc(p.description)}</textarea></label>
  <label>Dias liberados por pagamento <small>Ex.: 30 (mensal), 90 (trimestral), 365 (anual).</small><input name="${p.id}.days" type="number" min="1" max="730" value="${p.days}" required inputmode="numeric"></label>
  <label>Preço regular <small>Cobrado de quem já pagou antes. Deixe vazio para definir depois.</small><span class="am-money"><input name="${p.id}.price" value="${p.priceCents===null?'':(p.priceCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false})}" inputmode="decimal" placeholder="99,90" aria-label="Preço regular em R$"></span></label>
  <label>Preço promocional <small>Só no primeiro pagamento de quem nunca pagou. Vazio desliga a promoção.</small><span class="am-money"><input name="${p.id}.promo" value="${p.promoPriceCents==null?'':(p.promoPriceCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false})}" inputmode="decimal" placeholder="67,00" aria-label="Preço promocional em R$"></span></label>
  <label>Mensagens de IA por mês <input name="${p.id}.monthlyRequests" type="number" min="1" max="1000000" value="${p.monthlyRequests}" required></label>
  <div class="am-plan-preview" aria-hidden="true"><small>Como aparece no site</small><b data-plan-price>${esc(pricePreview(p.priceCents,p.promoPriceCents,p.days))}</b><span data-plan-limit>${fmtNum(p.monthlyRequests)} mensagens de IA por mês</span></div>
  <p class="am-small am-muted">Identificador interno: ${esc(p.id)}</p>
 </fieldset>`).join('')}</div>
 <div class="am-savebar" data-savebar><p data-save-state>Nenhuma alteração pendente.</p><div><button type="button" class="am-btn ghost" data-discard-plans disabled>Descartar</button><button class="am-btn" type="submit">Salvar os três planos</button></div></div>
 </form>`;
 state.plansDirty=false;
 const form=el.querySelector('form');
 form.addEventListener('input',e=>{
  state.plansDirty=true;el.querySelector('[data-savebar]').classList.add('dirty');el.querySelector('[data-save-state]').textContent='Alterações não salvas';el.querySelector('[data-discard-plans]').disabled=false;
  const card=e.target.closest('[data-plan]');if(!card)return;const id=card.dataset.plan,f=new FormData(form);
  card.querySelector('[data-plan-title]').textContent=f.get(id+'.name')||'Sem nome';
  const raw=String(f.get(id+'.price')||'').trim(),cents=raw?parseMoney(raw):null,rawPromo=String(f.get(id+'.promo')||'').trim(),promo=rawPromo?parseMoney(rawPromo):null;
  card.querySelector('[data-plan-price]').textContent=(raw&&cents===null)||(rawPromo&&promo===null)?'Preço inválido — use 99,90':pricePreview(cents,promo,Number(f.get(id+'.days'))||0);
  card.querySelector('[data-plan-limit]').textContent=`${fmtNum(Number(f.get(id+'.monthlyRequests'))||0)} mensagens de IA por mês`;
 });
 el.querySelector('[data-discard-plans]').onclick=()=>renderPlans();
}
async function savePlans(form){
 const raw=Object.fromEntries(new FormData(form));
 const plans=state.catalog.plans.map(p=>{
  const name=String(raw[p.id+'.name']||'').trim(),description=String(raw[p.id+'.description']||'').trim(),price=String(raw[p.id+'.price']||'').trim(),priceCents=price?parseMoney(price):null,promo=String(raw[p.id+'.promo']||'').trim(),promoPriceCents=promo?parseMoney(promo):null,days=Number(raw[p.id+'.days']),monthlyRequests=Number(raw[p.id+'.monthlyRequests']);
  if(!name||!description)throw Error(`Preencha nome e descrição do plano ${p.name}.`);
  if(price&&priceCents===null)throw Error(`Informe o preço regular do plano ${p.name} no formato 99,90.`);
  if(promo&&promoPriceCents===null)throw Error(`Informe o preço promocional do plano ${p.name} no formato 67,00.`);
  if(promoPriceCents!==null&&(priceCents===null||promoPriceCents>=priceCents))throw Error(`O preço promocional do plano ${p.name} precisa ser menor que o regular.`);
  if(!Number.isInteger(days)||days<1||days>730)throw Error(`Os dias do plano ${p.name} devem ficar entre 1 e 730.`);
  if(!Number.isInteger(monthlyRequests)||monthlyRequests<1||monthlyRequests>1000000)throw Error(`O limite de IA do plano ${p.name} deve ficar entre 1 e 1.000.000.`);
  return {id:p.id,name,description,days,priceCents,promoPriceCents,monthlyRequests};
 });
 state.catalog=await send('admin/plans',{plans,revision:state.catalog.revision},'PUT');
 state.plansDirty=false;renderPlans();
 notice('Planos atualizados no site e no controle de uso da IA.');
}

/* ---------- Feedback ---------- */
const KIND={sugestao:['Sugestão','info'],problema:['Problema','danger'],elogio:['Elogio','ok']};
const FSTATUS={novo:'Novo',lido:'Lido',resolvido:'Resolvido'};
async function renderFeedback(){
 const el=root.querySelector('#admin-feedback');
 el.innerHTML=`<div class="am-toolbar"><div class="am-chips" role="group" aria-label="Filtrar relatos">${[['novo','Novos'],['lido','Lidos'],['resolvido','Resolvidos'],['','Todos']].map(([id,label])=>`<button type="button" class="am-chip" data-feedback-filter="${id}" aria-pressed="${id===state.feedback}">${label}${id==='novo'&&state.overview?.insights?.feedbackNew?`<span class="n">${fmtNum(state.overview.insights.feedbackNew)}</span>`:''}</button>`).join('')}</div></div><div data-feedback-list><div class="am-card"><div class="am-card-body">${skeleton(4,24)}</div></div></div>`;
 await loadFeedback();
}
async function loadFeedback(){
 const list=root.querySelector('[data-feedback-list]');if(!list)return;
 try{
  const {items}=await api('admin/feedback'+(state.feedback?'?status='+state.feedback:''));
  list.innerHTML=items.length?`<ul class="admin-feedback-list">${items.map(item=>{const [kind,tone]=KIND[item.kind]||[item.kind,''];const next=item.status==='novo'?[['lido','Marcar como lido'],['resolvido','Resolver']]:item.status==='lido'?[['resolvido','Resolver'],['novo','Voltar para novo']]:[['novo','Reabrir']];return `<li class="am-card am-fb">
   <div class="am-fb-meta"><span class="am-pill ${tone}">${esc(kind)}</span><span class="am-avatar sm">${esc(initials(item.name))}</span><b>${esc(item.name)}</b><span>${esc(item.email)}</span><span>· Tela: <b>${esc(item.page)}</b></span><time datetime="${new Date(item.created_at).toISOString()}" title="${new Date(item.created_at).toLocaleString('pt-BR')}">${ago(item.created_at)}</time></div>
   <p class="am-fb-msg">${esc(item.message)}</p>
   <div class="am-fb-actions">${next.map(([id,label],n)=>`<button type="button" class="am-btn ${n?'ghost':''} sm" data-feedback-id="${esc(item.id)}" data-feedback-status="${id}">${label}</button>`).join('')}<span class="am-small am-muted">Situação: ${FSTATUS[item.status]||esc(item.status)}</span></div>
  </li>`;}).join('')}</ul>`:`<div class="am-card am-empty">${ico('inbox')}<b>${state.feedback==='novo'?'Nenhum relato novo.':'Nenhum relato nesta situação.'}</b><span>Os testers enviam relatos pelo botão “Feedback” dentro do app.</span></div>`;
 }catch(error){if(error.status===401||error.status===403)return accessError(error);list.innerHTML=`<div class="am-card am-empty">${ico('alert')}<b>Não foi possível carregar os relatos.</b><span>${esc(error.message||'')}</span></div>`;}
}

/* ---------- Pagamentos ---------- */
const money=c=>Number.isInteger(c)?(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const PAY={paid:['Pago','ok'],pending:['Aguardando','info'],unknown:['Confirmando','info'],creating:['Gerando','info'],canceled:['Expirado',''],failed:['Não gerado','danger']};
async function renderPayments(){
 const el=root.querySelector('#admin-payments');
 el.innerHTML=`<div class="am-card am-table-wrap"><div class="am-card-body">${skeleton(5,30)}</div></div>`;
 try{
  const {items,balance,checkout}=await api('admin/payments');
  const paid=items.filter(i=>i.status==='paid'&&!i.refunded_at);
  el.innerHTML=`<div class="am-pay-summary">
   <div class="am-card am-pay-stat"><span>Saldo disponível na Six7Pay</span><b class="num">${balance?money(balance.available):'—'}</b><small>${balance?'A liberar: '+money(balance.blocked)+' · liquidação em D+1':'Saldo indisponível agora'}</small></div>
   <div class="am-card am-pay-stat"><span>Pagos (últimos 100 pedidos)</span><b class="num">${money(paid.reduce((s,i)=>s+i.amount,0))}</b><small>${plural(paid.length,'pagamento confirmado','pagamentos confirmados')}</small></div>
   <div class="am-card am-pay-stat"><span>Checkout no site</span><b>${checkout?'Ligado':'Desligado'}</b><small>PIX via Six7Pay · estabelecimento 440627</small></div>
  </div>
  ${items.length?`<div class="am-card am-table-wrap"><table class="am-table"><thead><tr><th scope="col">Conta</th><th scope="col">Plano</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Data</th><th scope="col" class="am-col-act"><span class="am-sr">Ações</span></th></tr></thead><tbody>
  ${items.map(i=>{const [label,tone]=i.refunded_at?['Estornado','danger']:(PAY[i.status]||[i.status,'']);return `<tr>
   <td class="am-col-who"><div class="am-who"><span class="am-avatar">${esc(initials(i.name||'?'))}</span><div><b>${esc(i.name||'Conta removida')}</b><span>${esc(i.email||'')}</span></div></div></td>
   <td>${esc(planName(i.plan))}${i.days?`<small class="am-muted"> · ${fmtNum(i.days)} dias${i.promotional?' · promocional':''}</small>`:''}</td>
   <td class="num">${money(i.amount)}</td>
   <td><span class="am-pill ${tone}">${esc(label)}</span></td>
   <td class="num" title="${new Date(i.created_at).toLocaleString('pt-BR')}">${fmtDate(i.paid_at||i.created_at)}</td>
   <td class="am-col-act">${i.status==='paid'&&!i.refunded_at?`<button type="button" class="am-btn ghost sm" data-refund="${esc(i.id)}" data-refund-label="${esc((i.name||i.email||'')+' · '+money(i.amount))}">Estornar</button>`:''}</td>
  </tr>`;}).join('')}
  </tbody></table></div>`:`<div class="am-card am-empty">${ico('card')}<b>Nenhuma cobrança ainda.</b><span>As cobranças PIX aparecem aqui assim que alguém escolhe um plano.</span></div>`}
  <p class="am-small am-muted">O estorno devolve o valor integral ao pagador e retira os dias liberados por aquele pagamento. Estornos feitos direto no painel da Six7Pay também são detectados (verificação a cada 6 h).</p>`;
 }catch(error){if(error.status===401||error.status===403)return accessError(error);el.innerHTML=`<div class="am-card am-empty">${ico('alert')}<b>Não foi possível carregar os pagamentos.</b><span>${esc(error.message||'')}</span></div>`;}
}
root.addEventListener('click',async e=>{
 const b=e.target.closest('[data-refund]');if(!b||busy)return;
 if(!confirm(`Estornar o pagamento de ${b.dataset.refundLabel}?

O valor volta integralmente para quem pagou e os dias liberados por esse pagamento saem da assinatura. Esta ação não pode ser desfeita.`))return;
 busy=true;setBusy(b,true);
 try{await send('admin/payments/refund',{orderId:b.dataset.refund,confirm:true});notice('Estorno enviado à Six7Pay e assinatura ajustada.');await renderPayments();}
 catch(error){accessError(error);if(b.isConnected)setBusy(b,false);}
 finally{busy=false;}
});

/* ---------- Início da sessão ---------- */
async function start(){
 hideAdministration();
 try{
  const user=await adminSession();
  if(user.role!=='admin'){showAdminDenied(root,user,start);return;}
  state.user=user;state.catalog=await api('admin/plans');
  identity.innerHTML=`<span class="am-me" title="ADMIN MASTER · ${esc(user.email)}"><span class="am-avatar sm">${esc(initials(user.name||user.email))}</span><span>${esc(user.email)}</span></span><button type="button" class="am-btn ghost sm" id="admin-logout">${ico('logout')}<span class="am-hide-sm">Sair do painel</span></button>`;
  identity.hidden=false;navigation.hidden=false;topbar.hidden=false;app.dataset.state='ready';
  identity.querySelector('#admin-logout').onclick=async event=>{const b=event.currentTarget;setBusy(b,true);try{await send('logout',{});state.user=null;hideAdministration();showAdminLogin(root,start);}catch(error){accessError(error);if(b.isConnected)setBusy(b,false);}};
  root.innerHTML=`<section data-view="inicio" id="admin-overview" aria-label="Visão geral" hidden></section>
  <section data-view="contas" id="admin-accounts" aria-labelledby="am-title" hidden></section>
  <section data-view="planos" id="admin-plans" aria-labelledby="am-title" hidden></section>
  <section data-view="pagamentos" id="admin-payments" aria-labelledby="am-title" hidden></section>
  <section data-view="cerebro" id="admin-brain" aria-labelledby="am-title" hidden></section>
  <section data-view="feedback" id="admin-feedback" aria-labelledby="am-title" hidden></section>
  <section data-view="atividade" id="admin-activity" aria-labelledby="am-title" hidden></section>`;
  state.overview=null;state.view='';
  await route();
 }catch(error){
  hideAdministration();
  if(error.status===401){showAdminLogin(root,start);return;}
  root.innerHTML='<section class="am-card am-error-card"><h2>Não foi possível abrir o painel.</h2><p role="alert"></p><button class="am-btn" type="button">Tentar novamente</button></section>';
  root.querySelector('p').textContent=error.message;root.querySelector('button').onclick=start;
 }
}

/* ---------- Eventos ---------- */
window.addEventListener('hashchange',()=>{void route();});
window.addEventListener('beforeunload',e=>{if(state.plansDirty){e.preventDefault();e.returnValue='';}});
refreshBtn.innerHTML=ico('refresh');
refreshBtn.addEventListener('click',async()=>{if(!state.user||refreshBtn.classList.contains('spin'))return;refreshBtn.classList.add('spin');try{state.overview=null;await refreshOverview();if(state.view!=='planos'||!state.plansDirty){if(state.view==='planos')state.catalog=await api('admin/plans');await load(state.view);}notice('Dados atualizados.');}catch(error){accessError(error);}finally{refreshBtn.classList.remove('spin');}});

root.addEventListener('submit',async e=>{
 const form=e.target;if(!['admin-search','catalog-form'].includes(form.id))return;
 e.preventDefault();if(busy)return;const button=form.querySelector('button[type="submit"]');busy=true;setBusy(button,true);
 try{
  if(form.id==='admin-search'){state.users.q=String(new FormData(form).get('query')||'').trim();state.users.page=1;await loadUsers();return;}
  if(form.id==='catalog-form')await savePlans(form);
 }catch(error){if(error.status)accessError(error);else notice(error.message,'error');}
 finally{busy=false;if(button?.isConnected)setBusy(button,false);}
});
root.addEventListener('click',async e=>{
 const filter=e.target.closest('[data-user-filter]');
 if(filter){const st=filter.dataset.userFilter;if(st===state.users.status)return;history.replaceState(null,'','#/contas'+(st?'?status='+st:''));state.users.status=st;state.users.page=1;for(const b of root.querySelectorAll('[data-user-filter]'))b.setAttribute('aria-pressed',String(b===filter));try{await loadUsers();}catch(error){accessError(error);}return;}
 if(e.target.closest('[data-clear-users]')){state.users={...state.users,q:'',status:'',page:1};history.replaceState(null,'','#/contas');await renderUsers().catch(accessError);return;}
 const pager=e.target.closest('[data-admin-page]');
 if(pager){if(busy||pager.disabled)return;busy=true;const prior=state.users.page;state.users.page=Number(pager.dataset.adminPage);try{await loadUsers();root.querySelector('#admin-accounts')?.scrollIntoView({block:'start'});}catch(error){state.users.page=prior;accessError(error);}finally{busy=false;}return;}
 const open=e.target.closest('[data-open-user]');
 if(open){const u=state.users.data?.users.find(x=>x.id===open.dataset.openUser);if(u)openDrawer(u);return;}
 const fchip=e.target.closest('[data-feedback-filter]');
 if(fchip){state.feedback=fchip.dataset.feedbackFilter;for(const b of root.querySelectorAll('[data-feedback-filter]'))b.setAttribute('aria-pressed',String(b===fchip));await loadFeedback();return;}
 const fb=e.target.closest('[data-feedback-status]');
 if(fb){setBusy(fb,true);try{await send('admin/feedback',{id:fb.dataset.feedbackId,status:fb.dataset.feedbackStatus});await Promise.all([loadFeedback(),refreshOverview()]);notice(`Relato marcado como ${FSTATUS[fb.dataset.feedbackStatus].toLowerCase()}.`);}catch(error){accessError(error);if(fb.isConnected)setBusy(fb,false);}}
});
root.addEventListener('keydown',e=>{const row=e.target.closest?.('tr[data-open-user]');if(row&&e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const u=state.users.data?.users.find(x=>x.id===row.dataset.openUser);if(u)openDrawer(u);}});

start();
