/** Manual BRL ledger for the local demo. No banking or payment integrations. */
export const FINANCE_VERSION = 5;
export const PAYMENT_METHODS = ['pix', 'debit', 'cash', 'boleto', 'transfer', 'other'];
export const MAX_CENTS = 999999999;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const copy = value => structuredClone(value);
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const positiveCents = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_CENTS;
const signedCents = value => Number.isSafeInteger(value) && Math.abs(value) <= MAX_CENTS;
const calendarResult = date => {
  if (Number.isNaN(date.getTime())) return null;
  const value = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const fail = (state, ...errors) => ({ok: false, state, errors: errors.flat()});
const activeAccount = (state, accountId) => state.accounts.find(a => a.id === accountId && !a.archived);
const baseAccounts = () => [
  {id: 'itau', name: 'Itaú', kind: 'bank', openingBalanceCents: null, openingBalanceDate: null, archived: false},
  {id: 'nubank', name: 'Nubank', kind: 'bank', openingBalanceCents: null, openingBalanceDate: null, archived: false},
  {id: 'cash', name: 'Dinheiro', kind: 'cash', openingBalanceCents: null, openingBalanceDate: null, archived: false}
];

/** Migration preserves every legacy record and never guesses its bank account. */
export function migrateFinanceState(state = {}) {
  const next = copy(state);
  next.version = Math.max(FINANCE_VERSION, Number.isInteger(next.version) ? next.version : 0);
  next.financeVersion = FINANCE_VERSION;
  next.currency = 'BRL';
  next.accounts = Array.isArray(next.accounts) ? next.accounts.map(a => ({openingBalanceCents: null, openingBalanceDate: null, archived: false, ...a})) : baseAccounts();
  next.records = (Array.isArray(next.records) ? next.records : []).map(r => ({accountId: null, paymentMethod: 'other', ...r}));
  for (const key of ['obligations', 'recurrences', 'budgets']) if (!Array.isArray(next[key])) next[key] = [];
  return next;
}

/** Parse a Brazilian amount into integer cents; reject fractional cents and exponent forms. */
export function parseBRL(value, {allowZero = false, allowNegative = false} = {}) {
  const raw = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!new RegExp(`^${allowNegative ? '-?' : ''}(?:\\d{1,3}(?:\\.\\d{3})*|\\d+)(?:,\\d{1,2})?$`).test(raw)) return null;
  const negative = raw.startsWith('-');
  const [integer, decimal = ''] = raw.replace('-', '').replaceAll('.', '').split(',');
  const cents = (Number(integer) * 100 + Number(decimal.padEnd(2, '0'))) * (negative ? -1 : 1);
  return signedCents(cents) && (allowZero || cents !== 0) && (allowNegative || cents >= 0) ? cents : null;
}

export function saveAccount(state, draft) {
  const next = migrateFinanceState(state), errors = [];
  const existing = next.accounts.find(a => a.id === draft.id);
  const account = {...(existing || {kind: 'bank', archived: false, openingBalanceCents: null, openingBalanceDate: null}), ...draft, id: existing?.id || draft.id || uid('account')};
  if (typeof account.id !== 'string' || !account.id.trim() || draft.id != null && draft.id !== '' && typeof draft.id !== 'string') errors.push('Identificador de conta inválido.');
  account.name = String(account.name || '').trim().slice(0, 80);
  if (!account.name) errors.push('Informe o nome da conta.');
  if (!['bank', 'cash'].includes(account.kind)) errors.push('Tipo de conta inválido.');
  if (account.openingBalanceCents === '' || account.openingBalanceCents === undefined) account.openingBalanceCents = null;
  if (account.openingBalanceCents !== null && !signedCents(account.openingBalanceCents)) errors.push('O saldo inicial precisa estar em centavos inteiros.');
  if (account.openingBalanceCents !== null && !validDate(account.openingBalanceDate)) errors.push('Informe a data do saldo inicial.');
  if (account.openingBalanceCents === null) account.openingBalanceDate = null;
  if (next.accounts.some(a => a.id !== account.id && normal(a.name) === normal(account.name))) errors.push('Já existe uma conta com esse nome.');
  if (errors.length) return fail(state, errors);
  if (existing) next.accounts = next.accounts.map(a => a.id === account.id ? account : a);
  else next.accounts.push(account);
  return {ok: true, state: next, account};
}

