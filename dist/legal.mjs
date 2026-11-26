// Fonte única dos dados da empresa e dos textos legais (Termos de Uso e Aviso de Privacidade).
// As páginas públicas termos.html, privacidade.html e excluir-conta.html são geradas a partir
// deste arquivo por scripts/legal-pages.mjs; o app usa as mesmas funções em Planos e em Meu espaço.
// scripts/build-vercel.mjs recusa publicar se faltar algum campo de REQUIRED_COMPANY_FIELDS.

export const COMPANY = {
 legalName: 'Nexo Entretenimento e Eventos Culturais Ltda', // Nome empresarial (razão social), como no CNPJ
 tradeName: 'Mentra Life', // Nome fantasia / marca
 cnpj: '68.825.713/0001-28',
 address: 'Rua Carlos Machado, 152, Lote 18, LTM 41784, Quadra 8, Barra Olímpica, Rio de Janeiro/RJ, CEP 22775-042',
 email: 'contato@mentralife.com.br',
 phone: '',                // Opcional. Telefone ou WhatsApp de atendimento
 supportHours: 'todos os dias, 24 horas (atendimento automatizado)',
 site: 'https://mentralife.com.br',
 dpoName: '',              // Encarregado pelo tratamento de dados pessoais (LGPD, art. 41)
 dpoEmail: ''              // Canal do encarregado; se vazio, usa COMPANY.email
};

export const LEGAL = {
 termsVersion: '2026-11-26',
 privacyVersion: '2026-11-26',
 effectiveDate: '26/11/2026',
 minimumAge: 18,
 withdrawalDays: 7,          // CDC, art. 49
 changeNoticeDays: 15,       // aviso antes de mudanças relevantes
 requestReplyDays: 15,       // resposta a pedidos de titulares (LGPD, art. 19, II)
 billingReplyBusinessDays: 5,
 refundBusinessDays: 5,
 contestDays: 30,
 paymentRetentionYears: 5,   // registros fiscais e de pagamento
 accessLogMonths: 6,         // Marco Civil da Internet, art. 15
 technicalRetentionDays: 30,
 backupRetentionDays: 90
};

export const REQUIRED_COMPANY_FIELDS = {legalName:'nome empresarial',cnpj:'CNPJ',address:'endereço físico',email:'e-mail de atendimento',supportHours:'horário de atendimento'};
export function missingCompanyFields(company=COMPANY){return Object.entries(REQUIRED_COMPANY_FIELDS).filter(([key])=>!String(company[key]||'').trim()).map(([,label])=>label);}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Campo ainda não informado: some da tela (o build da Vercel cobra o preenchimento; veja MENTRA_ALLOW_LEGAL_DRAFT).
const val=value=>String(value||'').trim()?esc(value):'';
const brl=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const privacyEmail=(company=COMPANY)=>company.dpoEmail||company.email;

export const LEGAL_LINKS = {terms:'/termos.html',privacy:'/privacidade.html',deletion:'/excluir-conta.html'};

/** Identificação exigida pelo Decreto nº 7.962/2013, art. 2º. */
export function companyMarkup({company=COMPANY,heading='Quem oferece o serviço',compact=false,links=true}={}){
 const mail=company.email?(links?`<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>`:esc(company.email)):'';
 const name=company.legalName?`${esc(company.legalName)}${company.tradeName?` (${esc(company.tradeName)})`:''}`:esc(company.tradeName||'');
 const row=(label,value)=>value?`<div><dt>${label}</dt><dd>${value}</dd></div>`:'';
 return `<section class="legal-company${compact?' legal-company-compact':''}" aria-label="Identificação da empresa">${heading?`<h2>${esc(heading)}</h2>`:''}<dl>`+
  row('Empresa',name)+row('CNPJ',val(company.cnpj))+row('Endereço',val(company.address))+row('E-mail',mail)+row('Telefone',val(company.phone))+row('Atendimento',val(company.supportHours))+
  `</dl></section>`;
}

