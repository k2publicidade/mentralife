import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKS, createJourney, updateJourney, updateJourneyStep,
  addJourneyStep, journeyProgress, mentorReply,
} from '../dist/journeys-core.mjs';

const input = (track = 'discover', overrides = {}) => ({
  track, title: 'Um caminho possível', goal: 'Encontrar uma direção que caiba na rotina',
  context: 'undecided', resources: 'Caderno e celular', time: 15,
  skills: 'Escrever e organizar', interests: 'Aprender', audience: '',
  barrier: track === 'ongoing' ? 'Muitas coisas começaram ao mesmo tempo' : '',
  priority: '', ...overrides,
});
const make = (track = 'discover', overrides = {}, state = {}, id = 'confirmation-1') => {
  const result = createJourney(state, input(track, overrides), id);
  assert.equal(result.ok, true, result.errors?.join(' '));
  return result;
};
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const failure = (result, state) => {
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(result.journey, null);
  assert.equal(result.duplicate, false);
  assert.ok(result.errors.length);
  assert.ok(result.errors.every(error => typeof error === 'string'));
};
const complete = initial => {
  let result = initial;
  for (const step of initial.journey.steps) {
    result = updateJourneyStep(result.state, result.journey.id, step.id, {status: 'done'});
    assert.equal(result.ok, true, result.errors.join(' '));
  }
  return result;
};

test('tracks expose the three broad, immutable journeys with generic labels', () => {
  assert.deepEqual(TRACKS.map(track => track.id), ['discover', 'idea', 'ongoing']);
  assert.ok(Object.isFrozen(TRACKS));
  assert.ok(TRACKS.every(Object.isFrozen));
  assert.match(TRACKS[0].description, /trabalho, renda, negócio ou vida pessoal/);
  assert.ok(TRACKS.every(track => typeof track.label === 'string' && typeof track.description === 'string'));
});

for (const track of ['discover', 'idea', 'ongoing']) {
  test(`${track}: create a complete editable plan without a selected deadline`, () => {
    const raw = freeze(input(track));
    const {journey, state, errors, duplicate} = createJourney({}, raw, `confirm-${track}`);
    assert.equal(journey.id, `confirm-${track}`);
    assert.equal(journey.creationId, journey.id);
    assert.equal(journey.track, track);
    assert.equal(journey.source, 'local_demo');
    assert.equal(journey.status, 'active');
    assert.equal(journey.time, 15);
    assert.equal(journey.createdAt, journey.updatedAt);
    assert.ok(Number.isFinite(Date.parse(journey.createdAt)));
    assert.equal(journey.steps.length, 4);
    assert.equal(new Set(journey.steps.map(step => step.id)).size, 4);
    for (const step of journey.steps) {
      assert.equal(step.status, 'todo');
      assert.equal(step.dueDate, '');
      assert.ok(step.title.length > 0 && step.title.length <= 160);
      assert.ok(step.description.length > 0 && step.description.length <= 600);
    }
    assert.equal(state.journeys[0], journey);
    assert.deepEqual(errors, []);
    assert.equal(duplicate, false);
  });
}

