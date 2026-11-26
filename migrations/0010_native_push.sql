CREATE TABLE native_push_devices (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('android','ios')),
 token TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(platform,token)
);
CREATE INDEX native_push_devices_user ON native_push_devices(user_id);
CREATE TABLE native_push_deliveries (
 job_id TEXT NOT NULL REFERENCES reminder_jobs(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES native_push_devices(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 last_status INTEGER,
 PRIMARY KEY(job_id,device_id)
);
