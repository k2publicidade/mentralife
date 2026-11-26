-- Aceite dos Termos, consentimentos LGPD, arrependimento (CDC art. 49), retenção de pagamentos
-- após a exclusão da conta e registros de acesso (Marco Civil, art. 15).
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
ALTER TABLE users ADD COLUMN ai_consent_at INTEGER;
ALTER TABLE users ADD COLUMN health_consent_at INTEGER;
ALTER TABLE six7pay_orders ADD COLUMN terms_version TEXT;

CREATE TABLE consent_log(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('terms','ai','health')),
 granted INTEGER NOT NULL CHECK(granted IN (0,1)),
 version TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX consent_log_user ON consent_log(user_id,created_at);

-- Pedido de arrependimento. Sem FK no pedido: ele precisa sobreviver à exclusão da conta.
CREATE TABLE withdrawal_requests(
 id TEXT PRIMARY KEY,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 order_id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount > 0),
 requested_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('requested','refunded')),
 resolved_at INTEGER,
 detail TEXT
);

-- Registros de pagamento guardados após a exclusão da conta (obrigação fiscal), apagados em delete_after.
CREATE TABLE retained_payments(
 id TEXT PRIMARY KEY,
 former_user_id TEXT NOT NULL,
 name TEXT,
 email TEXT,
 source TEXT NOT NULL CHECK(source IN ('six7pay_order','payment_event')),
 record TEXT NOT NULL CHECK(json_valid(record)),
 occurred_at INTEGER NOT NULL,
 retained_at INTEGER NOT NULL,
 delete_after INTEGER NOT NULL
);
CREATE INDEX retained_payments_expiry ON retained_payments(delete_after);

-- Registros de acesso a aplicação: IP, data e hora, por 6 meses. Sem FK para sobreviver à exclusão.
CREATE TABLE access_log(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('register','login','recover')),
 ip TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX access_log_created ON access_log(created_at);
