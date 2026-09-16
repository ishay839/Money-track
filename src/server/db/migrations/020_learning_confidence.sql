ALTER TABLE merchant_categories ADD COLUMN confidence INTEGER;
ALTER TABLE merchant_categories ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE merchant_categories ADD COLUMN rationale TEXT;
ALTER TABLE merchant_categories ADD COLUMN learned_from TEXT;

ALTER TABLE transactions ADD COLUMN review_reason TEXT;

CREATE INDEX idx_merchant_categories_review
  ON merchant_categories(workspace_id, needs_review);
CREATE INDEX idx_transactions_review_queue
  ON transactions(workspace_id, needs_review, date);
