// Renderiza a animação da Mentra viva quadro a quadro (tempo controlado) em PNGs,
// para montar GIF/WebP. Requer o servidor local: npm run dev (127.0.0.1:8787).
// Uso: node scripts/render-face-animation.mjs <pasta> [fundo=#173e32] [loop|wink] [fps=20] [tamanho=540]
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const [,, outDir, background = '#173e32', mode = 'loop', fpsArg = '20', sizeArg = '540'] = process.argv;
const fps = Number(fpsArg), size = Number(sizeArg);
mkdirSync(outDir, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: size, height: size}, deviceScaleFactor: 1});
await page.goto('http://127.0.0.1:8787/offline.html');
await page.evaluate(async ({background, size}) => {
  document.head.insertAdjacentHTML('beforeend', `<style>
    html,body{margin:0;background:${background};overflow:hidden}
    #stage{position:relative;width:${size}px;height:${size}px;perspective:900px;
      background:radial-gradient(circle at 50% 42%,rgba(215,189,121,.20),rgba(215,189,121,0) 58%),${background}}
    #stage img{position:absolute;left:9%;top:7%;width:82%;height:82%;object-fit:contain;
      filter:drop-shadow(0 18px 26px rgba(7,31,24,.35));transform-origin:50% 65%;animation:qa-float 10s ease-in-out infinite}
    @keyframes qa-float{0%,100%{transform:translateY(0) rotateY(-5deg) rotateZ(-.8deg)}50%{transform:translateY(-10px) rotateY(6deg) rotateZ(.8deg)}}
  </style>`);
  document.body.innerHTML = '<div id="stage"><img src="/assets/mentra-face.png" alt=""></div>';
  await new Promise(r => document.querySelector('img').complete ? r() : document.querySelector('img').onload = r);
  await import('/face-alive.mjs');
  await new Promise(r => setTimeout(r, 400));
  if (!document.querySelector('svg.mentra-alive')) throw new Error('camada não criada');
}, {background, size});
await page.waitForTimeout(600);

const duration = mode === 'wink' ? 1.6 : 10;
const frames = Math.round(duration * fps);
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  await page.evaluate(({t, mode, i}) => {
    const svg = document.querySelector('svg.mentra-alive'), img = svg.previousElementSibling;
    svg.pauseAnimations();
    if (mode === 'wink') {
      if (i === 0) { svg.setCurrentTime(0.3); svg.unpauseAnimations(); for (const a of svg.querySelectorAll('[data-wink]')) a.beginElement(); svg.pauseAnimations(); svg.dataset.base = '0.3'; }
      svg.setCurrentTime(0.3 + t);
    } else svg.setCurrentTime(t);
    const ms = (mode === 'wink' ? 0 : t) * 1000;
    for (const el of [img, svg]) for (const anim of el.getAnimations()) { anim.pause(); anim.currentTime = ms; }
  }, {t, mode, i});
  await page.waitForTimeout(16);
  await page.screenshot({path: join(outDir, `f${String(i).padStart(4, '0')}.png`)});
}
await browser.close();
console.log(`${frames} quadros em ${outDir}`);