test('each track and context has distinct useful suggestions, including personal and work contexts', () => {
  const plans = new Set();
  for (const track of ['discover', 'idea', 'ongoing']) {
    for (const context of ['work', 'income', 'business', 'personal', 'undecided']) {
      const {journey} = make(track, {context}, {}, `${track}-${context}`);
      const text = journey.steps.map(step => `${step.title}: ${step.description}`).join('\n');
      plans.add(text);
      assert.doesNotMatch(text, /renda garantida|sucesso garantido|diagnóstico|você vai ganhar|você ganhará|R\$|https?:\/\//i);
      if (track === 'discover') {
        assert.match(journey.steps[0].title, /habilidades e interesses/i);
        assert.match(journey.steps[1].title, /hipótese/);
        assert.match(journey.steps[2].title, /Testar/);
      }
      if (track === 'idea') {
        assert.match(journey.steps[0].title, /beneficia/);
        assert.match(journey.steps[2].title, /testar/);
      }
      if (track === 'ongoing') {
        assert.match(journey.steps[1].title, /gargalo e uma prioridade/);
        assert.match(journey.steps[2].title, /entrega/);
      }
      if (context === 'personal') assert.match(text, /rotina|pessoal/);
      if (context === 'work') assert.match(text, /trabalho/);
    }
  }
  assert.equal(plans.size, 15);
});

test('context, existing resources, available time and relevant answers inform the suggestions', () => {
  const discovery = make('discover', {skills: 'Cuidar de plantas', interests: 'Jardinagem', resources: '', time: 5}).journey;
  assert.match(discovery.steps[0].description, /Cuidar de plantas/);
  assert.match(discovery.steps[0].description, /Jardinagem/);
  assert.match(discovery.steps[0].description, /5 minutos/);
  assert.match(discovery.steps[2].description, /sem gasto obrigatório/);
  const idea = make('idea', {audience: 'Minha equipe', resources: 'Papel e lápis', time: 60}).journey;
  assert.match(idea.steps[0].description, /Minha equipe/);
  assert.match(idea.steps[2].description, /Papel e lápis/);
  assert.match(idea.steps[2].description, /60 minutos/);
  const ongoing = make('ongoing', {barrier: 'Não sei por onde retomar', priority: 'Terminar o rascunho'}).journey;
  assert.match(ongoing.steps[1].description, /Não sei por onde retomar/);
  assert.match(ongoing.steps[1].description, /Terminar o rascunho/);
});

test('legacy plan and every unrelated state field survive without version changes or aliasing', () => {
  const legacy = freeze({
    version: 5, financeVersion: 5, plan: {key: 'income', steps: [{id: 'old-1', done: true}]},
    tasks: [{id: 'task-1', done: false}], accounts: [{id: 'bank', openingBalanceCents: 0}],
    documents: [{id: 'document', dataUrl: 'data:application/pdf;base64,example'}],
    moments: {enabled: false}, messages: [{text: 'antes'}], custom: {keep: [1, 2]},
  });
  const before = structuredClone(legacy);
  const result = make('idea', {}, legacy);
  const {journeys, ...other} = result.state;
  assert.deepEqual(other, before);
  assert.deepEqual(legacy, before);
  assert.notEqual(result.state, legacy);
  assert.notEqual(result.state.plan, legacy.plan);
  assert.notEqual(result.state.plan.steps, legacy.plan.steps);
  result.state.plan.steps[0].done = false;
  result.state.custom.keep.push(3);
  assert.deepEqual(legacy, before);
  assert.equal(journeys.length, 1);
  const noVersion = make().state;
  assert.equal(Object.hasOwn(noVersion, 'version'), false);
});

test('creation appends without overwriting an existing journey and keeps original order', () => {
  const first = make('discover', {}, {}, 'first');
  const original = structuredClone(first.state);
  freeze(first.state);
  const second = make('ongoing', {}, first.state, 'second');
  assert.deepEqual(second.state.journeys[0], first.journey);
  assert.notEqual(second.state.journeys[0], first.journey);
  assert.deepEqual(second.state.journeys.map(journey => journey.id), ['first', 'second']);
  assert.deepEqual(first.state, original);
});

test('discovery accepts missing or blank title; defaults remain bounded and deterministic', () => {
  for (const raw of [{track: 'discover', goal: 'Explorar'}, {track: 'discover', title: '  ', goal: ' Explorar '}]) {
    const result = createJourney({}, raw, 'discovery');
    assert.equal(result.ok, true);
    assert.equal(result.journey.title, 'Meu primeiro caminho');
    assert.equal(result.journey.goal, 'Explorar');
    assert.equal(result.journey.context, 'undecided');
    assert.equal(result.journey.time, 15);
    for (const field of ['resources', 'audience', 'skills', 'interests', 'barrier', 'priority']) assert.equal(result.journey[field], '');
  }
  for (const track of ['idea', 'ongoing']) {
    const state = {};
    failure(createJourney(state, input(track, {title: '   '}), track), state);
  }
  const state = {};
  failure(createJourney(state, input('ongoing', {barrier: ''}), 'ongoing'), state);
});

test('every supported numeric/select time is normalized; invalid coercions are rejected', () => {
  for (const time of [5, 15, 30, 60, '5', '15', '30', '60', ' 15 ']) {
    assert.equal(make('idea', {time}).journey.time, Number(time));
  }
  for (const time of [0, 10, -5, 61, Infinity, NaN, true, null, undefined, {}, [], '', '15 min', '015', '1.5e1']) {
    const state = {};
    failure(createJourney(state, input('idea', {time}), 'time'), state);
  }
});

test('text, enums, shape, ids and immutable creation fields are strictly validated', () => {
  const state = freeze({plan: {legacy: true}});
  const badInputs = [null, [], false, 42, 'idea',
    input('other'), input('Discover'), input('idea', {context: 'company'}),
    input('idea', {title: ''}), input('idea', {goal: ' \n '}),
    input('idea', {title: 'x'.repeat(161)}), input('idea', {goal: 'x'.repeat(501)}),
    input('idea', {audience: 'x'.repeat(301)}), input('idea', {resources: 'x'.repeat(501)}),
    input('idea', {skills: 'x'.repeat(501)}), input('idea', {interests: 'x'.repeat(501)}),
    input('idea', {barrier: 'x'.repeat(501)}), input('idea', {priority: 'x'.repeat(301)}),
    input('idea', {goal: 42}), input('idea', {resources: []}), input('idea', {audience: null}),
    input('idea', {title: 'a\u0000b'}), input('idea', {id: 'override'}),
    input('idea', {status: 'completed'}), input('idea', {steps: []}),
    input('idea', {createdAt: '2026-01-01'}), input('idea', {source: 'real_ai'}),
  ];
  for (const raw of badInputs) failure(createJourney(state, raw, 'bad-input'), state);
  for (const id of [undefined, null, '', ' ', 7, {}, [], '../path', '<img>', '__proto__', 'constructor', 'prototype', 'a/b', 'id\n', 'x'.repeat(97)]) {
    failure(createJourney(state, input(), id), state);
  }
  const inherited = Object.create({track: 'discover', title: 'Inherited', goal: 'Inherited'});
  failure(createJourney(state, inherited, 'inherited'), state);
  const poisoned = JSON.parse('{"track":"idea","title":"Test","goal":"Goal","__proto__":{"polluted":true}}');
  failure(createJourney(state, poisoned, 'poisoned'), state);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(state, {plan: {legacy: true}});
});

test('all exact UI text limits create valid generated steps and remain editable', () => {
  const limits = {title: 160, goal: 500, audience: 300, resources: 500, skills: 500, interests: 500, barrier: 500, priority: 300};
  const answers = Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key, 'x'.repeat(limit)]));
  for (const track of ['discover', 'idea', 'ongoing']) {
    for (const context of ['work', 'income', 'business', 'personal', 'undecided']) {
      const result = make(track, {...answers, context});
      assert.ok(result.journey.steps.every(step => step.description.length <= 600));
      assert.equal(updateJourney(result.state, result.journey.id, {priority: 'Agora'}).ok, true);
    }
  }
});

