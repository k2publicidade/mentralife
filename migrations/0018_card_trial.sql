-- Teste grátis de 30 dias com cartão de crédito vinculado e renovação automática (Six7Pay).
-- O número do cartão nunca é guardado: a Six7Pay devolve um token na verificação de R$ 1,00 (estornada).

-- Renovação automática na assinatura.
ALTER TABLE subscriptions ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0 CHECK(auto_renew IN (0,1));
ALTER TABLE subscriptions ADD COLUMN renewal_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN renewal_next_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN renewal_error TEXT;

-- Pedidos pagos por cartão usam a mesma tabela do PIX (estorno, arrependimento, retenção e /admin).
ALTER TABLE six7pay_orders ADD COLUMN method TEXT NOT NULL DEFAULT 'pix' CHECK(method IN ('pix','card'));

-- Cartão da conta: só o token da Six7Pay e o necessário para cobrar e mostrar ("Visa •••• 1234").
CREATE TABLE payment_methods(
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL,
 brand TEXT,
 last4 TEXT NOT NULL CHECK(length(last4)=4),
 exp_month INTEGER NOT NULL CHECK(exp_month BETWEEN 1 AND 12),
 exp_year INTEGER NOT NULL,
 holder_name TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 client TEXT NOT NULL CHECK(json_valid(client)),
 authorized_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);

-- Verificação do cartão: cobrança de R$ 1,00 com criação do token, estornada em seguida.
CREATE TABLE card_verifications(
 id TEXT PRIMARY KEY,
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 amount INTEGER NOT NULL CHECK(amount > 0),
 status TEXT NOT NULL CHECK(status IN ('creating','unknown','approved','reversed','reversal_pending','failed')),
 transaction_id TEXT UNIQUE,
 detail TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX card_verifications_open ON card_verifications(status,updated_at);

-- Um teste grátis por cartão e por CPF. Guarda só HMACs (sem dado legível) e sobrevive à exclusão
-- da conta, para impedir testes repetidos; o cron apaga depois de 2 anos.
CREATE TABLE trial_claims(
 key TEXT PRIMARY KEY,
 created_at INTEGER NOT NULL
);
