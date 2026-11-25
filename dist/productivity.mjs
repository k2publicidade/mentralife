/**
 * Recursos de produtividade da conta aberta:
 *  - "Atenção hoje" e "Primeiros passos" na página inicial;
 *  - busca global (Ctrl/⌘ + K ou botão "Buscar");
 *  - envio de feedback dos testers, gravado na conta autenticada.
 * Lê o estado do app apenas pela função `window.mentraState()` (somente leitura).
 */
import {attentionItems, onboardingSteps, searchIndex, searchItems} from './insights.mjs';
import {icon} from './icons.mjs';
import {escapeHtml as esc} from './core.mjs';
import {send} from './platform.mjs';
import {operationDate} from './time.mjs';

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const FEEDBACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>';
const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '');
const currentState = () => { try { return globalThis.mentraState?.() || null; } catch { return null; } };
const accountKey = () => globalThis.mentraPlatform?.user?.id || 'demo';
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* preferência local opcional */ } },
};
const onboardingHidden = () => storage.get('mentra-onboarding-hidden:' + accountKey()) === '1';
const route = () => location.hash.replace(/^#\/?/, '') || 'hoje';

/** Painéis da página inicial, sempre a partir dos dados desta conta. */
export function homePanels(state, today = operationDate()) {
  const items = attentionItems(state, today);
  const attention = `<section class="attention-panel card" aria-labelledby="attention-title">
   <div class="attention-head"><div><span class="eyebrow">PARA VOCÊ, AGORA</span><h2 id="attention-title">Atenção hoje</h2></div>
   <button type="button" class="outline small-button attention-search" data-prod="open-search">${SEARCH_ICON}<span>Buscar em tudo</span><kbd>${isMac() ? '⌘' : 'Ctrl'} K</kbd></button></div>
   ${items.length ? `<ul class="attention-list">${items.map(item => `<li class="attention-item is-${item.tone}"><a href="#/${esc(item.route)}"><span class="attention-icon">${icon(item.icon)}</span><span class="attention-copy"><strong>${esc(item.title)}</strong>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span>${icon('arrow', 'attention-arrow')}</a></li>`).join('')}</ul>`
     : `<p class="attention-empty">${icon('check')}<span><strong>Tudo em dia por aqui.</strong> Nenhuma tarefa atrasada, conta vencendo ou orçamento estourado.</span></p>`}
  </section>`;
  const onboarding = onboardingSteps(state);
  const showOnboarding = globalThis.mentraPlatform && !onboarding.complete && !onboardingHidden();
  const checklist = showOnboarding ? `<section class="onboarding-panel card" aria-labelledby="onboarding-title">
   <div class="attention-head"><div><span class="eyebrow">SUA CONTA, DO SEU JEITO</span><h2 id="onboarding-title">Primeiros passos</h2></div>
   <button type="button" class="text-link" data-prod="hide-onboarding">Ocultar</button></div>
   <div class="onboarding-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${onboarding.total}" aria-valuenow="${onboarding.done}" aria-label="Primeiros passos concluídos"><i style="--progress:${Math.round(onboarding.done / onboarding.total * 100)}%"></i></div>
   <p class="small muted">${onboarding.done} de ${onboarding.total} concluídos. Quanto mais a Mentra conhece sua rotina, mais pessoais ficam as sugestões.</p>
   <ol class="onboarding-list">${onboarding.steps.map(step => `<li class="${step.done ? 'is-done' : ''}"><a href="#/${esc(step.route)}"><span class="onboarding-check" aria-hidden="true">${step.done ? icon('check') : ''}</span><span><strong>${esc(step.title)}</strong><small>${esc(step.detail)}</small></span><span class="sr-only">${step.done ? 'concluído' : 'pendente'}</span></a></li>`).join('')}</ol>
  </section>` : '';
  return `<div class="home-productivity">${attention}${checklist}</div>`;
}

/* ---------------- Camadas (busca e feedback) ---------------- */
let layer = null, lastFocus = null;
function openLayer(html, label) {
  closeLayer();
  lastFocus = document.activeElement;
  layer = document.createElement('div');
  layer.className = 'prod-layer';
  layer.innerHTML = `<div class="prod-backdrop" data-prod="close"></div><section class="prod-dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</section>`;
  document.body.append(layer);
  document.body.classList.add('modal-open');
  const app = document.querySelector('#app'); if (app) app.inert = true;
  requestAnimationFrame(() => layer?.classList.add('is-open'));
  return layer;
}
function closeLayer() {
  if (!layer) return;
  layer.remove(); layer = null;
  document.body.classList.remove('modal-open');
  const app = document.querySelector('#app'); if (app) app.inert = false;
  lastFocus?.focus?.(); lastFocus = null;
}

function openSearch() {
  const state = currentState();
  if (!state) return;
  const index = searchIndex(state);
  const box = openLayer(`<div class="search-field-row">${SEARCH_ICON}<input type="search" class="search-input" placeholder="Buscar tarefas, agenda, documentos, lançamentos…" aria-label="Buscar em toda a sua conta" autocomplete="off"><kbd>Esc</kbd></div>
   <div class="search-results" role="listbox" aria-label="Resultados"></div>
   <p class="search-foot small muted">${index.length} ${index.length === 1 ? 'item' : 'itens'} da sua conta · busca feita neste aparelho</p>`, 'Busca global');
  const input = box.querySelector('.search-input'), results = box.querySelector('.search-results');
  let active = 0, found = [];
  const paint = () => {
    const query = input.value.trim();
    found = searchItems(index, query);
    active = Math.min(active, Math.max(found.length - 1, 0));
    results.innerHTML = !query ? `<p class="search-hint">Digite pelo menos duas letras. Ex.: <b>aluguel</b>, <b>reunião</b>, <b>garantia</b>.</p>`
      : found.length ? found.map((item, i) => `<a role="option" aria-selected="${i === active}" class="search-result ${i === active ? 'is-active' : ''}" href="#/${esc(item.route)}" data-index="${i}"><span class="search-type">${esc(item.type)}</span><strong>${esc(item.title)}</strong>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</a>`).join('')
      : `<p class="search-hint">Nada encontrado para “${esc(query)}”.</p>`;
    results.querySelector('.is-active')?.scrollIntoView?.({block: 'nearest'});
  };
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (found.length) { active = (active + (event.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; paint(); } }
    else if (event.key === 'Enter' && found[active]) { event.preventDefault(); go(found[active].route); }
  });
  results.addEventListener('click', event => { const link = event.target.closest('a.search-result'); if (link) { event.preventDefault(); go(found[Number(link.dataset.index)].route); } });
  paint();
  input.focus();
}
function go(path) { closeLayer(); location.hash = '#/' + path; }