export function legalLinksMarkup(){return `<nav class="legal-links" aria-label="Documentos legais"><a href="${LEGAL_LINKS.terms}">Termos de Uso</a><a href="${LEGAL_LINKS.privacy}">Aviso de Privacidade</a><a href="${LEGAL_LINKS.deletion}">Excluir conta</a></nav>`;}

/** Resumo exibido antes do pagamento (Decreto nº 7.962/2013, art. 4º, I). */
export function checkoutSummaryMarkup(){
 return `<div class="legal-summary"><p><strong>Antes de pagar:</strong> o pagamento é único, por PIX, e libera os dias do período escolhido. <strong>Não há renovação automática nem cobrança recorrente.</strong> Você pode desistir em até ${LEGAL.withdrawalDays} dias após o pagamento e receber o valor de volta, em Meu espaço → Desistir da compra.</p></div>`;
}

const p=text=>`<p>${text}</p>`;
const ul=items=>`<ul>${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
const table=(head,rows)=>`<div class="legal-table-wrap"><table><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${c}</td>`:`<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export function termsSections({company=COMPANY,plans=[]}={}){
 const support=`${company.email?`<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>`:''}${company.phone?` ou ${esc(company.phone)}`:''}`;
 const planRows=plans.map(pl=>[esc(pl.name),`${pl.days} dias`,pl.priceCents?brl(pl.priceCents):'—',pl.promoPriceCents?brl(pl.promoPriceCents):'—']);
 return [
 {id:'empresa',title:'1. Identificação da empresa e atendimento',body:[
  p(`Estes Termos de Uso regulam o uso da Mentra Life (site, aplicativo Android e aplicativo iOS), oferecida pela empresa identificada abaixo. A mesma identificação aparece na tela de planos, antes da contratação, e em Meu espaço → Sobre e contato.`),
  companyMarkup({company,heading:''}),
  p(`Atendimento: ${support}${company.supportHours?`, ${esc(company.supportHours)}`:''}. Dentro do app, use também o botão <strong>Feedback</strong>. Pedidos sobre dados pessoais seguem o <a href="${LEGAL_LINKS.privacy}">Aviso de Privacidade</a>.`)
 ]},
 {id:'conta',title:'2. Serviço e conta',body:[
  p(`A Mentra Life é um organizador pessoal. Para usar, você precisa ter pelo menos ${LEGAL.minimumAge} anos e criar uma conta com nome, e-mail e senha de 12 a 128 caracteres. A conta é pessoal: não a compartilhe e mantenha a senha em sigilo. Avise o atendimento se suspeitar de acesso indevido.`),
  p('Funções do serviço e do que cada uma depende:'),
  table(['Função','Internet','Terceiros','Plano ativo'],[
   ['Anotações, tarefas, documentos e fotos','Não para consultar e editar a cópia do aparelho. Sim para sincronizar','Não','Não'],
   ['Armazenamento em nuvem e sincronização entre aparelhos','Sim','Cloudflare (servidores e banco de dados)','Não'],
   ['Agenda da Mentra','Não para consultar a cópia do aparelho. Sim para sincronizar','Não','Não'],
   ['Lembretes por notificação','Sim','Serviços de notificação do navegador, Google (Android) ou Apple (iOS)','Sim'],
   ['Finanças e saúde e bem-estar (organização pessoal)','Não para consultar a cópia do aparelho. Sim para sincronizar','Não','Não'],
   ['Mentra IA (texto e áudio)','Sim','DeepSeek (respostas), Cloudflare (transcrição de áudio)','Sim'],
   ['Importação do Google Agenda (opcional)','Sim','Google','Não'],
   ['Conversa pelo WhatsApp (opcional)','Sim','WhatsApp (Meta)','Sim']
  ]),
  p('Sem plano ativo, você continua acessando, editando, exportando e excluindo tudo o que guardou. Só as funções marcadas como dependentes de plano ficam bloqueadas.'),
  p('<strong>Recuperação da conta.</strong> No cadastro, mostramos uma única vez um código pessoal de recuperação. Guarde esse código em local seguro: com ele você define uma nova senha na tela de entrada. Se perder a senha e o código, fale com o atendimento usando o e-mail da conta. Vamos pedir informações para confirmar que a conta é sua e podemos recusar o pedido se não for possível confirmar.')
 ]},
 {id:'ia',title:'3. Assistente de IA e agenda',body:[
  p('A Mentra IA responde perguntas sobre a sua organização e pode executar somente estas ações:'),
  ul(['<strong>Sugerir:</strong> orientar, resumir e analisar seus dados, sem gravar nada;','<strong>Criar:</strong> tarefas, compromissos na agenda da Mentra, receitas e despesas já realizadas e contas financeiras, quando o pedido for claro (por exemplo, “gastei R$ 35,90 no almoço”);','<strong>Não executa:</strong> edição ou exclusão de registros que já existem, envio de convites ou mensagens a outras pessoas, gravação em calendários externos, pagamentos, transferências ou alterações em dados de saúde.']),
  p('<strong>Confirmação.</strong> Quando o pedido é claro, a IA grava o registro na hora, sem pedir uma confirmação a mais, e a resposta mostra exatamente o que foi criado. Se faltar alguma informação, como data, horário ou valor, a IA pergunta antes e não grava nada. Pedidos repetidos não geram registros duplicados.'),
  p('<strong>Qual calendário.</strong> Os compromissos criados pela IA entram só na agenda da própria Mentra, no fuso horário da sua conta (horário de Brasília, se nenhum outro tiver sido escolhido). A IA nunca grava no Google Agenda nem em outro calendário externo.'),
  p('<strong>Como corrigir.</strong> Abra o registro na Agenda, em Tarefas ou em Finanças e edite ou exclua. Você também pode pedir à IA para criar um registro novo com os dados certos.'),
  p('<strong>Google Agenda (opcional).</strong> A integração apenas <em>lê</em> a sua agenda principal. Cada importação mostra uma revisão e só grava o que você confirmar. Para revogar o acesso, use Minha vida → Agenda → Desconectar calendário. Você também pode remover a permissão em <a href="https://myaccount.google.com/permissions" rel="noopener">myaccount.google.com/permissions</a>.'),
  p('A IA pode errar. Confira valores, datas e horários. As respostas não substituem orientação médica, nutricional, psicológica, jurídica ou financeira profissional. Para usar a IA, você precisa dar uma autorização própria, porque o conteúdo é processado por um fornecedor no exterior (veja o Aviso de Privacidade).')
 ]},
 {id:'planos',title:'4. Planos e cobrança',body:[
  p('Há um único plano, com acesso completo a todas as funções, oferecido em três períodos:'),
  planRows.length?table(['Período','Duração','Preço regular','1º pagamento (promoção)'],planRows):'',
  p('Estes são os preços na data desta versão. O preço que vale para você é sempre o exibido na tela de planos e no PIX antes do pagamento.'),
  ul([
   '<strong>Incluído:</strong> todas as funções da Mentra e até 2.000 mensagens de IA por mês. A contagem recomeça no dia 1 de cada mês. Áudios têm limites técnicos: até 2 minutos por gravação ou 2 MB por arquivo, além de um limite diário de transcrições.',
   '<strong>Preço promocional:</strong> vale só para quem nunca teve um pagamento confirmado na Mentra, e só no primeiro período contratado. Os pagamentos seguintes custam o preço regular.',
   '<strong>Periodicidade:</strong> cada pagamento libera 30, 90 ou 365 dias, conforme o período escolhido. Os dias começam a contar na confirmação do pagamento. Se você pagar antes de o acesso acabar, os dias se somam ao fim do acesso atual.',
   '<strong>Renovação:</strong> <strong>não há renovação automática nem cobrança recorrente.</strong> Para continuar depois do fim do período, você faz um novo pagamento.',
   '<strong>Teste gratuito:</strong> não há teste gratuito.',
   '<strong>Primeira cobrança:</strong> acontece quando você paga o PIX gerado na tela de planos. O acesso é liberado assim que o pagamento é confirmado. Não guardamos dados bancários nem de cartão.'
  ]),
  p('<strong>Onde contratar e gerenciar.</strong> A contratação é feita somente pelo site, em Planos, com PIX processado pela Six7Pay, uma instituição de pagamento. Os aplicativos da App Store e do Google Play não vendem assinaturas, por isso não há nada para gerenciar ou cancelar nessas lojas. A situação do seu acesso, a data de término e os pagamentos aparecem em Planos e em Meu espaço, no site e nos aplicativos.')
 ]},
 {id:'cancelamento',title:'5. Cancelamento e arrependimento',body:[
  p('<strong>Interromper a renovação.</strong> Como não existe renovação automática, não há nada para cancelar: basta não fazer um novo pagamento. Nenhum valor é cobrado sem que você gere e pague um PIX.'),
  p('<strong>Quando o acesso pago termina.</strong> No último dia do período pago, na data mostrada em Planos e em Meu espaço. Depois disso, seus dados continuam guardados e acessíveis, e só as funções que dependem de plano ficam bloqueadas.'),
  p(`<strong>Direito de arrependimento (art. 49 do Código de Defesa do Consumidor).</strong> Você pode desistir da contratação em até ${LEGAL.withdrawalDays} dias corridos, contados da confirmação do pagamento, sem precisar justificar. Para isso, use Meu espaço → <strong>Desistir da compra</strong> ou escreva para ${support}. A confirmação do pedido é imediata, com número de protocolo. Pedimos o estorno à Six7Pay na mesma hora, pelo valor integral, para a conta de onde saiu o PIX. Se a instituição de pagamento não confirmar o estorno na hora, nossa equipe conclui o processo em até ${LEGAL.refundBusinessDays} dias úteis. Os dias liberados por esse pagamento são retirados do seu acesso.`),
  p('<strong>Depois do prazo de arrependimento.</strong> O período pago continua disponível até o fim, e não há devolução proporcional pelos dias não usados. Isso não se aplica a cobranças indevidas nem a falhas do serviço, que são tratadas como explicado no item 7.'),
  p('Excluir a conta não substitui o pedido de arrependimento. Se você ainda estiver no prazo e quiser o dinheiro de volta, peça o arrependimento antes de excluir a conta.')
 ]},
 {id:'conteudo',title:'6. Anotações, privacidade e encerramento da conta',body:[
  p('<strong>O conteúdo é seu.</strong> Anotações, documentos, fotos, registros financeiros e de saúde e conversas pertencem a você. Você nos autoriza a usar esse conteúdo apenas no necessário para operar o serviço: guardar, sincronizar, exibir, gerar cópias de segurança e, quando você usar a Mentra IA, enviá-lo à IA para responder ao seu pedido. Não vendemos seu conteúdo nem o usamos para publicidade.'),
  p('<strong>Exportar.</strong> Em Meu espaço → Controle dos seus dados, use “Exportar meus dados” (arquivo JSON com a conta, o conteúdo, a assinatura e o histórico das integrações) ou “Baixar cópia para restauração”. Os documentos originais também podem ser baixados um a um na Biblioteca.'),
  p('<strong>Ao fim do plano.</strong> Nada é apagado. Suas anotações e documentos continuam disponíveis para consultar, editar, exportar e excluir.'),
  p(`<strong>Três ações diferentes:</strong>`),
  ul([
   '<strong>Não renovar:</strong> você mantém a conta e os dados. O acesso pago termina no fim do período.',
   '<strong>Apagar meus dados</strong> (Meu espaço): apaga todo o conteúdo (anotações, tarefas, agenda, finanças, saúde, documentos, conversas, memória da IA e integrações) e mantém a conta, o login, o plano e o histórico de pagamentos.',
   `<strong>Excluir minha conta</strong> (Meu espaço, ou pela página <a href="${LEGAL_LINKS.deletion}">Excluir conta</a> no site): apaga a conta e todo o conteúdo de forma definitiva, encerra as sessões e desconecta as integrações. Se houver dias pagos restantes, eles se perdem e não são reembolsados, salvo dentro do prazo de arrependimento. Os registros de pagamento são guardados à parte por ${LEGAL.paymentRetentionYears} anos, por obrigação fiscal e legal.`
  ]),
  p(`O tratamento de dados pessoais, os fornecedores, a retenção e os seus direitos como titular estão no <a href="${LEGAL_LINKS.privacy}">Aviso de Privacidade</a>, que faz parte destes Termos.`)
 ]},
 {id:'uso',title:'7. Uso indevido, suspensão e suporte',body:[
  p('Não é permitido: acessar contas de outras pessoas, tentar burlar limites, autenticação ou pagamentos, atacar ou sobrecarregar o serviço, usar automações abusivas, revender o acesso, compartilhar a conta e usar a Mentra, inclusive os links privados de documentos, para guardar ou distribuir conteúdo ilícito.'),
  p('<strong>Suspensão.</strong> Podemos suspender a conta, no todo ou em parte, por motivos objetivos: fraude ou tentativa de fraude em pagamentos, contestação indevida de pagamento, indício de acesso não autorizado, violação destes Termos ou da lei, ataque ao serviço ou ordem de autoridade competente. Avisamos a suspensão e o motivo pelo e-mail da conta ou no app.'),
  p(`<strong>Ação imediata.</strong> Quando for necessário proteger a sua conta, outras pessoas ou o serviço, por exemplo diante de um acesso indevido em andamento, podemos agir primeiro e avisar logo em seguida.`),
  p(`<strong>Contestação.</strong> Você pode contestar a suspensão em até ${LEGAL.contestDays} dias pelo atendimento (${support}). Respondemos com a decisão fundamentada em até ${LEGAL.billingReplyBusinessDays} dias úteis. Enquanto a conta estiver suspensa, você continua podendo pedir a exportação dos seus dados, salvo impedimento legal.`),
  p(`<strong>Erros da IA.</strong> Use o botão Feedback (opção “Problema”) ou o atendimento e descreva o que foi pedido e o que a IA fez. Você mesmo pode corrigir ou excluir os registros afetados.`),
  p(`<strong>Cobrança indevida.</strong> Escreva para ${support} com a data e o valor, ou o comprovante. Analisamos em até ${LEGAL.billingReplyBusinessDays} dias úteis. Confirmada a cobrança indevida, devolvemos o valor na forma do art. 42, parágrafo único, do Código de Defesa do Consumidor. Você também pode registrar reclamação em <a href="https://www.consumidor.gov.br" rel="noopener">consumidor.gov.br</a> ou no Procon.`)
 ]},
 {id:'alteracoes',title:'8. Alteração dos termos e dos planos',body:[
  p(`Mudanças relevantes nestes Termos, no Aviso de Privacidade, nos preços ou nas condições dos planos são avisadas no app e pelo e-mail da conta com pelo menos ${LEGAL.changeNoticeDays} dias de antecedência. O aviso informa a data em que a mudança passa a valer. Correções de texto e mudanças exigidas por lei ou por motivo de segurança podem valer antes, sempre com aviso.`),
  p('Uma mudança de preço ou de condições nunca altera um período que já foi pago. Como não há renovação automática, o novo preço só se aplica se você decidir fazer um novo pagamento depois da data informada, e não fazer o pagamento basta para não aderir. Se não concordar com os novos Termos, você pode exportar seus dados e excluir a conta a qualquer momento. Quando necessário, pediremos um novo aceite no app.')
 ]},
 {id:'geral',title:'9. Disponibilidade, responsabilidade e lei aplicável',body:[
  p('Trabalhamos para manter o serviço disponível e seguro. Mesmo assim, ele pode ficar indisponível por manutenção, falhas de fornecedores ou da sua conexão. Mantenha cópias dos documentos importantes. A Mentra é uma ferramenta de organização e não presta serviço médico, financeiro ou jurídico.'),
  p('Nada nestes Termos limita os direitos garantidos pelo Código de Defesa do Consumidor. Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor.'),
  p(`Versão ${esc(LEGAL.termsVersion)}, em vigor desde ${esc(LEGAL.effectiveDate)}.`)
 ]}
 ];
}

