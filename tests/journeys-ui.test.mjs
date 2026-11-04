import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, escapeHtml} from '../dist/core.mjs';
import {createJourney, journeyProgress, updateJourneyStep} from '../dist/journeys-core.mjs';
import {createJourneysUI} from '../dist/journeys-ui.mjs';

// Controller/runtime coverage only. This adapter is not a real browser and
// cannot establish layout, keyboard trapping, mobile behavior or device QA.
const tracks = ['discover', 'idea', 'ongoing'];
const answers = (track = 'idea', patch = {}) => ({
  context: 'personal', title: track === 'discover' ? '' : 'Uma ideia de exemplo',
  goal: 'Testar um começo que caiba na rotina', time: '15',
  resources: 'Papel e uma hora livre', skills: 'Organizar informações',
  interests: 'Aprender algo novo', audience: 'Pessoas do projeto',
  barrier: 'Há várias tarefas sem ordem', priority: 'Escolher uma primeira entrega',
  ...patch,
});

function stateWithLegacy() {
  return {
    ...initialState(),
    plan: {key: 'idea', title: 'Projeto anterior', steps: [{id: 'old-step', title: 'Etapa antiga', done: true}]},
    accounts: [{id: 'account-1', openingBalanceCents: 12345, openingDate: '2026-10-01'}],
    commitments: [{id: 'commitment-1', cents: 8500, status: 'pending'}],
    budgets: [{id: 'budget-1', cents: 20000}],
    moments: {enabled: false},
    customUnrelatedState: {preserve: ['this', 'too']},
  };
}

function seeded(track = 'idea', patch = {}) {
  const result = createJourney(stateWithLegacy(), {...answers(track, patch), track}, `saved-${track}`);
  assert.equal(result.ok, true, result.errors.join(' '));
  return result.state;
}

function unrelated(state) {
  const {journeys, ...rest} = state;
  return rest;
}

function controller(t, {state: suppliedState = stateWithLegacy(), route: initialRoute = 'caminhos', persist = true} = {}) {
  let state = suppliedState, route = initialRoute, canPersist = persist, ui;
  let dialog = '', dialogOpen = false, renderCount = 0, closeCount = 0, validityReports = 0;
  const messages = [], saves = [], visits = [], elements = new Map();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousFormData = Object.getOwnPropertyDescriptor(globalThis, 'FormData');
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', innerHTML: '', focusCalls: [], focus(options) { this.focusCalls.push(options); },
    });
    return elements.get(selector);
  };
  Object.defineProperty(globalThis, 'document', {configurable: true, writable: true, value: {querySelector: element}});
  Object.defineProperty(globalThis, 'FormData', {configurable: true, writable: true, value: class {
    constructor(form) { this.values = form.values; }
    [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); }
  }});
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousFormData) Object.defineProperty(globalThis, 'FormData', previousFormData);
    else delete globalThis.FormData;
  });
  const close = () => {
    // Match app.js: dismissing the dialog invalidates creation confirmation.
    ui.cancelPending();
    dialogOpen = false;
    closeCount++;
  };
  const form = (id, values = {}, dataset = {}, valid = true) => ({
    id, values, dataset, checkValidity: () => valid, reportValidity: () => validityReports++,
  });
  ui = createJourneysUI({
    getState: () => state, setState: next => { state = next; },
    save: () => { saves.push(structuredClone(state)); return canPersist; },
    toast: message => messages.push(message), render: () => renderCount++,
    modal: (title, body) => { dialog = `<h2>${title}</h2>${body}`; dialogOpen = true; },
    closeModal: close,
    button: (text, action, style = '', attrs = '') => `<button class="${style}" data-action="${action}" ${attrs}>${text}</button>`,
    link: (text, path, style = '') => `<a class="${style}" href="#/${path}">${text}</a>`,
    icon: () => '',
    heading: (label, title, description, actions = '') => `<p>${label}</p><h1>${title}</h1><p>${description}</p>${actions}`,
    getRoute: () => route,
    goTo: path => { route = path; visits.push(path); ui.routeChanged(); renderCount++; },
  });
  return {
    ui, element, form, messages, saves, visits, close,
    state: () => state, route: () => route, dialog: () => dialog,
    dialogOpen: () => dialogOpen, renderCount: () => renderCount,
    closeCount: () => closeCount, validityReports: () => validityReports,
    setPersist: value => { canPersist = value; },
    navigate: path => { route = path; ui.routeChanged(); close(); },
    submit: (id, values, dataset, valid) => ui.handleSubmit(form(id, values, dataset, valid)),
    start: (track = 'idea', patch = {}) => {
      route = `caminhos/novo/${track}`;
      return ui.handleSubmit(form('journey-start-form', answers(track, patch), {track}));
    },
    click: (action, data = {}) => ui.handleClick(action, data),
    create: (track = 'idea', patch = {}) => {
      route = `caminhos/novo/${track}`;
      ui.handleSubmit(form('journey-start-form', answers(track, patch), {track}));
      ui.handleClick('journey-confirm', {});
      return state.journeys?.at(-1);
    },
  };
}

