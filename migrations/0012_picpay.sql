CREATE TABLE picpay_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('essencial','plus','premium')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  expires_at INTEGER NOT NULL,
  link_id TEXT UNIQUE,
  checkout_url TEXT,
  paid_at INTEGER
);
CREATE INDEX picpay_orders_user ON picpay_orders(user_id, expires_at);
