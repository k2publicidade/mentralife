-- Consultas por conta sem índice dedicado (auditoria de 12/11/2026).
CREATE INDEX IF NOT EXISTS reminder_jobs_user ON reminder_jobs(user_id,status);
CREATE INDEX IF NOT EXISTS document_shares_recipient ON document_shares(recipient_id,revoked_at,expires_at);
CREATE INDEX IF NOT EXISTS audit_log_user ON audit_log(user_id,created_at);
-- Recibos de idempotência da IA passam a ter retenção (limpeza diária no cron).
CREATE INDEX IF NOT EXISTS ai_requests_age ON ai_requests(created_at);

-- Relatos dos testers: sempre ligados à conta autenticada e apagados com ela.
CREATE TABLE IF NOT EXISTS feedback (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('sugestao','problema','elogio')),
 page TEXT NOT NULL CHECK(length(page) <= 80),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 3 AND 2000),
 status TEXT NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','lido','resolvido')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_user ON feedback(user_id,created_at);
CREATE INDEX IF NOT EXISTS feedback_inbox ON feedback(status,created_at);
