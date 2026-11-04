CREATE TABLE product_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK(json_valid(value)),
  updated_at INTEGER NOT NULL
);
