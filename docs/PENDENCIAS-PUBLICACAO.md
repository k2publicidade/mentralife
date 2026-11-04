# Pendências exatas para publicar — 29/10/2026

A auditoria dos 91 requisitos históricos está registrada em AUDITORIA-FUNCIONAL.md e AUDITORIA-PRODUCAO.json. A revisão foi concluída; a implementação integral e a homologação de produção ainda não. Nenhuma das pendências abaixo foi ocultada como simples configuração de chave. Os resultados atuais comprovam funcionamento local nos escopos descritos.

## Destino atualizado

O proprietário escolheu site na Vercel com `vercel.app` e D1 na Cloudflare. API/cron permanecem em Worker Cloudflare, encaminhados pela Vercel com segredo privado. Preparação local implementada e suíte com 463 testes aprovada; publicação remota ainda depende das contas autenticadas. Seguir VERCEL-CLOUDFLARE.md para o procedimento atualizado de P01.

## Ordem de conclusão

### P01 — Preparar Cloudflare e staging

- Autenticar a conta Cloudflare do proprietário. `wrangler whoami` confirmou ausência de autenticação nesta execução.
- Criar D1s remotos separados e preparar as configurações com `npm run prepare:deployment` (staging/production/restore-test), sem compartilhar Worker/banco nem alterar o desenvolvimento; aplicar as nove migrações em staging e conferir schema/índices/FKs. `wrangler.jsonc` permanece para o desenvolvimento local. O ID atual não identifica uma base de produção.
- Publicar o backend Worker e a interface Vercel em staging, com D1 separado, proxy autenticado, cookies e origem pública correta; configurar endereço HTTPS. A identidade histórica do Sites não é uma publicação válida deste backend.
- Criar a conta administrativa do proprietário sem senha padrão; conceder o papel pelo procedimento documentado e testar autorização no servidor. Não liberar contas de QA em produção.
- Comprovar isolamento entre duas contas reais de teste no D1 remoto, cookies Secure, CSRF/origem, conflitos e limite de armazenamento. Não executar a suíte que cria/remove contas contra clientes de produção.

**Aceite:** staging acessível por HTTPS, schema correto, login/logout/recuperação e isolamento remoto conferidos.

### P02 — Backup, restauração e incidentes

- Ferramentas de backup criptografado, restauração isolada e quarentena implementadas e ensaiadas no D1 local; ver BACKUP-RESTAURACAO.md. Chave já preparada em arquivo privado. Definir retenção, frequência, responsável e local privado externo para backups; nunca hospedar SQL, hashes de senhas ou JSON de contas como assets públicos.
- Exportar a base remota e restaurar numa base remota isolada. Conferir contagens, FKs, revisões, originais e efeitos de exclusão; definir como impedir que exclusões posteriores ao backup voltem a ficar acessíveis após desastre.
- Registrar RPO/RTO, recuperação de acesso administrativo, rollback de versão e procedimento de incidente. O ensaio local conferiu oito tabelas, originais/estado, integridade/FKs e quarentena de sessões, concessões e envios. O bloqueio persistente impede APIs e cron até liberação pelo responsável; ainda é necessário reconciliar exclusões/credenciais/assinaturas posteriores ao backup e ensaiar a retomada remota.

**Aceite:** ensaio remoto documentado, responsável definido e cópia de recuperação protegida.

### P03 — Homologar interface e dispositivos da versão atual

