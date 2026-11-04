import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {
  PERIODS, defaultMomentsSettings, normalizeMomentsSettings,
  validateMomentsSettings, getMoment, getPeriodAt,
} from '../dist/moments-core.mjs';

test('moments defaults are neutral and use the three explicit example times', () => {
  assert.deepEqual(PERIODS, [
    {id: 'morning', label: 'Manhã', defaultTime: '08:00'},
    {id: 'afternoon', label: 'Tarde', defaultTime: '14:00'},
    {id: 'night', label: 'Noite', defaultTime: '20:00'},
  ]);
  assert.deepEqual(defaultMomentsSettings(), {
    enabled: true, christian: false,
    periods: {
      morning: {enabled: true, time: '08:00'},
      afternoon: {enabled: true, time: '14:00'},
      night: {enabled: true, time: '20:00'},
    },
  });
});

test('new settings and moment objects do not share mutable data', () => {
  const a = defaultMomentsSettings();
  a.periods.morning.time = '23:59';
  a.christian = true;
  assert.equal(defaultMomentsSettings().periods.morning.time, '08:00');
  assert.equal(defaultMomentsSettings().christian, false);
  const moment = getMoment('morning');
  moment.text = 'altered';
  assert.notEqual(getMoment('morning').text, 'altered');
  assert.ok(Object.isFrozen(PERIODS));
  assert.ok(PERIODS.every(Object.isFrozen));
});

test('normalization restores malformed and legacy preferences without mutation', () => {
  for (const input of [undefined, null, false, 2, 'true', []]) {
    assert.deepEqual(normalizeMomentsSettings(input), defaultMomentsSettings());
  }
  const input = {enabled: false, christian: true, periods: {
    morning: {enabled: false, time: '06:30'}, afternoon: null,
    night: {enabled: 'false', time: 'bad'}, unrelated: {enabled: true, time: '05:00'},
  }, unrelated: 'not persisted'};
  const before = JSON.stringify(input);
  const actual = normalizeMomentsSettings(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(actual.enabled, false);
  assert.equal(actual.christian, true);
  assert.deepEqual(actual.periods.morning, {enabled: false, time: '06:30'});
  assert.deepEqual(actual.periods.afternoon, {enabled: true, time: '14:00'});
  assert.deepEqual(actual.periods.night, {enabled: true, time: '20:00'});
  assert.equal(Object.hasOwn(actual, 'unrelated'), false);
  assert.equal(Object.hasOwn(actual.periods, 'unrelated'), false);
});

test('Christian content requires literal own-property true and never a truthy value', () => {
  for (const value of ['true', 'false', 1, [], {}, null]) {
    assert.equal(normalizeMomentsSettings({christian: value}).christian, false);
    assert.equal(validateMomentsSettings({christian: value}).ok, false);
    assert.equal(getMoment('morning', value).reference, null);
  }
  assert.equal(normalizeMomentsSettings(Object.create({christian: true})).christian, false);
  assert.notEqual(getMoment('morning', true).reference, null);
});

test('validation accepts missing optional fields and independent valid custom times', () => {
  for (const value of [undefined, null, {}, {periods: {}}, defaultMomentsSettings()]) {
    assert.equal(validateMomentsSettings(value).ok, true);
  }
  for (const times of [['23:59', '00:00', '12:34'], ['08:00', '08:00', '08:00']]) {
    const value = {enabled: false, christian: true, periods: Object.fromEntries(PERIODS.map(({id}, index) => [id, {enabled: false, time: times[index]}]))};
    const result = validateMomentsSettings(value);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.settings, value);
  }
});

test('validation rejects malformed input and every invalid HH:mm value', () => {
  for (const value of [false, 1, 'settings', [], {enabled: 'true'}, {christian: 1}, {periods: []}, {periods: null}, {periods: {morning: false}}, {periods: {night: {enabled: 0}}}]) {
    const result = validateMomentsSettings(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.every(error => typeof error === 'string'));
  }
  for (const value of ['', '8:00', '08:0', '24:00', '12:60', '-1:00', ' 08:00', '08:00 ', '08:00\n', '08:00:00', 800, null, undefined]) {
    const result = validateMomentsSettings({periods: {morning: {time: value}}});
    assert.equal(result.ok, false, String(value));
    assert.equal(result.settings.periods.morning.time, '08:00');
  }
});

