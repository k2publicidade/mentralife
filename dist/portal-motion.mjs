// Movimento do portal público (a página de entrada, antes do login).
//
// Cada efeito tem uma função: a entrada do topo apresenta a marca uma vez, as revelações
// acompanham a leitura ao rolar, e a Mentra responde ao ponteiro para parecer presente.
// Só transform e opacity são animados. Com "movimento reduzido" nada disso roda: o conteúdo
// aparece inteiro e parado, e só o estado da barra superior continua acompanhando a rolagem.
const query = text => globalThis.matchMedia?.(text).matches === true;
const reduced = () => query('(prefers-reduced-motion: reduce)');
const finePointer = () => query('(hover: hover) and (pointer: fine)');
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Quantas palavras da frase já foram "lidas" para um dado progresso de rolagem (0 a 1). */
export function litCount(progress, total) {
  return Math.round(clamp(progress, 0, 1) * total);
}

/** Atraso de cada item revelado no mesmo lote: passos que encurtam, para não soar mecânico. */
export function staggerDelay(index) {
  return Math.round(80 * index - 8 * index * (index - 1) / 2);
}

function splitWords(node) {
  const words = node.textContent.trim().split(/\s+/);
  node.textContent = '';
  return words.map((word, index) => {
    const span = document.createElement('span');
    span.className = 'site-word';
    span.textContent = word;
    node.append(span, index < words.length - 1 ? ' ' : '');
    return span;
  });
}

function reveals(site) {
  const items = [...site.querySelectorAll('[data-reveal]')];
  if (typeof IntersectionObserver !== 'function') { items.forEach(item => item.classList.add('is-in')); return; }
  const observer = new IntersectionObserver(entries => {
    const shown = entries.filter(entry => entry.isIntersecting).map(entry => entry.target)
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    shown.forEach((item, index) => {
      item.style.setProperty('--d', staggerDelay(Math.min(index, 4)) + 'ms');
      item.classList.add('is-in');
      observer.unobserve(item);
    });
  }, {threshold: .12, rootMargin: '0px 0px -6% 0px'});
  items.forEach(item => observer.observe(item));
}

export function mountPortalMotion(site) {
  if (!site || site.dataset.motion) return;
  site.dataset.motion = 'on';
  const still = reduced();
  const hero = site.querySelector('.portal-hero');
  const statement = site.querySelector('[data-words]');
  const layers = still || !finePointer() ? [] : [...site.querySelectorAll('.site-stage [data-depth]')]
    .map(node => ({node, depth: Number(node.dataset.depth) || 0}));
  let words = [], lit = 0, heroVisible = true, frame = 0, scrollQueued = false;
  const pointer = {x: 0, y: 0, tx: 0, ty: 0};

  if (!still) {
    site.classList.add('site-motion');
    reveals(site);
    if (statement) words = splitWords(statement);
  }

  function readScroll() {
    scrollQueued = false;
    site.classList.toggle('is-scrolled', scrollY > 16);
    if (!words.length) return;
    const box = statement.getBoundingClientRect(), view = innerHeight;
    const next = litCount((view * .85 - box.top) / (box.height + view * .2), words.length);
    if (next === lit) return;
    for (let index = Math.min(lit, next); index < Math.max(lit, next); index++) words[index].classList.toggle('is-lit', next > lit);
    lit = next;
  }
  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(readScroll);
  }
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', onScroll);
  readScroll();

  if (still || !hero) return;

  // O ponteiro passa por uma suavização antes de virar transform; o laço para quando assenta.
  function tick() {
    pointer.x += (pointer.tx - pointer.x) * .085;
    pointer.y += (pointer.ty - pointer.y) * .085;
    for (const {node, depth} of layers) node.style.transform = `translate3d(${(pointer.x * depth).toFixed(2)}px,${(pointer.y * depth).toFixed(2)}px,0)`;
    const settled = Math.abs(pointer.tx - pointer.x) < .001 && Math.abs(pointer.ty - pointer.y) < .001;
    frame = settled || !heroVisible ? 0 : requestAnimationFrame(tick);
  }
  const wake = () => { if (!frame && heroVisible) frame = requestAnimationFrame(tick); };
  if (layers.length) {
    hero.addEventListener('pointermove', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const box = hero.getBoundingClientRect();
      pointer.tx = clamp((event.clientX - box.left) / box.width - .5, -.5, .5);
      pointer.ty = clamp((event.clientY - box.top) / box.height - .5, -.5, .5);
      wake();
    });
    hero.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; wake(); });
  }
  // Fora da tela, os laços decorativos do topo ficam em pausa.
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      site.classList.toggle('is-hero-away', !heroVisible);
    }).observe(hero);
  }
}