export function privacySections({company=COMPANY}={}){
 const channel=privacyEmail(company)?`<a href="mailto:${esc(privacyEmail(company))}">${esc(privacyEmail(company))}</a>`:'';
 return [
 {id:'controlador',title:'1. Quem trata seus dados',body:[
  p('Este Aviso explica como a Mentra Life trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD) e o Marco Civil da Internet (Lei nº 12.965/2014). A controladora dos dados é a empresa abaixo:'),
  companyMarkup({company,heading:''}),
  p(`<strong>Encarregado pelo tratamento de dados (LGPD, art. 41):</strong> ${company.dpoName?esc(company.dpoName)+', pelo':'atendimento pelo'} e-mail ${channel}.`)
 ]},
 {id:'dados',title:'2. Dados que tratamos, para quê e com qual base legal',body:[
  table(['Dados','Para quê','Base legal (LGPD)'],[
   ['Cadastro: nome, e-mail e senha (guardada apenas como hash protegido)','Criar e proteger a conta e falar com você sobre ela','Execução de contrato (art. 7º, V)'],
   ['Conteúdo que você insere: anotações, tarefas, agenda, finanças, documentos e fotos, conversas e memória da IA (opcional)','Guardar, sincronizar e exibir para você','Execução de contrato (art. 7º, V)'],
   ['Dados de saúde e bem-estar que você registrar, como consultas, medicamentos, sono e disposição','Organizar e exibir esses registros apenas para você','Consentimento específico e destacado (art. 11, I), pedido na primeira vez que você usa a área de saúde'],
   ['Perguntas, áudios e o contexto enviado à Mentra IA','Gerar respostas e executar as ações pedidas','Execução de contrato e consentimento específico para a transferência internacional (art. 33, VIII)'],
   ['Pagamentos: plano, valor, datas, situação e identificador da transação PIX','Liberar o acesso, conciliar, estornar e cumprir obrigações fiscais','Execução de contrato e obrigação legal (art. 7º, II e V)'],
   ['Registros de acesso: endereço IP, data e hora de entrada na conta','Segurança e cumprimento do Marco Civil da Internet','Obrigação legal (art. 7º, II; Marco Civil, art. 15)'],
   ['Integrações opcionais: número de WhatsApp, autorização do Google Agenda e identificadores de aparelho para notificações','Fazer funcionar a integração que você ativou','Execução de contrato (art. 7º, V)'],
   ['Registros técnicos: limites de uso, contagem de mensagens de IA e eventos de segurança da conta','Prevenir fraude e abuso e manter o serviço','Legítimo interesse (art. 7º, IX) e execução de contrato']
  ]),
  p('Não usamos seus dados para publicidade, não vendemos dados e não criamos perfis para terceiros. Não usamos cookies de rastreamento: o único cookie é o de sessão, necessário para manter você conectado.'),
  p('<strong>O que não vai para a IA.</strong> Dados de saúde, documentos originais, senhas e credenciais nunca são enviados à IA. A IA recebe somente a pergunta e um recorte da sua organização necessário para responder, como compromissos, tarefas, totais financeiros e nomes de contas.')
 ]},
 {id:'fornecedores',title:'3. Fornecedores e transferência internacional',body:[
  p('Compartilhamos dados apenas com fornecedores que operam o serviço em nosso nome, cada um limitado à sua função:'),
  table(['Fornecedor','Função','Local'],[
   ['Cloudflare','Servidores da aplicação, banco de dados, transcrição de áudio (Workers AI)','Estados Unidos e rede global'],
   ['Vercel','Hospedagem do site','Estados Unidos e rede global'],
   ['DeepSeek','Geração das respostas da Mentra IA','China'],
   ['Six7Pay (Paytime)','Processamento do PIX e de estornos','Brasil'],
   ['Google','Google Agenda (se conectado) e notificações no Android (Firebase Cloud Messaging)','Estados Unidos'],
   ['Apple','Notificações no iOS (APNs)','Estados Unidos'],
   ['WhatsApp (Meta) e servidor de integração da Mentra','Conversa pelo WhatsApp, se você vincular seu número','Estados Unidos e servidor contratado pela Mentra']
  ]),
  p('Alguns fornecedores ficam fora do Brasil. As transferências internacionais seguem o art. 33 da LGPD: cláusulas contratuais e garantias dos fornecedores de infraestrutura e, no caso da DeepSeek (China), o seu consentimento específico e destacado, pedido antes do primeiro uso da IA. Sem esse consentimento, a IA fica desligada e as demais funções continuam funcionando.'),
  p('Também podemos fornecer dados quando houver ordem judicial ou requisição de autoridade competente, nos limites da lei.')
 ]},
 {id:'retencao',title:'4. Por quanto tempo guardamos',body:[
  ul([
   'Conta e conteúdo: enquanto a conta existir. Um item excluído de forma definitiva, inclusive ao esvaziar a lixeira, ou o conteúdo apagado com “Apagar meus dados” sai do banco de dados na hora.',
   `Cópias de segurança criptografadas: até ${LEGAL.backupRetentionDays} dias. Elas só são usadas para recuperar o serviço depois de um incidente.`,
   `Registros técnicos (pedidos de IA, transcrições, filas de integração e lembretes enviados): até ${LEGAL.technicalRetentionDays} dias.`,
   `Registros de acesso (IP, data e hora): ${LEGAL.accessLogMonths} meses, como exige o art. 15 do Marco Civil da Internet, mesmo depois da exclusão da conta.`,
   `Registros de pagamento: ${LEGAL.paymentRetentionYears} anos após o fim do ano do pagamento, por obrigação fiscal e para defesa em processos (LGPD, art. 16, I), mesmo depois da exclusão da conta. Ficam guardados à parte, só com nome, e-mail, valor, plano, datas e identificador da transação.`,
   'Sessões: até 7 dias, ou até você sair da conta ou trocar a senha.'
  ])
 ]},
 {id:'direitos',title:'5. Seus direitos e como exercê-los',body:[
  p('Você pode, a qualquer momento (LGPD, art. 18):'),
  ul([
   'confirmar se tratamos seus dados e acessá-los: Meu espaço → Exportar meus dados;',
   'corrigir dados incompletos ou desatualizados: edite diretamente no app, ou peça ao encarregado;',
   'obter a portabilidade: a exportação gera um arquivo JSON legível por máquina;',
   'pedir a eliminação: Meu espaço → Apagar meus dados (mantém a conta) ou Excluir minha conta. Fora do app, use a página <a href="'+LEGAL_LINKS.deletion+'">Excluir conta</a>;',
   'revogar consentimentos: Meu espaço → Privacidade (IA e saúde). A revogação não afeta o que foi feito antes dela;',
   'saber com quem compartilhamos seus dados (item 3), pedir informações sobre o tratamento e se opor a um tratamento feito com base em legítimo interesse;',
   'pedir revisão de decisões automatizadas: a Mentra não toma decisões automatizadas que afetem seus interesses. A IA só executa o que você pede.'
  ]),
  p(`Para qualquer pedido, escreva para ${channel} a partir do e-mail da conta. Respondemos em até ${LEGAL.requestReplyDays} dias. Também é possível reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" rel="noopener">gov.br/anpd</a>.`)
 ]},
 {id:'seguranca',title:'6. Segurança e incidentes',body:[
  p('Usamos conexão criptografada (HTTPS), senhas com hash e salt, sessões com cookie protegido, isolamento por conta, limites contra tentativas repetidas e cópias de segurança criptografadas. Nenhum sistema é totalmente imune a falhas. Se houver um incidente de segurança que possa trazer risco ou dano relevante, avisaremos você e a ANPD, como exige o art. 48 da LGPD.')
 ]},
 {id:'criancas',title:'7. Idade mínima',body:[
  p(`A Mentra Life é destinada a pessoas com ${LEGAL.minimumAge} anos ou mais. Não coletamos dados de crianças e adolescentes de forma intencional. Se identificarmos uma conta nessa situação, ela será excluída.`)
 ]},
 {id:'mudancas',title:'8. Alterações deste Aviso',body:[
  p(`Mudanças relevantes são avisadas no app e pelo e-mail da conta com pelo menos ${LEGAL.changeNoticeDays} dias de antecedência. Novos consentimentos são pedidos quando a mudança exigir. Versão ${esc(LEGAL.privacyVersion)}, em vigor desde ${esc(LEGAL.effectiveDate)}.`)
 ]}
 ];
}