test('hub and home offer all three broad tracks and retain access to legacy projects', t => {
  const c = controller(t), before = structuredClone(c.state());
  for (const html of [c.ui.renderPage(), c.ui.renderHomeCard()]) {
    for (const track of tracks) assert.ok(html.includes(`#/caminhos/novo/${track}`));
  }
  const hub = c.ui.renderPage();
  assert.ok(hub.includes('#/projetos'));
  assert.match(hub, /trabalho, renda extra, um projeto pessoal ou um negócio/i);
  assert.match(hub, /não de IA real/);
  assert.match(hub, /não há garantia de emprego, renda ou resultado/);
  assert.deepEqual(c.state(), before);
  assert.equal(c.saves.length, 0);
});

test('each track renders its own questions and marks review before saving', t => {
  const c = controller(t);
  for (const track of tracks) {
    c.navigate(`caminhos/novo/${track}`);
    const html = c.ui.renderPage();
    assert.match(html, new RegExp(`data-track="${track}"`));
    assert.match(html, /só será salvo depois de você revisar e confirmar/);
    assert.match(html, /name="goal"/);
    assert.match(html, /name="time"/);
    if (track === 'discover') assert.match(html, /name="skills"/);
    else assert.match(html, /name="title"/);
    if (track === 'idea') assert.match(html, /name="audience"/);
    if (track === 'ongoing') assert.match(html, /name="barrier"/);
  }
  assert.equal(c.saves.length, 0);
});

for (const track of tracks) {
  test(`${track}: review is read-only; confirmation creates one independent plan and repeated clicks do nothing`, t => {
    const c = controller(t), before = structuredClone(c.state());
    assert.equal(c.start(track), true);
    assert.deepEqual(c.state(), before);
    assert.equal(c.saves.length, 0);
    assert.equal(c.dialogOpen(), true);
    assert.match(c.dialog(), /data-action="journey-confirm"/);
    assert.match(c.dialog(), /data-action="journey-back"/);
    c.click('journey-confirm');
    const journey = c.state().journeys[0];
    assert.equal(journey.track, track);
    assert.equal(journey.steps.length, 4);
    assert.equal(journey.status, 'active');
    assert.ok(journey.steps.every(step => step.status === 'todo' && step.dueDate === ''));
    assert.equal(c.route(), `caminhos/plano/${journey.id}`);
    assert.deepEqual(unrelated(c.state()), before);
    assert.equal(c.dialogOpen(), false);
    assert.equal(c.saves.length, 1);
    assert.equal(c.visits.length, 1);
    c.click('journey-confirm');
    c.click('journey-confirm');
    assert.equal(c.state().journeys.length, 1);
    assert.equal(c.saves.length, 1);
    assert.equal(c.messages.length, 1);
  });
}

test('different tracks yield different suggested actions and coexist without replacing the previous plan', t => {
  const c = controller(t), before = structuredClone(c.state());
  for (const track of tracks) c.create(track);
  assert.deepEqual(c.state().journeys.map(journey => journey.track), tracks);
  assert.equal(new Set(c.state().journeys.map(journey => journey.id)).size, 3);
  assert.equal(new Set(c.state().journeys.map(journey => journey.steps[0].title)).size, 3);
  assert.deepEqual(unrelated(c.state()), before);
  c.navigate('caminhos');
  for (const journey of c.state().journeys) assert.ok(c.ui.renderPage().includes(`#/caminhos/plano/${journey.id}`));
});

