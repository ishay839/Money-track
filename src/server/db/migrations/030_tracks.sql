-- Tracks: a named slice of the ledger that gets its own cash flow.
--
-- Investments already did this, but only for investments: three fixed roles
-- backed by three auto-created categories. A rental property doesn't fit that
-- shape - its mortgage is not "capital", its rent is not "investment income",
-- and its categories (שכר דירה, משכנתא, ביטוח דירה) already exist and already
-- hold years of history we must not orphan.
--
-- So a track is deliberately thinner: a name and a display mode, plus a
-- membership table pointing at categories the user already has. Nothing is
-- created, nothing is moved, and removing a track leaves the ledger exactly
-- as it was. Whether a member counts as money in or money out is read from
-- the category's own `kind`, so there is no third place to keep in sync.

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#0F766E',
  -- excluded  : keep it out of the operating cash flow entirely
  -- net_income: fold one net row per month back into the cash flow
  -- included  : track it on its own page but leave the cash flow untouched
  mode TEXT NOT NULL DEFAULT 'excluded'
    CHECK(mode IN ('excluded','net_income','included')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);

-- A category belongs to at most one track: two tracks claiming the same
-- category would double-count it in the netting branch below.
CREATE TABLE track_categories (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, category_id),
  UNIQUE(workspace_id, category_id)
);

CREATE INDEX idx_track_categories_category ON track_categories(category_id);

DROP VIEW operating_transactions;
CREATE VIEW operating_transactions AS
-- 1. Everyday movements: not deleted, not an internal transfer, not claimed
--    by an investment, and not sitting in a track that asked to be removed
--    from the operating cash flow.
SELECT t.* FROM transactions t
WHERE t.deleted_at IS NULL
  AND t.kind != 'transfer' AND NOT EXISTS (
    SELECT 1 FROM investments i WHERE i.workspace_id = t.workspace_id
      AND t.category_id IN (i.capital_category_id, i.expense_category_id, i.income_category_id)
  )
  AND NOT EXISTS (
    SELECT 1 FROM track_categories tc JOIN tracks tr ON tr.id = tc.track_id
    WHERE tc.workspace_id = t.workspace_id AND tc.category_id = t.category_id
      AND tr.mode IN ('excluded','net_income')
  )

UNION ALL

-- 2. Investment net rows (unchanged).
SELECT
  -MIN(t.id), t.workspace_id, '',
  MAX(substr(t.date, 1, 10)), MAX(substr(t.date, 1, 10)),
  SUM(t.charged_amount), 'ILS', SUM(t.charged_amount), 'ILS',
  'תזרים נטו: ' || i.name, 'תקבולים פחות תשלומים ששויכו להשקעה',
  'normal', 'completed', NULL, NULL, NULL, i.income_category_id, 'user',
  'investment-net', MIN(t.sync_run_id), 'investment-net-' || i.id || '-' || substr(t.date, 1, 7),
  0, 'income', 0, MIN(t.created_at), MAX(t.updated_at), NULL, NULL, NULL, NULL, 0
FROM transactions t JOIN investments i ON i.workspace_id = t.workspace_id
  AND t.category_id IN (i.expense_category_id, i.income_category_id)
WHERE t.deleted_at IS NULL AND i.mode = 'net_income' AND t.status = 'completed'
GROUP BY i.id, t.workspace_id, substr(t.date, 1, 7)

UNION ALL

-- 3. Track net rows: one synthetic row per track per month carrying the
--    month's income minus its expenses. A profitable rental shows up as a
--    single positive line, a loss-making one as a single negative line, and
--    either way the underlying dozens of rows stay out of the everyday view.
--    id is negated and offset by 1e9 so it cannot collide with the
--    investment branch above, which also negates real transaction ids.
SELECT
  -(1000000000 + MIN(t.id)), t.workspace_id, '',
  MAX(substr(t.date, 1, 10)), MAX(substr(t.date, 1, 10)),
  SUM(CASE WHEN c.kind = 'income' THEN ABS(t.charged_amount)
           ELSE -ABS(t.charged_amount) END), 'ILS',
  SUM(CASE WHEN c.kind = 'income' THEN ABS(t.charged_amount)
           ELSE -ABS(t.charged_amount) END), 'ILS',
  'תזרים נטו: ' || tr.name, 'הכנסות פחות הוצאות של המסלול',
  'normal', 'completed', NULL, NULL, NULL,
  -- Park the net row on the track's own highest-value category so the row
  -- still has a real category to render with.
  (SELECT tc2.category_id FROM track_categories tc2
     WHERE tc2.track_id = tr.id ORDER BY tc2.category_id LIMIT 1),
  'user', 'track-net', MIN(t.sync_run_id),
  'track-net-' || tr.id || '-' || substr(t.date, 1, 7),
  0,
  CASE WHEN SUM(CASE WHEN c.kind = 'income' THEN ABS(t.charged_amount)
                     ELSE -ABS(t.charged_amount) END) >= 0
       THEN 'income' ELSE 'expense' END,
  0, MIN(t.created_at), MAX(t.updated_at), NULL, NULL, NULL, NULL, 0
FROM transactions t
JOIN track_categories tc ON tc.workspace_id = t.workspace_id
  AND tc.category_id = t.category_id
JOIN tracks tr ON tr.id = tc.track_id
JOIN categories c ON c.id = t.category_id
-- kind <> 'transfer' matters: rows neutralised as internal movement (e.g. a
-- credit-card settlement already itemised elsewhere) are dropped by the
-- everyday branch above, so netting them back in here would resurrect
-- charges the ledger has deliberately cancelled.
WHERE t.deleted_at IS NULL AND tr.mode = 'net_income'
  AND t.status = 'completed' AND t.kind <> 'transfer'
GROUP BY tr.id, t.workspace_id, substr(t.date, 1, 7);
