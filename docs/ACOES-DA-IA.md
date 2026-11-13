# Ações da Mentra por texto e áudio

O chat principal oferece ao DeepSeek ferramentas para cadastrar tarefas, compromissos na agenda interna, receitas/despesas realizadas em BRL e contas financeiras. Pedidos como “gastei R$ 35,90 no almoço” são executados quando claros. Não é preciso confirmar cada lançamento em outro formulário. Perguntas, hipóteses e exemplos devem receber orientação, sem gravação.

No chat, escolha **Gravar áudio** e depois **Parar e enviar áudio**, ou selecione um arquivo de até 2 MB. A gravação usa o microfone mediante permissão do aparelho e termina em até dois minutos. O áudio passa pelo Workers AI para transcrição; o texto vai ao DeepSeek, usando o mesmo executor do chat. O formulário de áudio em Conexões também encaminha a transcrição automaticamente ao executor. O original não é persistido. A transcrição pode conter erros; confira os registros criados.

Quando não há conta mencionada, o registro é agrupado em **Conta não informada**, sem presumir um banco ou pagamento em dinheiro. Categoria sem indicação clara fica em Outros; método não informado fica em other. Relato financeiro sem data usa o dia do contexto da conta; contas novas usam America/Sao_Paulo quando ainda não há fuso salvo. Compromissos exigem data e horário; tarefas podem não ter prazo. Conta mencionada precisa corresponder a uma conta ativa e sem ambiguidade. Valores ausentes, dúvidas ou formas não suportadas devem gerar esclarecimento.

O backend valida as ferramentas por lista permitida e reutiliza as regras dos formulários. Um lote de até dez ações é gravado em uma transação D1 com controle de revisão. Se qualquer ação falhar, nenhuma alteração do lote é aplicada. A confirmação é produzida pelo servidor após gravar. As ações ficam associadas à conta autenticada; campos enviados pelo cliente não escolhem o proprietário.

Cada pedido tem um requestId com recibo persistente em ai_requests. Repetir o mesmo pedido devolve o resultado sem duplicar ações ou cobrar outra mensagem de IA. Áudios usam seu hash por conta. Respostas perdidas podem ser recuperadas por **Tentar o mesmo pedido novamente**; o último pedido pendente também é recuperado ao reabrir o chat. O cliente adota a revisão retornada para a próxima sincronização. Edições simultâneas provocam conflito, preservando os dados existentes.

O caminho de mentoria dos planos, que não envia requestId, continua oferecendo orientação sem executar ações. A captura do WhatsApp continua com seu fluxo de revisão. Não há execução de exclusões, alteração de registros existentes, saúde, pagamentos bancários, cartão de crédito, parcelamento, transferências ou envios externos pelas novas ferramentas.

## Publicar

1. Executar npm test, npm run check e npm run build.
2. Aplicar a migração 0011_ai_requests.sql no D1 de destino antes de publicar o Worker. Em produção: npm run db:production.
3. Publicar Worker e interface juntos. As migrações 0010 e 0011 foram aplicadas em produção em 06/11/2026; Worker e interface foram publicados após a autorização do proprietário. A interface nova depende do executor novo. O Worker novo mantém compatibilidade com clientes antigos sem requestId.
4. DEEPSEEK_API_KEY e assinatura ativa são necessários. Áudio exige também o binding AI da Cloudflare. Os secrets permanecem no servidor.

Validação em 06/11/2026: suíte completa sem falhas (527 aprovados e seis ignorados na execução completa); teste de navegador com chat, arquivo de áudio, microfone sintético, replay, recarga, revisão e layout móvel; DeepSeek real aprovado para despesa de R$ 35,90, tarefa, compromisso e esclarecimento por valor ausente. Os quatro ensaios com o provedor real usam dados fictícios e SQLite em memória, sem alterações em produção. Scripts: node scripts/test-ai-actions-browser.mjs e, opcionalmente com chave configurada, node scripts/test-ai-actions-live.mjs.