test('closing review cancels pending confirmation, preserving legacy state and input draft', t => {
  const c = controller(t), before = structuredClone(c.state());
  c.start('idea', {title: 'Rascunho ainda não confirmado'});
  c.close();
  c.click('journey-confirm');
  assert.deepEqual(c.state(), before);
  assert.equal(c.saves.length, 0);
  assert.match(c.ui.renderPage(), /Rascunho ainda não confirmado/);
});

test('back returns to editable answers; only the revised confirmation is saved', t => {
  const c = controller(t);
  c.start('idea', {title: 'Primeiro rascunho'});
  c.click('journey-back');
  c.click('journey-confirm');
  assert.equal(c.state().journeys, undefined);
  assert.equal(c.saves.length, 0);
  assert.match(c.ui.renderPage(), /Primeiro rascunho/);
  assert.equal(c.element('#journey-start-form input,#journey-start-form textarea,#journey-start-form select').focusCalls.length, 1);
  c.start('idea', {title: 'Ideia revista', goal: 'Novo objetivo'});
  c.click('journey-confirm');
  assert.equal(c.state().journeys[0].title, 'Ideia revista');
  assert.equal(c.state().journeys[0].goal, 'Novo objetivo');
  assert.equal(c.saves.length, 1);
});

test('route changes invalidate a review and preserve independent in-memory drafts by track', t => {
  const c = controller(t);
  const first = c.form('journey-start-form', answers('discover', {goal: 'Explorar uma carreira'}), {track: 'discover'});
  c.ui.handleInput({target: {closest: selector => selector === '#journey-start-form' ? first : null}});
  c.start('idea', {title: 'Rascunho da ideia'});
  c.navigate('caminhos/novo/ongoing');
  c.click('journey-confirm');
  assert.equal(c.saves.length, 0);
  c.navigate('caminhos/novo/discover');
  assert.match(c.ui.renderPage(), /Explorar uma carreira/);
  c.navigate('caminhos/novo/idea');
  assert.match(c.ui.renderPage(), /Rascunho da ideia/);
  const before = c.ui.renderPage();
  c.ui.handleInput({target: {closest: () => null}});
  assert.equal(c.ui.renderPage(), before);
});

test('save false restores the exact prior state, keeps review open and permits one successful retry', t => {
  const c = controller(t, {persist: false}), before = c.state();
  c.start('ongoing');
  c.click('journey-confirm');
  const firstAttempt = c.saves[0].journeys[0];
  assert.equal(c.state(), before);
  assert.equal(c.dialogOpen(), true);
  assert.equal(c.visits.length, 0);
  assert.equal(c.closeCount(), 0);
  assert.equal(c.renderCount(), 0);
  assert.equal(c.messages.length, 0);
  assert.match(c.element('#journey-modal-error').textContent, /anterior foi mantido/);
  assert.equal(c.element('#journey-modal-error').focusCalls.length, 1);
  c.setPersist(true);
  c.click('journey-confirm');
  assert.equal(c.state().journeys.length, 1);
  assert.equal(c.state().journeys[0].id, firstAttempt.id);
  assert.equal(c.dialogOpen(), false);
  assert.equal(c.visits.length, 1);
  assert.equal(c.saves.length, 2);
  assert.equal(c.messages.length, 1);
  c.click('journey-confirm');
  assert.equal(c.saves.length, 2);
  assert.deepEqual(unrelated(c.state()), before);
});

test('invalid browser and domain inputs never open a review or persist a plan', t => {
  const c = controller(t), before = structuredClone(c.state());
  c.submit('journey-start-form', answers(), {track: 'idea'}, false);
  assert.equal(c.validityReports(), 1);
  assert.equal(c.dialogOpen(), false);
  for (const [track, patch] of [['idea', {title: ''}], ['discover', {goal: ' '}], ['ongoing', {barrier: ''}], ['idea', {time: '7'}], ['idea', {context: 'invalid'}]]) {
    c.start(track, patch);
    assert.equal(c.dialogOpen(), false);
    assert.ok(c.element('#journey-page-error').textContent);
  }
  c.click('journey-confirm');
  assert.deepEqual(c.state(), before);
  assert.equal(c.saves.length, 0);
  assert.ok(c.element('#journey-page-error').focusCalls.length >= 5);
});

