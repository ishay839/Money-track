ALTER TABLE transactions ADD COLUMN deleted_at TEXT;
ALTER TABLE transactions ADD COLUMN amount_edited INTEGER NOT NULL DEFAULT 0 CHECK(amount_edited IN (0,1));

DROP VIEW operating_transactions;
CREATE VIEW operating_transactions AS
SELECT t.* FROM transactions t
WHERE t.deleted_at IS NULL
  AND t.kind != 'transfer' AND NOT EXISTS (
    SELECT 1 FROM investments i WHERE i.workspace_id = t.workspace_id
      AND t.category_id IN (i.capital_category_id, i.expense_category_id, i.income_category_id)
  )
UNION ALL
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
GROUP BY i.id, t.workspace_id, substr(t.date, 1, 7);
