-- Corrects the track netting branch introduced in 030: it did not filter
-- kind='transfer', so rows deliberately neutralised as internal movement
-- (credit-card settlements already itemised on the card) were netted back
-- into the operating cash flow. Recreates the view with that filter.

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
