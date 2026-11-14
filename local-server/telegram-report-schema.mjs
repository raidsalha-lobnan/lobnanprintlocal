export async function ensureTelegramReportSchema(pool){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS sync_telegram_report_sessions (
  workspace text NOT NULL REFERENCES sync_workspaces(id),
  chat_id text NOT NULL,
  telegram_user_id text NOT NULL,
  category text NOT NULL,
  party_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,chat_id)
 );
 CREATE INDEX IF NOT EXISTS sync_telegram_report_sessions_owner_idx
  ON sync_telegram_report_sessions(workspace,telegram_user_id,updated_at);
 `);
}
