CREATE TABLE six7pay_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('essencial','plus','premium')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','pending','unknown','paid','canceled','failed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  transaction_id TEXT UNIQUE,
  pix_code TEXT,
  qr_image TEXT,
  checked_at INTEGER,
  paid_at INTEGER
);
CREATE INDEX six7pay_orders_user ON six7pay_orders(user_id, created_at);
CREATE INDEX six7pay_orders_open ON six7pay_orders(status, checked_at);
