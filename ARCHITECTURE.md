# Arquitetura atual

A base operacional Cloudflare está descrita em [docs/OPERACAO.md](docs/OPERACAO.md). A API e o catálogo ficam em `server/`; o esquema evolui por migrações em `migrations/`. `wrangler.jsonc` define a implantação atual. O texto abaixo é a referência histórica do protótipo estático.

# Arquitetura do protótipo v12

Aplicativo estático buildless com módulos ES. `core.mjs` contém captura, roteiros e estado inicial; `finance.mjs` concentra regras financeiras puras; `finance-ui.mjs` renderiza o controle financeiro e seus formulários. `app.js` controla rotas por hash e o estado geral. `styles.css` define temas e breakpoints.

## Persistência e migração

A persistência é local e isolada na chave `mentra-life-demo-v4`. O esquema financeiro interno é v5; a migração mantém os dados existentes sem presumir a conta de registros antigos ou seus saldos iniciais. Não existe servidor de aplicação, autenticação própria, API externa ou sincronização. Datas, pessoas e documentos iniciais são fictícios. Textos são escapados antes da inserção em HTML.

Anexos de exemplo preservam os bytes originais em base64 local, com tipo e extensão conferidos, limite de 500 KB por arquivo e 1,5 MB no total. Isso não é armazenamento seguro, criptografia, antivírus, backup nem upload para nuvem. Falha de quota impede a inclusão do anexo. O reset do aplicativo remove os dados somente desta chave, após confirmação.

## Regras financeiras

Valores em centavos inteiros. Resultado = receitas realizadas − despesas realizadas, excluindo transferências e saldos iniciais. Saldo calculado por conta = saldo inicial informado no início da data escolhida + movimentos realizados dessa data em diante. Registros anteriores ficam no histórico, sem dupla contagem. Sem saldo inicial, o saldo é desconhecido; os movimentos continuam visíveis.

Transferência interna é um registro atômico com origem e destino distintos: saída em uma conta, entrada na outra, efeito zero no consolidado. Compromisso a pagar/receber não movimenta saldo até a baixa. Cada baixa parcial cria exatamente um movimento realizado vinculado, reduz o restante e possui chave de idempotência. Edição direta de um movimento de baixa é bloqueada nesta demo; não há estorno implementado.

Recorrências geram compromissos futuros apenas por ação da pessoa, em lotes limitados e idempotentes, preservando o dia de origem e a regra de fim de mês. Não executam pagamentos, notificações ou tarefas em segundo plano. Recorrência não representa parcelamento.

Todos os novos lançamentos passam por formulário revisável e confirmação explícita. A interpretação de texto é uma heurística local conservadora: separa datas e valores; ambiguidades, crédito/fatura/parcelamento e transferências sem direção clara pedem esclarecimento. Não há IA real.

## Documentos e exportação

`pdf.mjs` gera bytes PDF 1.4 no navegador com fontes Liberation Sans incorporadas; a licença está em `dist/assets/licenses/`. Não usa serviço externo. O registro de despesa e o rascunho de recibo guardam uma fotografia dos campos na criação. Alterar o lançamento depois não altera o documento. O recibo é não fiscal, sem assinatura capturada e sem validação de pagamento/quitação. A linha para assinatura do recebedor permanece em branco.

Relatórios PDF e CSV refletem os filtros de conta e período. CSV usa UTF-8 com BOM, separador ponto e vírgula, escape de aspas e neutralização de fórmulas em texto fornecido pela pessoa. PDFs são baixáveis e podem ser abertos no visualizador nativo para impressão.

## Produção

Os controles do cliente são demonstração e exigem validação, autorização, idempotência e trilha de auditoria no servidor em produção. Regras adicionais de estorno, exclusão, conciliação e segurança documental precisam de definição. Não há cartões de crédito, faturas ou parcelamentos nesta versão.

A proposta de produção está em `dist/handoff/03-arquitetura-e-seguranca.md` e `dist/handoff/mentra-modelo-logico.json`. São recomendações a validar, não serviços integrados. O repositório existente, a identidade de hospedagem, o acesso privado, a cabeça animada e a assinatura única foram preservados.

## Documentos independentes (v5)

`documents-ui.mjs` implementa o fluxo em `#/vida/documentos/criar`, acessível por Documentos e pelo atalho financeiro. Não depende da existência de lançamentos. Depois de preencher tipo, partes, valor, data, motivo e opcionais, a pessoa vê uma prévia dos dados e confirma. Apenas então o app gera e guarda o PDF completo em base64, junto da fotografia dos campos e metadados, na biblioteca local, pasta `receipts` (Recibos e comprovantes). Nenhum movimento financeiro é criado ou alterado. Um `recordId` opcional serve só de referência a um lançamento realizado existente.

