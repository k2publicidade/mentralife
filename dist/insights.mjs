/**
 * Inteligência do dia a dia, calculada só com os dados da conta aberta no aparelho:
 * alertas do dia ("Atenção hoje"), primeiros passos da conta e índice da busca global.
 * Funções puras: não leem rede, relógio global nem outras contas.
 */
import {financialSummary, obligationRemaining} from './finance.mjs';

const list = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : [];
const live = v => !v.trashed && !v.cancelled && !v.canceled && v.status !== 'cancelled' && v.status !== 'canceled';
const brl = cents => (Number(cents) / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shift = (day, amount) => { const [y, m, d] = day.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + amount)); return t.toISOString().slice(0, 10); };
const names = (items, max = 2) => items.slice(0, max).map(i => i.title).filter(Boolean).join(', ') + (items.length > max ? ` e mais ${items.length - max}` : '');
const dated = (items, max = 2) => items.slice(0, max).map(i => i.dueDate ? `${i.title} (${String(i.dueDate).split('-').reverse().slice(0, 2).join('/')})` : i.title).join(', ') + (items.length > max ? ` e mais ${items.length - max}` : '');

/** Alertas priorizados do dia: o mais urgente primeiro, no máximo `limit`. */
export function attentionItems(state, today, {limit = 6} = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const items = [];
  const tasks = list(s.tasks).filter(t => live(t) && !t.done);
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const overdue = tasks.filter(t => validDay(t.dueDate) && t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = tasks.filter(t => t.dueDate === today);
  if (overdue.length) items.push({id: 'tasks-overdue', tone: 'alert', icon: 'check', weight: 100, title: plural(overdue.length, 'tarefa atrasada', 'tarefas atrasadas'), detail: dated(overdue), route: 'vida/tarefas'});
  if (dueToday.length) items.push({id: 'tasks-today', tone: 'info', icon: 'check', weight: 70, title: plural(dueToday.length, 'tarefa para hoje', 'tarefas para hoje'), detail: names(dueToday), route: 'vida/tarefas'});

  const events = list(s.events).filter(e => live(e) && e.date === today).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (events.length) {
    const next = events[0];
    items.push({id: 'events-today', tone: 'info', icon: 'calendar', weight: 80, title: plural(events.length, 'compromisso hoje', 'compromissos hoje'), detail: `${next.time ? next.time + ' · ' : ''}${next.title}${events.length > 1 ? ` e mais ${events.length - 1}` : ''}`, route: 'vida/agenda'});
  }

  const fileAreas = ['documentos', 'contratos', 'garantias'];
  const fileDates = list(s.documents).filter(d => live(d) && validDay(d.importantDate) && d.importantDate >= shift(today, -7) && (d.importantDate <= shift(today, 7) || (d.remind === true && shift(d.importantDate, -(Number(d.remindDaysBefore) || 0)) <= today))).sort((a, b) => a.importantDate.localeCompare(b.importantDate));
  if (fileDates.length) {
    const first = fileDates[0], late = fileDates.some(d => d.importantDate < today);
    items.push({id: 'files-dates', tone: late ? 'alert' : 'warn', icon: 'lock', weight: late ? 105 : 75, title: plural(fileDates.length, 'data importante em Meus Arquivos', 'datas importantes em Meus Arquivos'), detail: fileDates.slice(0, 2).map(d => `${d.title}: ${d.dateLabel || 'data importante'} ${d.importantDate.split('-').reverse().slice(0, 2).join('/')}`).join(', ') + (fileDates.length > 2 ? ` e mais ${fileDates.length - 2}` : ''), route: 'arquivos/' + (fileAreas.includes(first.area) && first.category !== 'Recibos e comprovantes' ? first.area : 'documentos')});
  }

  const open = list(s.obligations).filter(o => live(o) && o.status !== 'cancelled' && obligationRemaining(o) > 0 && validDay(o.dueDate));
  const weekEnd = shift(today, 7);
  const lateBills = open.filter(o => o.kind === 'payable' && o.dueDate < today);
  const soonBills = open.filter(o => o.kind === 'payable' && o.dueDate >= today && o.dueDate <= weekEnd).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const lateIncome = open.filter(o => o.kind === 'receivable' && o.dueDate < today);
  const total = items => items.reduce((sum, o) => sum + obligationRemaining(o), 0);
  if (lateBills.length) items.push({id: 'bills-overdue', tone: 'alert', icon: 'wallet', weight: 110, title: `${plural(lateBills.length, 'conta vencida', 'contas vencidas')} · ${brl(total(lateBills))}`, detail: dated(lateBills), route: 'dinheiro/compromissos'});
  if (soonBills.length) {
    const first = soonBills[0], when = first.dueDate === today ? 'vence hoje' : `vence em ${first.dueDate.split('-').reverse().slice(0, 2).join('/')}`;
    items.push({id: 'bills-soon', tone: first.dueDate === today ? 'alert' : 'warn', icon: 'wallet', weight: first.dueDate === today ? 105 : 90, title: `${plural(soonBills.length, 'conta a pagar', 'contas a pagar')} em 7 dias · ${brl(total(soonBills))}`, detail: `${first.title} ${when}${soonBills.length > 1 ? ` · mais ${soonBills.length - 1}` : ''}`, route: 'dinheiro/compromissos'});
  }
  if (lateIncome.length) items.push({id: 'income-overdue', tone: 'warn', icon: 'wallet', weight: 60, title: `${plural(lateIncome.length, 'valor a receber em atraso', 'valores a receber em atraso')} · ${brl(total(lateIncome))}`, detail: dated(lateIncome), route: 'dinheiro/compromissos'});

  const health = s.health && typeof s.health === 'object' ? s.health : {};
  const tomorrow = shift(today, 1);
  const appointments = list(health.appointments).filter(a => live(a) && !a.done && (a.date === today || a.date === tomorrow)).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  if (appointments.length) {
    const first = appointments[0];
    items.push({id: 'health-soon', tone: 'info', icon: 'life', weight: 78, title: plural(appointments.length, 'consulta ou exame próximo', 'consultas ou exames próximos'), detail: `${first.date === today ? 'Hoje' : 'Amanhã'}${first.time ? ' às ' + first.time : ''} · ${first.title || first.name || 'Consulta'}${appointments.length > 1 ? ` e mais ${appointments.length - 1}` : ''}`, route: 'saude/cuidado'});
  }
  const lateSteps = [];
  for (const journey of list(s.journeys).filter(j => live(j) && j.status !== 'completed' && j.status !== 'paused'))
    for (const step of list(journey.steps)) if (!step.done && validDay(step.dueDate) && step.dueDate < today) lateSteps.push({...step, title: step.title, dueDate: step.dueDate, journeyId: journey.id});
  if (lateSteps.length) items.push({id: 'steps-overdue', tone: 'warn', icon: 'idea', weight: 75, title: plural(lateSteps.length, 'etapa do Impulso atrasada', 'etapas do Impulso atrasadas'), detail: dated(lateSteps), route: 'caminhos/plano/' + lateSteps[0].journeyId});

  let budgets = [];
  try { budgets = financialSummary(s, {month: today.slice(0, 7)}).budgets || []; } catch { budgets = []; }
  const used = b => b.cents > 0 ? (b.spentCents || 0) / b.cents : 0;
  const over = budgets.filter(b => b.cents > 0 && used(b) > 1);
  const near = budgets.filter(b => b.cents > 0 && used(b) >= .8 && used(b) <= 1);
  if (over.length) items.push({id: 'budget-over', tone: 'alert', icon: 'bell', weight: 95, title: plural(over.length, 'orçamento estourado', 'orçamentos estourados'), detail: over.slice(0, 2).map(b => `${b.category}: ${Math.round(used(b) * 100)}%`).join(' · '), route: 'dinheiro/relatorios'});
  else if (near.length) items.push({id: 'budget-near', tone: 'warn', icon: 'bell', weight: 65, title: plural(near.length, 'orçamento perto do limite', 'orçamentos perto do limite'), detail: near.slice(0, 2).map(b => `${b.category}: ${Math.round(used(b) * 100)}%`).join(' · '), route: 'dinheiro/relatorios'});

  return items.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/** Primeiros passos para a conta ficar realmente pessoal. */
export function onboardingSteps(state) {
  const s = state && typeof state === 'object' ? state : {};
  const steps = [
    {id: 'perfil', title: 'Confirme seu nome e fuso horário', detail: 'Lembretes e mensagens no horário certo.', route: 'perfil', done: Boolean(s.profile?.timeZone && s.profile?.name)},
    {id: 'tarefa', title: 'Anote sua primeira tarefa', detail: 'Tire da cabeça o que está pendente.', route: 'vida/tarefas', done: list(s.tasks).length > 0},
    {id: 'agenda', title: 'Coloque um compromisso na agenda', detail: 'A Mentra usa sua agenda para personalizar o dia.', route: 'vida/agenda', done: list(s.events).length > 0},
    {id: 'dinheiro', title: 'Cadastre uma conta ou um lançamento', detail: 'Para acompanhar entradas, saídas e contas a pagar.', route: 'dinheiro/contas', done: list(s.accounts).length > 0 || list(s.records).length > 0},
    {id: 'mentra', title: 'Converse com a Mentra', detail: 'Peça ajuda para organizar o dia em uma frase.', route: 'mentra', done: list(s.messages).some(m => m.role === 'user')},
    {id: 'momentos', title: 'Escolha os horários dos seus Momentos', detail: 'Mensagens cristãs ligadas à sua rotina.', route: 'momentos', done: Boolean(s.moments && typeof s.moments === 'object')},
  ];
  const done = steps.filter(step => step.done).length;
  return {steps, done, total: steps.length, complete: done === steps.length};
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SOURCES = [
  ['tasks', 'Tarefa', 'vida/tarefas', t => [t.title, t.category, t.note], t => [t.category, t.dueDate && `prazo ${t.dueDate.split('-').reverse().join('/')}`, t.done && 'concluída']],
  ['events', 'Compromisso', 'vida/agenda', e => [e.title, e.note], e => [e.date && e.date.split('-').reverse().join('/'), e.time]],
  ['documents', d => ({contratos: 'Contrato', garantias: 'Garantia'})[d.area] || 'Documento', d => ['contratos', 'garantias'].includes(d.area) && d.category !== 'Recibos e comprovantes' ? 'arquivos/' + d.area : 'arquivos/documentos', d => [d.title, d.category, d.note, d.dateLabel, d.extractedText], d => [d.category, d.importantDate && `${d.dateLabel || 'data'} ${d.importantDate.split('-').reverse().join('/')}`, d.ext]],
  ['records', 'Lançamento', 'dinheiro/lancamentos', r => [r.title, r.category, r.note], r => [r.type === 'income' ? 'entrada' : r.type === 'expense' ? 'saída' : r.type, Number.isFinite(r.cents) && brl(r.cents), r.date && r.date.split('-').reverse().join('/')]],
  ['obligations', 'A pagar / receber', 'dinheiro/compromissos', o => [o.title, o.category], o => [o.kind === 'payable' ? 'a pagar' : 'a receber', Number.isFinite(o.cents) && brl(o.cents), o.dueDate && `vence ${o.dueDate.split('-').reverse().join('/')}`]],
  ['journeys', 'Plano no Impulso', 'caminhos', j => [j.title, j.goal, j.context], j => [j.status === 'active' ? 'em andamento' : j.status]],
];

/** Índice de busca da conta aberta. */
export function searchIndex(state) {
  const s = state && typeof state === 'object' ? state : {};
  const index = [];
  for (const [key, type, route, text, detail] of SOURCES) {
    for (const item of list(s[key]).filter(live)) {
      const title = String(item.title || '').trim();
      if (!title) continue;
      index.push({type: typeof type === 'function' ? type(item) : type, route: typeof route === 'function' ? route(item) : route, title: title.slice(0, 140), detail: detail(item).filter(Boolean).join(' · ').slice(0, 140), haystack: normalize(text(item).filter(Boolean).join(' ')).slice(0, 4000)});
    }
  }
  const health = s.health && typeof s.health === 'object' ? s.health : {};
  for (const [key, type, route] of [['appointments', 'Consulta ou exame', 'saude/cuidado'], ['medications', 'Medicamento', 'saude/cuidado'], ['logs', 'Registro de saúde', 'saude'], ['activities', 'Movimento', 'saude/movimento']]) {
    for (const item of list(health[key]).filter(live)) {
      const title = String(item.title || item.name || item.note || '').trim();
      if (!title) continue;
      index.push({type, route, title: title.slice(0, 140), detail: [item.date && String(item.date).split('-').reverse().join('/'), item.time, item.place].filter(Boolean).join(' · ').slice(0, 140), haystack: normalize([item.title, item.name, item.note, item.place, item.professional].filter(Boolean).join(' ')).slice(0, 4000)});
    }
  }
  for (const journey of list(s.journeys).filter(live)) {
    for (const step of list(journey.steps)) {
      const title = String(step.title || '').trim();
      if (!title) continue;
      index.push({type: 'Etapa do Impulso', route: 'caminhos/plano/' + journey.id, title: title.slice(0, 140), detail: [journey.title, step.dueDate && `prazo ${String(step.dueDate).split('-').reverse().join('/')}`, step.done && 'concluída'].filter(Boolean).join(' · ').slice(0, 140), haystack: normalize([step.title, step.description, journey.title].filter(Boolean).join(' ')).slice(0, 4000)});
    }
  }
  return index;
}

/** Busca sem acento e sem diferenciar maiúsculas; todas as palavras precisam aparecer. */
export function searchItems(index, query, {limit = 30} = {}) {
  const terms = normalize(query).split(/\s+/).filter(term => term.length >= 2);
  if (!terms.length) return [];
  return index
    .map(item => ({item, score: terms.every(term => item.haystack.includes(term)) ? terms.reduce((sum, term) => sum + (normalize(item.title).includes(term) ? 3 : 1) + (normalize(item.title).startsWith(term) ? 2 : 0), 0) : 0}))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'pt-BR'))
    .slice(0, limit)
    .map(result => result.item);
}
