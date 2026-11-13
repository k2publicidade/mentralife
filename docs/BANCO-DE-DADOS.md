# Banco de dados e isolamento por conta

Atualizado em 12/11/2026 (auditoria antes da fase de testes). Banco: Cloudflare D1 (SQLite), acessado só pelo Worker (`server/worker.mjs`). O navegador e a Vercel nunca falam com o banco diretamente.

## Regra central

**Toda leitura e escrita usa o `user_id` da sessão autenticada.** A sessão vem do cookie `mentra_session` (HttpOnly), cujo hash é procurado em `sessions`. Nenhuma rota aceita o ID da conta vindo do navegador, com uma única exceção restrita a administradores (`POST /api/admin/subscription`). O teste `tests/feedback.test.mjs` confere isso: um `userId` enviado no corpo é ignorado.

## Onde ficam os dados de cada pessoa

| O quê | Tabela | Chave | Observação |
| --- | --- | --- | --- |
| Agenda, tarefas, finanças (contas, lançamentos, a pagar/receber, orçamentos), documentos, saúde, Impulso, Momentos, conversas, planilha | `user_states` (+ `user_state_chunks` quando passa do limite de linha) | `user_id` (1 linha por conta) | Documento JSON da conta, com `revision` para evitar sobrescrita entre aparelhos |
| Conta e login | `users`, `sessions` | `id` / `token_hash` | Senha com PBKDF2 + sal; sessão guarda só o hash do token |
| Plano e uso de IA | `subscriptions`, `ai_usage`, `ai_requests` | `user_id` | `ai_requests` evita duplicar ações da IA quando o pedido é reenviado |
| Integrações | `whatsapp_links`, `integration_inbox`, `calendar_connections`, `push_subscriptions`, `native_push_devices`, `reminder_settings`, `reminder_jobs`, `audio_requests` | `user_id` | Credenciais do Google ficam cifradas |
| Compartilhamento de documentos | `document_shares` | `owner_id` + `recipient_id` | Link expira e pode ser revogado |
| Feedback dos testers | `feedback` | `user_id` | Novo em 0013; só administradores leem a caixa geral |
| Pagamentos | `picpay_orders`, `payment_events` | `user_id` | `payment_events` é preservado por política de retenção |

Todas as tabelas com `user_id` usam `ON DELETE CASCADE`: excluir a conta remove os dados dela (exceto registros de pagamento, que bloqueiam a exclusão até o atendimento tratar).

## O que a IA recebe

`server/ai-context.mjs` monta o contexto **somente da conta autenticada**, por lista explícita: perfil (nome, objetivo, fuso), tarefas, agenda, lançamentos, contas a pagar/receber, orçamentos, planos do Impulso. Saúde, documentos, arquivos, caixa de entrada e credenciais **não** são enviados. Não há cache em memória compartilhado entre contas no Worker.

As mensagens de Momentos, o painel "Atenção hoje", os primeiros passos e a busca global são calculados no próprio aparelho, a partir do estado da conta aberta (`dist/insights.mjs`), sem enviar dados a terceiros.

## Desempenho e retenção (migração 0013)

- Índices novos para consultas por conta: `reminder_jobs(user_id,status)`, `document_shares(recipient_id,…)`, `audit_log(user_id,created_at)`, `feedback(user_id,created_at)`.
- Limpeza diária (cron do Worker) inclui agora `ai_requests` com mais de 30 dias, além de sessões, códigos e filas já existentes.

## Por que um documento JSON por conta

Cada conta tem exatamente uma linha em `user_states`. Isso torna o isolamento estrutural (não existe consulta que traga dados de duas pessoas juntas), permite edição sem conexão e sincronização com revisão. Se no futuro for preciso relatório entre contas ou consulta por campo no servidor, o caminho recomendado é extrair tabelas específicas (por exemplo `tasks`) mantendo a mesma regra de `user_id` da sessão.
