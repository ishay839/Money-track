-- A better starter category set for a brand-new install.
--
-- SAFETY: every statement here is guarded on the workspace having NO
-- transactions. A database that has ever imported or entered a transaction is
-- somebody's real ledger, and renaming or deleting their categories would
-- destroy work. New installs run every migration in sequence, so they arrive
-- here with an empty ledger and get the improved set; existing users are
-- untouched by construction.
--
-- What this adds over the base seed: the family-role income split that any
-- household needs (two earners plus child benefit), an insurance breakdown,
-- a clothing group, and vacations separated into abroad vs domestic. The
-- names are deliberately generic - "בן/בת זוג א'" rather than a person's
-- name - so the first thing a new user does is rename them, not delete
-- someone else's life.

-- ---------------------------------------------------------------------------
-- Expense groups
-- ---------------------------------------------------------------------------
INSERT INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description, is_group)
SELECT w.id, NULL, p.name, p.color, p.icon, 'expense', 'tracking', p.description, 1
FROM workspaces w
CROSS JOIN (
  SELECT 'Clothing' AS name, '#C9A227' AS color, 'shirt' AS icon,
         'ביגוד והנעלה' AS description
  UNION ALL SELECT 'Insurances', '#8FA6C4', 'shield', 'ביטוחים'
  UNION ALL SELECT 'Vacations', '#6BBFA0', 'palmtree', 'חופשות ונסיעות'
) p
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.workspace_id = w.id)
  AND NOT EXISTS (
    SELECT 1 FROM categories c
     WHERE c.workspace_id = w.id AND c.name = p.name AND c.parent_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- Expense leaves, attached to the groups above
-- ---------------------------------------------------------------------------
INSERT INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description, is_group)
SELECT w.id, g.id, leaf.name, g.color, NULL, 'expense', 'tracking', NULL, 0
FROM workspaces w
JOIN categories g
  ON g.workspace_id = w.id AND g.parent_id IS NULL AND g.name = leaf.parent_name
CROSS JOIN (
  SELECT 'Clothing'   AS parent_name, 'Clothing - Partner A' AS name
  UNION ALL SELECT 'Clothing',   'Clothing - Partner B'
  UNION ALL SELECT 'Clothing',   'Clothing - Kids'
  UNION ALL SELECT 'Insurances', 'Home Insurance'
  UNION ALL SELECT 'Insurances', 'Life Insurance'
  UNION ALL SELECT 'Insurances', 'Health Insurance'
  UNION ALL SELECT 'Insurances', 'Car Insurance'
  UNION ALL SELECT 'Vacations',  'Vacations Abroad'
  UNION ALL SELECT 'Vacations',  'Vacations Domestic'
) leaf
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.workspace_id = w.id)
  AND NOT EXISTS (
    SELECT 1 FROM categories c
     WHERE c.workspace_id = w.id AND c.name = leaf.name
  );

-- ---------------------------------------------------------------------------
-- Income: the household split, generically named.
-- ---------------------------------------------------------------------------
INSERT INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description, is_group)
SELECT w.id, NULL, i.name, i.color, NULL, 'income', 'tracking', NULL, 0
FROM workspaces w
CROSS JOIN (
  SELECT 'Salary - Partner A' AS name, '#5B9E7E' AS color
  UNION ALL SELECT 'Salary - Partner B', '#5B9E7E'
  UNION ALL SELECT 'Child Benefit',      '#7FB7A3'
  UNION ALL SELECT 'Rental Income',      '#7FB7A3'
) i
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.workspace_id = w.id)
  AND NOT EXISTS (
    SELECT 1 FROM categories c
     WHERE c.workspace_id = w.id AND c.name = i.name
  );
