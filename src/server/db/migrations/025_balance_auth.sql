CREATE TABLE balance_auth (
  connection_id INTEGER PRIMARY KEY REFERENCES balance_connections(id) ON DELETE CASCADE,
  encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL
);
ALTER TABLE balance_connections ADD COLUMN last_attempt TEXT;
