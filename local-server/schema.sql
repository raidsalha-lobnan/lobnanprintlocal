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
  actor_id text,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,command_id)
);
-- Compatible with already-created tables from earlier local PostgreSQL builds.
ALTER TABLE sync_commands ADD COLUMN IF NOT EXISTS actor_id text;
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

-- New individually authenticated accounts, independent of legacy Firebase records.
-- No plaintext passwords or browser-shared device credentials belong here.
CREATE TABLE IF NOT EXISTS sync_auth_users (
  workspace text NOT NULL,
  user_id text NOT NULL,
  username_normalized text NOT NULL,
  email_normalized text,
  display_name text NOT NULL DEFAULT '',
  role_id text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('active','inactive')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,user_id),
  UNIQUE(workspace,username_normalized)
);
CREATE UNIQUE INDEX IF NOT EXISTS sync_auth_users_email_unique
  ON sync_auth_users(workspace,email_normalized) WHERE email_normalized IS NOT NULL;
CREATE TABLE IF NOT EXISTS sync_auth_sessions (
  workspace text NOT NULL,
  session_hash text NOT NULL,
  user_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,session_hash),
  FOREIGN KEY(workspace,user_id) REFERENCES sync_auth_users(workspace,user_id)
);
CREATE INDEX IF NOT EXISTS sync_auth_sessions_expiry_idx ON sync_auth_sessions(expires_at);

-- Transactionally queued, post-commit Telegram confirmations.
-- This is NOT a separate database; it is an outbox table in lobnan_main.
CREATE TABLE IF NOT EXISTS sync_telegram_outbox (
 workspace text NOT NULL REFERENCES sync_workspaces(id),
 command_id text NOT NULL,
 changes jsonb NOT NULL,
 committed_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 next_part integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 last_error text,
 PRIMARY KEY(workspace,command_id)
);
CREATE INDEX IF NOT EXISTS sync_telegram_outbox_pending_idx
 ON sync_telegram_outbox(workspace,next_attempt_at)
 WHERE delivered_at IS NULL;

ALTER TABLE sync_telegram_outbox ADD COLUMN IF NOT EXISTS next_part integer NOT NULL DEFAULT 0;
-- Idempotent financial invoice amendments; receipt and audit linkage remain in the SAME PostgreSQL transaction.
CREATE TABLE IF NOT EXISTS sync_invoice_revision_requests (
 workspace text NOT NULL REFERENCES sync_workspaces(id),
 request_id text NOT NULL,
 invoice_id text NOT NULL,
 request_fingerprint text NOT NULL,
 actor_id text,
 receipt jsonb NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace,request_id)
);
CREATE INDEX IF NOT EXISTS sync_invoice_revision_invoice_idx ON sync_invoice_revision_requests(workspace,invoice_id);


-- Public Telegram bot subscriptions: explicitly started chats receive future
-- PostgreSQL-committed transaction notifications, without a one-chat limit.
CREATE TABLE IF NOT EXISTS sync_telegram_subscribers (
 workspace text NOT NULL REFERENCES sync_workspaces(id),
 chat_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 subscribed_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace,chat_id)
);

-- One central Telegram long-poller prevents browsers from racing getUpdates.
CREATE TABLE IF NOT EXISTS sync_telegram_bot_offsets (
 workspace text NOT NULL REFERENCES sync_workspaces(id),
 bot_id text NOT NULL,
 last_update_id bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(workspace,bot_id)
);

-- Incoming report requests remain durable until one connected app instance
-- acknowledges processing them. The bot need not expose PostgreSQL credentials.
CREATE TABLE IF NOT EXISTS sync_telegram_inbox (
 workspace text NOT NULL REFERENCES sync_workspaces(id),
 update_id bigint NOT NULL,
 payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 claim_token text,
 claimed_until timestamptz,
 processed_at timestamptz,
 PRIMARY KEY(workspace,update_id)
);
CREATE INDEX IF NOT EXISTS sync_telegram_inbox_pending_idx
 ON sync_telegram_inbox(workspace,received_at)
 WHERE processed_at IS NULL;

-- Per-recipient delivery checkpoints ensure a failed Telegram user does not
-- block other subscribers or cause a completed multipart message to repeat.
CREATE TABLE IF NOT EXISTS sync_telegram_recipients (
 workspace text NOT NULL,
 command_id text NOT NULL,
 chat_id text NOT NULL,
 next_part integer NOT NULL DEFAULT 0 CHECK(next_part>=0),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 last_error text,
 PRIMARY KEY(workspace,command_id,chat_id),
 FOREIGN KEY(workspace,command_id) REFERENCES sync_telegram_outbox(workspace,command_id)
);
CREATE INDEX IF NOT EXISTS sync_telegram_recipients_pending_idx
 ON sync_telegram_recipients(workspace,next_attempt_at)
 WHERE delivered_at IS NULL;
