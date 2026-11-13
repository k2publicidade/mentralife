# Relatório de auditoria — Mentra Life — 05/11/2026

## Conclusão

O sistema está online em https://mentralife.vercel.app. A versão corrigida passou em **482 testes, zero falhas e zero testes ignorados**, e as nove verificações públicas passaram novamente após a publicação. O atendimento individual do DeepSeek foi corrigido, publicado e testado com o provedor real pelo endereço público. Isso não certifica todas as funcionalidades do produto em produção: WhatsApp e Google ainda precisam de aplicações/credenciais, PicPay aguarda liberação de chave e implementação do ciclo de cobrança, e push exige ensaio em aparelho real. Nenhuma área é classificada como “perfeita”: os resultados têm escopo e evidências definidos.

Foram preservadas as alterações pré-existentes no projeto. Os testes funcionais usaram somente contas sintéticas; contas/assinaturas de clientes não foram alteradas. As contas de QA criadas foram removidas ao final. O ensaio de recuperação exportou um snapshot de produção para backup criptografado e processou a cópia privadamente, sem expor conteúdo, senhas ou hashes nos resultados. Nenhuma cobrança foi feita.

## Correções publicadas e decisões do proprietário

- Contexto DeepSeek construído no servidor a partir da sessão da conta, sem aceitar proprietário indicado no pedido.
- Totais financeiros calculados sobre **todos os registros válidos**, mesmo quando os detalhes excedem o recorte; receitas/despesas realizadas, previsões, compromissos pendentes e transferências são separados. Fluxo líquido não é apresentado como saldo bancário.
- Exclusão de eventos e obrigações cancelados; tarefas priorizadas por relevância da pergunta, prioridade e prazo; agenda dá preferência aos próximos eventos.
- Período financeiro respeita o fuso da conta, mês anterior solicitado e mês explícito no formato AAAA-MM. Sem fuso válido, informa UTC. Outros períodos ou filtros não reconhecidos exigem esclarecimento, não uma falsa soma filtrada.
- Orientação de plano lê o plano salvo pelo servidor, incluindo dificuldade, recursos, habilidades, tempo, situação e até cem etapas. Não depende mais de JSON de plano cortado no navegador. IDs de planos indisponíveis na conta são recusados antes do provedor/cota.
- Trocar de conta durante sincronização ou espera de resposta impede envio/atualização indevidos da orientação e da cota na interface.
- Avisos do chat e da orientação explicam os dados enviados ao DeepSeek. Saúde, documentos, arquivos, inbox e credenciais ficam fora do envio automático. Notas pessoais continuam opcionais e revogáveis; o que a pessoa escrever na conversa é enviado.
- Preços mensais aprovados e publicados: **Mentra Basic R$27, Mentra Advanced R$47 e Mentra Delux R$97**. IDs internos e cotas existentes (100/500/2.000 mensagens) foram preservados para manter as contas compatíveis.
- Suporte publicado: **contato@mentralife.com.br**. O link usa mailto; não foi testada entrega de e-mail nem existência da caixa postal.
- Chaves VAPID cadastradas no Worker e VAPID_SUBJECT configurado com o contato aprovado. Isso configura push, mas não comprova a entrega no aparelho.
- Gateway escolhido pelo proprietário: **PicPay**, aguardando liberação da chave. A escolha/seleção de plano continua sem cobrar nem ativar assinatura.

Não há um modelo DeepSeek treinado separadamente para cada pessoa. A integração atende cada solicitação com conversa, contexto, plano selecionado e cota da conta autenticada. O contexto não executa ações nem garante a qualidade de toda resposta futura.

Os detalhes gerais têm recorte de até vinte itens e 180 caracteres por campo, com sinalização, busca textual e ordem operacional. O plano explicitamente selecionado preserva os campos válidos até 600 caracteres e cem etapas. Os totais financeiros não dependem desse recorte. Isso ainda não equivale à leitura integral de saúde, arquivos ou todo o histórico de uma conta; filtros complexos, intervalos arbitrários e pesquisa semântica em acervos grandes exigem evolução específica.

## Evidências novas de isolamento e análise individual