Homologação adicional em 06/11/2026, às 20h11 de Brasília: um arquivo WAV falado em português, de 423.660 bytes, passou pelos endpoints autenticados de transcrição e chat com Workers AI e DeepSeek reais. O D1 local temporário recebeu todas as migrações e gravou uma despesa **Almoço / Alimentação / R$ 35,90 / 06/11/2026**. Reenviar o áudio e o pedido manteve um único lançamento, uma única inferência de transcrição e uma mensagem de IA consumida; a segunda conta continuou vazia. Evidência local: qa/ai-actions/live-audio-result.json. A configuração do teste declara o D1 como remote:false e persist:false; não vincula o banco de produção.

Para repetir no Windows, gere o áudio fictício com powershell -NoProfile -File scripts/generate-ai-audio-fixture.ps1 e execute node scripts/test-ai-audio-live.mjs com autenticação Cloudflare e DEEPSEEK_API_KEY disponível. É um teste opcional com chamadas cobradas pelos provedores. O WAV, a transcrição e o relatório ficam em qa, fora dos pacotes públicos. A saída registra passed:false em caso de falha, para não apresentar sucesso antigo como resultado atual.

A fala do teste foi produzida por uma voz instalada do Windows. O Workers AI retornou erros parciais de palavras, incluindo “almoan” em lugar de almoço. Um ensaio não satisfez a verificação da descrição; no ensaio final, o DeepSeek interpretou almoço corretamente e o D1 confirmou todos os campos acima. Isso comprova o fluxo com provedores reais, mas não garante precisão de toda gravação. As mensagens do produto orientam conferir os registros. O fluxo foi homologado também no site publicado conforme a seção seguinte; microfones de aparelhos físicos específicos continuam sujeitos à homologação de cada plataforma.

## Publicação e homologação online de 06/11/2026

Publicação autorizada pelo proprietário. Backup criptografado anterior às migrações preservado em .mentra-private/pre-ai-actions-20261106-001.mlbk. D1 remoto sem migrações pendentes; Worker na versão 2fe1b7f3-878b-409a-a268-9194b7222e1c; interface Vercel no deployment dpl_FjGGgSVfrnaBGitJNNXkguVJfg1c. Endereço verificado: https://mentralife.vercel.app. A Vercel vinculou também mentralife.com.br, mas o domínio próprio retornou ENOTFOUND na verificação de DNS e continua pendente.

A primeira tentativa de build Vercel falhou porque a pasta mobile, exigida pelo verificador de sintaxe, havia sido excluída do upload. A exclusão foi corrigida; o segundo build preparou os 301 arquivos públicos e terminou como READY. Pastas nativas e privadas, ambientes, chaves e backups continuam excluídos do envio e da saída pública.

Às 20h29 de Brasília, a homologação pelo navegador no endereço público confirmou: áudio falado → Workers AI → DeepSeek → despesa Almoço/Alimentação/R$ 35,90 no D1 remoto; criação de tarefa por texto; persistência após recarga; reenvio sem duplicar registro ou consumir outra mensagem de IA; e isolamento ao enviar um proprietário forjado na segunda conta. Layout móvel e sincronização foram conferidos. O primeiro ensaio online não atingiu a expectativa de uma ação; o ensaio final completou todos os itens. As duas contas sintéticas foram excluídas ao terminar, com contagem remanescente zero. Evidências: qa/ai-actions/production-result.json e production-chat-mobile.png.

O smoke público passou para página inicial, schema, três planos, bloqueio anônimo das APIs privadas e indisponibilidade pública dos pacotes de fonte/handoff. Para uma futura homologação de release explicitamente autorizada, use node scripts/test-ai-actions-production.mjs --allow-production; esse comando cria contas sintéticas temporárias e altera somente essas contas no D1 remoto, removendo-as no finally.

Os demais testes usam respostas simuladas para validar persistência, valores, isolamento, replay, cotas, conflitos, revogação de assinatura e chunks. A transcrição real não é executada pela suíte npm test.

Formato das ferramentas conferido na [documentação oficial do DeepSeek](https://api-docs.deepseek.com/api/create-chat-completion/).
