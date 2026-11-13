/**
 * Momentos Mentra personalizados: escolhe uma mensagem cristã motivacional
 * ligada ao dia a dia de quem usa o app (agenda, tarefas, conversas e finanças).
 *
 * Tudo roda no aparelho: nenhum dado sai daqui. A frase exibida e o card
 * baixado usam apenas o tema detectado; o detalhe pessoal (ex.: o título do
 * compromisso) aparece somente na tela, nunca no PNG compartilhável.
 *
 * Textos são paráfrases originais com a referência bíblica indicada.
 */

import {getMoment} from './moments-core.mjs';

const THEMES = Object.freeze({
  trabalho: {
    label: 'Trabalho e compromissos',
    pattern: /reuni[aã]o|cliente|trabalho|projeto|entrega|prazo|apresenta[cç][aã]o|proposta|chefe|equipe|empresa|expediente|escrit[oó]rio|entrevista|emprego|carreira/i,
    messages: [
      {title: 'Trabalho entregue nas mãos certas', text: 'Tudo o que você fizer hoje, faça de coração, como quem serve ao Senhor. Seu esforço tem valor diante de Deus.', reference: 'Colossenses 3:23'},
      {title: 'Planos firmados em Deus', text: 'Entregue ao Senhor cada compromisso deste dia. Quando confiamos nossos planos a Ele, os passos ganham firmeza.', reference: 'Provérbios 16:3'},
      {title: 'Força para cada tarefa', text: 'Você não enfrenta este dia sozinho. Deus fortalece quem está cansado e renova o vigor de quem espera nele.', reference: 'Isaías 40:29–31'},
    ],
    apply: item => `Na sua agenda: ${item}. Entregue esse compromisso a Deus e faça a sua parte com calma.`,
  },
  financas: {
    label: 'Finanças e provisão',
    pattern: /\bcontas?\b|boleto|pagar|pagamento|d[ií]vida|dinheiro|gasto|or[cç]amento|aluguel|fatura|cart[aã]o|parcela|sal[aá]rio|financ|economi|investi|imposto/i,
    messages: [
      {title: 'Provisão para cada necessidade', text: 'O mesmo Deus que cuida das aves do céu conhece cada uma das suas necessidades. Busque primeiro o Reino; Ele cuida do restante.', reference: 'Mateus 6:26,33'},
      {title: 'Contentamento que liberta', text: 'Aprender a viver com o que se tem é um presente. Em toda situação, a força vem de Cristo, que nos sustenta.', reference: 'Filipenses 4:11–13'},
      {title: 'Sabedoria para administrar', text: 'Quem é fiel no pouco recebe mais. Cuidar bem de cada real hoje também é um ato de fé e de mordomia.', reference: 'Lucas 16:10'},
    ],
    apply: item => `Sobre ${item}: organize o próximo passo e confie a Deus o que ainda não depende de você.`,
  },
  saude: {
    label: 'Saúde e cuidado',
    pattern: /m[eé]dic|consulta|exame|hospital|academia|treino|rem[eé]dio|terapia|dentista|sa[uú]de|\bdores?\b|cirurgia|dieta|caminhada|corrida|vacina/i,
    messages: [
      {title: 'O corpo também é cuidado de Deus', text: 'Seu corpo é morada do Espírito. Cuidar da saúde é uma forma de honrar o presente da vida que Deus deu a você.', reference: '1 Coríntios 6:19–20'},
      {title: 'Ele restaura as forças', text: 'O Senhor sara os de coração quebrantado e cuida de cada ferida. Descanse nele enquanto segue cuidando de si.', reference: 'Salmo 147:3'},
      {title: 'Ânimo para o seu cuidado', text: 'Ainda que o corpo canse, o coração pode ser renovado dia após dia pela presença de Deus.', reference: '2 Coríntios 4:16'},
    ],
    apply: item => `Hoje você cuida de: ${item}. Que Deus guie cada cuidado com o seu corpo.`,
  },
  familia: {
    label: 'Família e relações',
    pattern: /fam[ií]lia|filh[oa]|m[aã]e|\bpais?\b|esposa|marido|casamento|anivers[aá]rio|irm[aã]|av[oóô]|namorad|amig[oa]|crian[cç]a|escola dos/i,
    messages: [
      {title: 'Uma casa firmada no amor', text: 'O amor é paciente e bondoso. Que hoje suas palavras e gestos com quem você ama reflitam o amor de Cristo.', reference: '1 Coríntios 13:4–7'},
      {title: 'Eu e a minha casa', text: 'Escolha servir ao Senhor junto com os seus. Pequenos gestos de cuidado também são adoração.', reference: 'Josué 24:15'},
      {title: 'Laços que Deus fortalece', text: 'Um cordão de três dobras não se rompe facilmente. Coloque Deus no centro das suas relações hoje.', reference: 'Eclesiastes 4:12'},
    ],
    apply: item => `Lembrando de ${item}: um gesto simples de carinho hoje pode abençoar alguém que você ama.`,
  },
  estudos: {
    label: 'Estudos e aprendizado',
    pattern: /prova|estud|curso|faculdade|aula|escola|vestibular|concurso|tcc|trabalho acad|leitura|certifica/i,
    messages: [
      {title: 'Sabedoria que vem do alto', text: 'Se falta sabedoria, peça a Deus, que dá a todos com generosidade. Estude com dedicação e confie nele o resultado.', reference: 'Tiago 1:5'},
      {title: 'Crescer em graça e conhecimento', text: 'Jesus crescia em sabedoria, estatura e graça. Cada página estudada hoje também faz parte do seu crescimento.', reference: 'Lucas 2:52'},
      {title: 'Mente renovada', text: 'Deixe que Deus renove a sua mente. Aprender com propósito transforma o caminho que você está construindo.', reference: 'Romanos 12:2'},
    ],
    apply: item => `Para ${item}: estude um bloco por vez e peça a Deus clareza e serenidade.`,
  },
  ansiedade: {
    label: 'Paz para o coração',
    pattern: /ansios|ansiedade|preocup|medo|estress|cansad|sobrecarreg|exaust|triste|sozinh|nervos|ins[oô]nia|n[aã]o consigo|desanim|press[aã]o/i,
    messages: [
      {title: 'Paz que guarda o coração', text: 'Não ande ansioso por coisa alguma. Apresente a Deus o que pesa em você, e a paz dele guardará seu coração e sua mente.', reference: 'Filipenses 4:6–7'},
      {title: 'Lance sobre Ele o peso', text: 'Entregue a Deus toda a sua ansiedade, porque Ele cuida de você. Você não precisa carregar tudo sozinho.', reference: '1 Pedro 5:7'},
      {title: 'Um convite ao descanso', text: 'Jesus acolhe quem está cansado e sobrecarregado. Aproxime-se dele hoje e encontre descanso para a alma.', reference: 'Mateus 11:28'},
    ],
    apply: () => 'Você comentou que algo está pesando. Respire, ore em poucas palavras e escolha só o próximo passo.',
  },
  empreender: {
    label: 'Ideias e novos caminhos',
    pattern: /ideia|neg[oó]cio|empreend|vendas|loja|cliente novo|lan[cç]amento|marca|produto|servi[cç]o|renda extra|começar|\bplanos?\b/i,
    messages: [
      {title: 'Um novo caminho no deserto', text: 'Deus faz coisas novas e abre caminhos onde parecia não haver. Dê o primeiro passo com fé e com cuidado.', reference: 'Isaías 43:19'},
      {title: 'Não despreze o começo pequeno', text: 'Os começos humildes também são vistos por Deus. Cada pequeno passo fiel prepara algo maior.', reference: 'Zacarias 4:10'},
      {title: 'Planos com propósito', text: 'O coração faz planos, mas é o Senhor quem dirige os passos. Sonhe, planeje e deixe Deus conduzir.', reference: 'Provérbios 16:9'},
    ],
    apply: item => `Sobre ${item}: escolha um passo pequeno para hoje e consagre esse sonho a Deus.`,
  },
  viagem: {
    label: 'Caminhos e viagens',
    pattern: /viagem|viajar|voo|aeroporto|estrada|mudan[cç]a|rodovi[aá]ria|f[eé]rias/i,
    messages: [
      {title: 'Guardado em cada caminho', text: 'O Senhor guardará a sua saída e a sua chegada, desde agora e para sempre. Siga em paz.', reference: 'Salmo 121:8'},
      {title: 'Ele vai à sua frente', text: 'O próprio Senhor irá à sua frente e estará com você. Não tenha medo nem desanime.', reference: 'Deuteronômio 31:8'},
    ],
    apply: item => `Em ${item}, que Deus guarde cada etapa do caminho.`,
  },
  gratidao: {
    label: 'Gratidão e conquistas',
    pattern: /conclu[ií]|consegui|conquist|gratid[aã]o|obrigad|aprovad|vit[oó]ria|deu certo|finalmente/i,
    messages: [
      {title: 'Gratidão em todas as coisas', text: 'Dê graças em todas as circunstâncias. Reconhecer o que Deus já fez renova a fé para o que vem.', reference: '1 Tessalonicenses 5:18'},
      {title: 'Até aqui nos ajudou o Senhor', text: 'Olhe para o caminho percorrido. Cada passo dado até aqui é sinal do cuidado fiel de Deus.', reference: '1 Samuel 7:12'},
    ],
    apply: item => `Você avançou em ${item}. Celebre e agradeça a Deus por esse passo.`,
  },
});

