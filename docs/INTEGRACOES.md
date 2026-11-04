# WhatsApp, áudio e push — implementação de 29/10/2026

## O que foi implementado

O Worker possui os conectores e as filas reais. A versão local sem credenciais não simula uma conexão ativa: a interface informa a configuração pendente. Os testes substituem os provedores em memória, mas percorrem autenticação, SQL, assinatura de webhook, transcrição, criptografia e estados da fila. Entrega externa e qualidade de voz precisam ser homologadas depois da ativação das contas do operador.

### WhatsApp Cloud API

- `/api/whatsapp/webhook`: verificação GET por token e desafio; POST verificado com HMAC SHA-256 sobre os bytes originais, sem depender da origem do navegador. Apenas o phone_number_id configurado é aceito.
- O usuário ativo gera, com consentimento, um código de 128 bits válido por dez minutos. Só seu hash fica no D1. Ao enviar `VINCULAR <código>` ao número empresarial, o remetente fica vinculado à conta. Uma conta/número não toma o vínculo de outra.
- Mensagens com timestamp ausente, futuro além de cinco minutos ou anterior a sete dias são ignoradas. Mensagens anteriores ao vínculo também não entram. Repetições usam o identificador da mensagem; os comandos de vínculo/opt-out têm recibo próprio, transacional, para um PARAR antigo não desfazer um vínculo novo.
- Texto entra numa caixa separada do estado da conta. Áudio, PDF, PNG e JPEG são processados pelo cron, com lease e até três tentativas. A assinatura e o vínculo são conferidos novamente antes de guardar o resultado.
- URLs de mídia são obtidas pela Graph API; apenas destinos HTTPS de CDN autorizados são aceitos, sem redirecionamentos. Conteúdo, tamanho e hash disponível são verificados. O token não é enviado para URLs fornecidas livremente.
- A caixa tem até 100 pendências e 5 MB de mídias preparadas; documentos individuais mantêm o limite de 500 KB. Sob lotação, o webhook devolve erro para permitir retentativa; mídia que não cabe fica com erro visível, sem declarar que o original foi guardado. Texto acima de 20.000 caracteres é recusado. Lotes acima de 50 mensagens por change ou 100 por requisição são rejeitados antes de processar, sem responder sucesso parcial.
- A pessoa revisa até 600 caracteres para criar uma sugestão, preservando o texto original. Mídia é importada na biblioteca privada. O ACK só limpa a pendência depois que o servidor confirma a presença de sourceInboxId no estado salvo; falhas e repetição não duplicam a importação.
- `PARAR`, `SAIR` ou `STOP` desfazem o vínculo e limpam as pendências ainda não importadas. Registros já guardados permanecem na conta. A desvinculação também está disponível no painel, com confirmação cancelável. Também há descarte individual confirmado de pendências, inclusive falhas, para liberar a caixa sem desfazer o vínculo. Tombstones impedem replay e processamento atrasado não ressuscita mídia descartada.
- O conector recebe capturas. Não envia publicidade, modelos proativos nem respostas automáticas de chat pelo WhatsApp. Portanto não há alegação de janela/modelos de saída homologados ou de aprovação do caso de uso na Meta.

### Transcrição de áudio

- `/api/audio/transcribe`: autenticação, origem, assinatura ativa e consentimento na interface; recebe WAV, OGG, WebM, MP3, M4A/AAC, conferindo tipo e assinatura binária. Até 2 MB por arquivo.
- Integração nativa `env.AI.run('@cf/openai/whisper', {audio: [...]})`, sem usar chave do DeepSeek nem outra chave OpenAI.
- Até vinte áudios distintos por conta/dia UTC, com reserva atômica da cota. Hash por conta permite reutilizar transcrições já prontas sem nova inferência. Lease evita processamento concorrente do mesmo áudio; há até três tentativas efetivas, reserva diária distinta por hash/dia no SQL e limite de duas inferências em andamento por isolate para limitar alocação de arrays grandes. Encontrar o serviço ocupado ou a cota cheia não consome tentativa. Um arquivo recusado por cota pode ser enviado no dia seguinte; retentativa de falha em outro dia reserva cota nesse novo dia. Cache pronto não consome outra inferência. Respostas antigas não sobrescrevem nova reserva; timeout mantém a capacidade ocupada enquanto a inferência subjacente ainda está em execução.
- Falha, indisponibilidade, vazio e timeout não criam lançamento nem uma transcrição fictícia. O arquivo original não é persistido pelo aplicativo; somente resultado e hash ficam disponíveis no processamento por até trinta dias. O provedor tem suas próprias condições de tratamento de dados, a aprovar pelo operador.
- A transcrição exige revisão. Texto pode conter erros; data/valor/horário ainda passam pela revisão da captura. Não há gravação de microfone nesta versão: a entrada é por arquivo ou áudio recebido no WhatsApp.