test('plan editing preserves existing steps and unrelated state while persisting editable details', t => {
  const c = controller(t, {state: seeded('ongoing')}), before = structuredClone(c.state()), journey = c.state().journeys[0];
  c.navigate(`caminhos/plano/${journey.id}`);
  c.click('journey-edit', {id: journey.id});
  assert.match(c.dialog(), /id="journey-edit-form"/);
  assert.match(c.dialog(), /data-action="close-modal"/);
  for (const name of ['context', 'audience', 'skills', 'interests']) assert.ok(c.dialog().includes(`name="${name}"`));
  const patch = {title: 'Plano ajustado', goal: 'Aprender com uma entrega pequena', priority: 'Preparar uma amostra', barrier: 'Tempo curto', resources: 'Celular', time: '30', status: 'paused', context: 'work', audience: 'Equipe', skills: 'Escrever', interests: 'Aprender'};
  c.submit('journey-edit-form', patch, {id: journey.id});
  const updated = c.state().journeys[0];
  for (const [key, value] of Object.entries(patch)) assert.equal(updated[key], key === 'time' ? Number(value) : value);
  assert.deepEqual(updated.steps, journey.steps);
  assert.equal(updated.track, journey.track);
  assert.deepEqual(unrelated(c.state()), unrelated(before));
  assert.equal(c.saves.length, 1);
  assert.equal(c.dialogOpen(), false);
  assert.equal(c.element(`[data-action="journey-edit"][data-id="${journey.id}"]`).focusCalls.length, 1);
  assert.match(c.ui.renderPage(), /PLANO PAUSADO/);
});

test('saved skills and interests both remain visible in the plan context', t => {
  const state = seeded('discover', {skills: 'Sei organizar informações', interests: 'Quero explorar fotografia'});
  const journey = state.journeys[0], c = controller(t, {state, route: `caminhos/plano/${journey.id}`});
  const context = c.ui.renderPage().match(/<dl class="journey-context">[\s\S]*?<\/dl>/)?.[0];
  assert.ok(context?.includes(escapeHtml(journey.skills)));
  assert.ok(context?.includes(escapeHtml(journey.interests)));
});

test('ongoing edit makes its required barrier clear while other tracks keep it optional', t => {
  const c = controller(t);
  for (const track of tracks) {
    const journey = c.create(track);
    c.click('journey-edit', {id: journey.id});
    const label = c.dialog().match(/<label for="journey-barrier">([^<]+)<\/label>/)?.[1];
    const control = c.dialog().match(/<textarea[^>]+name="barrier"[^>]*>/)?.[0];
    assert.ok(label && control);
    if (track === 'ongoing') {
      assert.doesNotMatch(label, /opcional/i);
      assert.match(control, /\brequired\b/);
    } else {
      assert.match(label, /opcional/i);
      assert.doesNotMatch(control, /\brequired\b/);
    }
    c.close();
  }
});

test('cancelling an edit does not mutate; failed save preserves fields and supports retry', t => {
  const c = controller(t, {state: seeded()}), before = c.state(), journey = before.journeys[0];
  c.click('journey-edit', {id: journey.id});
  c.close();
  assert.equal(c.state(), before);
  assert.equal(c.saves.length, 0);
  c.click('journey-edit', {id: journey.id});
  c.setPersist(false);
  c.submit('journey-edit-form', {title: 'Editar sem perder as etapas'}, {id: journey.id});
  assert.equal(c.state(), before);
  assert.equal(c.dialogOpen(), true);
  assert.equal(c.messages.length, 0);
  c.setPersist(true);
  c.submit('journey-edit-form', {title: 'Editar sem perder as etapas'}, {id: journey.id});
  assert.equal(c.state().journeys[0].title, 'Editar sem perder as etapas');
  assert.deepEqual(c.state().journeys[0].steps, journey.steps);
  assert.equal(c.messages.length, 1);
});