const PERIOD_FALLBACK_LABEL = Object.freeze({morning: 'Um novo dia', afternoon: 'Renovo no caminho', night: 'Descanso em Deus'});

const PERIOD_CLOSING = Object.freeze({
  morning: 'Comece com um passo e convide Deus para caminhar com você.',
  afternoon: 'Faça uma pausa breve, respire e retome com o coração em paz.',
  night: 'Entregue o que ficou pendente e descanse no cuidado de Deus.',
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value.filter(isRecord) : [];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value;
}

function localDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Coleta sinais do dia a dia com pesos: agenda de hoje pesa mais,
 * depois conversas recentes, tarefas pendentes e situação financeira.
 */
export function collectSignals(state, today) {
  const signals = [];
  const s = isRecord(state) ? state : {};
  for (const event of list(s.events)) {
    if (event.trashed || event.cancelled) continue;
    const title = clean(event.title);
    if (!title) continue;
    const weight = event.date === today ? 5 : (typeof event.date === 'string' && event.date > today && event.date <= addDays(today, 2) ? 2 : 0);
    if (weight) signals.push({text: title, weight, label: event.date === today && event.time ? `${title} às ${clean(event.time)}` : title, source: 'agenda'});
  }
  const messages = list(s.messages).filter(m => m.role === 'user').slice(-8);
  messages.forEach((message, index) => {
    const text = clean(message.text ?? message.content);
    if (text) signals.push({text, weight: 2 + index / 4, label: null, source: 'conversa'});
  });
  for (const task of list(s.tasks)) {
    const title = clean(task.title);
    if (!title || task.trashed) continue;
    if (task.done) signals.push({text: title, weight: .6, label: title, source: 'conquista', done: true});
    else signals.push({text: `${title} ${clean(task.category)}`, weight: task.dueDate === today ? 3 : 1.4, label: title.charAt(0).toLocaleLowerCase('pt-BR') + title.slice(1), source: 'tarefa'});
  }
  const records = list(s.records).filter(r => !r.trashed);
  const expense = records.filter(r => r.type === 'expense' && r.status === 'actual').reduce((sum, r) => sum + (Number(r.cents) || 0), 0);
  const income = records.filter(r => r.type === 'income' && r.status === 'actual').reduce((sum, r) => sum + (Number(r.cents) || 0), 0);
  if (expense > income && expense > 0) signals.push({text: 'orçamento dinheiro gastos', weight: 3, label: 'o seu orçamento', source: 'financas'});
  for (const bill of list(s.bills ?? s.payables)) {
    if (bill.paid || bill.status === 'paid') continue;
    const title = clean(bill.title ?? bill.name);
    if (title) signals.push({text: `${title} conta pagar`, weight: bill.dueDate === today ? 3 : 1, label: title, source: 'financas'});
  }
  return signals;
}

function addDays(day, amount) {
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y || !m || !d) return day;
  return localDate(new Date(y, m - 1, d + amount));
}

