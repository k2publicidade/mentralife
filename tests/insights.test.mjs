import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionItems, onboardingSteps, searchIndex, searchItems} from '../dist/insights.mjs';

const today = '2026-11-12';
const base = () => ({
  profile: {name: 'Ana', timeZone: 'America/Sao_Paulo'},
  tasks: [
    {id: 't1', title: 'Enviar proposta', dueDate: '2026-11-10', done: false},
    {id: 't2', title: 'Ligar para a escola', dueDate: today, done: false},
    {id: 't3', title: 'Tarefa antiga concluída', dueDate: '2026-11-01', done: true},
    {id: 't4', title: 'Na lixeira', dueDate: '2026-11-01', done: false, trashed: true},
  ],
  events: [{id: 'e1', title: 'Reunião com cliente', date: today, time: '15:00'}, {id: 'e2', title: 'Dentista', date: today, time: '09:30'}],
  records: [{id: 'r1', title: 'Mercado', type: 'expense', status: 'actual', category: 'Alimentação', cents: 95000, date: '2026-11-05'}],
  accounts: [], recurrences: [],
  budgets: [{id: 'b1', category: 'Alimentação', month: '2026-11', cents: 80000}],
  obligations: [
    {id: 'o1', title: 'Aluguel', kind: 'payable', cents: 120000, settledCents: 0, dueDate: '2026-11-08', status: 'open'},
    {id: 'o2', title: 'Conta de luz', kind: 'payable', cents: 16000, settledCents: 0, dueDate: '2026-11-15', status: 'open'},
    {id: 'o3', title: 'Já pago', kind: 'payable', cents: 5000, settledCents: 5000, dueDate: '2026-11-13', status: 'open'},
    {id: 'o4', title: 'Freela atrasado', kind: 'receivable', cents: 30000, settledCents: 0, dueDate: '2026-11-01', status: 'open'},
  ],
  messages: [],
});

test('attention items come only from this account data and are ordered by urgency', () => {
  const items = attentionItems(base(), today);
  const ids = items.map(i => i.id);
  assert.equal(ids[0], 'bills-overdue', 'conta vencida é o mais urgente');
  assert.deepEqual(new Set(ids), new Set(['bills-overdue', 'tasks-overdue', 'budget-over', 'bills-soon', 'events-today', 'tasks-today']));
  const overdue = items.find(i => i.id === 'tasks-overdue');
  assert.equal(overdue.title, '1 tarefa atrasada');
  assert.equal(overdue.detail, 'Enviar proposta (10/11)');
  assert.match(items.find(i => i.id === 'events-today').detail, /^09:30 · Dentista e mais 1$/);
  assert.match(items.find(i => i.id === 'bills-soon').title, /1 conta a pagar em 7 dias/);
  assert.match(items.find(i => i.id === 'budget-over').detail, /Alimentação: 119%/);
  assert.equal(attentionItems(base(), today, {limit: 6}).length, 6);
  assert.ok(attentionItems(base(), today, {limit: 7}).some(i => i.id === 'income-overdue'));
});

test('tasks without a due date are never overdue', () => {
  const items = attentionItems({tasks: [{id: 'x', title: 'Sem prazo', dueDate: '', done: false}, {id: 'y', title: 'Nula', dueDate: null, done: false}]}, today);
  assert.deepEqual(items, []);
});

test('an empty or malformed account produces no alerts and no errors', () => {
  for (const state of [null, undefined, {}, {tasks: 'x', events: [null], obligations: [{}]}]) assert.deepEqual(attentionItems(state, today), []);
});

test('onboarding progress reflects what the account already did', () => {
  const fresh = onboardingSteps({profile: {name: 'Bia'}});
  assert.equal(fresh.done, 0);
  assert.equal(fresh.total, 6);
  const used = onboardingSteps({...base(), messages: [{role: 'user', text: 'oi'}], moments: {enabled: true}});
  assert.equal(used.done, 6);
  assert.equal(used.complete, true);
  assert.equal(used.steps.find(s => s.id === 'dinheiro').done, true, 'lançamentos contam como passo financeiro');
});

test('global search is accent-insensitive, requires every word and ignores trashed items', () => {
  const index = searchIndex({...base(), documents: [{id: 'd1', title: 'Garantia da cafeteira', category: 'Casa'}, {id: 'd2', title: 'Garantia apagada', trashed: true}]});
  assert.deepEqual(searchItems(index, 'reuniao').map(i => i.title), ['Reunião com cliente']);
  assert.deepEqual(searchItems(index, 'GARANTIA').map(i => i.type), ['Documento']);
  assert.deepEqual(searchItems(index, 'conta luz').map(i => i.route), ['dinheiro/compromissos']);
  assert.deepEqual(searchItems(index, 'x'), [], 'termos de uma letra são ignorados');
  assert.ok(!searchItems(index, 'lixeira').length);
});
