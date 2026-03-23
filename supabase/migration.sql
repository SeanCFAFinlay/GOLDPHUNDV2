-- ============================================================
-- PHUND.CA — Database Schema
-- Run in Supabase: Dashboard > SQL Editor > New Query > Paste > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS phund_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phund_signals (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL DEFAULT 'XAUUSD',
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sig_ts ON phund_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sig_sym ON phund_signals (symbol);

CREATE TABLE IF NOT EXISTS phund_alerts (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL DEFAULT 'XAUUSD',
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alt_ts ON phund_alerts (created_at DESC);

CREATE TABLE IF NOT EXISTS phund_trades (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL DEFAULT 'XAUUSD',
  order_id TEXT,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trd_ts ON phund_trades (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trd_oid ON phund_trades (order_id);

CREATE TABLE IF NOT EXISTS phund_audit (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  action TEXT,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aud_ts ON phund_audit (created_at DESC);

-- RLS policies (service role bypasses these)
ALTER TABLE phund_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE phund_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE phund_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE phund_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE phund_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='phund_state' AND policyname='svc_full') THEN
    CREATE POLICY svc_full ON phund_state FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='phund_signals' AND policyname='svc_full') THEN
    CREATE POLICY svc_full ON phund_signals FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='phund_alerts' AND policyname='svc_full') THEN
    CREATE POLICY svc_full ON phund_alerts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='phund_trades' AND policyname='svc_full') THEN
    CREATE POLICY svc_full ON phund_trades FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='phund_audit' AND policyname='svc_full') THEN
    CREATE POLICY svc_full ON phund_audit FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
