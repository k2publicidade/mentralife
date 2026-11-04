# Google Agenda — 29/10/2026

Conector de leitura da agenda principal implementado, com OAuth por conta e importação revisada. Contratos com provedor simulado, API local/D1 e controladores testados; a autorização real do Google ainda não foi homologada. Não equivale a sincronização bidirecional nem conclui todas as integrações do requisito F42.

## Fluxo entregue

Em Minha vida → Agenda → Conectar ou consultar calendário, a pessoa inicia a autorização e escolhe sua conta no Google. Depois consulta um intervalo de até 90 dias, com cem ocorrências por revisão. Nada é importado automaticamente. A revisão lista adições e atualizações; cancelar deixa a agenda intacta. Confirmar usa a sincronização existente da conta e recusa revisão vencida ou agenda alterada.

Consultas seguintes reconhecem as ocorrências importadas por identificador de origem. Atualizações substituem nome, data, horário, duração e fuso, inclusive edições locais desses campos, somente após revisão. Cancelamentos locais permanecem cancelados. Ausência ou exclusão no Google não remove registros na Mentra. Eventos recorrentes são importados como ocorrências individuais no intervalo escolhido, sem criar uma série editável do Google.

Somente título, data, horário, duração e identificador de origem entram na agenda. Não importamos descrições, localização, convidados, anexos, alarmes nem links. Eventos de dia inteiro, duração superior a 24 horas ou precisão de segundos são listados como não importados; nenhum horário é inventado. Quando um horário local se repete na mudança de fuso, a segunda ocorrência é apresentada e guardada em UTC para manter o instante correto. Confira sempre o fuso exibido na revisão.

O conector não escreve no Google, não envia convites, não consulta em segundo plano e não oferece assinatura de calendário por URL. Outros calendários, Microsoft/Apple, sincronização bidirecional e serviços financeiros continuam pendentes no escopo histórico.

## Proteção de acesso

OAuth com PKCE S256, estado aleatório com validade de dez minutos, uso único e vínculo à conta e à sessão que iniciou a conexão. Códigos de retorno são removidos da barra de endereço após carregar a página. Tokens ficam no backend, criptografados com AES-256-GCM, IV aleatório e conta como dado autenticado; não aparecem no navegador, listagem ou exportação da conta. A chave permanece fora do D1.

Desconectar elimina imediatamente concessões locais e tentativas pendentes, mesmo se a configuração do operador estiver indisponível. Também tenta revogar o token no Google; se falhar, a interface orienta remover a permissão em Conta Google → conexões com terceiros. Compromissos importados permanecem na Mentra. Troca/recuperação de senha ou exclusão de conta elimina concessões locais; para remover a autorização mantida pelo Google, use também as conexões da Conta Google. A sessão que iniciou o fluxo também precisa continuar válida na gravação final; logout concorrente impede concluir a autorização. Uma resposta que chegue após a desconexão não recria a conexão nem conclui a consulta.

Hosts do Google fixos, redirects de rede recusados, timeout de doze segundos, respostas limitadas a 1,5 MB e trinta operações por quinze minutos/conta. A desconexão continua disponível acima desse limite. Paginação ou volume além do suportado pede redução do intervalo, sem importar uma página incompleta.

## O que o proprietário precisa disponibilizar

1. Publicação HTTPS estável na Cloudflare e migração `0009_calendar.sql` aplicada junto das anteriores (nove ao todo).
2. Projeto Google Cloud do operador com Google Calendar API habilitada, tela de consentimento configurada e cliente OAuth do tipo aplicação Web. Atender às exigências de teste/verificação/publicação que o Google apresentar para a aplicação e o escopo utilizado.
3. Configurar no Worker `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` e `GOOGLE_CALENDAR_REDIRECT_URI`. O retorno deve ser exatamente `https://SEU-DOMINIO/calendar-callback`, também cadastrado nas URIs autorizadas do cliente Google. Ele deve usar a mesma origem da Mentra.
4. Cadastrar `CALENDAR_ENCRYPTION_KEY` como secret do Worker. A chave já foi gerada no arquivo privado `.dev.vars.calendar`; não precisa criar outra nem enviar seu valor no chat. Guarde cópia privada com o procedimento de recuperação. Perder/trocar a chave exige reconectar os calendários existentes.
5. Autorizar uma conta de teste no navegador externo suportado pelo Google e homologar retorno, escopo negado, consulta, cancelamento, atualização, desconexão, falha, senha e isolamento entre duas contas. Navegadores internos podem ser recusados pelo Google; usar Chrome, Edge ou Safari para o fluxo real.

O escopo solicitado é `https://www.googleapis.com/auth/calendar.readonly`. O conector consulta apenas `primary`, embora o consentimento do Google permita a leitura de calendários. A Mentra não solicita permissão de escrita. `npm run readiness` verifica a presença/formato da configuração sem exibir valores, autenticar ou comprovar credenciais reais.

Referências oficiais consultadas: [OAuth para aplicações Web](https://developers.google.com/identity/protocols/oauth2/web-server), [listagem de eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). A homologação real deve conferir o contrato e as condições da aplicação do proprietário.
