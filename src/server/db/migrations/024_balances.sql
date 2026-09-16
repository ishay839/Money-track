CREATE TABLE balance_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  last_success TEXT,
  last_error TEXT
);
CREATE INDEX balance_connection_workspace ON balance_connections(workspace_id);
CREATE TABLE balance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES balance_connections(id) ON DELETE CASCADE,
  batch TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  account_key TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  UNIQUE(connection_id, batch, account_key)
);
CREATE INDEX balance_snapshot_latest ON balance_snapshots(connection_id, observed_at);
CREATE TABLE balance_account_kinds (
  connection_id INTEGER NOT NULL REFERENCES balance_connections(id) ON DELETE CASCADE,
  account_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('investment','pension','provident','study','insurance','unknown')),
  PRIMARY KEY(connection_id, account_key)
);
