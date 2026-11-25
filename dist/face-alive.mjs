/**
 * Mentra viva: piscadas, sorriso leve e piscadinha interativa sobre o PNG original.
 *
 * A imagem aprovada não é redesenhada. Uma camada SVG transparente fica
 * exatamente sobre cada <img> do rosto e anima só pálpebras e cantos da boca.
 * Todas as animações compartilham o mesmo ciclo (SMIL, 10 s), então o loop é perfeito.
 * Respeita prefers-reduced-motion e o botão "Pausar movimento".
 */

const SIZE = 1254;
const LOOP = 10;
const SELECTOR = 'img[src$="mentra-face.png"],img[src$="mentra-face-hero.webp"]';
const MIN_SIZE = 56; // avatares muito pequenos não precisam piscar
let counter = 0;

// Pontos no sistema de coordenadas do PNG (1254 × 1254). A pálpebra é um
// polígono cuja borda inferior se transforma do arco aberto à curva fechada.
const EYES = {
  left: {
    clip: 'M476,662 C518,632 640,622 712,697 C652,730 540,729 476,662 Z',
    box: [466, 540, 724], inner: [710, 697], outer: [478, 662],
    open: [[640, 624], [518, 634]], shut: [[652, 718], [540, 717]],
  },
  right: {
    clip: 'M868,719 C902,642 1000,614 1058,652 C1046,706 952,736 868,719 Z',
    box: [858, 540, 1068], inner: [1056, 652], outer: [870, 718],
    open: [[1000, 616], [902, 644]], shut: [[1044, 697], [952, 724]],
  },
};

/** Fechamento (0 = aberto, 1 = fechado) ao longo do ciclo, em segundos. */
const SQUINT = .2;
const LID_KEYS = [
  [0, 0], [2.0, 0], [2.07, 1], [2.1, 1], [2.24, 0],
  [3.2, 0], [4.2, SQUINT], [5.1, SQUINT], [5.17, 1], [5.2, 1], [5.34, SQUINT], [6.2, SQUINT], [7.3, 0],
  [8.55, 0], [8.62, 1], [8.65, 1], [8.77, 0], [8.92, 0], [8.99, 1], [9.02, 1], [9.15, 0], [LOOP, 0],
];

const lerp = (a, b, t) => +(a + (b - a) * t).toFixed(1);
const mix = (eye, t) => eye.open.map((point, i) => [lerp(point[0], eye.shut[i][0], t), lerp(point[1], eye.shut[i][1], t)]);

function lidPath(eye, t) {
  const [x0, top, x1] = eye.box, [ix, iy] = eye.inner, [ox, oy] = eye.outer, [c1, c2] = mix(eye, t);
  return `M${x0},${top} L${x1},${top} L${x1},${iy} L${ix},${iy} C${c1} ${c2} ${ox},${oy} L${x0},${oy} Z`;
}
function lashPath(eye, t) {
  const [ix, iy] = eye.inner, [ox, oy] = eye.outer, [c1, c2] = mix(eye, t);
  return `M${ox},${oy} C${c2} ${c1} ${ix},${iy}`;
}

function lidAnimation(eye, shape) {
  const keyTimes = LID_KEYS.map(([time]) => (time / LOOP).toFixed(4)).join(';');
  const values = LID_KEYS.map(([, t]) => shape(eye, t)).join(';');
  return `<animate attributeName="d" dur="${LOOP}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/>`;
}
function winkAnimation(eye, shape) {
  return `<animate data-wink attributeName="d" begin="indefinite" dur=".7s" keyTimes="0;.24;.6;1" values="${[0, 1, 1, 0].map(t => shape(eye, t)).join(';')}" fill="remove"/>`;
}

function eyeMarkup(id, side) {
  const eye = EYES[side], wink = side === 'right';
  return `<mask id="${id}-mask-${side}" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><path d="${eye.clip}" fill="#fff" filter="url(#${id}-feather)"/></mask>
  <g mask="url(#${id}-mask-${side})">
   <path d="${lidPath(eye, 0)}" fill="url(#${id}-lid)">${lidAnimation(eye, lidPath)}${wink ? winkAnimation(eye, lidPath) : ''}</path>
   <path d="${lashPath(eye, 0)}" fill="none" stroke="#2a1c12" stroke-width="5.5" stroke-linecap="round" stroke-opacity=".92">${lidAnimation(eye, lashPath)}${wink ? winkAnimation(eye, lashPath) : ''}</path>
  </g>`;
}