/** Retorna o tema mais presente no dia e o item concreto mais relevante. */
export function detectTheme(state, today) {
  const scores = new Map(), best = new Map();
  for (const signal of collectSignals(state, today)) {
    for (const [id, theme] of Object.entries(THEMES)) {
      const matches = id === 'gratidao' ? (signal.done || theme.pattern.test(signal.text)) : (!signal.done && theme.pattern.test(signal.text));
      if (!matches) continue;
      scores.set(id, (scores.get(id) || 0) + signal.weight);
      const current = best.get(id);
      if (signal.label && (!current || signal.weight > current.weight)) best.set(id, signal);
    }
  }
  let winner = null, top = 0;
  for (const [id, score] of scores) if (score > top) { winner = id; top = score; }
  if (!winner || top < 1) return null;
  return {id: winner, score: top, item: best.get(winner)?.label || null};
}

/**
 * Mensagem do momento, sempre cristã e alinhada à vida do usuário.
 * Mantém a mesma frase durante o dia e período (estável entre renderizações).
 */
export function personalMoment(period, state, now = new Date()) {
  const today = localDate(now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date());
  const detected = detectTheme(state, today);
  const closing = PERIOD_CLOSING[period] || PERIOD_CLOSING.morning;
  if (!detected) {
    const base = getMoment(PERIOD_FALLBACK_LABEL[period] ? period : 'morning');
    return {title: base.title, text: base.text, reference: base.reference, theme: 'periodo', themeLabel: PERIOD_FALLBACK_LABEL[base.period], personal: closing, personalized: false};
  }
  const theme = THEMES[detected.id];
  const pick = theme.messages[hash(`${today}|${period}|${detected.id}`) % theme.messages.length];
  const personal = detected.item ? theme.apply(detected.item) : theme.apply('o que está no seu coração');
  return {title: pick.title, text: pick.text, reference: pick.reference, theme: detected.id, themeLabel: theme.label, personal: `${personal} ${closing}`, personalized: true};
}

export const MOMENT_THEMES = Object.freeze(Object.keys(THEMES));
