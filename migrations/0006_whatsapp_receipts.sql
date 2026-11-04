CREATE TABLE whatsapp_control_receipts(event_hash TEXT PRIMARY KEY,claim TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX whatsapp_receipts_age ON whatsapp_control_receipts(created_at);
