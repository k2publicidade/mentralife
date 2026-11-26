// Caixa de feedback dos testers no painel de administração (somente administradores;
// o Worker recusa a rota para qualquer outra conta).
import {api, send} from './platform.mjs';
import {escapeHtml as esc} from './core.mjs';

const KIND = {sugestao: 'Sugestão', problema: 'Problema', elogio: 'Elogio'};
const STATUS = {novo: 'Novo', lido: 'Lido', resolvido: 'Resolvido'};
const date = new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
let filter = 'novo', section = null, busy = false;

async function load() {
  if (!section || busy) return;
  busy = true;
  const list = section.querySelector('[data-feedback-list]');
  list.innerHTML = '<p class="small muted">Carregando relatos…</p>';
  try {
    const {items} = await api('admin/feedback' + (filter ? '?status=' + filter : ''));
    list.innerHTML = items.length ? `<ul class="admin-feedback-list">${items.map(item => `<li class="card">
      <div class="admin-feedback-meta"><span class="admin-feedback-kind is-${esc(item.kind)}">${KIND[item.kind] || esc(item.kind)}</span><span>${esc(item.name)} · ${esc(item.email)}</span><span>Tela: <b>${esc(item.page)}</b></span><time>${date.format(item.created_at)}</time></div>
      <p>${esc(item.message)}</p>
      <div class="button-row">${Object.entries(STATUS).filter(([id]) => id !== item.status).map(([id, label]) => `<button type="button" class="outline small-button" data-feedback-id="${esc(item.id)}" data-feedback-status="${id}">Marcar como ${label.toLowerCase()}</button>`).join('')}<span class="small muted">Situação: ${STATUS[item.status] || esc(item.status)}</span></div>
    </li>`).join('')}</ul>` : '<p class="small muted">Nenhum relato nesta situação.</p>';
  } catch (error) {
    list.innerHTML = `<p class="form-error" role="alert">${esc(error.message || 'Não foi possível carregar os relatos.')}</p>`;
  } finally { busy = false; }
}

function mount() {
  const content = document.querySelector('#admin-content');
  if (!content?.querySelector('#admin-users') || content.querySelector('#admin-feedback')) return;
  section = document.createElement('section');
  section.id = 'admin-feedback';
  section.className = 'admin-feedback-section';
  section.setAttribute('aria-labelledby', 'feedback-title');
  section.innerHTML = `<p class="eyebrow">FASE DE TESTES</p><h2 id="feedback-title">Feedback dos testers</h2>
   <p>Relatos enviados pelas contas pelo botão “Feedback”. Cada relato pertence à conta que o enviou e é apagado se ela for excluída.</p>
   <div class="button-row" role="group" aria-label="Filtrar relatos">${[['novo', 'Novos'], ['lido', 'Lidos'], ['resolvido', 'Resolvidos'], ['', 'Todos']].map(([id, label]) => `<button type="button" class="${id === filter ? 'primary' : 'outline'} small-button" data-feedback-filter="${id}" aria-pressed="${id === filter}">${label}</button>`).join('')}</div>
   <div data-feedback-list></div>`;
  content.append(section);
  const nav = document.querySelector('.admin-sections');
  if (nav && !nav.querySelector('[href="#admin-feedback"]')) nav.insertAdjacentHTML('beforeend', '<a href="#admin-feedback">Feedback</a>');
  section.addEventListener('click', async event => {
    const chip = event.target.closest('[data-feedback-filter]');
    if (chip) {
      filter = chip.dataset.feedbackFilter;
      for (const b of section.querySelectorAll('[data-feedback-filter]')) { const on = b === chip; b.className = (on ? 'primary' : 'outline') + ' small-button'; b.setAttribute('aria-pressed', String(on)); }
      return load();
    }
    const button = event.target.closest('[data-feedback-status]');
    if (!button) return;
    button.disabled = true;
    try { await send('admin/feedback', {id: button.dataset.feedbackId, status: button.dataset.feedbackStatus}); await load(); }
    catch (error) { button.disabled = false; alert(error.message || 'Não foi possível atualizar o relato.'); }
  });
  load();
}

const content = document.querySelector('#admin-content');
if (content) new MutationObserver(mount).observe(content, {childList: true, subtree: true});
mount();
