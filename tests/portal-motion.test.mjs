import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {litCount, staggerDelay, mountPortalMotion} from '../dist/portal-motion.mjs';

const read = name => fs.readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8');

test('portal: a frase do manifesto acende conforme o progresso da rolagem', () => {
  assert.equal(litCount(-1, 30), 0);
  assert.equal(litCount(0, 30), 0);
  assert.equal(litCount(.5, 30), 15);
  assert.equal(litCount(3, 30), 30);
});

test('portal: revelações do mesmo lote entram em sequência curta e não uniforme', () => {
  const delays = [0, 1, 2, 3, 4].map(staggerDelay);
  assert.equal(delays[0], 0);
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1]);
  assert.ok(delays[2] - delays[1] < delays[1] - delays[0], 'os passos encurtam');
  assert.ok(delays[4] <= 400, 'o lote inteiro não atrasa a leitura');
});

test('portal: o módulo de movimento não exige navegador para ser importado', () => {
  assert.doesNotThrow(() => mountPortalMotion(null));
});

test('portal: a folha do portal entra por último e respeita movimento reduzido e ponteiro', () => {
  const html = read('index.html'), css = read('portal.css');
  assert.ok(html.indexOf('portal.css') > html.indexOf('productivity.css'));
  assert.ok(!/transition:\s*all/.test(css), 'sem transition: all');
  assert.ok(!/scale\(0\)/.test(css), 'nada entra a partir de scale(0)');
  // Estados ocultos só existem quando o movimento é permitido.
  const hidden = css.indexOf('[data-reveal]:not(.is-in){opacity:0}');
  assert.ok(hidden > css.indexOf('@media(prefers-reduced-motion:no-preference)'));
  assert.ok(css.includes('@media(hover:hover) and (pointer:fine)'));
});

test('portal: a página mantém os pontos de apoio usados pelo app e pelos testes', () => {
  const source = read('platform.mjs');
  for (const hook of ['class="portal site"', 'class="portal-nav"', 'id="open-auth"', 'class="portal-hero"', 'id="planos"', 'class="portal-access card" id="acesso"', 'id="main-content" tabindex="-1"', 'mentra-face-hero.webp'])
    assert.ok(source.includes(hook), hook);
});

test('app: ajustes de movimento entram por último, com hover só para mouse', () => {
  const html = read('index.html'), css = read('motion.css');
  assert.ok(html.indexOf('motion.css') > html.indexOf('portal.css'));
  assert.ok(css.includes('@media(hover:none),(pointer:coarse)'));
  assert.ok(!/transition:\s*(all|\.\d+s\s*[;}])/.test(css));
  assert.ok(!/scale\(0\)/.test(css));
  assert.ok(css.indexOf('.modal{animation') > css.indexOf('@media(prefers-reduced-motion:no-preference)'));
});

test('app: o passe editorial fica restrito às telas internas e não mexe em movimento contínuo', () => {
  const html = read('index.html'), css = read('editorial.css');
  assert.ok(html.indexOf('editorial.css') > html.indexOf('portal.css'));
  assert.ok(!/@keyframes|animation:/.test(css), 'sem novas animações em telas de uso diário');
  for (const rule of css.split('}').map(part => part.split('{')[0]).filter(sel => sel.includes('.') && !sel.includes('@')))
    assert.ok(/\.workspace|\.sidebar/.test(rule), 'fora do escopo: ' + rule.trim().slice(0, 60));
});

test('portal: a imagem da Mentra não usa filter, que custava pintura a cada quadro', () => {
  const css = read('portal.css');
  assert.ok(!/drop-shadow|blur\((?!14px)/.test(css.replace(/backdrop-filter:[^;}]*/g, '')));
});