test('same confirmation is idempotent across normalized input and repeated clicks', () => {
  const raw = input('idea', {time: '15', title: '  Ideia pequena  '});
  const first = createJourney({version: 5, plan: {legacy: true}}, raw, 'repeat');
  const before = structuredClone(first.state);
  freeze(first.state);
  const repeated = createJourney(first.state, {...raw, title: 'Ideia pequena', time: 15}, 'repeat');
  assert.equal(repeated.ok, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.journeys.length, 1);
  assert.deepEqual(repeated.state, before);
  assert.notEqual(repeated.state, first.state);
  assert.notEqual(repeated.journey, first.journey);
  assert.deepEqual(first.state, before);
});

test('original confirmation remains idempotent after editing or completing the journey', () => {
  const raw = input('idea');
  const first = createJourney({}, raw, 'edit-then-repeat');
  const edited = updateJourney(first.state, first.journey.id, {title: 'Nome atualizado', goal: 'Objetivo atualizado'});
  const completed = complete(edited);
  const retry = createJourney(completed.state, raw, 'edit-then-repeat');
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.journey.title, 'Nome atualizado');
  assert.equal(retry.journey.goal, 'Objetivo atualizado');
  assert.equal(retry.journey.status, 'completed');
  assert.deepEqual(retry.state, completed.state);
});