export function validateFinancialEntry(state, draft) {
  const current = migrateFinanceState(state), errors = [];
  const entry = {status: 'actual', paymentMethod: 'other', category: 'Outros', ...copy(draft)};
  entry.title = String(entry.title || '').trim().slice(0, 300);
  entry.category = String(entry.category || 'Outros').trim().slice(0, 80) || 'Outros';
  if (!entry.title) errors.push('Informe uma descrição.');
  if (!['income', 'expense', 'transfer'].includes(entry.type)) errors.push('Tipo de lançamento inválido.');
  if (!positiveCents(entry.cents)) errors.push('O valor precisa ser positivo, em centavos inteiros.');
  if (!validDate(entry.date)) errors.push('Informe uma data válida.');
  if (!['actual', 'estimated'].includes(entry.status)) errors.push('Situação inválida.');
  if (!PAYMENT_METHODS.includes(entry.paymentMethod) || entry.installments || entry.creditCardId) errors.push('Cartão de crédito e parcelamento ainda não são suportados. Use uma forma de pagamento à vista.');
  if (entry.type === 'transfer') {
    entry.paymentMethod = 'transfer';
    if (entry.status !== 'actual') errors.push('A transferência precisa representar uma movimentação realizada.');
    if (!activeAccount(current, entry.fromAccountId) || !activeAccount(current, entry.toAccountId)) errors.push('Escolha duas contas ativas para a transferência.');
    if (entry.fromAccountId === entry.toAccountId) errors.push('A origem e o destino precisam ser contas diferentes.');
    if (own(entry, 'toCents') && entry.toCents !== entry.cents || own(entry, 'fromCents') && entry.fromCents !== entry.cents) errors.push('A transferência precisa ter o mesmo valor nas duas contas.');
    entry.accountId = null;
  } else {
    if (entry.status === 'actual' && !activeAccount(current, entry.accountId)) errors.push('Escolha uma conta ativa.');
    if (entry.accountId && !activeAccount(current, entry.accountId)) errors.push('A conta selecionada está indisponível ou arquivada.');
    entry.accountId ||= null;
    delete entry.fromAccountId;
    delete entry.toAccountId;
  }
  return {ok: errors.length === 0, errors, draft: entry};
}

const entryFingerprint = draft => JSON.stringify(['type', 'cents', 'date', 'title', 'category', 'status', 'paymentMethod', 'accountId', 'fromAccountId', 'toAccountId', 'obligationId'].map(key => draft[key] ?? null));
export function applyFinancialEntry(state, draft) {
  return commitFinancialEntry(state, draft, false);
}

function commitFinancialEntry(state, draft, allowObligation) {
  if (draft.obligationId && !allowObligation) return fail(state, 'Registre pagamentos vinculados pela baixa do compromisso.');
  const next = migrateFinanceState(state);
  const editing = draft.id ? next.records.find(r => r.id === draft.id) : null;
  if (draft.id && !editing) return fail(state, 'Lançamento não encontrado.');
  if (editing?.obligationId) return fail(state, 'Uma baixa vinculada não pode ser alterada diretamente.');
  if (editing && (editing.type === 'transfer') !== ((draft.type || editing.type) === 'transfer')) return fail(state, 'Uma transferência deve permanecer inteira, com origem e destino.');
  const merged = editing ? {...editing, ...draft, id: editing.id, idempotencyKey: editing.idempotencyKey} : draft;
  const result = validateFinancialEntry(next, merged);
  if (!editing && draft.idempotencyKey) {
    const existing = next.records.find(r => r.idempotencyKey === draft.idempotencyKey);
    if (existing) {
      if (entryFingerprint(existing) !== entryFingerprint(result.draft)) return fail(state, 'Esta confirmação já foi usada com dados diferentes.');
      return {ok: true, state: next, record: existing, duplicate: true};
    }
  }
  if (!result.ok) return fail(state, result.errors);
  const record = {...result.draft, id: editing?.id || uid('record')};
  if (editing) next.records = next.records.map(r => r.id === editing.id ? record : r);
  else next.records.unshift(record);
  return {ok: true, state: next, record, duplicate: false, updated: !!editing};
}