### Push e scheduler

- Service worker próprio em `/push-sw.js`, registrado ao ativar o dispositivo; permissão pedida exclusivamente após o toque da pessoa. Não há pedido de permissão ao abrir a página ou salvar preferências desligadas.
- Subscriptions são privadas da conta, com validação de chave P-256, auth e destino HTTPS conhecido dos serviços push. Até dez dispositivos por conta, com limite e proprietário protegidos no próprio SQL contra concorrência; vínculo a outra conta é recusado. A API informa elegibilidade e contagem atual. A interface não solicita permissão se a assinatura já é conhecida como inativa. Sair pelo aplicativo revoga o dispositivo atual; troca/recuperação de senha revogam todos os endpoints da conta.
- Fila para tarefas com prazo, compromissos da agenda e Momentos. Nada é gerado para doses/medicamentos. O fuso do envio e o intervalo silencioso são configuráveis. Compromissos preservam seu próprio fuso; tarefas e silêncio usam o fuso escolhido nos avisos.
- Datas inexistentes por DST não são inventadas. Em horário ambíguo, usa-se a primeira ocorrência. Avisos durante o silêncio são suprimidos, sem reposicionar um compromisso já passado.
- O cron executa a cada minuto. Reconciliação após salvar e reconstrução periódica dos próximos dias de Momentos mantêm a fila. Até 1.000 lembretes por conta; a ativação recusa uma configuração acima do limite. Grandes volumes ainda exigem ensaio de carga.
- Antes de enviar, a fila relê o estado, as preferências, a assinatura e o dispositivo. Conclusão de tarefa, cancelamento, pausa, opt-out e exclusão impedem envios ainda não iniciados. Uma chamada já iniciada ou aceita pelo serviço não pode ser recolhida.
- Web Push usa AES-128-GCM e VAPID via biblioteca compatível com Workers. Banner genérico: nenhum título de tarefa, dado de saúde ou texto motivacional é incluído. O clique abre apenas rotas internas permitidas.
- Entregas por dispositivo têm lease, até cinco tentativas e backoff para 429/5xx/falha transitória e respeito ao Retry-After (segundos ou data HTTP). O silêncio é reavaliado imediatamente antes de iniciar a chamada; retentativa que cair no silêncio é suprimida. 404/410 revogam o endpoint. Aceite 2xx é gravado como `accepted`, sem alegar leitura/entrega. Diante de perda da resposta, o transporte pode repetir; tag estável substitui o mesmo aviso no dispositivo. Não é garantia de exatamente uma entrega.
- Avisos mais de uma hora atrasados expiram. Silêncio/Focus, falta de conexão e suporte do navegador/aparelho afetam a entrega. Não há promessa de horário exato, som ou narração no banner.

## Configuração já preparada