test('reusing a confirmation with different inputs rejects collision instead of overwriting', () => {
  const first = make('idea', {}, {}, 'used');
  const before = structuredClone(first.state);
  for (const changes of [{goal: 'Different'}, {context: 'work'}, {time: 30}, {resources: 'Another'}, {track: 'discover'}]) {
    failure(createJourney(first.state, input('idea', changes), 'used'), first.state);
  }
  assert.deepEqual(first.state, before);
  const occupyingState = {journeys: [{id: 'occupied', legacyData: 'keep'}]};
  failure(createJourney(occupyingState, input(), 'occupied'), occupyingState);
  assert.deepEqual(occupyingState.journeys, [{id: 'occupied', legacyData: 'keep'}]);
});

test('malformed saved state is not silently replaced or mutated', () => {
  for (const state of [null, [], false, 'state', {journeys: null}, {journeys: {}}, {journeys: 'legacy'},
    {journeys: [null]}, {journeys: [{id: 'bad id'}]}, {journeys: [{id: 'same'}, {id: 'same'}]},
    {journeys: [{id: 'one', creationId: 'key'}, {id: 'two', creationId: 'key'}]},
    {journeys: [{id: 'one', creationId: '<bad>'}]}, {uncloneable: () => true}]) {
    failure(createJourney(state, input(), 'new'), state);
  }
});

test('update edits only requested details without regenerating steps or mutating previous states', () => {
  const initial = make('idea', {}, {plan: {steps: [{done: true}]}});
  const second = make('discover', {}, initial.state, 'another');
  const before = structuredClone(second.state);
  freeze(second.state);
  const edited = updateJourney(second.state, initial.journey.id, {title: '  Novo nome ', goal: 'Novo objetivo', context: 'personal', resources: 'Livro', time: '30', status: 'paused'});
  assert.equal(edited.ok, true);
  assert.equal(edited.journey.title, 'Novo nome');
  assert.equal(edited.journey.time, 30);
  assert.equal(edited.journey.status, 'paused');
  assert.equal(edited.journey.createdAt, initial.journey.createdAt);
  assert.equal(edited.journey.creationFingerprint, initial.journey.creationFingerprint);
  assert.deepEqual(edited.journey.steps, initial.journey.steps);
  assert.notEqual(edited.journey.steps, initial.journey.steps);
  assert.deepEqual(edited.state.plan, before.plan);
  assert.deepEqual(edited.state.journeys[1], before.journeys[1]);
  assert.deepEqual(second.state, before);
});

test('update rejects unknown targets, protected fields, incomplete completion and bad input', () => {
  const {state, journey} = make('idea');
  for (const id of ['missing', '', null, '<id>']) failure(updateJourney(state, id, {title: 'New'}), state);
  for (const patch of [null, [], 'new', {}, {title: ''}, {goal: 1}, {context: 'invalid'}, {time: 10},
    {status: 'invalid'}, {status: 'completed'}, {id: 'different'}, {track: 'discover'},
    {creationId: 'different'}, {creationFingerprint: 'changed'}, {source: 'ai'},
    {steps: []}, {createdAt: '2026-01-01'}, {updatedAt: '2026-01-01'},
    {status: 'completed', steps: null}]) failure(updateJourney(state, journey.id, patch), state);
});