1. Teste local A → B → A: cada payload contém tarefa, despesa, dificuldade e etapa da própria conta; exclui marcadores da outra. userId forjado não altera o proprietário. Cotas verificadas separadamente: duas e uma solicitações. Plano de outra conta é recusado sem consulta ao provedor nem consumo de cota.
2. Testes de allowlist, limite, prioridade, busca além dos vinte itens, eventos cancelados, totais além do recorte, valores/datas inválidos, baixas parciais, fuso, virada de mês e plano com cem etapas aprovados.
3. Testes de interface comprovam que trocar de conta antes do envio ou durante a espera não aplica texto/cota da sessão anterior. Atalhos de orientação enviam pergunta legível e ID, sem copiar o plano do navegador.
4. DeepSeek real via Worker local: duas contas identificaram corretamente suas tarefas distintas. Na rodada ampliada, identificaram também suas despesas totais e restrições de plano.
5. **DeepSeek real via Vercel + Worker + D1 remoto, após deploy:** Alfa tinha 25 despesas de 100 centavos; Beta tinha 25 despesas de 200 centavos. Respostas corretas: 2.500 e 5.000 centavos, respectivamente, apesar do limite de vinte detalhes. Cada conta identificou sua própria dificuldade (sem computador/sem transporte), tempo (5/30 minutos) e situação pausada do plano 25. Consulta de plano da outra conta retornou 404 e persistência/leitura do estado retornou os marcadores corretos.
6. As duas contas remotas sintéticas foram excluídas ao final, após cancelar somente suas ativações de QA. Não foi executada a suíte destrutiva completa contra produção.

Evidências locais privadas, excluídas do upload público: qa/audit-tests-2026-11-05.log; qa/audit-real-ai-analysis-2026-11-05.json; qa/audit-remote-ai-analysis-2026-11-05.json. Os scripts dessa pasta usam dados sintéticos e não são ferramentas para executar indiscriminadamente contra clientes.

## Publicação verificada

- Frontend Vercel: deployment `dpl_7bqHAvbbRnfqEjBU83UuGZNJCe8H`, estado READY.
- Worker Cloudflare: versão `2165aab3-5a29-4699-a760-672a9ff5f37c`, cron por minuto e D1 existente preservados; sem migração nova.
- Versão anterior do Worker registrada antes do deploy: `9f4566f0-f32e-4d98-a7d5-b9dbe6a92d63`. Frontend anterior: `mentralife-6rvqf2tvg-k2publicidade2-9832s-projects.vercel.app`. Reverter código não remove automaticamente secrets/configuração adicionados.
- API pública confirma os três nomes/preços; navegador confirma os cartões, os limites e o link de suporte. APIs privadas continuam exigindo sessão.
- **Domínio próprio pendente:** a CLI Vercel encontrou mentralife.com.br no projeto, mas informou configuração de DNS incorreta. A resolução também falhou neste ambiente. Usar por enquanto https://mentralife.vercel.app. Conferir os registros exigidos no [painel de domínios](https://vercel.com/k2publicidade2-9832s-projects/mentralife/settings/domains); os valores não foram presumidos nem alterados no registrador. O contato informado não comprova que MX/e-mail já estejam operacionais.

## Verificações executadas