A nova entidade usa `kind: standalone_payment` e `documentType: receipt | payment_record`. `pdfData` guarda os bytes para reabertura sem depender de regeneração por versões posteriores; `payload` guarda os campos confirmados. `recordId` pode ser nulo. `folder`, `category`, `date`, `createdAt`, `fileSize`, `mime` e `trashed` integram a biblioteca e a lixeira recuperável. A migração financeira preserva esses objetos. Falha de persistência reverte a inclusão e não a anuncia como salva.

A pasta também encontra recibos vinculados antigos pelo tipo `receipt_draft`, sem alterar seus dados. Criar novamente é uma ação nova; repetir o mesmo botão de confirmação não duplica o arquivo. Cancelar, voltar ou navegar invalida a confirmação pendente. O PDF é não fiscal, sem comprovante bancário, sem assinatura capturada e sem validação automática de pagamento/quitação.

Compartilhamento usa `navigator.canShare({files})` e `navigator.share({files})`, dentro do clique do usuário, quando suportados. Não escolhe destinatário nem serviço automaticamente. A resolução da promessa não comprova entrega ao destinatário; os textos não alegam envio. Cancelamento mantém o arquivo. Se indisponível ou bloqueado, orienta baixar o PDF. Referências técnicas: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share e https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare .

## Momentos Mentra (v6)

`moments-core.mjs` mantém três períodos e seis mensagens editoriais estáticas. `getMoment(period, christian)` só ativa a variante cristã quando recebe o booleano `true`; normalização de estado antigo não presume religião por valores truthy. As preferências ficam em `state.moments`, na mesma chave local da demonstração, preservando finanças e documentos. Defaults: ativo na demonstração, horários 08:00/14:00/20:00, conteúdo cristão desligado. Cada período tem horário e ativação próprios; tempos iguais ou cruzando a meia-noite não são proibidos, já que não há scheduler. A tela informa o fuso resolvido por Intl no aparelho.

A seleção editorial inicial usa a hora local: manhã 05–11:59, tarde 12–17:59 e noite 18–04:59. Isso não é disparo de notificação nem depende dos horários escolhidos. Links `#/momentos/morning`, `/afternoon` e `/night` abrem explicitamente cada mensagem. Prévias de lembrete existem só como links dentro da página.

`moments-ui.mjs` usa animações CSS discretas na cabeça e revelação por palavra; texto completo separado atende leitura assistiva. Pausar modifica a classe existente, sem reiniciar a revelação. Mostrar tudo torna a frase inteira visível. prefers-reduced-motion remove os movimentos e mostra todas as palavras. A animação é decorativa, não lip sync ou um modelo 3D.

SpeechSynthesis é opcional, sem autoplay, por clique. Usa pt-BR e prefere voz portuguesa disponível, sem clonagem. Interrupção, mudança de rota, ocultação da aba e pagehide cancelam a leitura; callbacks antigos não reativam estados. Não se promete processamento offline ou voz igual entre sistemas. Referência: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance .

Cards são seis arquivos PNG pré-gerados 1080×1920, sem perfil, contas, documentos, horários pessoais ou identificadores da pessoa. O script lê a mesma fonte JS para evitar divergência textual. A UI baixa o PNG existente; não transforma a animação em vídeo. Para compartilhamento, o arquivo é preparado antecipadamente e a API nativa é chamada dentro de um novo clique válido. Se a preparação ainda não terminou, pede tocar de novo; se incompatível, orienta baixar. Nenhum destino é selecionado pelo app e resolução da API não confirma entrega. Respostas assíncronas obsoletas são ignoradas após navegação.

Não existem Notification.requestPermission, push, registro de service worker, notificações em background, integração iOS/Android, geração de áudio exportável ou MP4. A proposta desses serviços e seus limites está no capítulo 05 do handoff; deve respeitar consentimento, fuso/DST, Focus/horários silenciosos e entrega best-effort.

## Mentra Impulso (v7)

`journeys-core.mjs` é um domínio puro, sem persistência ou rede. Três trilhas (`discover`, `idea`, `ongoing`) produzem sugestões diferentes conforme o contexto escolhido (`work`, `income`, `business`, `personal`, `undecided`). Os comandos retornam estado clonado, erros explícitos e a jornada. A UI só troca o estado confirmado após validar; se o save local falhar, restaura o anterior.

A lista `state.journeys` é aditiva. Não converte, remove ou substitui `state.plan`. Cada jornada tem `id = creationId`, fingerprint dos campos originais para deduplicação, conteúdo editável, timestamps, origem `local_demo` e etapas. A repetição da mesma criação retorna a existente inclusive após edição; reutilizar a confirmação com conteúdo diferente é recusado. IDs, trilha, origem e confirmação não são editáveis.

