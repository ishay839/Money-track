-- Current-account balances from the bank scrapers.
--
-- The bank sync already fetches a balance for every account (Hapoalim from a
-- dedicated endpoint, Beinleumi off the account page) and then threw it away.
-- These balances belong beside the investment and pension figures, so they are
-- stored in the same balance_snapshots table rather than a parallel one.
--
-- Two changes are needed:
--  1. 'checking' joins the allowed account kinds.
--  2. balance_connections gains a nullable bank_provider. A row with it set is
--     owned by the bank sync (created and refreshed automatically); a row with
--     it NULL is a user-created portal connection exactly as before.

ALTER TABLE balance_connections ADD COLUMN bank_provider TEXT;

CREATE UNIQUE INDEX idx_balance_connections_bank
  ON balance_connections(workspace_id, bank_provider)
  WHERE bank_provider IS NOT NULL;

-- SQLite cannot alter a CHECK constraint in place, so the kinds table is
-- rebuilt with 'checking' added.
CREATE TABLE balance_account_kinds_new (
  connection_id INTEGER NOT NULL REFERENCES balance_connections(id) ON DELETE CASCADE,
  account_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('checking','investment','pension','provident','study','insurance','unknown')),
  PRIMARY KEY(connection_id, account_key)
);
INSERT INTO balance_account_kinds_new (connection_id, account_key, kind)
  SELECT connection_id, account_key, kind FROM balance_account_kinds;
DROP TABLE balance_account_kinds;
ALTER TABLE balance_account_kinds_new RENAME TO balance_account_kinds;