| Área | Resultado e limite da evidência |
| --- | --- |
| Suíte completa | 482/482 aprovados com MENTRA_TEST_URL=http://127.0.0.1:8787, incluindo os seis cenários HTTP. |
| Sintaxe e build | npm run check e npm run build aprovados; build remoto da Vercel pronto. Pacotes fonte/handoff continuam indisponíveis publicamente. |
| Leitura pública | Nove checks pós-deploy aprovados: página, schema D1, três planos, 401 em estado/admin/calendário/documentos e 404 para fonte/handoff. |
| Interface pública | Navegador confirma apresentação, nomes/preços/cotas, formulário de acesso, aviso de contratação pendente e suporte. Não equivale a Android/iOS ou leitor de tela. |
| D1 remoto | Nenhuma migração pendente; health com banco/schema prontos. Consulta somente de catálogo confirmou ausência de override no banco, portanto os novos defaults são efetivos. |
| Configuração remota | Secrets listados sem valores: DEEPSEEK_API_KEY, VERCEL_ORIGIN_SECRET, VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY. Contato VAPID em vars do Worker. |
| Readiness | VAPID/contato aprovados. Pendências restantes: app secret/token/número/versão Meta e cliente/secret Google. Verificador local não certifica os provedores. |
| Conta e isolamento | Cadastro, sessão, persistência, plano privado, análise individual e exclusão das contas sintéticas passaram no remoto. Rodada remota adicional: login após recuperação, rotação do código de recuperação, rejeição do código antigo, invalidação da sessão e dos links e preservação do estado aprovados. Demais cenários também cobertos localmente/HTTP local, sem alegar homologação remota de todos os casos. |
| Sincronização | Revisões, conflitos, idempotência, falha de rede, ACK antigo e recuperação por conta aprovados localmente. Remoto: salvar/consultar estado, repetir a mesma operação e duas gravações concorrentes passaram; uma gravação recebeu 200 e a concorrente 409, preservando os outros módulos. |
| Tarefas e agenda | Criar/editar/concluir/adiar, prioridades, séries, revisão coletiva, fusos/DST aprovados nos testes. Contexto IA corrigido para eventos cancelados. |
| Finanças | Registros, centavos, transferências, compromissos, baixa parcial, recorrências, orçamento, CSV revisado e PDF aprovados nos testes. Totais do contexto IA conferidos local/remoto. Sem integração bancária ou movimentação de dinheiro. |
| Biblioteca e documentos | Originais, validação, extração de PDF e OCR real local, lixeira/restauração, links com destinatário/expiração/revogação e isolamento aprovados localmente. Remoto: download do PNG original conferido byte a byte; acesso limitado ao destinatário, repetição idempotente, revogação explícita, lixeira/restauração sem ressuscitar link e recuperação revogando link aprovados. OCR real no navegador publicado também passou com imagem sintética limpa, revisão, busca e preservação do original. Fotos com ruído, câmera do aparelho e downloads em dispositivos ainda exigem homologação. |
| Saúde e Momentos | Formulários, revisões e preferências aprovados localmente. Estado sintético de consultas, registros, orientação informada e preferências de Momentos persistiu junto aos demais módulos no D1 remoto e na exportação/restauração da conta. Sem atendimento médico ou integração profissional. |
| Impulso e planos | Criação/edição, etapas, progresso e pausa aprovados nos testes. Orientação IA real remota respeitou dados específicos e situação do plano selecionado nos cenários executados. |
| WhatsApp | Contratos simulados, assinatura do webhook, replay, isolamento, quotas, mídia e falhas aprovados. Aplicação Meta ainda não existe segundo o proprietário. Sem captura real homologada. |
| Áudio direto | Workers AI Whisper real reconheceu voz sintética em português pela URL pública. Resposta exige revisão; repetição na mesma conta reutiliza transcrição, segunda conta processa separadamente e cota registra uma inferência por conta. Estado não é alterado automaticamente. Áudio anônimo recebeu 401 e assinatura pendente 403. Não certifica microfone/aparelho ou todos os sotaques/ruídos. |
| Push | Criptografia, fila, concorrência, retries, silêncio, DST e service worker aprovados nos testes. Chaves/contato publicados; entrega real com app fechado ainda pendente. |
| Google Agenda | OAuth, isolamento, criptografia, importação revisada e desconexão aprovados em contratos simulados/HTTP local. Cliente OAuth ainda não existe. |
| Backup/restauração | Snapshot de produção exportado com criptografia, decriptado e restaurado em D1 remoto temporário sem Worker público; oito tabelas comparadas por digest, quick_check e FKs aprovados, sessões/dispositivos desativados e quarentena confirmada. D1 temporário removido. Retenção, cópia externa, responsáveis e retomada após incidente ainda pendentes. |
| Cobrança | Preços publicados; PicPay escolhido, aguardando chave. Checkout, webhook, vigência, renovação, cancelamento e reembolso continuam sem implementação/homologação completa. Selecionar plano não cobra. |

## Ampliação da auditoria remota: módulos, áudio e recuperação

A rodada adicional percorreu dez grupos funcionais pela URL pública, com três contas sintéticas: cookies HttpOnly/Secure/SameSite; reenvio idempotente; isolamento/origem/admin; concorrência com conflito explícito; persistência conjunta de finanças/baixa parcial/recibo PDF/saúde/planos/agenda/Momentos; exportação sem credenciais e restauração só pelo proprietário; original PNG byte a byte e destinatário restrito; revogação; lixeira/restauração sem ressuscitar acesso; recuperação com código rotacionado e revogação de sessão/link; assinatura pendente sem habilitar IA. Os casos correlatos estão agrupados no log em dez verificações, sem representar dez funcionalidades isoladas. Nenhuma falha foi observada nesses cenários. Eles testam HTTP, D1 e regras compartilhadas, não cliques de interface em todos os aparelhos.

A transcrição real usou WAV sintético de 208.142 bytes, produzido localmente por voz pt-BR com a frase “Preciso organizar a reunião amanhã às nove horas”. O Workers AI reconheceu reunião e nove horas, exigiu revisão e não criou registros automaticamente. Duas contas ativas foram exercitadas: a primeira reutilizou o resultado na repetição, a segunda fez seu próprio processamento; o D1 confirmou uma utilização por conta. As contas de áudio foram canceladas/excluídas após o ensaio. Isso não substitui teste de gravação pelo microfone, qualidade em ruído ou captura pelo WhatsApp.

A exportação criptografada do snapshot de produção gerou arquivo privado de 5.605 bytes; a decriptação autenticada produziu SQL privado de 17.495 bytes. O SQL foi importado em memória local, com integrity_check e FKs válidos. Em seguida foi importado, com quarentena, em D1 remoto temporário sem binding público/cron. Compararam-se por digest users, subscriptions, user_states, user_state_chunks, ai_usage, payment_events, audit_log e configurações de negócio; as oito comparações passaram. No D1 remoto, **PRAGMA quick_check** retornou ok e **PRAGMA foreign_key_check** não encontrou violações, conforme os [comandos suportados pelo D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/). Sessões e dispositivos push ficaram vazios e restore_quarantine presente. O D1 temporário foi removido ao final. A base de produção não foi substituída nem colocada em quarentena. O ensaio prova restauração do snapshot existente; não define retenção, cópia fora desta máquina, RPO/RTO ou reconciliação de alterações posteriores.

