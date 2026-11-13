/**
 * Card vertical (1080 × 1920) dos Momentos Mentra, desenhado no aparelho em
 * <canvas> com o mesmo visual escuro do palco exibido na tela.
 * O PNG contém apenas título, frase e referência bíblica: nenhum dado pessoal.
 */

const W = 1080, H = 1920, PAD = 96;
const COLORS = Object.freeze({
  deep: '#0c261f', forest: '#173e32', mid: '#123429', cream: '#fbf9e9',
  sage: '#d7e5bf', gold: '#d7bd79', goldSoft: 'rgba(215,189,121,.22)', line: 'rgba(251,249,233,.14)',
});

const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { imageCache.delete(src); reject(new Error('Imagem do card indisponível.')); };
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

async function ensureFonts() {
  if (!globalThis.document?.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load('600 80px Fraunces'),
      document.fonts.load('400 48px Fraunces'),
      document.fonts.load('500 30px Outfit'),
    ]);
  } catch { /* o card usa fontes de fallback */ }
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Ajusta o tamanho da fonte até o texto caber no número máximo de linhas. */
function fit(ctx, text, {family, weight, max, min, maxWidth, maxLines}) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) return {size, lines};
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return {size: min, lines: wrap(ctx, text, maxWidth)};
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const width = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, -spacing);
  let cursor = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const previous = ctx.textAlign; ctx.textAlign = 'left';
  for (const c of chars) { ctx.fillText(c, cursor, y); cursor += ctx.measureText(c).width + spacing; }
  ctx.textAlign = previous;
}

function background(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, COLORS.forest);
  g.addColorStop(.55, COLORS.mid);
  g.addColorStop(1, COLORS.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * .5, H * .3, 40, W * .5, H * .3, 760);
  glow.addColorStop(0, 'rgba(215,189,121,.20)');
  glow.addColorStop(.45, 'rgba(215,229,174,.06)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Textura discreta de pontos para profundidade
  ctx.fillStyle = 'rgba(251,249,233,.035)';
  for (let y = 40; y < H; y += 48) for (let x = 40 + (y / 48 % 2) * 24; x < W; x += 48) ctx.fillRect(x, y, 2, 2);
  // Moldura fina
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 36, 36, W - 72, H - 72, 44);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFace(ctx, face, cx, cy, size) {
  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, size * .15, cx, cy, size * .72);
  halo.addColorStop(0, 'rgba(215,189,121,.30)');
  halo.addColorStop(.6, 'rgba(215,189,121,.08)');
  halo.addColorStop(1, 'rgba(215,189,121,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, size * .72, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(215,189,121,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * .56, Math.PI * .1, Math.PI * .9, true);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(251,249,233,.10)';
  ctx.beginPath();
  ctx.arc(cx, cy, size * .64, 0, Math.PI * 2);
  ctx.stroke();
  if (face) ctx.drawImage(face, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function cross(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
  ctx.moveTo(x - s * .62, y - s * .32); ctx.lineTo(x + s * .62, y - s * .32);
  ctx.stroke();
  ctx.restore();
}

/** Desenha o card e devolve um Blob PNG. */
export async function renderMomentCard(moment, {faceSrc = 'assets/mentra-face-hero.webp'} = {}) {
  if (typeof document === 'undefined') throw new Error('Canvas indisponível.');
  await ensureFonts();
  const face = await loadImage(faceSrc).catch(() => null);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  ctx.textBaseline = 'alphabetic';
  background(ctx);

  // Cabeçalho
  ctx.fillStyle = COLORS.sage;
  ctx.font = '600 24px Outfit, system-ui, sans-serif';
  spaced(ctx, 'MOMENTOS MENTRA', PAD, 142, 5);
  ctx.textAlign = 'left';
  ctx.font = '500 28px Outfit, system-ui, sans-serif';
  ctx.fillStyle = COLORS.gold;
  const label = String(moment.label || '').toUpperCase();
  spaced(ctx, label, W - PAD, 142, 4, 'right');
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(PAD, 178, W - PAD * 2, 2);

  // Rosto Mentra
  drawFace(ctx, face, W / 2, 540, 560);

  // Mede o bloco de texto para centralizá-lo entre o rosto e o rodapé
  ctx.textAlign = 'center';
  const title = fit(ctx, moment.title, {family: 'Fraunces, Georgia, serif', weight: 600, max: 80, min: 54, maxWidth: W - PAD * 2, maxLines: 2});
  const body = fit(ctx, `“${moment.text}”`, {family: 'Fraunces, Georgia, serif', weight: 400, max: 50, min: 34, maxWidth: W - PAD * 2 - 20, maxLines: 7});
  const themeH = moment.themeLabel ? 40 : 0;
  const blockH = themeH + 96 + title.lines.length * title.size * 1.12 + 34 + body.lines.length * body.size * 1.42 + (moment.reference ? 80 : 0);
  const top = 850, bottom = H - 250;
  let y = top + Math.max(0, (bottom - top - blockH) / 2);

  // Tema
  if (moment.themeLabel) {
    ctx.font = '600 24px Outfit, system-ui, sans-serif';
    ctx.fillStyle = COLORS.gold;
    spaced(ctx, String(moment.themeLabel).toUpperCase(), W / 2, y, 5, 'center');
    y += themeH;
  }
  cross(ctx, W / 2, y + 20, 22);
  y += 96 + title.size * .8;

  // Título
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.cream;
  ctx.font = `600 ${title.size}px Fraunces, Georgia, serif`;
  for (const line of title.lines) { ctx.fillText(line, W / 2, y); y += title.size * 1.12; }
  y += 34;

  // Frase
  ctx.font = `400 ${body.size}px Fraunces, Georgia, serif`;
  ctx.fillStyle = 'rgba(251,249,233,.92)';
  for (const line of body.lines) { ctx.fillText(line, W / 2, y); y += body.size * 1.42; }
  y += 22;

  // Referência
  if (moment.reference) {
    ctx.font = '600 30px Outfit, system-ui, sans-serif';
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(moment.reference, W / 2, y);
    ctx.font = '400 22px Outfit, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(215,229,191,.7)';
    ctx.fillText('Paráfrase bíblica', W / 2, y + 40);
  }

  // Rodapé
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(PAD, H - 210, W - PAD * 2, 2);
  ctx.fillStyle = COLORS.cream;
  ctx.font = '500 52px Outfit, system-ui, sans-serif';
  ctx.fillText('mentra', PAD, H - 120);
  const brandWidth = ctx.measureText('mentra').width;
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath(); ctx.arc(PAD + brandWidth + 14, H - 136, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = '500 18px Outfit, system-ui, sans-serif';
  ctx.fillStyle = COLORS.sage;
  spaced(ctx, 'LIFE', PAD + 4, H - 90, 9);
  ctx.font = '500 22px Outfit, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(215,229,191,.8)';
  spaced(ctx, 'UM PASSO DE CADA VEZ', W - PAD, H - 112, 4, 'right');

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.')), 'image/png');
  });
}

export const CARD_SIZE = Object.freeze({width: W, height: H});