function validateRecurrence(recurrence, dueDate) {
  if (!recurrence) return [];
  const errors = [];
  if (!['weekly', 'monthly', 'yearly'].includes(recurrence.frequency)) errors.push('Frequência de recorrência inválida.');
  if (!Number.isInteger(recurrence.interval ?? 1) || (recurrence.interval ?? 1) < 1 || (recurrence.interval ?? 1) > 12) errors.push('Intervalo de recorrência inválido.');
  if ((recurrence.endDate || recurrence.until) && (!validDate(recurrence.endDate || recurrence.until) || (recurrence.endDate || recurrence.until) < dueDate)) errors.push('O fim da recorrência deve ser igual ou posterior ao início.');
  if (recurrence.count != null && (!Number.isInteger(recurrence.count) || recurrence.count < 1 || recurrence.count > 100)) errors.push('Informe entre 1 e 100 ocorrências.');
  return errors;
}

export function createObligation(state, draft) {
  const next = migrateFinanceState(state), errors = [];
  const obligation = {id: uid('obligation'), accountId: null, category: 'Outros', settledCents: 0, settlementIds: [], status: 'open', ...copy(draft)};
  obligation.title = String(obligation.title || '').trim().slice(0, 300);
  if (!obligation.title) errors.push('Informe uma descrição.');
  if (!['payable', 'receivable'].includes(obligation.kind)) errors.push('Escolha a pagar ou a receber.');
  if (!positiveCents(obligation.cents)) errors.push('O valor precisa ser positivo, em centavos inteiros.');
  if (!validDate(obligation.dueDate)) errors.push('Informe um vencimento válido.');
  if (obligation.accountId && !activeAccount(next, obligation.accountId)) errors.push('Escolha uma conta ativa.');
  if (draft.settledCents || draft.settlementIds?.length || draft.status && draft.status !== 'open') errors.push('Crie o compromisso em aberto e use a baixa para registrar pagamentos.');
  if (draft.paymentMethod && !PAYMENT_METHODS.includes(draft.paymentMethod) || draft.installments) errors.push('Cartão de crédito e parcelamento ainda não são suportados.');
  errors.push(...validateRecurrence(draft.recurrence, draft.dueDate));
  const existing = draft.idempotencyKey && next.obligations.find(o => o.idempotencyKey === draft.idempotencyKey);
  if (existing) {
    const keys = ['kind', 'cents', 'dueDate', 'title', 'category', 'accountId'];
    if (keys.some(key => (existing[key] ?? null) !== (obligation[key] ?? null)) || JSON.stringify(existing.recurrence || null) !== JSON.stringify(draft.recurrence || null)) return fail(state, 'Esta confirmação já foi usada com dados diferentes.');
    return {ok: true, state: next, obligation: existing, duplicate: true};
  }
  if (errors.length) return fail(state, errors);
  obligation.id = uid('obligation');
  obligation.settledCents = 0;
  obligation.settlementIds = [];
  obligation.status = 'open';
  if (draft.recurrence) {
    const recurrenceId = uid('recurrence');
    obligation.recurrenceId = recurrenceId;
    obligation.occurrenceKey = `${recurrenceId}:${obligation.dueDate}`;
    next.recurrences.push({id: recurrenceId, active: true, interval: 1, ...copy(draft.recurrence), endDate: draft.recurrence.endDate || draft.recurrence.until || null, startDate: obligation.dueDate, template: {title: obligation.title, kind: obligation.kind, cents: obligation.cents, category: obligation.category, accountId: obligation.accountId}});
  }
  next.obligations.unshift(obligation);
  return {ok: true, state: next, obligation, duplicate: false};
}

export function obligationRemaining(obligation) {
  return Math.max(0, obligation.cents - (obligation.settledCents || 0));
}
export function obligationStatus(obligation, today = new Date().toISOString().slice(0, 10)) {
  if (obligation.status === 'cancelled') return 'cancelled';
  if (obligationRemaining(obligation) === 0) return 'settled';
  if (obligation.dueDate < today) return 'overdue';
  return obligation.settledCents > 0 ? 'partial' : 'open';
}

