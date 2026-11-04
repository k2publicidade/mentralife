# O que depende do proprietário para colocar no ar — 29/10/2026

WhatsApp de entrada, transcrição e push foram implementados e testados localmente. A rodada atual passou em 463 testes; incluiu descarte individual, concorrência/cotas diárias, proteção de respostas atrasadas e silêncio/Retry-After. O roteiro com responsáveis e trabalhos técnicos ainda necessários está em RELATORIO-INTEGRACOES-2026-10-29.md. Credenciais reais, ativação dos serviços e homologação externa continuam pendentes. Não existe publicação em produção confirmada. Não envie segredos no chat; use os secrets do Worker.

## 1. Cloudflare, Vercel e endereço do sistema

Destino escolhido: site em `vercel.app`, banco D1 e API na Cloudflare. Integração entre hospedagens preparada; procedimento em VERCEL-CLOUDFLARE.md. Falta autenticar as duas contas para criar/vincular os recursos reais. O endereço definitivo será o atribuído ao projeto Vercel, não um nome presumido.

- Entrar na sua conta Cloudflare; a sessão atual do Wrangler não está autenticada.
- Disponibilizar a conta/projeto que pagará e hospedará Workers, D1 e Workers AI. Aprovar a ativação do Workers AI e os custos/condições aplicáveis.
- Concluir login na conta/equipe Vercel que hospedará o projeto. O uso inicial de vercel.app já foi escolhido; domínio próprio não bloqueia esta etapa. O ID D1 e a URL do Worker serão obtidos depois do acesso, sem valores inventados.
- Informar qual e-mail será o administrador proprietário. Não há senha padrão; o cadastro/primeiro acesso é seu.

Preparado no código: nove migrações, exemplo de deploy com binding AI/cron/logs sem query strings, comandos de build/migração, GET /api/health e npm run readiness. O verificador confirmou as chaves VAPID e o token de verificação preparados; o arquivo de produção/ID real e os dados Meta/contato ainda faltam. Falta executar e homologar em staging/produção autenticados.

## 2. Conta empresarial WhatsApp/Meta

- Disponibilizar o acesso à aplicação Meta e ao número empresarial que receberá as mensagens; completar as verificações/aprovações exigidas pela Meta para seu caso de uso.
- Configurar no Worker: `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_GRAPH_VERSION` aceita pela aplicação.
- Cadastrar no painel Meta a URL HTTPS `/api/whatsapp/webhook`, o token de verificação já preparado e a assinatura do campo `messages`.
- Ter um número/aparelho de teste autorizado para enviar texto, PDF/imagem e áudio e completar o vínculo pelo comando gerado no app.

O token WHATSAPP_VERIFY_TOKEN já foi gerado e o par VAPID já foi validado criptograficamente no verificador local; não depende de você criar outro. O conector é de entrada/captura com revisão no app. Não há campanha, modelo proativo nem robô de resposta automática pelo WhatsApp configurados. Se isso for parte da oferta comercial, exige um fluxo de saída adicional e validação das regras atuais do provedor.

## 3. Push: contato e permissão no aparelho

- Informar um contato real ou URL HTTPS do operador para `VAPID_SUBJECT`.
- Autorizar a instalação/uso do sistema e a permissão de notificações nos aparelhos que devem receber os avisos. Você pode negar/desligar sem bloquear agenda/documentos/finanças.
- Participar do teste real com app fechado no navegador/aparelho que será suportado. Os testes locais comprovam fila e criptografia, não a entrega pelo serviço de Apple/Google/Mozilla ou as restrições do sistema operacional.

As chaves VAPID já estão geradas no arquivo privado `.dev.vars.push`; não precisa criar chave de serviço push de terceiro. Precisamos apenas cadastrá-las no Worker, após sua autenticação Cloudflare, com o contato real.

## 4. Identidade comercial e operação

- Informar identificação do operador, contato real de suporte, responsável e horários de atendimento.
- Aprovar termos, política de privacidade, retenção, suporte, backups e resposta a incidentes para os dados que pretende operar, incluindo saúde informada e envio opcional de áudio à Cloudflare/notas à IA.
- Definir capacidade/limites comerciais e aprovar o custo de infraestrutura. Limites técnicos atuais: estado de organização de 5 MB, arquivo de documento até 500 KB, caixa de mídias pendentes até 5 MB/100 mensagens, áudio até 2 MB, vinte áudios distintos/dia UTC.
- Se quiser verificação de e-mail/entrega transacional, escolher a conta/provedor remetente; a recuperação atual funciona por código pessoal de uso rotacionado.

Depois do acesso e dessas decisões, ainda precisam ser executados: deploy/homologação remotos, ensaio de restauração, monitoramento/alertas e testes finais de aparelhos. Não são apenas campos para você preencher: são verificações técnicas que continuam sob responsabilidade de quem implanta.

## 5. Decisões sobre recursos adicionais da matriz histórica

Links privados expirantes, Google Agenda de leitura e importação financeira CSV já foram implementados e testados localmente. Links e calendário ainda precisam de homologação remota; o Google exige autorização e cliente OAuth do proprietário. Conexão bancária automática, outros calendários, sincronização bidirecional e saída/mentoria pelo WhatsApp continuam como trabalho técnico adicional, não como simples cadastro de chaves. Equipes e distribuição em lojas são etapas futuras da matriz histórica. A lista geral e os critérios de aceite estão em PENDENCIAS-PUBLICACAO.md.

## 6. DeepSeek — penúltima etapa

Disponibilizar a chave por secret `DEEPSEEK_API_KEY` e aprovar modelo/limites de custo. A integração, isolamento, notas opcionais e cotas dos planos estão preparados. Depois, realizar teste real de conversa e orientação de planos com conta ativa.

## 7. Gateway — última etapa

Escolher o fornecedor, fornecer/configurar sua conta e credenciais de sandbox e definir os preços/condições dos três planos. Após a escolha, implementar o adaptador específico e homologar checkout, webhooks assinados/idempotentes, ativação, renovação, cancelamento, inadimplência e reembolso. Só então liberar cobrança real.

A seleção de plano atual não cobra nem ativa automaticamente uma assinatura. Não foi criado um pagamento ou um gateway fictício.

Links privados de documentos também implementados nesta rodada, sem chave externa: ver LINKS-PRIVADOS.md. Exigem somente a publicação do backend e a migração 0008 no ambiente remoto. Google Agenda de leitura com OAuth e revisão foi implementado; o proprietário precisa disponibilizar projeto/cliente OAuth e retorno HTTPS, conforme CALENDARIO-GOOGLE.md. A chave de criptografia já está preparada em .dev.vars.calendar. Outros calendários, conectores financeiros, sincronização bidirecional e equipes continuam como trabalho técnico histórico pendente, não como simples cadastro de secrets.

Importação financeira de entradas/saídas por CSV implementada, sem precisar de credenciais bancárias ou IA: IMPORTACAO-FINANCEIRA.md. A conexão bancária automática não foi implementada. Autorização de calendário não conclui após logout concorrente; teste específico passou.

Implantação e recuperação: configurações de alvos separadas, backup criptografado, SQL de quarentena e smoke de leitura preparados. Chave de backup já gerada em .dev.vars.backup; não vai para o Worker. Ensaio real de exportação/restauração local concluído, sem mudar o D1 em uso. Faltam conta Cloudflare autenticada, domínio/administrador, destino privado externo/retenção, RPO/RTO e ensaio remoto; ver OPERACAO.md e BACKUP-RESTAURACAO.md.
