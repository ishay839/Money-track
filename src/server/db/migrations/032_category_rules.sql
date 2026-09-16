-- Explicit categorisation rules.
--
-- The app already learns merchant -> category pairs in `merchant_categories`
-- every time the user ticks "remember", and the sync applies them before the
-- AI runs. But that memory is exact-match on the whole normalised description,
-- it is invisible in the UI, and it cannot express "anything containing this
-- word", "any charge of exactly this amount", or "only within these dates".
--
-- These rules cover that gap. They are deliberately a separate table rather
-- than an extension of merchant_categories: that one is a learning cache the
-- app maintains itself, whereas these are hand-written statements the user
-- owns and expects to stay exactly as typed.
CREATE TABLE category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  -- contains : merchant_value appears anywhere in the description
  -- equals   : the description is exactly merchant_value
  -- starts   : the description begins with merchant_value
  match_type TEXT NOT NULL DEFAULT 'contains'
    CHECK(match_type IN ('contains','equals','starts')),
  merchant_value TEXT,

  -- Optional narrowing. All present conditions must hold together, so a rule
  -- can say "HaShomron bakery, but only charges over 200".
  amount_min REAL,
  amount_max REAL,
  date_from TEXT,
  date_to TEXT,

  -- Lower number wins when several rules match the same transaction.
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  hit_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- A rule that constrains nothing would swallow every transaction, so at
  -- least one condition must be present.
  CHECK (
    (merchant_value IS NOT NULL AND length(trim(merchant_value)) > 0)
    OR amount_min IS NOT NULL
    OR amount_max IS NOT NULL
    OR date_from IS NOT NULL
    OR date_to IS NOT NULL
  )
);

CREATE INDEX idx_category_rules_lookup
  ON category_rules(workspace_id, enabled, priority);
CREATE INDEX idx_category_rules_category
  ON category_rules(category_id);