test('progress uses status, prefers a step already in progress, and returns a detached next step', () => {
  const initial = make();
  assert.deepEqual(journeyProgress(initial.journey), {total: 4, done: 0, doing: 0, todo: 4, percent: 0, nextStep: initial.journey.steps[0]});
  let next = updateJourneyStep(initial.state, initial.journey.id, initial.journey.steps[2].id, {status: 'doing'});
  next = updateJourneyStep(next.state, next.journey.id, initial.journey.steps[0].id, {status: 'done'});
  const progress = journeyProgress(next.journey);
  assert.deepEqual({total: progress.total, done: progress.done, doing: progress.doing, todo: progress.todo, percent: progress.percent}, {total: 4, done: 1, doing: 1, todo: 2, percent: 25});
  assert.equal(progress.nextStep.id, initial.journey.steps[2].id);
  progress.nextStep.title = 'Changed outside';
  assert.notEqual(next.journey.steps[2].title, 'Changed outside');
  assert.equal(initial.journey.steps[0].status, 'todo');
});

test('completing the last step completes; reopening it reactivates the journey', () => {
  const initial = make();
  const completed = complete(initial);
  assert.equal(completed.journey.status, 'completed');
  assert.equal(journeyProgress(completed.journey).percent, 100);
  assert.equal(journeyProgress(completed.journey).nextStep, null);
  assert.equal(updateJourney(completed.state, completed.journey.id, {status: 'completed'}).ok, true);
  const reOpen = updateJourneyStep(completed.state, completed.journey.id, completed.journey.steps[0].id, {status: 'todo'});
  assert.equal(reOpen.ok, true);
  assert.equal(reOpen.journey.status, 'active');
  assert.equal(journeyProgress(reOpen.journey).percent, 75);
  assert.equal(completed.journey.status, 'completed');
  assert.ok(completed.journey.steps.every(step => step.status === 'done'));
});

test('pausing is preserved while editing steps until all steps are complete', () => {
  const initial = make();
  const paused = updateJourney(initial.state, initial.journey.id, {status: 'paused'});
  const doing = updateJourneyStep(paused.state, paused.journey.id, paused.journey.steps[0].id, {status: 'doing'});
  assert.equal(doing.journey.status, 'paused');
  const added = addJourneyStep(doing.state, doing.journey.id, {title: 'Etapa extra'});
  assert.equal(added.journey.status, 'paused');
  assert.equal(complete(added).journey.status, 'completed');
  assert.equal(updateJourney(doing.state, doing.journey.id, {status: 'active'}).journey.status, 'active');
});

test('step edits accept real dates including leap days and an empty optional date', () => {
  const initial = make();
  for (const dueDate of ['', '2024-02-29', '2026-10-15', '2000-02-29', '0001-01-01', '9999-12-31']) {
    const result = updateJourneyStep(initial.state, initial.journey.id, initial.journey.steps[0].id,
      {title: '  Minha etapa  ', description: 'Descrição editável', dueDate});
    assert.equal(result.ok, true, result.errors.join(' '));
    assert.equal(result.journey.steps[0].title, 'Minha etapa');
    assert.equal(result.journey.steps[0].description, 'Descrição editável');
    assert.equal(result.journey.steps[0].dueDate, dueDate);
    assert.equal(initial.journey.steps[0].dueDate, '');
  }
});

test('step validation rejects impossible dates, invalid enums, ids and protected fields', () => {
  const {state, journey} = make();
  for (const dueDate of ['2026-02-29', '2026-02-30', '2026-04-31', '1900-02-29', '2026-13-01',
    '2026-00-01', '2026-10-00', '0000-01-01', '2026-1-01', '15/10/2026', '2026-10-15T00:00:00Z',
    '2026-10-15\n', null, undefined, 20261015, {}]) {
    failure(updateJourneyStep(state, journey.id, journey.steps[0].id, {dueDate}), state);
  }
  for (const patch of [{title: ''}, {title: 'x'.repeat(161)}, {description: 'x'.repeat(601)},
    {description: []}, {status: 'complete'}, {status: true}, {id: 'replacement'}, {done: true}, {}, null, []]) {
    failure(updateJourneyStep(state, journey.id, journey.steps[0].id, patch), state);
  }
  for (const id of [null, '', '<step>', 'missing']) failure(updateJourneyStep(state, journey.id, id, {status: 'done'}), state);
  failure(updateJourneyStep(state, 'missing', journey.steps[0].id, {status: 'done'}), state);
});

