-- Every workspace gets one catch-all investment that is excluded from the
-- operating cash flow. Existing expenses above the threshold are moved into it.
INSERT OR IGNORE INTO categories
  (workspace_id,parent_id,name,color,kind,budget_mode,description)
SELECT id,NULL,'השקעות','#0d9488','expense','tracking','כספים המיועדים להשקעות ואינם חלק מההוצאות השוטפות.'
FROM workspaces;

INSERT OR IGNORE INTO categories
  (workspace_id,parent_id,name,color,kind,budget_mode,description)
SELECT id,NULL,'הכנסות מהשקעות','#0d9488','income','tracking','תקבולים שמקורם בהשקעות.'
FROM workspaces;

INSERT OR IGNORE INTO categories
  (workspace_id,parent_id,name,color,kind,budget_mode,description)
SELECT w.id,p.id,'השקעה כללית · הון','#0d9488','expense','tracking','העברות הון להשקעה כללית.'
FROM workspaces w JOIN categories p ON p.workspace_id=w.id AND p.name='השקעות';

INSERT OR IGNORE INTO categories
  (workspace_id,parent_id,name,color,kind,budget_mode,description)
SELECT w.id,p.id,'השקעה כללית · תשלומים','#0d9488','expense','tracking','תשלומים הקשורים להשקעה כללית.'
FROM workspaces w JOIN categories p ON p.workspace_id=w.id AND p.name='השקעות';

INSERT OR IGNORE INTO categories
  (workspace_id,parent_id,name,color,kind,budget_mode,description)
SELECT w.id,p.id,'השקעה כללית · תקבולים','#0d9488','income','tracking','תקבולים מהשקעה כללית.'
FROM workspaces w JOIN categories p ON p.workspace_id=w.id AND p.name='הכנסות מהשקעות';

INSERT OR IGNORE INTO investments
  (workspace_id,name,mode,capital_category_id,expense_category_id,income_category_id)
SELECT w.id,'השקעה כללית','excluded',capital.id,expense.id,income.id
FROM workspaces w
JOIN categories capital ON capital.workspace_id=w.id AND capital.name='השקעה כללית · הון'
JOIN categories expense ON expense.workspace_id=w.id AND expense.name='השקעה כללית · תשלומים'
JOIN categories income ON income.workspace_id=w.id AND income.name='השקעה כללית · תקבולים';

UPDATE transactions
SET category_id = (
      SELECT i.capital_category_id FROM investments i
      WHERE i.workspace_id=transactions.workspace_id AND i.name='השקעה כללית'
    ),
    category_source='ai',needs_review=0,review_reason=NULL,updated_at=datetime('now')
WHERE kind='expense' AND charged_amount < -15000
  AND NOT EXISTS (
    SELECT 1 FROM investments i WHERE i.workspace_id=transactions.workspace_id
      AND transactions.category_id IN(i.capital_category_id,i.expense_category_id,i.income_category_id)
  );
