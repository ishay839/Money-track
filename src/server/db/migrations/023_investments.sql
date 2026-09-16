CREATE TABLE investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('excluded', 'net_income')),
  capital_category_id INTEGER NOT NULL REFERENCES categories(id),
  expense_category_id INTEGER NOT NULL REFERENCES categories(id),
  income_category_id INTEGER NOT NULL REFERENCES categories(id),
  UNIQUE(workspace_id, name)
);

CREATE VIEW operating_transactions AS
SELECT t.* FROM transactions t
WHERE t.kind != 'transfer' AND NOT EXISTS (
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
  0, 'income', 0, MIN(t.created_at), MAX(t.updated_at), NULL, NULL
FROM transactions t JOIN investments i ON i.workspace_id = t.workspace_id
  AND t.category_id IN (i.expense_category_id, i.income_category_id)
WHERE i.mode = 'net_income' AND t.status = 'completed'
GROUP BY i.id, t.workspace_id, substr(t.date, 1, 7);