export function deletionSections({company=COMPANY}={}){
 const channel=privacyEmail(company)?`<a href="mailto:${esc(privacyEmail(company))}">${esc(privacyEmail(company))}</a>`:'';
 return [
 {id:'como',title:'Como excluir sua conta da Mentra Life',body:[
  p('Você pode excluir a conta de três formas:'),
  ul(['<strong>No aplicativo ou no site:</strong> Meu espaço → Excluir minha conta;','<strong>Nesta página:</strong> entre com e-mail e senha no formulário abaixo;','<strong>Sem acesso à conta:</strong> escreva para '+channel+' a partir do e-mail cadastrado, com o assunto “Excluir conta”. Confirmamos que a conta é sua e concluímos em até '+LEGAL.requestReplyDays+' dias.'])
 ]},
 {id:'efeitos',title:'O que acontece',body:[
  table(['Ação','O que é apagado','O que continua'],[
   ['Não renovar o plano','Nada','Conta e dados. O acesso pago termina no fim do período'],
   ['Apagar meus dados (Meu espaço)','Todo o conteúdo: anotações, tarefas, agenda, finanças, saúde, documentos, conversas, memória da IA e integrações','Conta, login, plano e histórico de pagamentos'],
   ['Excluir minha conta','A conta e todo o conteúdo, de forma definitiva. Sessões encerradas e integrações desconectadas',`Registros de pagamento, por ${LEGAL.paymentRetentionYears} anos, e de acesso, por ${LEGAL.accessLogMonths} meses, como a lei exige`]
  ]),
  p(`A exclusão é imediata e não pode ser desfeita. Cópias de segurança criptografadas são substituídas em até ${LEGAL.backupRetentionDays} dias. Dias pagos restantes não são reembolsados, salvo dentro do prazo de arrependimento de ${LEGAL.withdrawalDays} dias: nesse caso, peça antes Meu espaço → Desistir da compra. Se houver um PIX aguardando pagamento, espere ele ser pago ou expirar.`),
  p('Os aplicativos não vendem assinaturas pela App Store ou pelo Google Play. Por isso, não há assinatura nas lojas para cancelar.')
 ]}
 ];
}

export function sectionsMarkup(sections){return sections.map(s=>`<section id="${esc(s.id)}" class="legal-section"><h2>${esc(s.title)}</h2>${s.body.join('')}</section>`).join('');}
