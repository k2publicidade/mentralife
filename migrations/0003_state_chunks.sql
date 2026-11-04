CREATE TABLE user_state_chunks (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, slot INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,slot));