test('all six messages use static public-only data and explicit attribution', () => {
  const neutralTexts = [
    'Você não precisa resolver o dia inteiro agora. Escolha um pequeno começo e siga no seu ritmo.',
    'Se o dia ficou pesado, faça uma pausa. Você pode ajustar o caminho e escolher só o próximo passo.',
    'O que ficou pendente pode esperar um pouco. Reconheça o que foi possível hoje e dê espaço ao descanso.',
  ];
  const references = ['Lamentações 3:22–23', 'Mateus 11:28', 'Salmo 4:8'];
  const ids = new Set();
  for (const [index, period] of PERIODS.entries()) {
    for (const christian of [false, true]) {
      const moment = getMoment(period.id, christian);
      ids.add(moment.id);
      assert.deepEqual(Object.keys(moment).sort(), ['id', 'period', 'label', 'title', 'text', 'reference', 'attribution', 'cardPath'].sort());
      assert.equal(moment.period, period.id);
      assert.equal(moment.label, period.label);
      assert.equal(moment.cardPath, `assets/moments/${moment.id}.png`);
      assert.match(moment.attribution, /Mentra Life/);
      if (christian) {
        assert.match(moment.attribution, /Paráfrase/);
        assert.equal(moment.reference, references[index]);
      } else {
        assert.equal(moment.reference, null);
        assert.equal(moment.text, neutralTexts[index]);
        assert.doesNotMatch(moment.text, /Jesus|Deus|Senhor|misericórdia/i);
      }
      assert.doesNotMatch(moment.text, /Deus disse|prosperidade|curar|cura garantida|culpa|Marina|R\$|@|https?:/i);
    }
  }
  assert.equal(ids.size, 6);
  for (const invalid of [undefined, null, 'bad', 'Morning', 0]) assert.throws(() => getMoment(invalid), RangeError);
});

test('display period uses local hours and covers all boundaries without scheduling', () => {
  for (const [hour, minute, expected] of [
    [0, 0, 'night'], [4, 59, 'night'], [5, 0, 'morning'], [11, 59, 'morning'],
    [12, 0, 'afternoon'], [17, 59, 'afternoon'], [18, 0, 'night'], [23, 59, 'night'],
  ]) assert.equal(getPeriodAt(new Date(2026, 9, 15, hour, minute)), expected);
  for (const invalid of [new Date('invalid'), '2026-10-15', null, 0]) assert.throws(() => getPeriodAt(invalid), TypeError);
});

test('display period follows the device timezone, never UTC or a hard-coded zone', () => {
  const moduleUrl = new URL('../dist/moments-core.mjs', import.meta.url).href;
  const source = `import {getPeriodAt} from ${JSON.stringify(moduleUrl)}; console.log(getPeriodAt(new Date('2026-10-15T15:00:00Z')));`;
  for (const [TZ, expected] of [['UTC', 'afternoon'], ['America/Los_Angeles', 'morning'], ['Asia/Tokyo', 'night']]) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', source], {env: {...process.env, TZ}, encoding: 'utf8'}).trim();
    assert.equal(result, expected, TZ);
  }
});

function readPng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const result = {metadata: {}, data: []};
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(data.length, length);
    if (type === 'IHDR') {
      result.width = data.readUInt32BE(0);
      result.height = data.readUInt32BE(4);
      assert.equal(data[8], 8, '8-bit image');
      assert.equal(data[9], 2, 'RGB image');
      assert.equal(data[12], 0, 'no interlacing');
    } else if (type === 'iTXt') {
      const keyEnd = data.indexOf(0);
      assert.equal(data[keyEnd + 1], 0, 'metadata is uncompressed');
      const languageEnd = data.indexOf(0, keyEnd + 3);
      const translationEnd = data.indexOf(0, languageEnd + 1);
      result.metadata[data.toString('utf8', 0, keyEnd)] = data.toString('utf8', translationEnd + 1);
    } else if (type === 'IDAT') result.data.push(data);
    else if (type === 'IEND') result.complete = true;
    offset += length + 12;
  }
  assert.equal(offset, bytes.length);
  assert.equal(result.complete, true);
  result.pixels = inflateSync(Buffer.concat(result.data));
  return result;
}

test('six real PNGs are decodable 1080x1920 and match the exact app text', () => {
  const directory = new URL('../dist/assets/moments/', import.meta.url);
  const expectedFiles = [];
  const faceHash = createHash('sha256').update(readFileSync(new URL('../dist/assets/mentra-face.png', import.meta.url))).digest('hex');
  assert.equal(faceHash, '7fd99528e76dc790e9675033e98a7c321b81c6e946f5d1478b646e6da70b7fb2', 'approved face remains unchanged');
  for (const christian of [false, true]) {
    for (const {id} of PERIODS) {
      const moment = getMoment(id, christian);
      expectedFiles.push(`${moment.id}.png`);
      const bytes = readFileSync(new URL(`../dist/${moment.cardPath}`, import.meta.url));
      assert.ok(bytes.length > 100_000, 'full-size static PNG, not a placeholder');
      const png = readPng(bytes);
      assert.equal(png.width, 1080);
      assert.equal(png.height, 1920);
      assert.equal(png.pixels.length, 1920 * (1 + 1080 * 3));
      assert.equal(png.metadata.Title, moment.title);
      assert.equal(png.metadata.Description, moment.text);
      assert.equal(png.metadata.Attribution, moment.attribution);
      assert.equal(png.metadata.Reference, moment.reference || '');
      assert.equal(png.metadata['Moment-ID'], moment.id);
      assert.equal(png.metadata['Face-SHA256'], faceHash);
    }
  }
  assert.deepEqual(readdirSync(directory).filter(name => name.endsWith('.png')).sort(), expectedFiles.sort());
});
