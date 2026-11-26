// Regressões encontradas no teste ponta a ponta de 12/11/2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFinancialCsv, reviewFinancialCsv} from '../dist/finance-import.mjs';
import {migrateFinanceState, toCsv, deleteRecord, cancelObligation, createObligation, saveBudget, settleObligation, parseBRL} from '../dist/finance.mjs';
import {taskDraft, eventDraft, TASK_CATEGORIES} from '../dist/organizer.mjs';
import {classifyCapture} from '../dist/core.mjs';

const base = () => migrateFinanceState({version: 5, records: [], documents: [], events: []});

test('the CSV template the app offers (and its own exports) import back without "Valor inválido"', async () => {
  const csv = toCsv([{'Data': '2026-10-29', 'Descrição': 'Exemplo de despesa', 'Valor': '-25,90', 'Categoria': 'Outros', 'Identificador de origem': 'exemplo-001'}]);
  const parsed = await parseFinancialCsv(csv);
  assert.equal(parsed.rows[0][2], '-25,90', 'apóstrofo de proteção removido na leitura');
  const s = base();
  const review = await reviewFinancialCsv(s, parsed, {accountId: s.accounts[0].id, date: '0', title: '1', amount: '2', category: '3', externalId: '4', amountFormat: 'brl', dateFormat: 'iso', paymentMethod: 'other', status: 'actual'});
  const rows = review.rows || review.items || [];
  assert.ok(rows.length >= 1);
  assert.ok(!JSON.stringify(review).includes('Valor inválido'), JSON.stringify(review).slice(0, 300));
});

test('manual entries can be deleted, settlement-linked ones cannot', () => {
  let s = base();
  s.records.push({id: 'r1', title: 'Errado', type: 'expense', status: 'actual', cents: 1000, date: '2026-11-10', accountId: s.accounts[0].id});
  s.documents.push({id: 'd1', title: 'Comprovante', recordId: 'r1'});
  const removed = deleteRecord(s, 'r1');
  assert.equal(removed.ok, true);
  assert.equal(removed.state.records.length, 0);
  assert.equal(removed.state.documents[0].recordId, null, 'documento fica, sem vínculo');
  s.records.push({id: 'r2', title: 'Baixa', type: 'expense', status: 'actual', cents: 1000, date: '2026-11-10', obligationId: 'o1'});
  assert.equal(deleteRecord(s, 'r2').ok, false);
  assert.equal(deleteRecord(s, 'nao-existe').ok, false);
});

test('bills without settlement can be cancelled; settled ones cannot', () => {
  let s = base();
  const created = createObligation(s, {title: 'Conta errada', kind: 'payable', cents: 5000, dueDate: '2026-11-20', category: 'Casa'});
  assert.equal(created.ok, true, JSON.stringify(created.errors));
  const cancelled = cancelObligation(created.state, created.obligation.id);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state.obligations[0].status, 'cancelled');
  assert.equal(cancelObligation(cancelled.state, created.obligation.id).duplicate, true);
  const other = createObligation(s, {title: 'Paga em parte', kind: 'payable', cents: 5000, dueDate: '2026-11-20', category: 'Casa'});
  const settled = settleObligation(other.state, other.obligation.id, {cents: 1000, date: '2026-11-12', accountId: other.state.accounts[0].id, paymentMethod: 'pix'});
  if (settled.ok) assert.equal(cancelObligation(settled.state, other.obligation.id).ok, false);
});

test('budget keeps the existing category spelling and amount errors explain the format', () => {
  const first = saveBudget(base(), {category: 'Alimentação', month: '2026-11', cents: 50000});
  const second = saveBudget(first.state, {category: 'alimentação', month: '2026-11', cents: 60000});
  assert.equal(second.state.budgets.length, 1);
  assert.equal(second.state.budgets[0].category, 'Alimentação');
  assert.equal(second.state.budgets[0].cents, 60000);
  assert.equal(parseBRL('1.234,56'), 123456);
});

test('task categories offered in the inbox are accepted and messages are specific', () => {
  for (const category of ['Casa', 'Saúde', 'Dinheiro', 'Pessoal', 'Trabalho', 'Projetos']) assert.ok(TASK_CATEGORIES.includes(category));
  assert.equal(taskDraft({title: 'Comprar lâmpada', category: 'Casa'}).category, 'Casa');
  assert.throws(() => taskDraft({title: '   ', category: 'Casa'}), /Escreva o que você quer fazer/);
  assert.throws(() => taskDraft({title: 'x'.repeat(101), category: 'Casa'}), /até 100 caracteres/);
  assert.throws(() => eventDraft({title: '  ', date: '2026-11-12', time: '10:00', duration: 30}), /Informe o nome do compromisso/);
  assert.equal(eventDraft({title: 'Série', date: '2026-11-12', time: '10:00', duration: 45}).duration, 45);
});

test('inbox recognises appointments by keyword or time, not only "reunião"', () => {
  for (const text of ['consulta médica amanhã às 10h', 'ligar pro João às 15h', 'dentista sexta', 'aula de violão quinta', 'reunião às 9h'])
    assert.equal(classifyCapture(text, 'text', '2026-11-12').type, 'event', text);
  for (const text of ['Comprar lâmpada', 'lembrar das casas', 'estudar 3 capítulos'])
    assert.equal(classifyCapture(text, 'text', '2026-11-12').type, 'task', text);
  assert.equal(classifyCapture('gastei 35,90 no almoço', 'text', '2026-11-12').type, 'record');
});

test('AI context carries a ready agenda for today and tomorrow from this account only', async () => {
  const {accountAIContext} = await import('../server/ai-context.mjs');
  const ctx = JSON.parse(accountAIContext({profile: {timeZone: 'America/Sao_Paulo'}, events: [{id: 'e1', title: 'Dentista', date: '2026-11-13', time: '10:00', duration: 30}, {id: 'e2', title: 'Cancelado', date: '2026-11-13', time: '11:00', cancelled: true}], tasks: [{id: 't', title: 'Pagar internet', dueDate: '2026-11-13'}], obligations: [{id: 'o', title: 'Luz', kind: 'payable', cents: 1000, settledCents: 0, dueDate: '2026-11-12'}]}, new Date('2026-11-12T15:00:00Z')));
  assert.equal(ctx.agenda.length, 7);
  assert.deepEqual(ctx.agenda.map(d => d.label).slice(0, 2), ['hoje', 'amanhã']);
  assert.deepEqual(ctx.agenda[1].events, [{time: '10:00', title: 'Dentista', duration: 30}], 'cancelados ficam de fora');
  assert.deepEqual(ctx.agenda[1].tasksDue, ['Pagar internet']);
  assert.equal(ctx.agenda[0].billsDue[0].title, 'Luz');
});
