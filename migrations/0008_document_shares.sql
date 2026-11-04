CREATE TABLE document_shares(
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 document_signature TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 title TEXT NOT NULL,
 filename TEXT NOT NULL,
 mime TEXT NOT NULL,
 file_size INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 CHECK(expires_at>created_at)
);
CREATE INDEX document_shares_owner ON document_shares(owner_id,created_at);
CREATE INDEX document_shares_lifecycle ON document_shares(owner_id,document_id,revoked_at,expires_at);
CREATE INDEX document_shares_expiry ON document_shares(expires_at);
