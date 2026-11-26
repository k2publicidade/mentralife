import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {overlayMarkup, lidPath, LID_KEYS, LOOP} from '../dist/face-alive.mjs';

test('face animation loops perfectly: every channel starts and ends at rest', () => {
  assert.equal(LID_KEYS[0][0], 0);
  assert.equal(LID_KEYS.at(-1)[0], LOOP);
  assert.equal(LID_KEYS[0][1], 0);
  assert.equal(LID_KEYS.at(-1)[1], 0);
  for (let i = 1; i < LID_KEYS.length; i++) assert.ok(LID_KEYS[i][0] > LID_KEYS[i - 1][0], 'key times strictly increase');
  assert.ok(LID_KEYS.every(([, t]) => t >= 0 && t <= 1));
  const svg = overlayMarkup('qa', 'assets/mentra-face.png');
  for (const [, values] of svg.matchAll(/repeatCount="indefinite"[^>]*values="([^"]+)"/g)) {
    const list = values.split(';');
    assert.equal(list[0], list.at(-1), 'first and last frame match');
  }
  for (const match of svg.matchAll(/dur="([\d.]+)s" repeatCount="indefinite"/g)) assert.equal(Number(match[1]), LOOP);
});

test('closed lid path keeps the same command structure as the open one (morphable)', () => {
  const shape = path => path.replace(/[\d.,-]+/g, '#');
  const eye = {box: [0, 0, 10], inner: [10, 5], outer: [0, 5], open: [[7, 1], [3, 1]], shut: [[7, 9], [3, 9]]};
  assert.equal(shape(lidPath(eye, 0)), shape(lidPath(eye, 1)));
});

test('overlay is decorative, uses the approved image and respects reduced motion', () => {
  const svg = overlayMarkup('qa', 'assets/mentra-face.png');
  assert.ok(svg.includes('aria-hidden="true"'));
  assert.ok(svg.includes('href="assets/mentra-face.png"'));
  assert.ok(fs.existsSync(new URL('../dist/assets/mentra-face-smile-map.png', import.meta.url)));
  const css = fs.readFileSync(new URL('../dist/refresh.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.mentra-alive\{display:none!important\}/);
  assert.match(css, /\.moment-paused \.mentra-alive,\.motion-paused \.mentra-alive/);
  assert.ok(fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8').includes('face-alive.mjs'));
});