test('adding steps never overwrites and reopening by addition reactivates a completed journey', () => {
  const initial = complete(make());
  const before = structuredClone(initial.state);
  freeze(initial.state);
  const added = addJourneyStep(initial.state, initial.journey.id, {title: 'Uma nova etapa', description: 'Definir um teste', dueDate: '2026-12-31'});
  assert.equal(added.ok, true);
  assert.equal(added.journey.steps.length, 5);
  assert.equal(added.journey.status, 'active');
  assert.equal(added.journey.steps[4].status, 'todo');
  assert.equal(added.journey.steps[4].dueDate, '2026-12-31');
  assert.deepEqual(added.journey.steps.slice(0, 4), initial.journey.steps);
  assert.deepEqual(initial.state, before);
  const explicit = addJourneyStep(added.state, added.journey.id, {id: 'my-step', title: 'Etapa identificada', status: 'doing'});
  assert.equal(explicit.ok, true);
  assert.equal(explicit.journey.steps[5].id, 'my-step');
  failure(addJourneyStep(explicit.state, explicit.journey.id, {id: 'my-step', title: 'Collision'}), explicit.state);
  const doneAddition = addJourneyStep(initial.state, initial.journey.id, {title: 'Também terminada', status: 'done'});
  assert.equal(doneAddition.journey.status, 'completed');
});

test('adding steps validates all supplied fields and avoids generated id collisions', () => {
  const initial = make();
  for (const raw of [null, [], '', {}, {title: ' '}, {title: 'Valid', id: ''}, {title: 'Valid', id: '../x'},
    {title: 'Valid', dueDate: '2026-02-30'}, {title: 'Valid', status: 'complete'},
    {title: 'Valid', description: 'x'.repeat(601)}, {title: 'Valid', source: 'ai'}]) {
    failure(addJourneyStep(initial.state, initial.journey.id, raw), initial.state);
  }
  const occupied = addJourneyStep(initial.state, initial.journey.id, {id: `${initial.journey.id}-step-6`, title: 'Ocupa o próximo id'});
  const next = addJourneyStep(occupied.state, occupied.journey.id, {title: 'Não sobrescrever'});
  assert.equal(next.journey.steps.at(-1).id, `${initial.journey.id}-step-7`);
  assert.equal(new Set(next.journey.steps.map(step => step.id)).size, next.journey.steps.length);
  const full = structuredClone(initial.state);
  full.journeys[0].steps = Array.from({length: 100}, (_, index) => ({id: `max-${index}`, title: 'Etapa', description: '', dueDate: '', status: 'todo'}));
  failure(addJourneyStep(full, initial.journey.id, {title: 'Etapa 101'}), full);
});

test('corrupt stored targets fail safely rather than repair or discard user content', () => {
  const initial = make();
  for (const change of [journey => {journey.steps = [];}, journey => {journey.steps = [null];},
    journey => {journey.steps[1].id = journey.steps[0].id;}, journey => {journey.steps[0].dueDate = '2026-02-30';},
    journey => {journey.steps[0].status = 'invalid';}, journey => {journey.status = 'completed';},
    journey => {journey.status = 'unknown';}, journey => {journey.goal = null;}]) {
    const state = structuredClone(initial.state);
    change(state.journeys[0]);
    const before = structuredClone(state);
    failure(updateJourney(state, initial.journey.id, {title: 'Changed'}), state);
    failure(updateJourneyStep(state, initial.journey.id, initial.journey.steps[0].id, {status: 'done'}), state);
    failure(addJourneyStep(state, initial.journey.id, {title: 'New'}), state);
    assert.deepEqual(state, before);
  }
  const state = structuredClone(initial.state);
  state.journeys[0].status = 'completed';
  state.journeys[0].steps = [null];
  failure(updateJourney(state, initial.journey.id, {title: 'Changed'}), state);
});