test('step editing saves action, deadline and status; invalid dates retain original step', t => {
  const c = controller(t, {state: seeded()}), journey = c.state().journeys[0], step = journey.steps[0];
  c.navigate(`caminhos/plano/${journey.id}`);
  c.click('journey-edit-step', {id: journey.id, step: step.id});
  assert.match(c.dialog(), /type="date"/);
  c.submit('journey-step-form', {title: 'Uma ação revisada', description: 'Começar por uma pergunta', dueDate: '2026-10-25', status: 'doing'}, {id: journey.id, step: step.id});
  assert.deepEqual(c.state().journeys[0].steps[0], {id: step.id, title: 'Uma ação revisada', description: 'Começar por uma pergunta', dueDate: '2026-10-25', status: 'doing'});
  assert.equal(c.element(`[data-action="journey-edit-step"][data-step="${step.id}"]`).focusCalls.length, 1);
  assert.match(c.ui.renderPage(), /25\/10\/2026/);
  const before = c.state();
  c.click('journey-edit-step', {id: journey.id, step: step.id});
  c.submit('journey-step-form', {dueDate: '2026-02-31'}, {id: journey.id, step: step.id});
  assert.equal(c.state(), before);
  assert.equal(c.dialogOpen(), true);
  assert.match(c.element('#journey-modal-error').textContent, /data real/);
  assert.equal(c.saves.length, 1);
  c.submit('journey-step-form', {dueDate: ''}, {id: journey.id, step: step.id});
  assert.equal(c.state().journeys[0].steps[0].dueDate, '');
});

test('step toggle derives progress, focuses its replacement, completes the plan and reopens it', t => {
  const c = controller(t, {state: seeded()}), journey = c.state().journeys[0];
  c.navigate(`caminhos/plano/${journey.id}`);
  c.click('journey-toggle-step', {id: journey.id, step: journey.steps[0].id});
  assert.equal(journeyProgress(c.state().journeys[0]).percent, 25);
  assert.equal(c.element(`[data-action="journey-toggle-step"][data-step="${journey.steps[0].id}"]`).focusCalls.length, 1);
  assert.match(c.ui.renderPage(), /aria-pressed="true"/);
  for (const step of journey.steps.slice(1)) c.click('journey-toggle-step', {id: journey.id, step: step.id});
  assert.equal(c.state().journeys[0].status, 'completed');
  assert.equal(journeyProgress(c.state().journeys[0]).percent, 100);
  assert.match(c.ui.renderPage(), /Você concluiu as etapas deste plano/);
  c.click('journey-toggle-step', {id: journey.id, step: journey.steps[0].id});
  assert.equal(c.state().journeys[0].status, 'active');
  assert.equal(journeyProgress(c.state().journeys[0]).percent, 75);
});

test('failed toggle rolls back progress and never announces success, then retries cleanly', t => {
  const c = controller(t, {state: seeded(), persist: false}), before = c.state(), journey = before.journeys[0];
  c.click('journey-toggle-step', {id: journey.id, step: journey.steps[0].id});
  assert.equal(c.state(), before);
  assert.equal(journeyProgress(c.state().journeys[0]).percent, 0);
  assert.equal(c.messages.length, 0);
  assert.equal(c.renderCount(), 0);
  assert.match(c.element('#journey-page-error').textContent, /anterior foi mantido/);
  c.setPersist(true);
  c.click('journey-toggle-step', {id: journey.id, step: journey.steps[0].id});
  assert.equal(journeyProgress(c.state().journeys[0]).percent, 25);
  assert.equal(c.messages.length, 1);
});

test('completing a plan with unfinished steps is rejected without persisting', t => {
  const c = controller(t, {state: seeded()}), before = c.state(), journey = before.journeys[0];
  c.click('journey-edit', {id: journey.id});
  c.submit('journey-edit-form', {status: 'completed'}, {id: journey.id});
  assert.equal(c.state(), before);
  assert.equal(c.saves.length, 0);
  assert.match(c.element('#journey-modal-error').textContent, /todas as etapas/);
  assert.equal(c.dialogOpen(), true);
});

