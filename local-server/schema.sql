-- One authoritative PostgreSQL database per server. Never put database credentials on clients.
CREATE TABLE IF NOT EXISTS sync_workspaces (
  id text PRIMARY KEY,
  next_sequence bigint NOT NULL DEFAULT 0 CHECK(next_sequence>=0),
  next_invoice bigint NOT NULL DEFAULT 0 CHECK(next_invoice>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_records (
  workspace text NOT NULL REFERENCES sync_workspaces(id),
  entity text NOT NULL,
  record_id text NOT NULL,
  version bigint NOT NULL CHECK (version>0),
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,entity,record_id)
);
CREATE TABLE IF NOT EXISTS sync_commands (
  workspace text NOT NULL REFERENCES sync_workspaces(id),
  command_id text NOT NULL,
  fingerprint text NOT NULL,
  receipt jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,command_id)
);
CREATE TABLE IF NOT EXISTS sync_events (
  workspace text NOT NULL REFERENCES sync_workspaces(id),
  sequence bigint NOT NULL CHECK(sequence>0),
  command_id text NOT NULL,
  changes jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,sequence)
);
CREATE INDEX IF NOT EXISTS sync_events_command_idx ON sync_events(workspace,command_id);
CREATE TABLE IF NOT EXISTS invoice_claims (
  workspace text NOT NULL REFERENCES sync_workspaces(id),
  invoice_number text NOT NULL,
  invoice_id text NOT NULL,
  PRIMARY KEY(workspace,invoice_number),
  UNIQUE(workspace,invoice_id)
);