/** Settlement is one immutable atomic operation: one record plus one linked balance update. */
export function settleObligation(state, obligationId, draft) {
  const next = migrateFinanceState(state);
  const obligation = next.obligations.find(o => o.id === obligationId);
  if (!obligation) return fail(state, 'Compromisso não encontrado.');
  if (!draft.idempotencyKey || typeof draft.idempotencyKey !== 'string') return fail(state, 'A baixa precisa de uma chave de confirmação para evitar duplicação.');
  const key = `settlement:${draft.idempotencyKey}`;
  const existing = next.records.find(r => r.idempotencyKey === key);
  const accountId = draft.accountId || obligation.accountId;
  const paymentMethod = draft.paymentMethod || 'other';
  if (existing) {
    if (existing.obligationId !== obligationId || existing.cents !== draft.cents || existing.accountId !== accountId || existing.date !== draft.date || existing.paymentMethod !== paymentMethod) return fail(state, 'Esta confirmação de baixa já foi usada com dados diferentes.');
    return {ok: true, state: next, record: existing, obligation, duplicate: true};
  }
  if (obligation.status === 'cancelled') return fail(state, 'Este compromisso foi cancelado.');
  if (!positiveCents(draft.cents) || draft.cents > obligationRemaining(obligation)) return fail(state, 'O valor da baixa precisa ser positivo e não pode superar o saldo em aberto.');
  const result = commitFinancialEntry(next, {type: obligation.kind === 'payable' ? 'expense' : 'income', cents: draft.cents, accountId, date: draft.date, paymentMethod, title: draft.title || obligation.title, category: obligation.category, status: 'actual', obligationId, idempotencyKey: key}, true);
  if (!result.ok) return fail(state, result.errors);
  const updated = result.state.obligations.find(o => o.id === obligationId);
  updated.settledCents = (updated.settledCents || 0) + draft.cents;
  updated.settlementIds = [...(updated.settlementIds || []), result.record.id];
  updated.status = obligationRemaining(updated) === 0 ? 'settled' : 'partial';
  return {...result, obligation: updated};
}