const KINDS = [['sugestao', 'Sugestão'], ['problema', 'Algo deu errado'], ['elogio', 'Elogio']];
function openFeedback() {
  if (!globalThis.mentraPlatform) return;
  const box = openLayer(`<header class="prod-head"><div><span class="eyebrow">FASE DE TESTES</span><h2>Conte para a gente</h2></div><button type="button" class="icon-button" data-prod="close" aria-label="Fechar">${icon('close')}</button></header>
   <form class="feedback-form">
    <fieldset class="feedback-kinds"><legend class="sr-only">Tipo do relato</legend>${KINDS.map(([id, label], i) => `<label><input type="radio" name="kind" value="${id}" ${i === 0 ? 'checked' : ''}><span>${label}</span></label>`).join('')}</fieldset>
    <label class="feedback-label" for="feedback-message">O que você quer contar?</label>
    <textarea id="feedback-message" name="message" rows="5" maxlength="2000" required minlength="3" placeholder="Ex.: na tela de Organização Financeira, ao salvar um lançamento, a lista não atualizou."></textarea>
    <p class="small muted">Enviaremos junto a tela atual (<b>${esc(route())}</b>). Não inclua senhas ou dados de cartão.</p>
    <p class="form-error feedback-status" role="status" aria-live="polite"></p>
    <div class="button-row"><button type="button" class="outline" data-prod="close">Cancelar</button><button type="submit" class="primary">Enviar feedback</button></div>
   </form>`, 'Enviar feedback');
  const form = box.querySelector('form'), status = box.querySelector('.feedback-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopPropagation();
    const data = Object.fromEntries(new FormData(form));
    const message = String(data.message || '').trim();
    if (message.length < 3) { status.textContent = 'Escreva pelo menos algumas palavras.'; return; }
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true; status.textContent = 'Enviando…';
    try {
      await send('feedback', {kind: data.kind, page: route().slice(0, 80), message});
      box.querySelector('.prod-dialog').innerHTML = `<div class="feedback-done">${icon('check')}<h2>Obrigado!</h2><p>Recebemos seu relato. Ele ajuda a deixar a Mentra melhor para todos.</p><button type="button" class="primary" data-prod="close">Fechar</button></div>`;
      box.querySelector('.feedback-done button')?.focus();
    } catch (error) {
      status.textContent = error.message || 'Não foi possível enviar agora. Tente de novo em instantes.';
      submit.disabled = false;
    }
  });
  form.querySelector('textarea').focus();
}

/* ---------------- Botões no cabeçalho ---------------- */
function placeHeaderButtons() {
  const bar = document.querySelector('.top-actions');
  if (!bar || typeof bar.querySelector !== 'function' || typeof bar.prepend !== 'function' || bar.querySelector('[data-prod="open-search"].header-tool')) return;
  const make = (action, svg, label, extra = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'header-tool'; b.dataset.prod = action; b.setAttribute('aria-label', label); b.innerHTML = `${svg}<span>${label}</span>${extra}`; return b; };
  const tools = [make('open-search', SEARCH_ICON, 'Buscar', `<kbd>${isMac() ? '⌘' : 'Ctrl'} K</kbd>`)];
  if (globalThis.mentraPlatform) tools.push(make('open-feedback', FEEDBACK_ICON, 'Feedback'));
  bar.prepend(...tools);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', event => {
    const control = event.target.closest?.('[data-prod]');
    if (!control) return;
    const action = control.dataset.prod;
    if (action === 'open-search') { event.preventDefault(); openSearch(); }
    else if (action === 'open-feedback') { event.preventDefault(); openFeedback(); }
    else if (action === 'close') { event.preventDefault(); closeLayer(); }
    else if (action === 'hide-onboarding') { storage.set('mentra-onboarding-hidden:' + accountKey(), '1'); control.closest('.onboarding-panel')?.remove(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && document.querySelector('#main-content')) { event.preventDefault(); layer ? closeLayer() : openSearch(); }
    else if (event.key === 'Escape' && layer) { event.preventDefault(); closeLayer(); }
    else if (event.key === 'Tab' && layer) {
      const focusable = [...layer.querySelectorAll('button,a[href],input:not([type=hidden]),textarea,select,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!layer.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    }
  });
  globalThis.addEventListener?.('hashchange', closeLayer);
  const app = document.querySelector('#app');
  if (app && typeof MutationObserver === 'function') new MutationObserver(placeHeaderButtons).observe(app, {childList: true, subtree: true});
  placeHeaderButtons();
}