- Testar criação e recuperação de conta, perfil/fuso/notas da IA, captura textual, revisão, repetição e cancelamento.
- Testar séries na agenda, edição individual, cancelamento da série e restauração. Editor coletivo de nome, horário e duração implementado com revisão, escopo por data e proteção contra revisão desatualizada; fluxo conferido no navegador local com série sintética; homologar em staging também.
- Exportação/restauração conferida localmente pelo seletor real: comparação, cancelamento, confirmação, JSON inválido, reload e preservação de originais; organização completa e assinatura comparadas pela nova exportação. Concorrência entre arquivos e saída da tela corrigidas, com testes. Repetir em staging/aparelhos e conferir conflito entre abas na versão publicada. Ver RESTAURACAO-CONTA.md.
- Exercitar finanças completas, recibos/PDF/CSV, upload/OCR, planos Impulso, saúde, Momentos, voz/PNG e compartilhamento em navegadores de desktop e aparelhos Android/iOS. Importação CSV de entradas/saídas implementada e conferida localmente com seletor real, revisão, confirmação, persistência e bloqueio de repetição; homologar também em staging.
- Atalho “Pular para o conteúdo” corrigido e conferido localmente por teclado, preservando rota e token privado após recarregar; contraste de texto em fundos sólidos auditado em dez telas, com limites em AJUSTES-UX.md.
- Validar largura de 360 px, zoom 200%, teclado, foco em modais e leitor de tela; corrigir os achados. Os testes de markup/controladores não certificam essas condições.
- A indisponibilidade anterior da automação foi resolvida em 29/10. Painel de conexões conferido a 360/1280 px; gravação de preferências desligadas e bloqueio de ativação sem configuração passaram no navegador, sem erros de console no fluxo observado. Nesta revisão de UX, 21 rotas foram verificadas em 360/768/1280 px (63 checagens), com leitura ampliada nas duas menores larguras, sem transbordamento horizontal. Abas por teclado, rascunhos, Escape/foco e entrada pública foram conferidos; /admin foi corrigido e testado por HTTP. Ver AJUSTES-UX.md. Aparelhos Android/iOS, zoom 200%, leitor de tela e os demais roteiros em staging continuam pendentes.

**Aceite:** roteiro real concluído sem bloqueios e evidências da versão publicada em staging.

### P04 — Ativar e homologar WhatsApp e áudio

O conector de entrada e a transcrição foram implementados. Autenticar/configurar conta Meta, número, Graph version, app secret e access token; cadastrar webhook e token já preparado. Habilitar o binding Workers AI na conta Cloudflare. Homologar o caso de uso e as condições reais do provedor; testar vínculo, texto, imagem/PDF, áudio, repetição, falha, revisão e opt-out com arquivos sintéticos. O aplicativo não envia campanhas nem respostas automáticas pelo WhatsApp.

**Aceite:** recebimento e transcrição com provedores reais e conta ativa; testes de memória não certificam essa etapa. Ver INTEGRACOES.md e DEPENDE-DO-OPERADOR.md.

### P05 — Ativar e homologar push em aparelhos

Fila, scheduler por minuto, fuso/DST/silêncio, cancelamento, retentativas, endpoints e service worker foram implementados. Chaves VAPID já geradas em arquivo privado; cadastrar secrets no Worker e contato real em VAPID_SUBJECT. O usuário precisa permitir/ativar o dispositivo. Homologar entrega com app fechado, silêncio, cancelamento e opt-out nos aparelhos suportados.

Manifest de instalação, ícone e instruções iPhone/iPad/Android preparados; service worker ativa/atualiza sem cache de dados privados. Retentativas respeitam Retry-After e reavaliam o silêncio no instante do envio.

**Aceite:** serviço aceita e aparelho apresenta notificações no cenário testado; sem garantir horário exato ou ignorar Focus/restrições do sistema. Nenhuma permissão foi forçada nesta rodada.

### P06 — Identidade do operador, privacidade e suporte

- Informar nome/identificação do operador, contato, responsável e horários de suporte reais.
- Aprovar/publicar termos e política compatíveis com sincronização, dados de saúde informados, notas opcionais e envio explícito à IA; definir retenção, exclusão e atendimento de solicitações de dados.
- Decidir e implementar verificação de titularidade de e-mail e entrega transacional de mensagens, caso exigidas para a operação. Atualmente a recuperação usa código pessoal exibido uma vez, não e-mail.
- Definir permissões e proteção das contas administrativas. Nenhum mecanismo de MFA próprio foi implementado.

**Aceite:** informações reais publicadas, procedimentos e responsáveis definidos, fluxos de acesso aceitos pelo operador.