Evidências privadas adicionais: qa/audit-remote-functional-2026-11-05.log; qa/audit-remote-audio-2026-11-05.log; qa/audit-restore-remote-2026-11-05.log. Backup criptografado: .mentra-private/backup-producao-auditoria-2026-11-05.mlbk. SQL decifrado também ficou na pasta privada, nunca nos assets. A primeira tentativa do ensaio remoto usou uma checagem SQLite não aceita pelo D1; o banco temporário foi limpo e o ensaio completo passou após usar quick_check. Não foi uma divergência dos dados restaurados.

## Auditoria da interface publicada e correções do período financeiro

A inspeção com conta sintética encontrou um defeito reproduzível: em 05/11/2026 o financeiro inicializava seu filtro em outubro de 2026, apesar da Home indicar novembro. O mês fixo foi substituído pela data operacional no fuso da conta. O período automático acompanha a virada de mês; um mês/intervalo escolhido pelo usuário permanece preservado. A legenda da data/mês na Home também foi alinhada à data operacional, em vez do fuso do aparelho. Testes novos cobrem seleção dos lançamentos corretos, virada de mês, fevereiro bissexto e preservação dos filtros manuais.

Outro ajuste publicado: a tela de áudio indicava “Disponível” para assinaturas pendentes, embora a API recusasse a transcrição. Agora o servidor informa a elegibilidade da conta e a interface apresenta “Assinatura necessária” antes de selecionar/enviar arquivo. A autorização continua sendo verificada pela API em cada pedido. Testes verificam conta ativa, pendente, vencida e serviço sem configuração, sem iniciar inferência, além do bloqueio da seleção/envio pela interface.

Após a publicação, as cinco áreas financeiras mostraram novembro de 2026 e o intervalo 01/11–30/11 no navegador. A aba Áudio da conta pendente mostrou o novo aviso sem formulário de upload. Uma tarefa sintética foi criada, priorizada e concluída pela interface; após recarregar, permaneceu concluída, com prioridade removida. O estado confirmado no backend correspondeu ao resultado visual. A conta sintética foi excluída e sua sessão anterior passou a receber 401.

Também foram realizadas **42 verificações de layout da versão pública**: 21 rotas em 360×800 e 1280×900, com exatamente um main, um h1 e sem transbordamento horizontal da página. As medições registram o título renderizado de cada rota; a consulta de erros do console nessa sessão retornou lista vazia. Isso não verifica todos os componentes internos, todos os formulários ou zoom/leitor de tela, nem substitui teste no Android físico.

Evidências: qa/layout-publicado-2026-11-05.json; qa/interface-tarefa-publicada-2026-11-05.jpg; qa/finance-corrigido-desktop-2026-11-05.jpg. Código: dist/finance-ui.mjs, dist/app.js, dist/integrations-ui.mjs e server/whatsapp.mjs. Testes novos: tests/finance-period-ui.test.mjs e complementos de tests/integrations-ui.test.mjs / tests/integrations.test.mjs. Total final desta rodada: 482 testes aprovados, build aprovado e nove checks públicos aprovados novamente.

O proprietário confirmou Android/Chrome para push e acesso ao Registro.br, mas ainda não criou sua conta Mentra. Foi entregue o [roteiro de domínio e teste Android](DOMINIO-E-PUSH-ANDROID.md). A consulta autenticada Vercel informou os registros A de primeira preferência da raiz: 216.198.79.1 e 64.29.17.1. A alteração no registrador e a entrega no aparelho não foram presumidas como concluídas.

## Dependências e leitura segura de requisições

O npm audit do lockfile instalado retornou zero vulnerabilidades conhecidas (informativas, baixas, moderadas, altas e críticas). Isso cobre a base de avisos do npm consultada em 05/11/2026, não uma certificação de segurança de toda a aplicação. Evidência: qa/audit-dependencies-2026-11-05.json.

Foi reproduzida uma falha no limite de JSON da API: um cadastro sintético transmitido sem Content-Length, com mais de 6 MB em UTF-8 mas menos de seis milhões de caracteres, recebia 200. A validação antiga só contava caracteres após ler todo o corpo. Um JSON com sequência UTF-8 inválida também era aceito após substituição silenciosa dos bytes por caracteres de reposição.

Correção: leitura por fluxo com o limite de 6.000.000 bytes aplicado durante o recebimento e cancelamento do fluxo excedente; decodificação UTF-8 estrita antes de interpretar o JSON. Rotas de integração mantêm seu limite de 20.000 bytes e também recusam UTF-8 inválido. O limite de 5 MB do estado e os limites específicos de arquivo/áudio permanecem separados.

