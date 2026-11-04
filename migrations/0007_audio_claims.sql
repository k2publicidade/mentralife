ALTER TABLE audio_requests ADD COLUMN claim_token TEXT;
CREATE TABLE audio_daily_claims(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 audio_hash TEXT NOT NULL,
 day TEXT NOT NULL,
 PRIMARY KEY(user_id,audio_hash,day)
);
CREATE INDEX audio_daily_retention ON audio_daily_claims(day);
CREATE TRIGGER audio_daily_limit BEFORE INSERT ON audio_daily_claims
BEGIN
 SELECT CASE WHEN COALESCE((SELECT requests FROM transcription_usage WHERE user_id=NEW.user_id AND day=NEW.day),0)>=20
 THEN RAISE(ABORT,'audio_daily_limit') END;
END;
CREATE TRIGGER audio_daily_usage AFTER INSERT ON audio_daily_claims
BEGIN
 INSERT INTO transcription_usage(user_id,day,requests) VALUES(NEW.user_id,NEW.day,1)
 ON CONFLICT(user_id,day) DO UPDATE SET requests=requests+1;
END;
