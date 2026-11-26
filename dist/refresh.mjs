// Transições de tela no estilo nativo (Android e iOS).
// - Troca entre abas da barra inferior: "fade through" (sai rápido, entra com leve escala).
// - Ir mais fundo (Mais → Saúde, Arquivos → item): desliza da direita, a tela anterior sai pela esquerda.
// - Voltar (botão voltar ou nível acima): o mesmo deslize, invertido.
// Usa a View Transitions API quando existe (WebView Android e iOS 18+); nos demais casos só a nova tela
// entra, na mesma direção. Barra superior e navegação inferior ficam paradas: só o conteúdo se move.
const root = document.documentElement;
const tabs = ['hoje', 'vida', 'arquivos', 'dinheiro', 'menu'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let timer = 0, lastSection = '', pending = '';
const trail = [];

const section = () => (location.hash.replace(/^#\/?/, '').split('/').slice(0, 2).join('/')) || 'hoje';

// Abas ficam no nível 0; áreas abertas a partir de "Mais" contam como um nível abaixo dele.
function level(route) {
  const [top, ...rest] = route.split('/');
  return (tabs.includes(top) ? 0 : 1) + rest.filter(Boolean).length;
}

function direction(from, to) {
  if (!from) return 'initial';
  if (trail.length > 1 && trail[trail.length - 2] === to) return 'back';
  const [a] = from.split('/'), [b] = to.split('/');
  const da = level(from), db = level(to);
  if (db > da) return 'forward';
  if (db < da) return 'back';
  return a === b && da > 0 ? 'fade' : 'tab';
}

function remember(nav, route) {
  if (nav === 'back') trail.pop();
  else if (nav === 'tab' || nav === 'initial') trail.length = 0;
  if (trail[trail.length - 1] !== route) trail.push(route);
  if (trail.length > 30) trail.shift();
}

const isWebKitEngine = () => typeof navigator !== 'undefined' && /AppleWebKit/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(navigator.userAgent);
export const viewTransitions = () => typeof document.startViewTransition === 'function' && !reduced.matches && !isWebKitEngine();

function enter() {
  const current = section();
  if (current === lastSection) return;
  const nav = direction(lastSection, current);
  lastSection = current;
  remember(nav, current);
  root.dataset.nav = nav;
  pending = nav;
  // Sem View Transitions (ou na primeira abertura), só a nova tela anima a entrada.
  if (nav !== 'initial' && viewTransitions()) return;
  root.classList.remove('route-enter');
  void root.offsetWidth; // reinicia a animação mesmo se a classe já estava aplicada
  root.classList.add('route-enter');
  clearTimeout(timer);
  timer = setTimeout(() => { root.classList.remove('route-enter'); if (root.dataset.nav === nav) delete root.dataset.nav; }, 600);
}

// O app chama isto ao trocar de rota: o registro do estado antigo acontece antes da nova tela ser desenhada.
window.mentraTransition = (update) => {
  const nav = pending;
  pending = '';
  if (!nav || nav === 'initial' || !viewTransitions()) { update(); return; }
  const transition = document.startViewTransition(update);
  transition.ready?.catch(() => {});
  transition.finished.catch(() => {}).finally(() => { if (root.dataset.nav === nav) delete root.dataset.nav; });
};

window.addEventListener('hashchange', enter);
enter();