Quatro regressões em tests/request-limits.test.mjs comprovam: requisição excedente sem Content-Length retorna 413 e não cria usuário; bytes UTF-8 inválidos retornam 400; JSON válido com acentos divididos entre chunks continua aceito e preservado; parser das integrações também recusa a codificação inválida. A reprodução de carga excedente ocorreu somente no ambiente de teste, não contra clientes de produção. Código: server/worker.mjs e server/integration-utils.mjs. Suíte após a correção: 482 aprovados, zero falhas e zero ignorados; build aprovado. Correção publicada no Worker 2165aab3-5a29-4699-a760-672a9ff5f37c. Teste pós-deploy pelo endereço público: UTF-8 inválido retornou 400; cadastro por fluxo com nome acentuado retornou 200; objetivo com acentuação persistiu exatamente. Conta sintética removida e nove checks públicos aprovados. Evidência: qa/audit-remote-parser-2026-11-05.log.

## OCR real no navegador publicado

A suíte já incluía OCR real local com Tesseract e extração real de PDF. A ampliação desta rodada conferiu também o caminho efetivamente hospedado na Vercel: em uma conta sintética, uma imagem PNG limpa com “MENTRA LIFE”, “Contrato numero 4812”, “Pagamento confirmado” e “Sao Paulo” foi processada pelo botão Extrair texto da biblioteca. As bibliotecas/idioma da própria hospedagem foram usados no navegador; o texto reconhecido exibiu essas quatro linhas para revisão.

Foi acrescentada manualmente a expressão “jabuticaba QA” e salva a revisão. Após recarregar a página, a busca por jabuticaba retornou o documento e uma busca inexistente retornou zero resultados. A consulta do estado remoto confirmou o texto revisado e a igualdade byte a byte/hash SHA-256 do PNG original. Tarefas, eventos e lançamentos financeiros permaneceram vazios: OCR não criou ações nem presumiu que o “pagamento confirmado” impresso representasse uma movimentação real. A consulta de erros do console nessa sessão retornou lista vazia. A conta sintética foi removida ao final.

Evidências: qa/audit-remote-ocr-2026-11-05.json e qa/ocr-busca-publicada-2026-11-05.jpg. Esse teste comprova o cenário da imagem sintética limpa; não garante precisão de OCR em toda foto, manuscrito, idioma, documento danificado ou câmera de celular.

## Ajustes e prioridades restantes