- `migrations/0005_integrations.sql`, `0006_whatsapp_receipts.sql` e `0007_audio_claims.sql`, aplicadas e testadas no D1 local (sete migrações no total).
- `wrangler.production.example.jsonc` com Workers AI, D1, assets e cron; dry-run de compilação passou sem publicar.
- Chaves VAPID e token WHATSAPP_VERIFY_TOKEN gerados em `.dev.vars.push`, arquivo privado excluído do Git/pacote. Não foram exibidos nem enviados a serviços. Não rode novamente `push:keys` sobre esse arquivo: o script recusa sobrescrita.
- Secrets esperados: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`. Versão Graph deve ser explícita e aceita pela aplicação Meta; não foi inventado um valor de produção.
- Binding Workers AI `AI` presente no exemplo de produção, ausente de propósito no dev offline. Ativação/custos dependem da conta Cloudflare real.
- DeepSeek e gateway não foram configurados.

## Publicação, sem expor segredos

1. Autenticar a Cloudflare do proprietário e preparar staging, D1 real, domínio/HTTPS e a conta administrativa. Copiar o exemplo para `wrangler.production.jsonc`, trocar o ID placeholder e conferir o nome do banco alvo.
2. Aplicar as sete migrações no banco novo, antes de publicar o Worker que as usa: `npm run db:production`.
3. Cadastrar os secrets no Worker. O Wrangler instalado aceita `wrangler secret bulk .dev.vars.push --config wrangler.production.jsonc` para o arquivo privado preparado. Os demais valores devem ser cadastrados com `wrangler secret put NOME --config wrangler.production.jsonc`, sem colá-los em mensagens, código ou logs. Nunca adicionar esse arquivo ao dist.
4. Fornecer VAPID_SUBJECT real (mailto de contato ou HTTPS do operador) e os dados Meta da conta empresarial, conforme DEPENDE-DO-OPERADOR.md. Vincular o webhook HTTPS e assinar o campo messages no painel Meta.
5. Habilitar Workers AI na conta, conferir permissões e publicar com `npm run deploy:production`. Homologar transcrição e mídia com arquivos sintéticos e só depois usar dados reais.
6. Em aparelho compatível, permitir notificações, ativar o dispositivo e salvar os tipos/horários de lembrete. Conferir eventos na fila, cancelamento, silêncio e entrega com app fechado. Isso não pode ser certificado somente por testes locais.
7. Só depois dessas homologações, configurar DeepSeek e, por último, escolher/integrar o gateway.

## Operação e retenção

Os conectores têm tabelas próprias com cascata de exclusão da conta. Exportação inclui vínculo, pendências, transcrições, preferências e metadados dos dispositivos; não exporta tokens Meta, chave VAPID privada nem material auth dos endpoints. Importação de organização não restaura permissões, dispositivos ou vínculos externos.

O cron remove resultados de áudio, pendências/recibos e jobs antigos após trinta dias. Dados já importados seguem a conta e sua política de lixeira/exclusão. Essa é a retenção técnica atual; o operador ainda precisa aprovar política publicada, backups e incidentes. Backups da hospedagem não são expurgados pelo botão do aplicativo.

## Fontes técnicas consultadas

- [Webhook do SDK oficial WhatsApp (referência arquivada)](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/blob/main/website/docs/api-reference/webhooks/start.md) — desafio e HMAC. A documentação Meta atual retornou 429 nesta consulta; aprovação comercial e condições atuais devem ser conferidas no painel do proprietário.
- [Coleção oficial Meta — retrieve media URL](https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url).
- [Cloudflare Workers AI — Whisper](https://developers.cloudflare.com/workers-ai/models/whisper/).
- [Webcrypto Web Push — biblioteca e protocolo](https://github.com/block65/webcrypto-web-push/blob/master/packages/web-push/README.md).

O desenvolvimento/testes usa Node.js 24. A compilação do Worker não depende de node:sqlite; esse módulo aparece apenas nos adaptadores de teste.

## Fechamento desta rodada

- Manifest instalável e instruções em Lembretes. No iPhone/iPad, instalar pela Tela de Início e ativar pelo gesto da pessoa; a versão/aparelho ainda precisa de homologação real.
- GET /api/health responde 200 quando as tabelas/coluna necessárias estão disponíveis e 503 para banco/schema incompleto; não expõe dados de conta nem certifica Meta, áudio ou entrega push. O exemplo de produção prepara logs genéricos com query strings redigidas e invocation_logs=false.
- npm run readiness verifica configuração de produção, ID D1, binding/cron, nomes/formato dos secrets Meta, contato e correspondência criptográfica do par VAPID. Pode receber --config e --secrets (arquivo .dev.vars ou JSON); a configuração usa o formato JSON compatível do exemplo. Nenhum valor secreto é exibido. Código 1 significa configuração incompleta, não falha dos testes. A validação é local e não instala secrets nem valida credenciais no provedor.
- O resultado atual confirmou par VAPID e token de verificação preparados. Falta arquivo de produção com D1 real, ativação/conta Cloudflare, credenciais Meta/versão/ID do número e VAPID_SUBJECT. Wrangler whoami confirmou falta de autenticação.
- A suíte final e a compilação estão registradas em QA.md e RELATORIO-INTEGRACOES-2026-10-29.md. Não houve deploy, permissão de notificações, microfone ou transcrição em provedor real.

Fontes complementares: [Web Push da Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html).
