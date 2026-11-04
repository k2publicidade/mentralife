/**
 * Editable local suggestions for three broad journeys. No network, AI service,
 * storage, payment, notification or automatic execution belongs in this module.
 *
 * All text is plain text, including text that happens to contain HTML characters.
 * Render it with textContent or the UI's escaping helper, never as trusted HTML.
 * Mutations return a deep-cloned state; failures return the unchanged input.
 * Legacy state.plan and every unrelated field/version are preserved verbatim.
 */

export const TRACKS = Object.freeze([
  Object.freeze({id: 'discover', label: 'Encontrar um caminho', description: 'Explorar possibilidades de trabalho, renda, negócio ou vida pessoal.'}),
  Object.freeze({id: 'idea', label: 'Colocar uma ideia em prática', description: 'Transformar uma ideia em um teste pequeno e possível.'}),
  Object.freeze({id: 'ongoing', label: 'Organizar o que já começou', description: 'Identificar o gargalo e definir as próximas entregas.'}),
]);

const CONTEXTS = ['work', 'income', 'business', 'personal', 'undecided'];
const TIMES = [5, 15, 30, 60];
const STATUSES = ['active', 'paused', 'completed'];
const STEP_STATUSES = ['todo', 'doing', 'done'];
const MAX_STEPS = 100;
const FIELDS = Object.freeze({
  title: {label: 'Nome do caminho', max: 160, required: true},
  goal: {label: 'Objetivo', max: 500, required: true},
  audience: {label: 'Quem pode se beneficiar', max: 300},
  resources: {label: 'Recursos disponíveis', max: 500},
  skills: {label: 'Habilidades', max: 500},
  interests: {label: 'Interesses', max: 500},
  barrier: {label: 'Dificuldade atual', max: 500},
  priority: {label: 'Prioridade', max: 300},
});
const INPUT_KEYS = [...Object.keys(FIELDS), 'track', 'context', 'time'];
const PATCH_KEYS = [...Object.keys(FIELDS), 'context', 'time', 'status'];
const STEP_KEYS = ['title', 'description', 'dueDate', 'status'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = value => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
  && !['constructor', 'prototype', '__proto__'].includes(value);
const validCreationId = value => validId(value) && value.length <= 96;
const normal = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const short = value => value.length > 140 ? `${value.slice(0, 137)}…` : value;
const fail = (state, errors) => ({ok: false, state, journey: null, errors: Array.isArray(errors) ? errors : [errors], duplicate: false});
const stamp = () => new Date().toISOString();

function textField(value, definition, errors) {
  if (typeof value !== 'string') {
    errors.push(`${definition.label}: informe um texto.`);
    return '';
  }
  const clean = value.trim();
  if (definition.required && !clean) errors.push(`${definition.label}: preencha este campo.`);
  if (clean.length > definition.max) errors.push(`${definition.label}: use até ${definition.max} caracteres.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) errors.push(`${definition.label}: remova os caracteres de controle.`);
  return clean;
}

function unexpectedKeys(value, allowed, errors) {
  if (Object.keys(value).some(key => !allowed.includes(key))) errors.push('Há campos não permitidos nesta operação.');
}

/** Empty means no chosen deadline. Real calendar dates only; no timezone shift. */
function validDueDate(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeInput(raw, errors) {
  const result = {};
  for (const [key, definition] of Object.entries(FIELDS)) {
    let value = own(raw, key) ? raw[key] : '';
    if (key === 'title' && raw.track === 'discover' && typeof value === 'string' && !value.trim()) value = 'Meu primeiro caminho';
    result[key] = textField(value, definition, errors);
  }
  result.track = own(raw, 'track') ? raw.track : undefined;
  result.context = own(raw, 'context') ? raw.context : 'undecided';
  const time = own(raw, 'time') ? raw.time : 15;
  result.time = typeof time === 'string' && /^(5|15|30|60)$/.test(time.trim()) ? Number(time.trim()) : time;
  if (!TRACKS.some(track => track.id === result.track)) errors.push('Escolha uma das três trilhas.');
  if (!CONTEXTS.includes(result.context)) errors.push('Escolha um contexto válido.');
  if (!TIMES.includes(result.time)) errors.push('Escolha 5, 15, 30 ou 60 minutos.');
  if (result.track === 'ongoing' && !result.barrier) errors.push('Informe a dificuldade atual para organizar o que já começou.');
  return result;
}

function stateErrors(state) {
  if (!isRecord(state)) return ['Estado local inválido.'];
  if (!own(state, 'journeys')) return [];
  if (!Array.isArray(state.journeys)) return ['Os caminhos salvos precisam ser uma lista. Nenhum dado foi substituído.'];
  const ids = new Set(), confirmations = new Set();
  for (const journey of state.journeys) {
    if (!isRecord(journey) || !validId(journey.id) || ids.has(journey.id)) return ['Há um identificador de caminho inválido ou repetido nos dados salvos.'];
    ids.add(journey.id);
    if (own(journey, 'creationId')) {
      if (!validCreationId(journey.creationId) || confirmations.has(journey.creationId)) return ['Há uma confirmação inválida ou repetida nos caminhos salvos.'];
      confirmations.add(journey.creationId);
    }
  }
  return [];
}

function cloneState(state) {
  try { return {state: structuredClone(state)}; }
  catch { return {error: 'Não foi possível copiar o estado local. Nenhum dado foi alterado.'}; }
}

function fingerprint(input) {
  return JSON.stringify(INPUT_KEYS.map(key => input[key]));
}

function generatedSteps(input, journeyId) {
  const {track, context, time, goal, resources, skills, interests, audience, barrier, priority} = input;
  const timeHint = `Reserve até ${time} minutos; se não couber, divida em partes menores.`;
  const resourceHint = resources ? `Use o que já tem: ${short(resources)}.` : 'Use recursos que já estão ao seu alcance, sem gasto obrigatório.';
  let steps;
  if (track === 'discover') {
    const hypotheses = {
      work: 'Escolha uma função, atividade ou habilidade de trabalho que queira conhecer melhor. Não é preciso abrir um negócio.',
      income: 'Escolha uma possibilidade de renda ligada a algo que sabe ou quer aprender, como uma vaga ou uma ajuda que consiga oferecer. Não há garantia de renda.',
      business: 'Escolha uma necessidade que você conhece e uma hipótese de como poderia ajudar, antes de definir uma oferta ou investir.',
      personal: 'Escolha uma mudança na rotina, um interesse ou um projeto pessoal que queira experimentar.',
      undecided: 'Compare uma possibilidade de trabalho, renda, negócio ou vida pessoal. Escolha só uma hipótese para conhecer melhor agora.',
    };
    const tests = {
      work: 'Examine uma descrição de atividade ou faça uma pequena amostra com o que já sabe. Anote o que gostou e o que precisa aprender.',
      income: 'Investigue uma oportunidade concreta ou converse com alguém sobre uma necessidade. Descubra requisitos e limites antes de assumir compromissos.',
      business: 'Converse com alguém que vive a necessidade escolhida. Ouça como resolve isso hoje, sem comprar materiais nem prometer uma solução.',
      personal: 'Experimente uma pequena parte dessa mudança na sua rotina. Observe se ela cabe no seu tempo e se faz sentido para você.',
      undecided: 'Faça uma pequena experiência ou busque informação sobre a hipótese escolhida. Observe seu interesse e o esforço envolvido, sem obrigação de escolher um negócio.',
    };
    steps = [
      ['Reconhecer habilidades e interesses', `Liste algo que sabe fazer e algo que gostaria de explorar.${skills ? ` Habilidades anotadas: ${short(skills)}.` : ''}${interests ? ` Interesses anotados: ${short(interests)}.` : ''} ${timeHint}`],
      ['Escolher uma hipótese de caminho', `${hypotheses[context]} Sua direção atual: ${short(goal)}.`],
      ['Testar um pequeno começo', `${tests[context]} ${resourceHint} ${timeHint}`],
      ['Registrar o que aprendeu e decidir', 'Anote o que despertou interesse, o que foi difícil e o que ainda falta saber. Escolha entre continuar, ajustar a hipótese ou explorar outra possibilidade. O teste não garante sucesso.'],
    ];
  } else if (track === 'idea') {
    const benefit = {
      work: 'Descreva qual atividade, equipe ou oportunidade de trabalho a ideia pode ajudar e qual benefício pretende testar.',
      income: 'Descreva que necessidade poderia atender e como investigará se alguém precisa dessa ajuda. Receita é uma hipótese, não uma promessa.',
      business: 'Descreva para quem é a ideia, qual necessidade atende e qual benefício pretende testar antes de investir.',
      personal: 'Explique como a ideia pode ajudar você ou outras pessoas na rotina, no aprendizado ou em um projeto pessoal.',
      undecided: 'Explique quem pode se beneficiar, inclusive você, e o que a ideia pretende melhorar. Ela pode ser profissional, pessoal ou de negócio.',
    };
    const prototypes = {
      work: 'Crie um rascunho, uma amostra de trabalho ou um ensaio curto da atividade.',
      income: 'Descreva uma ajuda ou prepare uma pequena amostra do que poderia fazer, sem assumir vendas ou pagamentos.',
      business: 'Prepare uma descrição ou uma amostra simples da solução, sem depender de abrir empresa ou comprar materiais.',
      personal: 'Experimente uma versão pequena da ideia no seu dia ou faça um rascunho do que quer criar.',
      undecided: 'Prepare um rascunho ou experimente apenas uma parte da ideia para aprender antes de expandir.',
    };
    steps = [
      ['Definir quem se beneficia e como', `${benefit[context]}${audience ? ` Pessoas indicadas por você: ${short(audience)}.` : ' Se ainda não souber quem se beneficia, deixe isso como uma pergunta do teste.'} Objetivo: ${short(goal)}.`],
      ['Checar a necessidade antes de avançar', `${context === 'personal' ? 'Observe a situação na sua rotina e, se envolver outra pessoa, ouça o que ela precisa.' : 'Ouça alguém que poderia se beneficiar ou examine um exemplo real da necessidade. Faça perguntas, sem tentar convencer.'} Registre o que já sabe e o que ainda é uma hipótese. ${timeHint}`],
      ['Fazer uma versão pequena para testar', `${prototypes[context]} ${resourceHint} ${timeHint}`],
      ['Revisar o teste e escolher o próximo passo', 'Compare o que aconteceu com o benefício esperado. Registre um aprendizado e escolha se vale ajustar, continuar ou parar. Só você decide os próximos compromissos.'],
    ];
  } else {
    const inventories = {
      work: 'Liste o que está em andamento no trabalho, o que foi combinado e quem depende da próxima entrega.',
      income: 'Liste as atividades de renda em andamento, os compromissos assumidos e o que ainda precisa ser confirmado, sem tratar previsões como dinheiro recebido.',
      business: 'Liste as entregas, atendimentos e rotinas em andamento. Separe o que foi combinado do que ainda é uma possibilidade.',
      personal: 'Liste o que já começou na rotina ou no projeto pessoal, o que quer preservar e o que ainda falta fazer.',
      undecided: 'Liste o que já começou, o que está pendente e quem é afetado. Pode ser trabalho, renda, negócio ou uma atividade pessoal.',
    };
    steps = [
      ['Organizar o ponto de partida', `${inventories[context]} Objetivo atual: ${short(goal)}. ${timeHint}`],
      ['Escolher um gargalo e uma prioridade', `${barrier ? `Dificuldade informada: ${short(barrier)}.` : 'Identifique uma dificuldade que esteja impedindo o próximo avanço.'} ${priority ? `Prioridade informada: ${short(priority)}. Confira se ela ajuda a destravar esse ponto.` : 'Escolha só uma prioridade que ajude a destravar esse ponto.'}`],
      ['Definir a próxima entrega possível', `Escreva uma entrega pequena e como reconhecerá que ela terminou. Se houver dependências, registre-as; escolha você o prazo. ${resourceHint} ${timeHint}`],
      ['Revisar o avanço e reorganizar', 'Compare o que foi feito com a entrega escolhida. Registre o que segue bloqueado e escolha a próxima entrega. Ajuste a prioridade e os prazos conforme a situação real.'],
    ];
  }
  return steps.map(([title, description], index) => ({id: `${journeyId}-step-${index + 1}`, title, description, dueDate: '', status: 'todo'}));
}

/**
 * Required: track, goal and a stable creationId (also the journey id).
 * title is required except in discover, where empty means "Meu primeiro caminho".
 * ongoing also requires barrier; other optional text fields default to ''.
 * Optional text fields default to ''; context defaults to undecided, time to 15.
 * New paths start active with suggested steps. No supplied steps are executed.
 * Persist creationId + creationFingerprint unchanged: a retry of the original
 * normalized input stays idempotent even after the path or its steps are edited.
 * Different input with the same key is rejected, never used to overwrite a path.
 */
export function createJourney(state, raw, creationId) {
  const errors = stateErrors(state);
  if (!isRecord(raw)) return fail(state, [...errors, 'Dados do caminho inválidos.']);
  unexpectedKeys(raw, INPUT_KEYS, errors);
  if (!validCreationId(creationId)) errors.push('Identificador da confirmação inválido.');
  const input = normalizeInput(raw, errors);
  if (errors.length) return fail(state, errors);
  const journeys = state.journeys || [], creationFingerprint = fingerprint(input);
  const existing = journeys.find(journey => journey.creationId === creationId);
  if (existing && existing.creationFingerprint !== creationFingerprint) return fail(state, 'Esta confirmação já foi usada com dados diferentes.');
  const journeyId = creationId;
  if (!existing && journeys.some(journey => journey.id === journeyId)) return fail(state, 'O identificador deste caminho já está em uso. Nenhum caminho foi substituído.');
  const cloned = cloneState(state);
  if (cloned.error) return fail(state, cloned.error);
  const next = cloned.state;
  if (existing) return {ok: true, state: next, journey: next.journeys.find(journey => journey.creationId === creationId), errors: [], duplicate: true};
  const now = stamp();
  const journey = {id: journeyId, ...input, status: 'active', createdAt: now, updatedAt: now,
    steps: generatedSteps(input, journeyId), source: 'local_demo', creationId, creationFingerprint};
  next.journeys = [...(next.journeys || []), journey];
  return {ok: true, state: next, journey, errors: [], duplicate: false};
}

function validateStep(step, errors) {
  if (!isRecord(step)) { errors.push('Etapa inválida.'); return null; }
  const normalized = {
    id: step.id,
    title: textField(own(step, 'title') ? step.title : '', {label: 'Nome da etapa', max: 160, required: true}, errors),
    description: textField(own(step, 'description') ? step.description : '', {label: 'Descrição da etapa', max: 600}, errors),
    dueDate: own(step, 'dueDate') ? step.dueDate : '',
    status: own(step, 'status') ? step.status : 'todo',
  };
  if (!validId(normalized.id)) errors.push('Identificador da etapa inválido.');
  if (!validDueDate(normalized.dueDate)) errors.push('Informe uma data real no formato AAAA-MM-DD ou deixe o prazo vazio.');
  if (!STEP_STATUSES.includes(normalized.status)) errors.push('Escolha uma situação válida para a etapa.');
  return normalized;
}

function targetJourney(state, id) {
  const errors = stateErrors(state);
  if (!validId(id)) errors.push('Identificador do caminho inválido.');
  if (errors.length) return {errors};
  const journey = (state.journeys || []).find(item => item.id === id);
  if (!journey) return {errors: ['Caminho não encontrado.']};
  normalizeInput(journey, errors);
  if (!STATUSES.includes(journey.status)) errors.push('Situação do caminho inválida.');
  if (!Array.isArray(journey.steps) || journey.steps.length < 1 || journey.steps.length > MAX_STEPS) errors.push('O caminho precisa ter de 1 a 100 etapas.');
  else {
    const ids = new Set();
    for (const step of journey.steps) {
      validateStep(step, errors);
      if (ids.has(step?.id)) errors.push('Há identificadores de etapa repetidos.');
      ids.add(step?.id);
    }
    if (journey.status === 'completed' && !allDone(journey.steps)) errors.push('Um caminho concluído precisa ter todas as etapas concluídas.');
  }
  return {journey, errors};
}

const allDone = steps => Array.isArray(steps) && steps.length > 0 && steps.every(step => isRecord(step) && step.status === 'done');

function commitJourney(state, journey) {
  const cloned = cloneState(state);
  if (cloned.error) return fail(state, cloned.error);
  // Clone the replacement too: callers may mutate the result without altering input.
  const replacement = structuredClone({...journey, updatedAt: stamp()});
  cloned.state.journeys = cloned.state.journeys.map(item => item.id === journey.id ? replacement : item);
  return {ok: true, state: cloned.state, journey: replacement, errors: [], duplicate: false};
}

/** Edits onboarding details/status only; existing steps and track are preserved. */
export function updateJourney(state, id, patch) {
  const target = targetJourney(state, id);
  if (target.errors.length) return fail(state, target.errors);
  if (!isRecord(patch)) return fail(state, 'Alterações do caminho inválidas.');
  const errors = [];
  unexpectedKeys(patch, PATCH_KEYS, errors);
  if (!Object.keys(patch).length) errors.push('Informe ao menos uma alteração.');
  if (errors.length) return fail(state, errors);
  const candidate = {...target.journey, ...patch};
  const normalized = normalizeInput(candidate, errors);
  if (!STATUSES.includes(candidate.status)) errors.push('Escolha uma situação válida para o caminho.');
  if (candidate.status === 'completed' && !allDone(candidate.steps)) errors.push('Conclua todas as etapas antes de finalizar o caminho.');
  if (errors.length) return fail(state, errors);
  return commitJourney(state, {...candidate, ...normalized});
}

/**
 * Completing the last pending step completes the journey (even if paused).
 * Reopening a step in a completed journey returns it to active. Otherwise a
 * paused journey stays paused. Explicit status edits use updateJourney.
 */
export function updateJourneyStep(state, id, stepId, patch) {
  const target = targetJourney(state, id);
  if (target.errors.length) return fail(state, target.errors);
  if (!validId(stepId)) return fail(state, 'Identificador da etapa inválido.');
  const step = target.journey.steps.find(item => item.id === stepId);
  if (!step) return fail(state, 'Etapa não encontrada.');
  if (!isRecord(patch)) return fail(state, 'Alterações da etapa inválidas.');
  const errors = [];
  unexpectedKeys(patch, STEP_KEYS, errors);
  if (!Object.keys(patch).length) errors.push('Informe ao menos uma alteração.');
  const candidate = validateStep({...step, ...patch}, errors);
  if (errors.length) return fail(state, errors);
  const journey = {...target.journey, steps: target.journey.steps.map(item => item.id === stepId ? {...item, ...candidate} : item)};
  journey.status = allDone(journey.steps) ? 'completed' : journey.status === 'completed' ? 'active' : journey.status;
  return commitJourney(state, journey);
}

/** Adds one editable step. An optional explicit id must be valid and unused. */
export function addJourneyStep(state, id, raw) {
  const target = targetJourney(state, id);
  if (target.errors.length) return fail(state, target.errors);
  if (!isRecord(raw)) return fail(state, 'Dados da nova etapa inválidos.');
  if (target.journey.steps.length >= MAX_STEPS) return fail(state, 'Este caminho já tem 100 etapas. Ajuste as etapas existentes.');
  const errors = [];
  unexpectedKeys(raw, [...STEP_KEYS, 'id'], errors);
  let index = target.journey.steps.length + 1;
  while (target.journey.steps.some(step => step.id === `${id}-step-${index}`)) index++;
  const step = validateStep({...raw, id: own(raw, 'id') ? raw.id : `${id}-step-${index}`}, errors);
  if (step && target.journey.steps.some(item => item.id === step.id)) errors.push('O identificador da etapa já está em uso.');
  if (errors.length) return fail(state, errors);
  const journey = {...target.journey, steps: [...target.journey.steps, step]};
  journey.status = allDone(journey.steps) ? 'completed' : journey.status === 'completed' ? 'active' : journey.status;
  return commitJourney(state, journey);
}

/** Progress is derived, never saved. nextStep is a detached plain-text object. */
export function journeyProgress(journey) {
  const steps = Array.isArray(journey?.steps) ? journey.steps.filter(step => isRecord(step)) : [];
  const total = steps.length, done = steps.filter(step => step.status === 'done').length;
  const doing = steps.filter(step => step.status === 'doing').length;
  const todo = steps.filter(step => step.status === 'todo').length;
  const next = steps.find(step => step.status === 'doing') || steps.find(step => step.status === 'todo');
  const nextStep = next ? Object.fromEntries(['id', ...STEP_KEYS].map(key => [key, typeof next[key] === 'string' ? next[key] : ''])) : null;
  return {total, done, doing, todo, percent: total ? Math.round(done / total * 100) : 0, nextStep};
}

/**
 * A scripted, read-only response. suggestion is for review only and is never
 * passed to any updater. No information is sent out and no chat is persisted.
 * Returns {ok,text,suggestion,errors,source}; suggestion is plain text or null.
 */
export function mentorReply(journey, prompt) {
  const errors = [];
  const clean = textField(prompt, {label: 'Pergunta', max: 600, required: true}, errors);
  if (!isRecord(journey)) errors.push('Escolha um caminho válido.');
  else errors.push(...targetJourney({journeys: [journey]}, journey.id).errors);
  if (errors.length) return {ok: false, text: 'Revise os dados antes de pedir uma sugestão.', suggestion: null, errors, source: 'local_demo'};
  const progress = journeyProgress(journey), next = progress.nextStep;
  const disclosure = 'Resposta roteirizada da demonstração. A sugestão é editável e nada foi alterado.';
  if (!next) return {ok: true, text: `Todas as ${progress.total} etapas estão concluídas. Revise o que aprendeu em “${journey.title}” antes de decidir se quer criar outra etapa. ${disclosure}`,
    suggestion: `Revisar o que foi aprendido: compare as etapas concluídas com seu objetivo: ${journey.goal}`, errors: [], source: 'local_demo'};
  const query = normal(clean);
  const paused = journey.status === 'paused' ? 'Seu caminho está pausado. Você pode revisar a sugestão e decidir quando retomar. ' : '';
  let text, suggestion;
  if (/simplif|menor|pequen|dific|trav|sobrecarreg|nao consigo/.test(query)) {
    const description = `Trabalhe por até ${Math.min(journey.time, 5)} minutos em uma única parte de “${next.title}”. Registre o que conseguiu e o que falta, sem marcar a etapa como concluída antes de terminar o que você definiu.`;
    text = `${paused}Podemos diminuir o próximo esforço. ${description}${journey.barrier ? ` Você apontou esta dificuldade: ${journey.barrier}.` : ''} ${disclosure}`;
    suggestion = description;
  } else if (/priori|primeir|proxim|foc|comec|ordem|^start$/.test(query)) {
    text = `${paused}${journey.priority ? `Sua prioridade registrada é “${journey.priority}”. ` : ''}Como ponto de partida, sugiro “${next.title}”${next.status === 'doing' ? ', que já está em andamento' : ', a primeira etapa ainda pendente'}. Confira se ela atende ao seu objetivo: ${journey.goal}. ${disclosure}`;
    suggestion = `${next.title}: ${next.description}`;
  } else {
    text = `${paused}Seu objetivo é “${journey.goal}”. A próxima etapa sugerida é “${next.title}”: ${next.description} Você reservou ${journey.time} minutos por vez. Ajuste o plano ao que fizer sentido para você. ${disclosure}`;
    suggestion = `${next.title}: ${next.description}`;
  }
  return {ok: true, text, suggestion, errors: [], source: 'local_demo'};
}