1. **Alta — PicPay.** Implementar e testar o ciclo completo do produto liberado ao lojista, cadastrar credenciais de forma privada e homologar antes de cobrar. A API oficial de Checkout possui [recorrência](https://developers-business.picpay.com/checkout/docs/features/recurrency) e [webhooks autenticados](https://developers-business.picpay.com/checkout/docs/webhook); a chave/produto habilitado ainda precisam ser confirmados. Não presumir compatibilidade com a API legada Wallet.
2. **Alta — WhatsApp e Google.** Criar aplicações Meta e cliente OAuth Google e completar configuração e testes reais de vínculo, captura/importação, falhas e revogação. Não há chave a inventar nem conector externo homologado só com os testes simulados.
3. **Alta — domínio/e-mail.** Corrigir/verificar DNS no registrador conforme painel Vercel; testar HTTPS e suporte real. Após domínio funcional, alinhar origem pública, proxy e retorno OAuth, preservando a validação de origem.
4. **Alta — operação e recuperação.** Ensaio de restauração remota realizado; ainda faltam retenção, cópia externa, responsáveis, alertas, capacidade/custos e validação da retomada após incidente. Cadastro ainda não verifica titularidade de e-mail; proteção administrativa e fluxos de identidade exigem definição/implementação.
5. **Média — push em aparelho.** Com chaves/contato já publicados, testar permissão do usuário, entrega com app fechado, silêncio e cancelamento em aparelhos reais. Não forçar permissões nem alegar entrega sem observar o aparelho.
6. **Média — interface e módulos publicados.** Ensaiar fluxos completos em navegador, Android/iOS, teclado/leitor de tela, OCR com documentos sintéticos e downloads/compartilhamento. Testes automatizados não certificam todas as telas/dispositivos.
7. **Média — contexto IA ampliado.** Evoluir intervalos financeiros arbitrários, filtros específicos e busca semântica em contas grandes. Resumos atuais têm recorte explícito de detalhes e totais de todos os registros válidos; saúde e arquivos exigem seleção explícita se forem incluídos futuramente.

## Matriz dos 91 itens propostos

A matriz abaixo preserva a classificação da auditoria histórica de código, para rastreabilidade. **Ela não representa 91 testes manuais novos nem aprovação de produção.** A nova execução da suíte, as consultas remotas e a correção DeepSeek estão detalhadas acima. A especificação histórica inclui itens substituídos e fora do produto atual. Consulte AUDITORIA-FUNCIONAL.md e AUDITORIA-PRODUCAO.json para critérios, evidências e próximas ações de cada item.

| Item | Funcionalidade | Classificação histórica | Evidência cadastrada |
| --- | --- | --- | --- |
| F01 | Autenticação e recuperação | parcial | server/worker.mjs; migrations/0001_platform.sql; tests/platform-api.test.mjs; tests/platform-worker.test.mjs |
| F02 | Resumo de rotina e tarefas do dia | verificado_localmente | dist/time.mjs; dist/organizer.mjs; dist/event-series.mjs; dist/calendar-ui.mjs; tests/time-series.test.mjs; tests/app.test.mjs; tests/operational-roundtrip.test.mjs; tests/series-edit.test.mjs |
| F03 | Criar editar concluir e adiar tarefas | verificado_localmente | dist/time.mjs; dist/organizer.mjs; dist/event-series.mjs; dist/calendar-ui.mjs; tests/time-series.test.mjs; tests/app.test.mjs; tests/operational-roundtrip.test.mjs; tests/series-edit.test.mjs |
| F04 | Compromissos com data e horário | verificado_localmente | dist/time.mjs; dist/organizer.mjs; dist/event-series.mjs; dist/calendar-ui.mjs; tests/time-series.test.mjs; tests/app.test.mjs; tests/operational-roundtrip.test.mjs; tests/series-edit.test.mjs |
| F05 | Prioridades selecionadas pela pessoa | verificado_localmente | dist/time.mjs; dist/organizer.mjs; dist/event-series.mjs; dist/calendar-ui.mjs; tests/time-series.test.mjs; tests/app.test.mjs; tests/operational-roundtrip.test.mjs; tests/series-edit.test.mjs |
| F06 | Agendamento e cancelamento de avisos | aguarda_homologacao_externa | server/push.mjs; server/reminder-plan.mjs; dist/push-sw.js; tests/integrations.test.mjs; tests/push-sw.test.mjs; docs/INTEGRACOES.md |
| F07 | Recorrências | verificado_localmente | dist/time.mjs; dist/organizer.mjs; dist/event-series.mjs; dist/calendar-ui.mjs; tests/time-series.test.mjs; tests/app.test.mjs; tests/operational-roundtrip.test.mjs; tests/series-edit.test.mjs |
| F08 | Entrada de texto no aplicativo | verificado_localmente | dist/app.js; dist/core.mjs; dist/finance.mjs; tests/app.test.mjs; tests/finance.test.mjs; tests/library-ui.test.mjs; tests/documents.test.mjs |
| F09 | Captura de texto pelo WhatsApp | aguarda_homologacao_externa | server/whatsapp.mjs; server/audio.mjs; dist/integrations-ui.mjs; tests/integrations.test.mjs; tests/integrations-ui.test.mjs; docs/INTEGRACOES.md; migrations/0007_audio_claims.sql; scripts/readiness.mjs; tests/readiness.test.mjs; tests/pwa.test.mjs; docs/RELATORIO-INTEGRACOES-2026-10-29.md |
| F10 | Captura de áudio e transcrição | aguarda_homologacao_externa | server/whatsapp.mjs; server/audio.mjs; dist/integrations-ui.mjs; tests/integrations.test.mjs; tests/integrations-ui.test.mjs; docs/INTEGRACOES.md; migrations/0007_audio_claims.sql; scripts/readiness.mjs; tests/readiness.test.mjs; tests/pwa.test.mjs; docs/RELATORIO-INTEGRACOES-2026-10-29.md |
| F11 | Captura de fotos e documentos | aguarda_homologacao_externa | server/whatsapp.mjs; server/audio.mjs; dist/integrations-ui.mjs; tests/integrations.test.mjs; tests/integrations-ui.test.mjs; docs/INTEGRACOES.md |
| F12 | Guardar PDFs e digitalizados | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F13 | Busca por conteúdo sem nome perfeito | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F14 | Separação Pessoal e Empresa | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F15 | Favoritos e categorias opcionais | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F16 | Lançamentos por conta método categoria data e situação | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F17 | Experiência para pessoa sem renda | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F18 | Caminho educativo para gerar renda | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F19 | Três trilhas amplas incluídas na assinatura | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F20 | Hipóteses testes e evidências de negócio | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F21 | Organização e sugestões por IA real | aguarda_integracao_final | server/worker.mjs: chat; dist/app.js: sendChat; dist/journeys-ui.mjs: answer; tests/platform-worker.test.mjs |
| F22 | Memória opcional editável | verificado_localmente | dist/app.js: account-preferences; server/worker.mjs: chat; tests/platform-worker.test.mjs |
| F23 | Esclarecimento de ambiguidades | verificado_localmente | dist/app.js; dist/core.mjs; dist/finance.mjs; tests/app.test.mjs; tests/finance.test.mjs; tests/library-ui.test.mjs; tests/documents.test.mjs |
| F24 | Confirmação vinculada à proposta | verificado_localmente | dist/app.js; dist/core.mjs; dist/finance.mjs; tests/app.test.mjs; tests/finance.test.mjs; tests/library-ui.test.mjs; tests/documents.test.mjs |
| F25 | Lixeira e exclusão permanente | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F26 | Exportação da conta | parcial | server/worker.mjs; dist/bootstrap.mjs; dist/backup.mjs; dist/sync-ui.mjs; dist/sync-review.mjs; tests/backup.test.mjs; tests/sync-ui.test.mjs; tests/sync-review.test.mjs; docs/RESTAURACAO-CONTA.md |
| F27 | Exclusão de conta e revogação | parcial | server/worker.mjs; migrations/0001_platform.sql; tests/platform-api.test.mjs; tests/platform-worker.test.mjs |
| F28 | Elegibilidade da plataforma e provedor | decisao_provedor_pendente | docs/INTEGRACOES.md; docs/DEPENDE-DO-OPERADOR.md |
| F29 | Opt-in janela e modelos de mensagem | parcial | server/whatsapp.mjs; tests/integrations.test.mjs; dist/integrations-ui.mjs |
| F30 | Uma assinatura paga completa no lançamento | substituido | server/catalog.mjs; dist/platform.mjs; tests/catalog.test.mjs |
| F31 | Mensalidade da assinatura completa: valor a definir | aguarda_decisao | server/catalog.mjs; dist/admin.mjs; tests/catalog.test.mjs |
| F32 | Limites de IA arquivos áudio e WhatsApp | parcial | server/worker.mjs; server/catalog.mjs; dist/platform.mjs; dist/app.js; dist/uploads.mjs; tests/platform-worker.test.mjs; server/audio.mjs; server/whatsapp.mjs; server/push.mjs; tests/integrations.test.mjs; migrations/0007_audio_claims.sql; scripts/readiness.mjs; tests/readiness.test.mjs; tests/pwa.test.mjs; docs/RELATORIO-INTEGRACOES-2026-10-29.md |
| F33 | Cobrança cancelamento e reembolso | aguarda_integracao_final | migrations/0001_platform.sql; server/worker.mjs: subscription; dist/platform.mjs |
| F34 | Teclado leitor de tela mobile e contraste | homologacao_pendente | tests/app.test.mjs; tests/health-ui.test.mjs; tests/journeys-ui.test.mjs; dist/styles.css; dist/sync.css; qa/conexoes-mobile-2026-10-29.png; qa/conexoes-desktop-2026-10-29.png; dist/skip-link.mjs; tests/skip-link.test.mjs; docs/AJUSTES-UX.md |
| F35 | Vazio carregamento erro e offline | verificado_localmente | dist/sync-controller.mjs; dist/draft-store.mjs; dist/sync-ui.mjs; tests/sync.test.mjs; tests/sync-review.test.mjs; docs/QA.md |
| F36 | Isolamento proteção de arquivos e segredos | parcial | server/worker.mjs; migrations/0001_platform.sql; tests/platform-api.test.mjs; tests/platform-worker.test.mjs; tests/integrations.test.mjs; qa/restore-local-results-2026-10-29.json |
| F37 | Backup restauração e incidentes | parcial | scripts/private-backup.mjs; scripts/restore-quarantine.sql; server/worker.mjs; tests/private-backup.test.mjs; tests/recovery-lock.test.mjs; docs/BACKUP-RESTAURACAO.md |
| F38 | Canal responsáveis e procedimentos | decisao_operacional_pendente | docs/OPERACAO.md; docs/PENDENCIAS-PUBLICACAO.md |
| F39 | Ativação retorno qualidade e recomendação | verificado_localmente | dist/entry.mjs; dist/bootstrap.mjs; dist/app.js; server/worker.mjs |
| F40 | Aviso de simulação e dados fictícios | verificado_localmente | dist/app.js; dist/health-ui.mjs; dist/documents-ui.mjs; dist/journeys-ui.mjs; tests/health-ui.test.mjs; tests/app.test.mjs |
| F41 | Links restritos e expiráveis | verificado_localmente | server/document-shares.mjs; migrations/0008_document_shares.sql; dist/document-shares-ui.mjs; dist/shared-document.mjs; tests/document-shares.test.mjs; tests/document-shares-ui.test.mjs; tests/document-shares-http.test.mjs; docs/LINKS-PRIVADOS.md |
| F42 | Calendários e serviços financeiros externos | parcial | server/calendar.mjs; migrations/0009_calendar.sql; dist/calendar-connect-ui.mjs; dist/calendar-import.mjs; tests/calendar.test.mjs; tests/calendar-ui.test.mjs; tests/calendar-http.test.mjs; docs/CALENDARIO-GOOGLE.md; dist/finance-import.mjs; dist/finance-import-ui.mjs; tests/finance-import.test.mjs; tests/finance-import-ui.test.mjs; tests/finance-import-http.test.mjs; docs/IMPORTACAO-FINANCEIRA.md |
| F43 | Produto para empresas após validar pessoa física | fora_do_produto_atual | dist/library-core.mjs; dist/library-ui.mjs; tests/library.test.mjs |
| F44 | Escolha da plataforma e fornecedores | parcial | wrangler.jsonc; docs/OPERACAO.md; docs/DEPENDENCIAS-OCR.md; server/catalog.mjs |
| F45 | Contas manuais com saldo inicial e data | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F46 | Contas a pagar e receber com vencimento | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F47 | Baixas totais e parciais | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F48 | Transferência interna entre contas próprias | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F49 | Recorrências de compromissos previstos | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F50 | Anexo local de exemplo com original preservado | verificado_localmente | dist/library-core.mjs; dist/library-ui.mjs; dist/extraction.mjs; tests/library.test.mjs; tests/library-ui.test.mjs; tests/extraction.test.mjs; docs/QA.md |
| F51 | Registro de despesa para impressão ou PDF | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F52 | Recibo ou declaração de pagamento independente com assinatura em branco | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F53 | Orçamento mensal por categoria | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F54 | Filtros por conta e período com CSV e PDF | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F55 | Revisão e confirmação antes de salvar | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F56 | Cartões faturas e parcelas fora desta versão | verificado_localmente | dist/finance.mjs; dist/finance-ui.mjs; tests/finance.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F57 | Criar para alguém sem exigir lançamento | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F58 | Salvar automaticamente em Recibos e comprovantes | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F59 | Download de PDF real do documento individual | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F60 | Compartilhamento nativo compatível com alternativa de baixar | verificado_localmente | dist/documents-ui.mjs; dist/pdf.mjs; tests/documents.test.mjs; tests/pdf.test.mjs; tests/operational-roundtrip.test.mjs |
| F61 | Três mensagens originais manhã tarde e noite | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F62 | Horários editáveis controle geral e fuso do aparelho | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F63 | Cristão opt-in separado com padrão neutro | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F64 | Cabeça suave pausa e movimento reduzido | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F65 | Ouvir com SpeechSynthesis após toque | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F66 | Card vertical em PNG real sem dados pessoais | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F67 | Compartilhar PNG pelo dispositivo ou baixar | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F68 | Prévia ilustrativa de notificação com abertura interna | verificado_localmente | dist/moments-core.mjs; dist/moments-ui.mjs; tests/moments-core.test.mjs; tests/moments-ui.test.mjs |
| F69 | Push com autorização fuso DST Focus e horário silencioso | aguarda_homologacao_externa | server/push.mjs; server/reminder-plan.mjs; dist/push-sw.js; tests/integrations.test.mjs; tests/push-sw.test.mjs; docs/INTEGRACOES.md; migrations/0007_audio_claims.sql; scripts/readiness.mjs; tests/readiness.test.mjs; tests/pwa.test.mjs; docs/RELATORIO-INTEGRACOES-2026-10-29.md |
| F70 | Pilar visível na navegação e em Hoje | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F71 | Organizar atividade em andamento | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F72 | Executar uma ideia | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F73 | Encontrar caminho a partir do zero | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F74 | Onboarding curto e salvamento explícito | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F75 | Editar plano etapas e próxima ação | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F76 | Status e prazo opcional do plano | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F77 | Mentoria roteirizada identificada como DEMO | aguarda_integracao_final | server/worker.mjs: chat; dist/app.js: sendChat; dist/journeys-ui.mjs: answer; tests/platform-worker.test.mjs |
| F78 | Projetos pessoais e legado preservados | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F79 | Erros e retorno de navegação dos planos | verificado_localmente | dist/journeys-core.mjs; dist/journeys-ui.mjs; tests/journeys-core.test.mjs; tests/journeys-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F80 | Limites do piloto e da distribuição em lojas | fora_do_produto_atual | wrangler.jsonc; docs/OPERACAO.md |
| F81 | Entrada de Saúde na Home e navegação | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F82 | Consultas, exames e retornos | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F83 | Horários de medicamentos informados | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F84 | Registro rápido e histórico | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F85 | Resumo local para consulta | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F86 | Receitas ilustrativas e filtros | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F87 | Planejamento semanal e compras derivadas | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F88 | Organização de plano profissional | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F89 | Atividades escolhidas e conclusão gentil | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F90 | Persistência e preservação do legado | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
| F91 | Privacidade e limites de saúde | verificado_localmente | dist/health-core.mjs; dist/health-ui.mjs; tests/health-core.test.mjs; tests/health-ui.test.mjs; tests/operational-roundtrip.test.mjs |