### P07 — Integrações e compartilhamento adicionais do escopo histórico

- Links privados de documentos implementados e testados localmente: destinatário autenticado, expiração, revogação e invalidação permanente ao retirar/alterar o original. Aplicar a migração 0008 e homologar o fluxo em HTTPS remoto. Ver LINKS-PRIVADOS.md. Não há acesso anônimo.
- Google Agenda de leitura implementado com OAuth por conta, consulta e importação revisada, criptografia e desconexão. Disponibilizar projeto/cliente OAuth Google, configurar retorno HTTPS e homologar com conta real; ver CALENDARIO-GOOGLE.md. A chave de criptografia já foi gerada em arquivo privado. Outros calendários, sincronização bidirecional e conectores financeiros continuam como implementação pendente.
- Importação financeira CSV implementada sem credenciais externas: mapeamento de colunas, formatos explícitos, seleção/revisão, totais, detecção de repetição e conflitos. Ver IMPORTACAO-FINANCEIRA.md. Não constitui Open Finance, conexão bancária automática ou suporte a cartões/faturas/parcelas; estes permanecem fora do recurso.
- Não anunciar Mentra Empresas/equipes/colaboração, submissão em lojas ou piloto público como prontos: não fazem parte do produto atual. Contexto Empresa não cria acesso de terceiros.

**Aceite:** todas as integrações anunciadas entregues e homologadas; qualquer retirada do escopo completo deve ser decisão explícita do proprietário, não uma conclusão presumida da auditoria.

### P08 — Capacidade, monitoramento e operação

- Medir latência, concorrência, consumo D1/Workers, tamanho de conta e custo de IA/OCR nos dispositivos esperados; definir volume inicial suportado.
- Vincular monitor externo/alertas ao GET `/api/health`, testar aviso ao responsável e configurar limites de gastos/capacidade. A rota verifica banco e schema, sem certificar os provedores. Logs de falha genéricos, com query strings suprimidas e sem logs automáticos de invocação, já estão preparados no exemplo de produção. Ainda faltam destino dos alertas, procedimento e homologação remota.
- Confirmar os limites comerciais de 5 MB por conta e 500 KB por arquivo. R2 não está configurado; arquivos maiores exigem implementação e migração específicas.
- Reexecutar a suíte e o build da versão final e conferir que QA, dumps, banco local, .mentra-private e segredos permanecem fora do pacote público. Readiness agora confere entrada/roteamento/assets, proteção de logs e proíbe secrets em vars; smoke:release fornece nove verificações somente de leitura, sem certificar homologação integral.

**Aceite:** volume suportado e limites documentados, alertas testados e pacote de publicação conferido.

### P09 — DeepSeek, penúltima etapa

- Configurar `DEEPSEEK_API_KEY` somente como secret do Worker, conferir modelo disponível e homologar conversa, orientação de planos e notas opcionais com assinatura ativa.
- Testar cota dos três planos, indisponibilidade, timeout, resposta vazia, abortamento, custo e privacidade. Os testes atuais usam provedor simulado; nenhuma chave real foi solicitada ou gravada.

**Aceite:** resposta real com chave do proprietário, consumo e falhas conferidos.

### P10 — Gateway e cobrança, última etapa

- Escolher fornecedor, definir preços/condições e configurar credenciais em ambiente de testes.
- Implementar checkout, assinatura criptográfica e idempotência de webhooks, ativação, vigência, renovação, troca/cancelamento, estorno e inadimplência conforme API do gateway escolhido.
- Definir acesso após expiração e política de retenção/exportação sem apagar arquivos por pagamento recusado; tratar eventos financeiros na exclusão da conta.
- Testar sandbox completo, duplicidade, evento fora de ordem, recusa, renovação, cancelamento e reembolso; somente então habilitar cobrança real.

**Aceite:** contratação e ciclo completo dos três planos comprovados. A seleção de plano atual não cobra nem ativa assinatura. As tabelas existentes não equivalem a um gateway implementado.
