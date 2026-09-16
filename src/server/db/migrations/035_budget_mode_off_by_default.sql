-- A monthly target is opt-in, not the starting state.
--
-- Every category was created 'budgeted' purely because that was the column
-- default, which made the app look like it tracked dozens of targets that were
-- never set: the budgets table is empty. Categories that have no real target
-- become 'tracking' (show the spending, no target).
--
-- Deliberately NOT a table rebuild. Changing a column default in SQLite means
-- recreating the table, and ALTER TABLE ... RENAME rewrites every view and
-- every foreign-key clause in other tables to follow the rename - which then
-- dangle the moment the temporary table is dropped. The insert sites pass
-- budget_mode explicitly instead, so the stored default never matters.

UPDATE categories
   SET budget_mode = 'tracking'
 WHERE budget_mode = 'budgeted'
   AND NOT EXISTS (
     SELECT 1 FROM budgets b
      WHERE b.category_id = categories.id
        AND b.monthly_amount > 0
   );
