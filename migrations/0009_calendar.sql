CREATE TABLE calendar_oauth (
 state_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL,
 verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 claimed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX calendar_oauth_user ON calendar_oauth(user_id);
CREATE TABLE calendar_connections (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL UNIQUE,
 credentials TEXT NOT NULL,
 connected_at INTEGER NOT NULL
);