`journeyProgress` deriva progresso e próxima ação, priorizando `doing` e depois `todo`. Não se mantém um contador de progresso duplicado. Datas são strings de calendário validadas, opcionais, sem conversão implícita de fuso. Etapas e planos têm estados separados, com conclusão/reabertura consistentes. Há limite defensivo de 100 etapas por plano na demonstração.

A UI usa rotas por hash, formulários com rótulos, revisão de criação, erros específicos e controles de 44px no acompanhamento. Cancelar/fechar/navegar invalida a confirmação pendente; rascunhos da entrada permanecem só na memória da sessão. Foco após salvar edição ou marcar etapa é direcionado ao controle correspondente. Conteúdo de usuário e mentoria é escapado. Rotas inválidas, inclusive chaves de protótipo, retornam estado seguro.

A mentoria é uma função local de leitura: recebe o plano e uma pergunta, oferece orientação roteirizada e não grava conversa, não altera o plano, não consulta mercado nem chama IA. A ausência de APIs é um limite do protótipo. Persistência, permissões por conta, sincronização, mentoria real e seus testes pertencem à implementação de produção.

## Organização da Home (v10)

A mudança é de composição da interface: abertura com cabeça em área própria do grid, atalhos compactos, painel de documentos/recibo, finanças, seção editorial Impulso, resumo do dia e áreas auxiliares. `today()` reutiliza os destinos existentes, `financialSummary(...).net` para o resultado do mês e `journeyProgress(...).nextStep` para retomar um plano ativo. A receber usa o restante dos compromissos não cancelados por vencimento no mês da demo. Não há nova entidade, migração ou integração.

A prévia de recibo é uma ilustração HTML/CSS marcada como fictícia e `aria-hidden`, sem dados da pessoa. Os números financeiros são renderizados uma única vez na Home. A retomada ignora contêineres/identificadores de plano malformados sem regravar nem excluir o armazenamento. Os estilos novos são escopados às classes da Home; a cabeça continua com pausa e suporte a movimento reduzido. Os testes de UI usam adaptador de DOM, não motor de layout.


## Saúde e bem-estar (v12)

`health-core.mjs` é um domínio puro, sem rede. Catálogo de receitas e filtros são editoriais/locais. Comandos validam coleções, identificadores, datas/horários, enumerações, comprimentos e referências documentais; retornam novo estado e erros explícitos. `health-ui.mjs` renderiza as rotas `saude/cuidado`, `saude/alimentacao` e `saude/movimento`, integrada pelos handlers de `app.js`. Formulários devem escapar conteúdo livre, permitir cancelamento e evitar duplicação na repetição do mesmo salvamento.

`state.health` versão 1 reúne appointments, medications, logs, activities, meals, groceryChecked e professional.nutrition/movement. A chave global permanece `mentra-life-demo-v4`. Ausência de health exibe exemplos sem salvar durante leitura; a primeira ação explícita acrescenta a coleção. Não reescreve state.plan, journeys, finance, documentos, agenda, tarefas ou Momentos. Estado health incompatível/corrompido não deve ser substituído silenciosamente. A UI restaura o estado anterior se localStorage falhar, sem anunciar sucesso.

A lista de compras deriva dos ingredientes das refeições selecionadas; um espaço dia/refeição é único. Resumo para consulta deriva dos registros atuais e referências válidas, sem interpretação médica, e produz texto simples exibido/baixado somente por clique. Ambos evitam persistir uma segunda cópia divergente do conteúdo. Horários de medicamentos e marcas de conclusão são visualizações demonstrativas; não há temporizador de entrega, permissão, push, tomada comprovada ou dose. Notas profissionais apenas organizam texto informado, sem produzir prescrição.

Referências documentais são IDs existentes e não excluídos; não enviam dados, não duplicam bytes e não alteram permissões. Links reais para Agenda e Documentos navegam; não sincronizam. Nenhum comando cria movimento financeiro, pedido de compras, evento ou upload. Não há APIs/IA/analytics externos de saúde nem compartilhamento automático. O acesso da publicação é mantido; ele não protege localStorage como armazenamento clínico nem separa pessoas no mesmo perfil de navegador. Só usar dados fictícios.

Para produção, separar organização não clínica de capacidades reguladas; definir finalidade, minimização, público, consentimentos aplicáveis, controles de autorização/armazenamento, retenção, exportação, exclusão e revisão profissional antes de dados reais. Lembretes e compartilhamentos futuros precisam de autorização específica e limites de confiabilidade. A seção 29 do handoff e D19/D20 descrevem propostas, não serviços implantados ou conformidade comprovada.