/** Adds from the original anchor, so Jan 31 -> Feb 28 -> Mar 31. Dates are UTC calendar dates. */
export function recurrenceDate(startDate, frequency, interval = 1, index = 0) {
  if (!validDate(startDate) || !Number.isSafeInteger(interval) || interval < 1 || !Number.isSafeInteger(index) || index < 0) return null;
  const [year, month, day] = startDate.split('-').map(Number);
  if (frequency === 'weekly') {
    const date = new Date(`${startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 7 * interval * index);
    return calendarResult(date);
  }
  if (!['monthly', 'yearly'].includes(frequency)) return null;
  const targetMonth = month - 1 + interval * index * (frequency === 'yearly' ? 12 : 1);
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(1);
  date.setUTCFullYear(year, targetMonth, 1);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return calendarResult(date);
}

export function generateRecurrences(state, throughDate) {
  const next = migrateFinanceState(state);
  if (!validDate(throughDate)) return fail(state, 'Informe uma data final válida.');
  const created = [];
  const existing = new Set(next.obligations.map(o => o.occurrenceKey).filter(Boolean));
  for (const recurrence of next.recurrences.filter(r => r.active !== false)) {
    if (!validDate(recurrence.startDate) || validateRecurrence(recurrence, recurrence.startDate).length) return fail(state, 'Uma recorrência contém dados inválidos.');
    const seriesEnd = recurrence.endDate || recurrence.until;
    let end = seriesEnd && seriesEnd < throughDate ? seriesEnd : throughDate;
    if (recurrence.count != null) {
      const last = recurrenceDate(recurrence.startDate, recurrence.frequency, recurrence.interval ?? 1, recurrence.count - 1);
      if (last < end) end = last;
    }
    const cursor = validDate(recurrence.generatedThrough) ? recurrence.generatedThrough : recurrence.startDate;
    // Each explicit generation is bounded to twelve calendar months and 100 new occurrences.
    const horizon = recurrenceDate(cursor, 'yearly', 1, 1);
    if (!horizon || end > horizon) return fail(state, 'Gere no máximo doze meses de cada recorrência por vez.');
    if (end < recurrence.startDate) continue;
    // Compute an index close to the cursor, then advance from the original calendar anchor.
    const [startYear, startMonth] = recurrence.startDate.split('-').map(Number);
    const [cursorYear, cursorMonth] = cursor.split('-').map(Number);
    const interval = recurrence.interval ?? 1;
    const elapsedMonths = (cursorYear - startYear) * 12 + cursorMonth - startMonth;
    const estimatedIndex = recurrence.frequency === 'weekly' ? Math.floor((Date.parse(cursor) - Date.parse(recurrence.startDate)) / (7 * 86400000 * interval)) : Math.floor(elapsedMonths / (interval * (recurrence.frequency === 'yearly' ? 12 : 1)));
    const firstIndex = Math.max(0, estimatedIndex - 1);
    for (let index = firstIndex; ; index++) {
      if (recurrence.count != null && index >= recurrence.count) break;
      const dueDate = recurrenceDate(recurrence.startDate, recurrence.frequency, interval, index);
      if (!dueDate || dueDate > end) break;
      if (recurrence.generatedThrough && dueDate <= recurrence.generatedThrough) continue;
      const occurrenceKey = `${recurrence.id}:${dueDate}`;
      if (existing.has(occurrenceKey)) continue;
      const o = {id: `occurrence-${occurrenceKey}`, ...copy(recurrence.template), dueDate, recurrenceId: recurrence.id, occurrenceKey, settledCents: 0, settlementIds: [], status: 'open'};
      next.obligations.push(o);
      created.push(o);
      existing.add(occurrenceKey);
      if (created.length > 100) return fail(state, 'Gere no máximo 100 novas ocorrências por vez.');
    }
    if (!recurrence.generatedThrough || end > recurrence.generatedThrough) recurrence.generatedThrough = end;
  }
  return {ok: true, state: next, created, count: created.length, duplicate: created.length === 0};
}

/** A supplied opening balance is a snapshot at the start of its calendar day. */
export function accountBalances(state, options = {}) {
  const throughDate = typeof options === 'string' ? options : options.throughDate;
  const current = migrateFinanceState(state);
  return current.accounts.map(account => {
    const known = signedCents(account.openingBalanceCents) && validDate(account.openingBalanceDate) && (!throughDate || account.openingBalanceDate <= throughDate);
    let movementCents = 0, beforeOpeningCents = 0;
    for (const record of current.records) {
      if (record.status !== 'actual' || !positiveCents(record.cents) || throughDate && record.date > throughDate) continue;
      const delta = record.type === 'transfer' ? (record.toAccountId === account.id ? record.cents : 0) - (record.fromAccountId === account.id ? record.cents : 0) : record.accountId === account.id ? (record.type === 'income' ? record.cents : record.type === 'expense' ? -record.cents : 0) : 0;
      if (known && record.date < account.openingBalanceDate) beforeOpeningCents += delta;
      else movementCents += delta;
    }
    return {...account, known, balanceCents: known ? account.openingBalanceCents + movementCents : null, movementCents, beforeOpeningCents};
  });
}

export function saveBudget(state, draft) {
  const next = migrateFinanceState(state), errors = [];
  const budget = {accountId: null, ...copy(draft), id: draft.id || uid('budget'), category: String(draft.category || '').trim().slice(0, 80)};
  if (typeof budget.id !== 'string' || !budget.id.trim() || draft.id != null && draft.id !== '' && typeof draft.id !== 'string') errors.push('Identificador de orçamento inválido.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(budget.month)) errors.push('Informe um mês válido.');
  if (!budget.category) errors.push('Informe uma categoria.');
  if (!Number.isSafeInteger(budget.cents) || budget.cents < 0 || budget.cents > MAX_CENTS) errors.push('O limite precisa estar em centavos inteiros, sem valor negativo.');
  if (budget.accountId && !activeAccount(next, budget.accountId)) errors.push('Escolha uma conta ativa.');
  if (draft.id && next.budgets.some(b => b.id !== draft.id && b.month === budget.month && normal(b.category) === normal(budget.category) && (b.accountId || null) === (budget.accountId || null))) errors.push('Já existe um orçamento para esta categoria, conta e mês.');
  if (errors.length) return fail(state, errors);
  const match = next.budgets.find(b => b.id === budget.id || b.month === budget.month && normal(b.category) === normal(budget.category) && (b.accountId || null) === (budget.accountId || null));
  if (match) {budget.id = match.id; next.budgets = next.budgets.map(b => b.id === match.id ? budget : b);}
  else next.budgets.push(budget);
  return {ok: true, state: next, budget};
}

export function financialSummary(state, filters = {}) {
  filters = {...filters, accountId: filters.accountId === 'all' ? null : filters.accountId, fromDate: filters.fromDate || filters.from, toDate: filters.toDate || filters.to};
  const current = migrateFinanceState(state);
  const inPeriod = date => (!filters.month || date?.startsWith(`${filters.month}-`)) && (!filters.fromDate || date >= filters.fromDate) && (!filters.toDate || date <= filters.toDate);
  const matches = record => inPeriod(record.date) && (!filters.accountId || record.accountId === filters.accountId || record.type === 'transfer' && [record.fromAccountId, record.toAccountId].includes(filters.accountId)) && (!filters.category || normal(record.category) === normal(filters.category));
  const records = current.records.filter(matches);
  const flowRecords = records.filter(r => ['income', 'expense'].includes(r.type) && positiveCents(r.cents));
  const sum = (type, status) => flowRecords.filter(r => r.type === type && r.status === status).reduce((total, r) => total + r.cents, 0);
  const income = sum('income', 'actual'), expense = sum('expense', 'actual');
  const estimatedIncome = sum('income', 'estimated'), estimatedExpense = sum('expense', 'estimated');
  const categoryMap = new Map();
  for (const record of flowRecords.filter(r => r.status === 'actual')) {
    const name = record.category || 'Outros';
    if (!categoryMap.has(name)) categoryMap.set(name, {category: name, income: 0, expense: 0, net: 0});
    const group = categoryMap.get(name);
    group[record.type] += record.cents;
    group.net = group.income - group.expense;
  }
  const pending = current.obligations.filter(o => o.status !== 'cancelled' && inPeriod(o.dueDate) && (!filters.accountId || o.accountId === filters.accountId) && (!filters.category || normal(o.category) === normal(filters.category)));
  const payableCents = pending.filter(o => o.kind === 'payable').reduce((sum, o) => sum + obligationRemaining(o), 0);
  const receivableCents = pending.filter(o => o.kind === 'receivable').reduce((sum, o) => sum + obligationRemaining(o), 0);
  const accounts = current.accounts.map(account => {
    const linked = flowRecords.filter(r => r.status === 'actual' && r.accountId === account.id);
    const accountIncome = linked.filter(r => r.type === 'income').reduce((total, r) => total + r.cents, 0);
    const accountExpense = linked.filter(r => r.type === 'expense').reduce((total, r) => total + r.cents, 0);
    const transferCents = records.filter(r => r.type === 'transfer' && r.status === 'actual').reduce((total, r) => total + (r.toAccountId === account.id ? r.cents : 0) - (r.fromAccountId === account.id ? r.cents : 0), 0);
    return {accountId: account.id, name: account.name, income: accountIncome, expense: accountExpense, transferCents, net: accountIncome - accountExpense + transferCents};
  });
  const budgets = current.budgets.filter(b => (!filters.month || b.month === filters.month) && (!filters.accountId || !b.accountId || b.accountId === filters.accountId) && (!filters.category || normal(b.category) === normal(filters.category))).map(b => {
    const spentCents = current.records.filter(r => r.type === 'expense' && r.status === 'actual' && r.date?.startsWith(`${b.month}-`) && normal(r.category) === normal(b.category) && (!b.accountId || r.accountId === b.accountId)).reduce((sum, r) => sum + r.cents, 0);
    return {...b, spentCents, remainingCents: b.cents - spentCents, exceeded: spentCents > b.cents, percent: b.cents ? Math.round(spentCents / b.cents * 100) : spentCents ? 100 : 0};
  });
  return {income, expense, net: income - expense, balance: income - expense, estimatedIncome, estimatedExpense, projected: income - expense + estimatedIncome - estimatedExpense + receivableCents - payableCents, payableCents, receivableCents, categories: [...categoryMap.values()], accounts, budgets, records, unassignedCents: flowRecords.filter(r => r.status === 'actual' && !r.accountId).reduce((sum, r) => sum + (r.type === 'income' ? r.cents : -r.cents), 0)};
}

function captureDate(text, today) {
  const spans = [], dates = [], questions = [];
  const mask = (match, date) => {spans.push([match.index, match.index + match[0].length]); if (date) dates.push(date);};
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {const value = match[0]; mask(match, validDate(value) ? value : null); if (!validDate(value)) questions.push('Qual é a data correta?');}
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)) {
    const value = `${match[3] || today.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    mask(match, validDate(value) ? value : null); if (!validDate(value)) questions.push('Qual é a data correta?');
  }
  for (const match of text.matchAll(/\bdia\s*(\d{1,2})(?![\d/])(?:\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?)?/g)) {
    const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const month = match[2] ? String(months.indexOf(match[2]) + 1).padStart(2, '0') : today.slice(5, 7);
    const value = `${match[3] || today.slice(0, 4)}-${month}-${match[1].padStart(2, '0')}`;
    mask(match, validDate(value) ? value : null); if (!validDate(value)) questions.push('Qual é a data correta?');
  }
  const relative = text.match(/\b(hoje|ontem|amanha)\b/);
  if (relative) {const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + ({hoje: 0, ontem: -1, amanha: 1}[relative[1]])); dates.push(d.toISOString().slice(0, 10));}
  if (new Set(dates).size > 1) questions.push('Qual das datas é a data deste lançamento?');
  return {date: dates[0] || today, spans, questions};
}

/** Deliberately conservative extraction; financial ambiguity always requires review. */
export function parseFinancialCapture(input, state = {}, options = {}) {
  const original = String(input ?? '').trim().slice(0, 600), text = normal(original), current = migrateFinanceState(state);
  const financial = /gastei|paguei|comprei|recebi|entrou|transferi|transferir|transferencia|a pagar|a receber|vou pagar|vou receber|preciso pagar|boleto|salario/.test(text);
  if (!financial) return {type: 'none', title: original};
  const questions = [];
  const clarify = draft => ({type: 'clarification', title: original, draft, questions: [...new Set(questions)], message: [...new Set(questions)].join(' '), needsClarification: true});
  if (/credito|cartao(?!\s*(?:de\s*)?debito)|parcelad|parcelas|\d\s*x\b/.test(text)) {questions.push('Cartão de crédito e parcelamento ainda não são suportados. Qual valor foi efetivamente pago à vista e de qual conta?'); return clarify({title: original});}
  const today = validDate(options.today) ? options.today : new Date().toISOString().slice(0, 10);
  const dateResult = captureDate(text, today);
  questions.push(...dateResult.questions);
  let amountText = text.split('');
  for (const [start, end] of dateResult.spans) for (let i = start; i < end; i++) amountText[i] = ' ';
  amountText = amountText.join('').replace(/\b\d{1,2}(?::\d{2}|h\d{0,2})(?:\s*h(?:oras?)?)?\b/g, match => ' '.repeat(match.length));
  const numbers = [...amountText.matchAll(/(?:r\$\s*)?(-?\d+(?:[.,]\d+)*)\s*(reais|real|centavos|centavo)?/g)].map(match => {
    const raw = match[1], unit = match[2], prefix = match[0].trim().startsWith('r$');
    let cents = unit?.startsWith('centavo') ? (/^\d+$/.test(raw) && positiveCents(Number(raw)) ? Number(raw) : null) : parseBRL(raw);
    const previous = amountText.slice(Math.max(0, match.index - 15), match.index);
    const after = amountText.slice(match.index + match[0].length, match.index + match[0].length + 16);
    const quantity = !unit && !prefix && /^\s*(?:unidades?|itens?|produtos?|pecas?|vezes|pessoas?|materiais?|camisas?|livros?|meses?|dias?)\b/.test(after);
    const time = !unit && !prefix && (/\bas\s*$/.test(previous) || /^\s*(?:h\b|horas?\b|:\d)/.test(after));
    return {raw, cents, explicit: prefix || !!unit || raw.includes(','), quantity, time};
  });
  const candidates = numbers.filter(n => !n.quantity && !n.time);
  let chosen;
  if (candidates.length === 1 && candidates[0].cents !== null) chosen = candidates[0];
  else if (!candidates.length) questions.push('Qual é o valor em reais?');
  else questions.push(candidates.some(c => c.cents === null) ? 'Qual é o valor correto? Use reais e no máximo dois centavos, como 130,50.' : 'Há mais de um valor na mensagem. Qual é o valor total deste lançamento?');
  const isTransfer = /transferi|transferir|transferencia/.test(text);
  const income = /recebi|entrou|vou receber|a receber|salario/.test(text);
  const expense = /gastei|paguei|comprei|vou pagar|a pagar|preciso pagar|boleto/.test(text);
  if (income && expense && !isTransfer) questions.push('Esse valor é uma entrada ou uma saída?');
  const future = /vou pagar|vou receber|a pagar|a receber|preciso pagar|ainda nao paguei|nao paguei|nao recebi|ainda nao recebi|vou transfer|a transferir|pretendo transferir/.test(text);
  const methodMatches = [...new Set([[/pix/, 'pix'], [/debito/, 'debit'], [/dinheiro|especie/, 'cash'], [/boleto/, 'boleto']].filter(([regex]) => regex.test(text)).map(([, value]) => value))];
  if (methodMatches.length > 1) questions.push('Qual forma de pagamento foi usada neste lançamento?');
  const mentioned = current.accounts.map(account => {
    const aliases = account.id === 'cash' || account.kind === 'cash' ? [normal(account.name), 'dinheiro', 'carteira', 'especie'] : [normal(account.name)];
    const positions = aliases.map(alias => ({alias, position: text.indexOf(alias)})).filter(item => item.position >= 0);
    const match = positions.sort((a, b) => a.position - b.position)[0];
    return match ? {account, position: match.position, alias: match.alias} : null;
  }).filter(Boolean).sort((a, b) => a.position - b.position);
  const draft = {title: original, cents: chosen?.cents ?? null, type: isTransfer ? 'transfer' : income ? 'income' : 'expense', status: future ? 'estimated' : 'actual', date: dateResult.date, category: 'Outros', accountId: null, paymentMethod: isTransfer ? 'transfer' : methodMatches[0] || 'other'};
  if (isTransfer) {
    if (mentioned.length !== 2) questions.push('De qual conta saiu e para qual conta entrou a transferência?');
    else {
      const [first, second] = mentioned;
      const between = text.slice(first.position + first.alias.length, second.position);
      const beforeFirst = text.slice(0, first.position);
      if (/(?:^|\s)(?:para|pro|pra|ao|a)\s*(?:(?:a|o)\s*)?$/.test(between) || /para(?:o|a)?$/.test(between.replace(/\s/g, ''))) {draft.fromAccountId = first.account.id; draft.toAccountId = second.account.id;}
      else if (/(?:para|pro|pra|ao|a)\s*(?:o|a)?\s*$/.test(beforeFirst) && /(?:do|da|de)\s*(?:o|a)?\s*$/.test(between)) {draft.fromAccountId = second.account.id; draft.toAccountId = first.account.id;}
      else questions.push('Confirme qual é a conta de origem e qual é a de destino.');
      if (mentioned.some(m => m.account.archived)) questions.push('Uma conta citada está arquivada. Escolha contas ativas.');
    }
    if (future) questions.push('A transferência já aconteceu? Apenas transferências realizadas podem ser registradas.');
  } else {
    if (mentioned.length === 1) {draft.accountId = mentioned[0].account.id; if (mentioned[0].account.archived) questions.push('Essa conta está arquivada. Escolha uma conta ativa.');}
    if (mentioned.length > 1) questions.push('Qual conta foi usada neste lançamento?');
  }
  if (questions.length) return clarify(draft);
  return {type: isTransfer ? 'transfer' : 'record', title: original, cents: draft.cents, recordType: draft.type, category: draft.category, date: draft.date, accountId: draft.accountId, paymentMethod: draft.paymentMethod, status: draft.status, draft, needsReview: true, questions: !isTransfer && !draft.accountId ? ['Escolha a conta antes de confirmar.'] : [], suggestedObligationKind: future ? income ? 'receivable' : 'payable' : null};
}

/** Semicolon-delimited UTF-8 CSV; formulas are neutralized in every string cell/header. */
export function toCsv(rows, columns) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const keys = columns || [...new Set(rows.flatMap(row => Object.keys(row)))];
  const encode = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
    if (typeof value === 'string' && /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [keys.map(encode).join(';'), ...rows.map(row => keys.map(key => encode(row[key])).join(';'))].join('\r\n');
}
