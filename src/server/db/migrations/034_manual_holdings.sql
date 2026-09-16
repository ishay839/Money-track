-- Manually tracked assets and liabilities.
--
-- Some of the biggest numbers in a household balance sheet cannot be scraped:
-- a property has no API, and no Israeli bank scraper exposes a mortgage
-- balance (checked - there is no mortgage support anywhere in
-- israeli-bank-scrapers). Both change slowly and predictably, so a figure the
-- user updates every few months is more honest than a fragile scraper.
--
-- Kept separate from balance_snapshots because that table is a log of what a
-- machine observed at a point in time, whereas these are values a person
-- asserts and then revises. Mixing them would make "last synced" meaningless.
CREATE TABLE manual_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- asset increases net worth, liability reduces it.
  side TEXT NOT NULL CHECK(side IN ('asset','liability')),
  -- Free-form grouping for the balance sheet ("נדל\"ן", "הלוואות", "רכב").
  category TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  note TEXT,
  -- The date the figure was accurate at, which is not the row's edit time: a
  -- mortgage statement read today may be dated to the start of the month.
  as_of TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_manual_holdings_workspace
  ON manual_holdings(workspace_id, side);

-- Every revision is kept, so a property's appreciation and a mortgage's
-- amortisation both become a trend rather than a single overwritten number.
CREATE TABLE manual_holding_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holding_id INTEGER NOT NULL REFERENCES manual_holdings(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  as_of TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_manual_holding_history
  ON manual_holding_history(holding_id, as_of);
