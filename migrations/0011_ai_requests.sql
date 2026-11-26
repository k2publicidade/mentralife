-- Receipts survive state edits and retries; never store audio bytes or credentials.
CREATE TABLE ai_requests (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 claim_token TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 result TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
