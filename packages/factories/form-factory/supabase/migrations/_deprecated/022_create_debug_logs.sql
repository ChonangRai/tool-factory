-- migrations/022_create_debug_logs.sql
CREATE TABLE IF NOT EXISTS debug_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  step TEXT NOT NULL,
  details TEXT
);
