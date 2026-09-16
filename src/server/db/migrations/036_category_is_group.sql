-- A group is something the user declared, not something inferred.
--
-- Group-ness was derived from "does anything point at this row", so a newly
-- created group had no children and was indistinguishable from a loose
-- category. The only way to make it a real group was to drag something into
-- it, which is backwards: you make the shelf before you put things on it.
--
-- Existing rows that already have children are marked as groups so nothing
-- moves on the board.

ALTER TABLE categories
  ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0 CHECK(is_group IN (0,1));

UPDATE categories
   SET is_group = 1
 WHERE parent_id IS NULL
   AND EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id);