test('adding a step supports cancellation and rollback, then appends once on successful retry', t => {
  const c = controller(t, {state: seeded()}), before = c.state(), journey = before.journeys[0];
  c.click('journey-add-step', {id: journey.id});
  assert.match(c.dialog(), /data-step=""/);
  c.close();
  assert.equal(c.state(), before);
  const raw = {title: 'Registrar um aprendizado', description: 'Escrever uma frase', dueDate: '2026-11-01', status: 'todo'};
  c.click('journey-add-step', {id: journey.id});
  c.setPersist(false);
  c.submit('journey-step-form', raw, {id: journey.id, step: ''});
  assert.equal(c.state(), before);
  assert.equal(c.dialogOpen(), true);
  assert.equal(c.messages.length, 0);
  c.setPersist(true);
  c.submit('journey-step-form', raw, {id: journey.id, step: ''});
  assert.equal(c.state().journeys[0].steps.length, 5);
  assert.deepEqual(c.state().journeys[0].steps.slice(0, 4), journey.steps);
  assert.equal(c.state().journeys[0].steps.at(-1).title, raw.title);
  assert.equal(c.dialogOpen(), false);
  assert.equal(c.element(`[data-action="journey-add-step"][data-id="${journey.id}"]`).focusCalls.length, 1);
  assert.deepEqual(unrelated(c.state()), unrelated(before));
});

test('next action, home resume and mentor all prefer a step already in progress', t => {
  const initial = seeded(), journey = initial.journeys[0];
  const result = updateJourneyStep(initial, journey.id, journey.steps[2].id, {status: 'doing'});
  assert.equal(result.ok, true);
  const c = controller(t, {state: result.state, route: `caminhos/plano/${journey.id}`});
  const next = journey.steps[2];
  const panel = c.ui.renderPage().match(/<section class="journey-next-action">[\s\S]*?<\/section>/)?.[0];
  assert.ok(panel?.includes(`<h2>${escapeHtml(next.title)}</h2>`));
  assert.ok(c.ui.renderHomeCard().includes(escapeHtml(next.title)));
  c.click('journey-mentor-prompt', {id: journey.id, prompt: 'start'});
  assert.ok(c.element('#journey-mentor-reply').innerHTML.includes(escapeHtml(next.title)));
});

test('scripted mentor shortcuts and free text never mutate or save the plan', t => {
  const c = controller(t, {state: seeded()}), before = structuredClone(c.state()), journey = c.state().journeys[0];
  c.navigate(`caminhos/plano/${journey.id}`);
  for (const prompt of ['start', 'simplify', 'priority']) {
    c.click('journey-mentor-prompt', {id: journey.id, prompt});
    assert.match(c.element('#journey-mentor-reply').innerHTML, /SUGESTÃO ROTEIRIZADA/);
    assert.match(c.element('#journey-mentor-reply').innerHTML, /Nada foi alterado automaticamente/);
    assert.deepEqual(c.state(), before);
  }
  c.submit('journey-mentor-form', {question: 'Tenho pouco tempo para começar'}, {id: journey.id});
  const last = c.element('#journey-mentor-reply').innerHTML;
  assert.ok(last.length > 100);
  assert.ok(c.ui.renderPage().includes(last));
  c.submit('journey-mentor-form', {question: '   '}, {id: journey.id});
  assert.equal(c.element('#journey-mentor-reply').innerHTML, last);
  assert.deepEqual(c.state(), before);
  assert.equal(c.saves.length, 0);
  assert.equal(c.messages.length, 0);
  assert.ok(c.element('#journey-mentor-reply').focusCalls.length >= 4);
});

