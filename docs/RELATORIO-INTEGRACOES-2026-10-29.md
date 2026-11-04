# WhatsApp, áudio e push — fechamento de 29/10/2026

## Correções desta rodada

- **WhatsApp:** descarte individual com confirmação, isolamento por conta, repetição idempotente e proteção contra replay. Cancelar a confirmação preserva a mensagem. Um download em andamento não recria um item descartado. Assinatura vencida depois de gerar o código impede o vínculo; vencimento durante download impede confirmar a mídia pronta. O consentimento do vínculo explicita a transcrição de áudios pela Cloudflare.
- **Áudio:** reserva de vinte hashes distintos por conta/dia feita no SQL por tabela e triggers da migração 0007. Serviço ocupado/cota cheia não gastam tentativa. Um arquivo recusado por cota pode ser enviado no dia seguinte. Retentativa em outro dia conta nesse dia; resultado em cache não faz nova inferência. Cada processamento tem token de posse: respostas atrasadas não sobrescrevem outra reserva. Timeout não libera a capacidade de uma inferência ainda em execução. O aplicativo continua sem armazenar o áudio original.
- **Push:** silêncio reavaliado no instante de envio, inclusive retentativas. Retry-After em segundos/data HTTP respeitado além do backoff. Disputa pelo mesmo endpoint não cria vínculo em duas contas; limite de dez dispositivos protegido no SQL. Elegibilidade/contagem retornadas pela API; conta já identificada como inativa não recebe pedido de permissão pela interface. Revogação permanece disponível após expiração.
- **Celular e operação:** manifest de instalação com ícone original, instruções iPhone/iPad/Android e atualização/ativação do service worker sem cache privado. Comando `npm run readiness` e rota `GET /api/health` preparados. Configuração de produção inclui logs genéricos, sem logs automáticos de invocação e com query strings suprimidas.

## Evidências

**369 testes passaram, zero falhas e zero ignorados**, com `MENTRA_TEST_URL=http://127.0.0.1:8787`. Os testes incluem API/SQL locais, concorrência, virada do dia, falhas de provedores substituídos em memória e receptor sintético que autentica/descriptografa o payload Web Push com ECDH/HKDF/AES-GCM.

As sete migrações estão aplicadas no D1 local. `PRAGMA quick_check` retornou `ok`, e `foreign_key_check` não retornou violações. A fixture de mensagem usada no navegador foi removida, sem alterar tarefas, documentos ou preferências da conta.

No navegador real, a confirmação de descarte foi aberta e cancelada; a mensagem permaneceu. Instruções de instalação e abas foram conferidas em desktop e 360 px, sem transbordamento horizontal e sem erros JavaScript observados. Nenhuma permissão de notificações/microfone ou transcrição em serviço externo foi solicitada. Tamanho normal restaurado ao fim. Capturas locais: `qa/integration-discard-review-2026-10-29.png`, `qa/integration-push-install-mobile-2026-10-29.png` e `qa/integration-final-desktop-2026-10-29.png`.

Compilação Wrangler de produção em **dry-run** passou com os bindings D1/AI/assets. HTTP local confirmou `/api/health` 200 e schema `integrations-v2`, manifest 200 com `application/manifest+json`, service worker 200; código compactado e handoff permanecem indisponíveis como assets públicos (404). O build final contém os fontes desta rodada e exclui `.dev.vars*`, `.env*`, D1 local, dependências instaladas e QA.

## Resultado exato de pré-publicação

Wrangler informou **ausência de autenticação Cloudflare**. Nenhum banco remoto, domínio, publicação ou serviço real foi homologado nesta rodada. O verificador local confirmou que o par VAPID preparado corresponde criptograficamente e que o token de verificação WhatsApp está presente, sem exibir valores.

O comando `npm run readiness` ainda acusa:

1. Arquivo `wrangler.production.jsonc` com ID real do D1, binding AI e cron do exemplo.
2. `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e versão explícita `WHATSAPP_GRAPH_VERSION`.
3. Contato real `VAPID_SUBJECT`.

O comando não instala secrets nem valida credenciais externas. Mesmo com resultado local OK, os itens abaixo continuam necessários.

| Ordem | Depende do proprietário | Trabalho técnico após essa liberação |
|---|---|---|
| 1. Cloudflare | Autenticar a conta que hospedará/pagará o sistema; escolher domínio/endereço e e-mail do administrador | Criar o D1 alvo, configurar produção/staging, aplicar sete migrações, cadastrar secrets, publicar HTTPS; testar login, isolamento, cookies, conflitos e saúde remotos |
| 2. Meta/WhatsApp | Aplicação/número empresarial, verificações/aprovações do caso de uso e credenciais/versão Graph acima; remetente de teste autorizado | Cadastrar webhook HTTPS `/api/whatsapp/webhook`, token já preparado e campo `messages`; homologar vínculo, texto, imagem/PDF, áudio, falha, repetição, descarte e PARAR com provedor real |
| 3. Workers AI | Habilitar/autorizar o uso e custos na conta Cloudflare | Ativar binding AI e homologar transcrição/limites/falhas com arquivos sintéticos reais; não há chave DeepSeek envolvida |
| 4. Push | Contato real para VAPID_SUBJECT, aparelhos suportados e permissão concedida por cada usuário | Instalar as chaves já preparadas no Worker e testar ativação, app fechado, silêncio, cancelamento, expiração e revogação nos aparelhos; não há promessa de horário exato |
| 5. Operação | Identificação/suporte, política de privacidade/termos e aprovação de retenção, backups e custos; destino/responsável pelos alertas | Publicar os textos aprovados, ensaiar restauração remota isolada, configurar/testar alertas de saúde, rollback, capacidade e homologação Android/iOS/acessibilidade. Logs/rota de saúde preparados não substituem esses ensaios |
| 6. Escopo adicional | Decidir a inclusão dos recursos históricos ainda não entregues, sem anunciar como prontos | Se incluídos: implementar links privados expirantes/revogáveis, calendário/bancos externos e colaboração/equipes; mentoria/saída pelo WhatsApp e distribuição em lojas também exigem integração/validação própria |
| 7. DeepSeek, penúltimo | Secret DEEPSEEK_API_KEY e modelo/custos aprovados | Homologar conversa e orientação reais, cotas e falhas. O conector já está implementado |
| 8. Gateway, último | Escolher fornecedor/conta, preços e condições dos três planos, credenciais de sandbox | Implementar o adaptador desse fornecedor e homologar checkout, webhook assinado/idempotente, ativação, renovação, alteração/cancelamento, inadimplência e estorno antes de cobrar |

As pendências não foram reduzidas artificialmente às duas chaves finais. O conector WhatsApp atual recebe capturas para revisão no aplicativo; não oferece um robô de respostas/mentoria pelo WhatsApp. A lista geral de aceite continua em `PENDENCIAS-PUBLICACAO.md`, e os detalhes do operador em `DEPENDE-DO-OPERADOR.md`.
