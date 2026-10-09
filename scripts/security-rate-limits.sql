-- Apply before deploying the counter; no production migration is executed here.
CREATE TABLE IF NOT EXISTS tollbooth_security_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL CHECK(count>0),reset_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS tollbooth_security_rate_limits_expiry ON tollbooth_security_rate_limits(reset_at);