test('plain text remains plain data; escaping belongs to the rendering boundary', () => {
  const text = '<img src=x onerror="alert(1)"> & "test" <script>text</script>';
  const initial = make('idea', {title: text, goal: text, audience: text});
  assert.equal(initial.journey.title, text);
  assert.equal(initial.journey.goal, text);
  assert.match(initial.journey.steps[0].description, /<script>text<\/script>/);
  const edited = updateJourneyStep(initial.state, initial.journey.id, initial.journey.steps[0].id, {title: text, description: text});
  assert.equal(edited.journey.steps[0].description, text);
  const reply = mentorReply(edited.journey, 'explain');
  assert.equal(reply.ok, true);
  assert.match(reply.text, /<img/);
  assert.equal(typeof reply.suggestion, 'string');
});

test('mentor explains, prioritizes and simplifies existing data without changing or persisting anything', () => {
  const initial = make('ongoing', {priority: 'Concluir meu rascunho', barrier: 'Pouco tempo', time: 30});
  const state = freeze(initial.state);
  const before = structuredClone(state);
  for (const prompt of ['start', 'priority', 'simplify', 'explique meu plano', 'Qual é o próximo passo?', 'Pode simplificar?', 'Qual prioridade agora?']) {
    const reply = mentorReply(initial.journey, prompt);
    assert.equal(reply.ok, true);
    assert.equal(reply.source, 'local_demo');
    assert.equal(typeof reply.text, 'string');
    assert.equal(typeof reply.suggestion, 'string');
    assert.match(reply.text, /roteirizada/);
    assert.match(reply.text, /nada foi alterado/);
    assert.match(reply.text, new RegExp(initial.journey.steps[0].title));
    assert.deepEqual(reply.errors, []);
    assert.deepEqual(state, before);
    assert.equal(Object.hasOwn(reply, 'state'), false);
    assert.equal(Object.hasOwn(reply, 'execute'), false);
  }
  assert.match(mentorReply(initial.journey, 'simplify').suggestion, /até 5 minutos/);
  assert.match(mentorReply(initial.journey, 'priority').text, /Concluir meu rascunho/);
  assert.match(mentorReply(initial.journey, 'explique').text, /30 minutos/);
});

test('mentor respects pause and completed plans without resuming or adding anything', () => {
  const initial = make();
  const paused = updateJourney(initial.state, initial.journey.id, {status: 'paused'});
  const reply = mentorReply(paused.journey, 'start');
  assert.match(reply.text, /está pausado/);
  assert.equal(paused.journey.status, 'paused');
  const completed = complete(paused);
  const before = structuredClone(completed.journey);
  const finishedReply = mentorReply(freeze(completed.journey), 'simplify');
  assert.equal(finishedReply.ok, true);
  assert.match(finishedReply.text, /Todas as 4 etapas estão concluídas/);
  assert.match(finishedReply.suggestion, /Revisar/);
  assert.deepEqual(completed.journey, before);
});

test('mentor rejects malformed data and prompts rather than inventing context', () => {
  const {journey} = make();
  for (const prompt of ['', '  ', null, undefined, {}, [], 1, 'x'.repeat(601), 'a\u0000b']) {
    const result = mentorReply(journey, prompt);
    assert.equal(result.ok, false);
    assert.equal(result.suggestion, null);
    assert.ok(result.errors.length);
  }
  for (const invalid of [null, {}, [], {id: 'bad'}, {...journey, steps: []}]) {
    const result = mentorReply(invalid, 'start');
    assert.equal(result.ok, false);
    assert.equal(result.suggestion, null);
  }
});

test('progress handles missing/empty data and uses rounded percentages without mutation', () => {
  for (const journey of [null, undefined, {}, {steps: []}, {steps: null}, {steps: [null]}]) {
    assert.deepEqual(journeyProgress(journey), {total: 0, done: 0, doing: 0, todo: 0, percent: 0, nextStep: null});
  }
  const steps = freeze([{id: '1', status: 'done'}, {id: '2', status: 'todo'}, {id: '3', status: 'todo'}]);
  assert.equal(journeyProgress({steps}).percent, 33);
  assert.equal(steps[0].status, 'done');
});
