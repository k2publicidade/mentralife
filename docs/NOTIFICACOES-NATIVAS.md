# Notificações Android e iOS

O app usa Firebase Cloud Messaging HTTP v1 no Android e APNs com chave P-256 no iOS. A implementação reaproveita os lembretes de agenda, tarefas e Momentos, com validação da assinatura, silêncio, cancelamento, repetição e recuperação de falha. O texto no banner é sempre genérico. Nenhuma informação de saúde, título de tarefa, valor financeiro ou conteúdo de documento é enviada.

O código pode ser testado localmente com provedores simulados. A entrega real ainda depende da configuração abaixo e de testes em aparelhos; não foi homologada com credenciais reais.

## Backend

1. Aplicar `migrations/0010_native_push.sql` no banco de staging antes de publicar o Worker atualizado. Usar a configuração do alvo correto. A nova verificação de saúde exige as tabelas `native_push_devices` e `native_push_deliveries`.
2. Manter o cron de um minuto. Ele executa Web Push e notificações nativas em filas separadas, sem substituir as assinaturas web existentes.
3. Cadastrar credenciais exclusivamente como secrets do Worker. O serviço não consulta arquivos de credenciais públicos nem aceita endereços de provedor enviados pelo aparelho.

Android: `FCM_SERVICE_ACCOUNT` contém o JSON completo da conta de serviço do projeto Firebase, com permissão para enviar mensagens pelo FCM. O backend gera JWT RS256 e troca por um token OAuth de curta duração. Não copie esse JSON para o app.

iOS: cadastrar `APNS_PRIVATE_KEY` com o conteúdo PEM da chave `.p8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` e `APNS_ENVIRONMENT`. O tópico deve corresponder ao bundle identifier (`app.mentralife.mobile`, se mantido). O ambiente aceita `sandbox` ou `production`; o backend só envia para os hosts oficiais correspondentes. A chave é usada no servidor para gerar JWT ES256 e não entra no pacote mobile.

Use backend e credenciais separados para staging e produção. O projeto iOS declara `development` no Debug e `production` no Release; os tokens desses ambientes não são intercambiáveis. A configuração APNs do backend deve corresponder ao binário testado.

## Android

- Cadastrar o aplicativo com o mesmo `applicationId` do Gradle no Firebase.
- Baixar o arquivo cliente `google-services.json` e colocá-lo em `android/app/google-services.json`. O build confere o package name; sem esse arquivo, o app não tenta ativar o SDK de registro nem pede uma permissão que não conseguirá usar. Esse arquivo é ignorado pelo Git; ele é distinto da conta de serviço privada do backend.
- Executar `npm run mobile:sync` e compilar com JDK 21 e Android SDK 36. O app exige Android 8/API 26 ou superior; o transporte binário utilizado pelo Capacitor depende dessa versão.
- O plugin e suas dependências fornecem o serviço FCM. O manifesto desabilita a inicialização automática de mensagens; o app só chama o registro depois da ação do usuário. Android 13 ou superior também solicita a permissão de notificações.
- O canal `mentra-reminders` usa o ícone monocromático próprio. A permissão do sistema e as preferências da conta são controles separados.

## iOS

- Abrir o projeto no Xcode, selecionar sua equipe e habilitar a capacidade Push Notifications para o App ID e o perfil de assinatura.
- O projeto inclui `App.entitlements` e os callbacks de registro no `AppDelegate`. Confirmar que o perfil assinado contém o entitlement correspondente ao ambiente.
- Executar `npm ci` e `npm run mobile:sync` no Mac antes da compilação. Não é necessário instalar o SDK Firebase no iOS: o plugin retorna um token APNs e o Worker envia diretamente para a Apple.

## Consentimento, conta e operação

Em Conexões e lembretes, **Ativar neste dispositivo** pede a permissão e vincula o token à conta atual. O envio continua dependendo de **Receber lembretes da minha conta** e das preferências salvas. O token tem proprietário único; ele não é transferido silenciosamente para outra conta. O limite é de dez aparelhos nativos por conta, além dos dispositivos web.

O app renova o vínculo quando o sistema fornece outro token; a substituição ocorre em uma transação, inclusive quando o limite de aparelhos já foi alcançado. Ao sair, ele aguarda registros em andamento, remove o vínculo no servidor e limpa os avisos entregues. Uma falha do SDK depois da revogação no servidor não bloqueia o logout. Troca de senha, recuperação, exclusão da conta e quarentena de restauração também revogam os dispositivos.

O scheduler revalida conta, assinatura, preferências, estado atual do registro e horário de silêncio antes de enviar. Há até cinco tentativas com intervalo crescente para falhas transitórias. Aceitação pelo provedor não prova exibição ou leitura no aparelho. Retentativas após perda da confirmação de rede podem repetir um envio; identificadores de agrupamento reduzem duplicações visuais. Concluir ou cancelar um item impede envios ainda não iniciados, mas não recolhe uma notificação já entregue.

Ao tocar em um aviso, o app aceita somente rotas internas conhecidas de agenda, tarefas e Momentos. A abertura não executa alterações nos dados. Se houver outro usuário conectado, o aviso não navega para a conta anterior.

## Homologação necessária

Validar com contas e aparelhos de teste: autorização/negação, registro inicial, rotação de token, saída e troca de conta, abertura com o app encerrado, segundo plano, silêncio e fuso, tarefa concluída/cancelada, assinatura vencida, token revogado e falhas 429/5xx. Conferir entrega real em Android e iPhone e a ausência de conteúdo privado no banner e no payload. Verificar também a atualização do banco e os relatórios do provedor, sem imprimir tokens ou chaves.

Referências: [plugin Capacitor](https://capacitorjs.com/docs/apis/push-notifications), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [APNs](https://developer.apple.com/documentation/UserNotifications/sending-notification-requests-to-apns).