function overlayMarkup(id, href) {
  const smileTimes = [0, 3.2, 4.2, 6.2, 7.3, LOOP].map(t => (t / LOOP).toFixed(4)).join(';');
  const ease = '.42 0 .58 1';
  return `<svg class="mentra-alive" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="${id}-lid" gradientUnits="userSpaceOnUse" x1="0" y1="610" x2="0" y2="728">
    <stop offset="0" stop-color="#ecd8bf"/><stop offset=".45" stop-color="#e6cfb4"/><stop offset=".8" stop-color="#d9bb9c"/><stop offset="1" stop-color="#bf9a7b"/>
   </linearGradient>
   <filter id="${id}-feather" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.8"/></filter>
   <filter id="${id}-smile" filterUnits="userSpaceOnUse" x="600" y="920" width="340" height="120" color-interpolation-filters="sRGB">
    <feImage href="assets/mentra-face-smile-map.png" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G">
     <animate attributeName="scale" dur="${LOOP}s" repeatCount="indefinite" calcMode="spline" keyTimes="${smileTimes}" values="0;0;55;55;0;0" keySplines="0 0 1 1;${ease};0 0 1 1;${ease};0 0 1 1"/>
     <animate data-wink attributeName="scale" begin="indefinite" dur="1.4s" calcMode="spline" keyTimes="0;.3;.7;1" values="0;65;65;0" keySplines="${ease};0 0 1 1;${ease}" fill="remove"/>
    </feDisplacementMap>
   </filter>
   <clipPath id="${id}-mouth"><rect x="600" y="920" width="340" height="120"/></clipPath>
  </defs>
  <image href="${href}" width="${SIZE}" height="${SIZE}" clip-path="url(#${id}-mouth)" filter="url(#${id}-smile)"/>
  ${eyeMarkup(id, 'left')}
  ${eyeMarkup(id, 'right')}
 </svg>`;
}

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const live = new Map();

function place(img, svg) {
  // Mesma caixa da imagem; object-fit: contain equivale a xMidYMid meet.
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';
  svg.style.left = img.offsetLeft + 'px';
  svg.style.top = img.offsetTop + 'px';
  svg.style.width = img.offsetWidth + 'px';
  svg.style.height = img.offsetHeight + 'px';
  const style = getComputedStyle(img);
  svg.style.transformOrigin = style.transformOrigin;
  svg.style.animation = style.animationName !== 'none' ? `${style.animationName} ${style.animationDuration} ${style.animationTimingFunction} ${style.animationDelay} ${style.animationIterationCount}` : 'none';
  svg.style.zIndex = String((parseInt(style.zIndex, 10) || 0) + 1);
  sync(img, svg);
}

/** Alinha o giro decorativo da camada ao da imagem, quadro a quadro. */
function sync(img, svg) {
  setTimeout(() => {
    const source = img.getAnimations?.()[0], copy = svg.getAnimations?.()[0];
    if (source && copy && source.currentTime !== null) copy.currentTime = source.currentTime;
  }, 0);
}

function wink(svg) {
  if (svg.dataset.winking) return;
  svg.dataset.winking = '1';
  for (const anim of svg.querySelectorAll('[data-wink]')) anim.beginElement?.();
  setTimeout(() => { delete svg.dataset.winking; }, 1500);
}

function enhance(img) {
  if (live.has(img) || !img.isConnected) return;
  const parent = img.parentElement;
  if (!parent || img.offsetWidth < MIN_SIZE) return;
  const id = `mentra-alive-${++counter}`;
  const holder = document.createElement('div');
  holder.innerHTML = overlayMarkup(id, img.getAttribute('src'));
  const svg = holder.firstElementChild;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  img.after(svg);
  place(img, svg);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place(img, svg)) : null;
  observer?.observe(img);
  // Começa em um ponto diferente do ciclo para várias cabeças na tela não piscarem juntas.
  try { svg.setCurrentTime?.((counter * 3.7) % LOOP); } catch { /* opcional */ }
  const onWink = () => wink(svg);
  img.addEventListener('pointerenter', onWink);
  img.addEventListener('click', onWink);
  live.set(img, {svg, observer, onWink});
}

function sweep() {
  for (const [img, entry] of live) {
    if (!img.isConnected) { entry.observer?.disconnect(); entry.svg.remove(); live.delete(img); }
  }
  if (reduced()) return;
  for (const img of document.querySelectorAll(SELECTOR)) {
    if (img.complete && img.naturalWidth) enhance(img);
    else img.addEventListener('load', () => enhance(img), {once: true});
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; sweep(); }, 30);
}

if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
  new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true});
  addEventListener('resize', schedule);
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
    if (reduced()) for (const [img, entry] of live) { entry.observer?.disconnect(); entry.svg.remove(); live.delete(img); }
    else schedule();
  });
  schedule();
}

export {overlayMarkup, lidPath, LID_KEYS, LOOP};
