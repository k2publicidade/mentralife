/**
 * Momentos Mentra: conteúdo editorial estático e preferências locais.
 * Nenhuma função agenda, dispara ou confirma a entrega de notificações.
 * Paráfrases originais, conferidas em 15/10/2026 na NVI-PT publicada no
 * Bible Gateway. Os links servem à revisão editorial, sem acesso em runtime:
 * https://www.biblegateway.com/passage/?search=Lamenta%C3%A7%C3%B5es%203%3A22-23&version=NVI-PT
 * https://www.biblegateway.com/passage/?search=Mateus%2011%3A28&version=NVI-PT
 * https://www.biblegateway.com/passage/?search=Salmos%204%3A8&version=NVI-PT
 */

export const PERIODS = Object.freeze([
  Object.freeze({id: 'morning', label: 'Manhã', defaultTime: '08:00'}),
  Object.freeze({id: 'afternoon', label: 'Tarde', defaultTime: '14:00'}),
  Object.freeze({id: 'night', label: 'Noite', defaultTime: '20:00'}),
]);

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTime = value => typeof value === 'string' && TIME_PATTERN.test(value);

/** Always creates independent nested objects. Christian content is opt-in. */
export function defaultMomentsSettings() {
  return {
    enabled: true,
    christian: false,
    periods: Object.fromEntries(PERIODS.map(({id, defaultTime}) => [id, {enabled: true, time: defaultTime}])),
  };
}

/** Safely restores partial/legacy local settings without enabling religion by coercion. */
export function normalizeMomentsSettings(value) {
  const defaults = defaultMomentsSettings();
  if (!isRecord(value)) return defaults;
  if (Object.hasOwn(value, 'enabled') && typeof value.enabled === 'boolean') defaults.enabled = value.enabled;
  if (Object.hasOwn(value, 'christian') && typeof value.christian === 'boolean') defaults.christian = value.christian;
  if (isRecord(value.periods)) {
    for (const {id} of PERIODS) {
      const period = value.periods[id];
      if (!isRecord(period)) continue;
      if (typeof period.enabled === 'boolean') defaults.periods[id].enabled = period.enabled;
      if (isTime(period.time)) defaults.periods[id].time = period.time;
    }
  }
  return defaults;
}

/**
 * Validate supplied fields before saving. Missing fields use defaults.
 * null/undefined represent no saved preferences; malformed supplied fields fail.
 * Times are independent: custom schedules can cross midnight or coincide.
 * settings is the normalized candidate, but callers must not save when ok=false.
 */
export function validateMomentsSettings(value) {
  const settings = normalizeMomentsSettings(value);
  const errors = [];
  if (value === undefined || value === null) return {ok: true, errors, settings};
  if (!isRecord(value)) return {ok: false, errors: ['Preferências de momentos inválidas.'], settings};
  for (const [key, label] of [['enabled', 'Ativação dos momentos'], ['christian', 'Conteúdo cristão']]) {
    if (Object.hasOwn(value, key) && typeof value[key] !== 'boolean') errors.push(`${label}: escolha ativado ou desativado.`);
  }
  if (Object.hasOwn(value, 'periods') && !isRecord(value.periods)) {
    errors.push('Períodos dos momentos inválidos.');
  } else if (isRecord(value.periods)) {
    for (const {id, label} of PERIODS) {
      if (!Object.hasOwn(value.periods, id)) continue;
      const period = value.periods[id];
      if (!isRecord(period)) {
        errors.push(`${label}: preferências inválidas.`);
        continue;
      }
      if (Object.hasOwn(period, 'enabled') && typeof period.enabled !== 'boolean') errors.push(`${label}: escolha ativado ou desativado.`);
      if (Object.hasOwn(period, 'time') && !isTime(period.time)) errors.push(`${label}: informe um horário válido no formato HH:mm.`);
    }
  }
  return {ok: errors.length === 0, errors, settings};
}

const MOMENTS = Object.freeze({
  'neutral-morning': Object.freeze({
    title: 'Um pequeno começo',
    text: 'Você não precisa resolver o dia inteiro agora. Escolha um pequeno começo e siga no seu ritmo.',
    reference: null,
    attribution: 'Texto original · Mentra Life',
  }),
  'neutral-afternoon': Object.freeze({
    title: 'Espaço para uma pausa',
    text: 'Se o dia ficou pesado, faça uma pausa. Você pode ajustar o caminho e escolher só o próximo passo.',
    reference: null,
    attribution: 'Texto original · Mentra Life',
  }),
  'neutral-night': Object.freeze({
    title: 'Permita-se descansar',
    text: 'O que ficou pendente pode esperar um pouco. Reconheça o que foi possível hoje e dê espaço ao descanso.',
    reference: null,
    attribution: 'Texto original · Mentra Life',
  }),
  'christian-morning': Object.freeze({
    title: 'Misericórdia a cada manhã',
    text: 'A compaixão do Senhor não se esgota. Cada amanhecer renova suas misericórdias e nos lembra de sua fidelidade.',
    reference: 'Lamentações 3:22–23',
    attribution: 'Paráfrase bíblica · Mentra Life',
  }),
  'christian-afternoon': Object.freeze({
    title: 'Um convite ao descanso',
    text: 'Jesus acolhe quem está exausto e carrega um peso difícil. Seu convite é aproximar-se dele e encontrar descanso.',
    reference: 'Mateus 11:28',
    attribution: 'Paráfrase bíblica · Mentra Life',
  }),
  'christian-night': Object.freeze({
    title: 'Repousar em confiança',
    text: 'Ao encerrar o dia, o salmista encontra paz para repousar. Sua confiança está no cuidado do Senhor.',
    reference: 'Salmo 4:8',
    attribution: 'Paráfrase bíblica · Mentra Life',
  }),
});

/** Invalid periods are programming errors. Only literal true opts into Christian content. */
export function getMoment(period, christian = false) {
  const definition = PERIODS.find(item => item.id === period);
  if (!definition) throw new RangeError('Período de momento inválido.');
  const id = `${christian === true ? 'christian' : 'neutral'}-${period}`;
  return {id, period, label: definition.label, ...MOMENTS[id], cardPath: `assets/moments/${id}.png`};
}

/**
 * Device-local display period, not a notification schedule:
 * morning 05:00–11:59; afternoon 12:00–17:59; night 18:00–04:59.
 * Saved notification times do not change these editorial display periods.
 */
export function getPeriodAt(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Data local inválida.');
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}