test('user markup is escaped in review, saved cards, plan details, forms and mentor output', t => {
  const markup = '<img src=x onerror="alert(1)"> & \'example\'';
  const c = controller(t);
  c.start('idea', {title: markup, goal: markup, resources: markup, skills: markup, interests: markup, audience: markup, priority: markup, barrier: markup});
  assert.ok(c.dialog().includes(escapeHtml(markup)));
  assert.ok(!c.dialog().includes('<img src=x'));
  c.click('journey-confirm');
  const journey = c.state().journeys[0];
  assert.equal(journey.title, markup, 'plain-text data must not be destructively escaped at storage time');
  const plan = c.ui.renderPage();
  assert.ok(plan.includes(escapeHtml(markup)));
  assert.ok(!plan.includes('<img src=x'));
  c.click('journey-edit', {id: journey.id});
  assert.ok(c.dialog().includes(`value="${escapeHtml(markup)}"`));
  assert.ok(!c.dialog().includes('<img src=x'));
  c.close();
  c.click('journey-mentor-prompt', {id: journey.id, prompt: 'priority'});
  assert.ok(c.element('#journey-mentor-reply').innerHTML.includes(escapeHtml(markup)));
  assert.ok(!c.element('#journey-mentor-reply').innerHTML.includes('<img src=x'));
  c.navigate('caminhos');
  assert.ok(c.ui.renderPage().includes(escapeHtml(markup)));
  assert.ok(!c.ui.renderPage().includes('<img src=x'));
});

test('JSON reload resumes details, chosen deadlines, completion and legacy data without resaving', t => {
  const c = controller(t);
  const journey = c.create('ongoing');
  c.submit('journey-step-form', {dueDate: '2026-10-30', status: 'done'}, {id: journey.id, step: journey.steps[0].id});
  c.submit('journey-edit-form', {status: 'paused'}, {id: journey.id});
  const snapshot = JSON.parse(JSON.stringify(c.state()));
  // Replace only the controller, as an actual reload loses transient drafts/chat.
  const restored = createJourneysUI({
    getState: () => snapshot, getRoute: () => `caminhos/plano/${journey.id}`,
    heading: (label, title, description) => `<h1>${title}</h1><p>${description}</p>`,
    button: (text, action, style, attrs) => `<button data-action="${action}" ${attrs || ''}>${text}</button>`,
    link: (text, path) => `<a href="#/${path}">${text}</a>`, icon: () => '',
    save: () => assert.fail('rendering a saved plan must not save'),
  });
  const html = restored.renderPage();
  assert.ok(html.includes(escapeHtml(snapshot.journeys[0].title)));
  assert.match(html, /30\/10\/2026/);
  assert.match(html, /1\/4 etapas concluídas/);
  assert.match(html, /PLANO PAUSADO/);
  assert.deepEqual(snapshot.plan, c.state().plan);
  assert.deepEqual(snapshot.records, c.state().records);
  assert.deepEqual(snapshot, JSON.parse(JSON.stringify(c.state())));
});

test('unknown plans, missing track segments and inherited object keys show a safe recovery route', t => {
  const c = controller(t), before = structuredClone(c.state());
  for (const route of ['caminhos/plano/missing', 'caminhos/plano', 'caminhos/novo', 'caminhos/novo/unknown', 'caminhos/novo/constructor', 'caminhos/novo/__proto__', 'caminhos/novo/toString']) {
    c.navigate(route);
    let html;
    assert.doesNotThrow(() => { html = c.ui.renderPage(); }, route);
    assert.match(html, /não está neste navegador/, route);
    assert.ok(html.includes('#/caminhos'), route);
  }
  assert.deepEqual(c.state(), before);
  assert.equal(c.saves.length, 0);
});

test('irrelevant events and stale plan/step targets never mutate or save anything', t => {
  const c = controller(t, {state: seeded()}), before = structuredClone(c.state()), journey = c.state().journeys[0];
  assert.equal(c.click('unrelated-action'), false);
  assert.equal(c.submit('another-form', {}, {}), false);
  for (const action of ['journey-edit', 'journey-add-step', 'journey-edit-step', 'journey-toggle-step', 'journey-mentor-prompt']) {
    assert.equal(c.click(action, {id: 'missing', step: 'missing', prompt: 'start'}), true);
  }
  c.click('journey-toggle-step', {id: journey.id, step: 'missing'});
  c.click('journey-edit-step', {id: journey.id, step: 'missing'});
  c.submit('journey-edit-form', {title: 'Must not save'}, {id: 'missing'});
  c.submit('journey-step-form', {title: 'Must not save'}, {id: 'missing', step: 'missing'});
  assert.deepEqual(c.state(), before);
  assert.equal(c.dialogOpen(), false);
  assert.equal(c.saves.length, 0);
});
