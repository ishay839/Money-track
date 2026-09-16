-- Starter rules for well-known Israeli merchants.
--
-- Why this exists: categorisation runs rules -> learned merchant memory -> AI.
-- Without an AI key the first two are all there is, and a brand-new install has
-- neither, so every transaction would land uncategorised. Most people will not
-- pay for an API key, and "it did nothing" is a bad first run.
--
-- These are ordinary rows in category_rules: they show up on Settings > Rules
-- exactly like a rule the user wrote, and can be edited or deleted there.
-- priority 500 puts them *after* anything the user creates (lower number wins,
-- user rules default to 100), so a personal rule always overrides a shipped one.
--
-- SAFETY: guarded on the workspace having no transactions, same as migration
-- 038. An existing ledger is somebody's real setup and must not have rules
-- injected into it.
--
-- 'contains' matching, because bank descriptions carry branch names and
-- suffixes ("שופרסל דיל רמת גן", "פז יעלים בע\"מ"). The values are chosen to be
-- specific enough not to collide: a chain name, not a generic word.

INSERT INTO category_rules
  (workspace_id, category_id, match_type, match_field, merchant_value,
   priority, enabled, note)
SELECT w.id, c.id, 'contains', 'description', r.value, 500, 1, 'כלל מובנה'
FROM workspaces w
CROSS JOIN (
  -- ---- Groceries -------------------------------------------------------
  SELECT 'שופרסל'      AS value, 'Groceries' AS cat
  UNION ALL SELECT 'רמי לוי',        'Groceries'
  UNION ALL SELECT 'ויקטורי',        'Groceries'
  UNION ALL SELECT 'יינות ביתן',     'Groceries'
  UNION ALL SELECT 'אושר עד',        'Groceries'
  UNION ALL SELECT 'טיב טעם',        'Groceries'
  UNION ALL SELECT 'מגה בעיר',       'Groceries'
  UNION ALL SELECT 'סופר פארם',      'Groceries'
  UNION ALL SELECT 'am:pm',          'Groceries'
  UNION ALL SELECT 'טסקו',           'Groceries'

  -- ---- Transport / fuel ------------------------------------------------
  UNION ALL SELECT 'פז',             'Transport'
  UNION ALL SELECT 'דלק מוטורס',     'Transport'
  UNION ALL SELECT 'סונול',          'Transport'
  UNION ALL SELECT 'דור אלון',       'Transport'
  UNION ALL SELECT 'פנגו',           'Transport'
  UNION ALL SELECT 'סלופארק',        'Transport'
  UNION ALL SELECT 'כביש 6',         'Transport'
  UNION ALL SELECT 'נתיבי איילון',   'Transport'
  UNION ALL SELECT 'רב קו',          'Transport'
  UNION ALL SELECT 'גט טקסי',        'Transport'
  UNION ALL SELECT 'GETT',           'Transport'

  -- ---- Coffee & restaurants -------------------------------------------
  UNION ALL SELECT 'ארומה',          'Coffee & Cafes'
  UNION ALL SELECT 'קפה קפה',        'Coffee & Cafes'
  UNION ALL SELECT 'לנדוור',         'Coffee & Cafes'
  UNION ALL SELECT 'קופיקס',         'Coffee & Cafes'
  UNION ALL SELECT 'COFIX',          'Coffee & Cafes'
  UNION ALL SELECT 'רולדין',         'Coffee & Cafes'
  UNION ALL SELECT 'מקדונלד',        'Restaurants'
  UNION ALL SELECT 'בורגר',          'Restaurants'
  UNION ALL SELECT 'דומינו',         'Restaurants'
  UNION ALL SELECT 'פיצה האט',       'Restaurants'
  UNION ALL SELECT 'ג׳פניקה',        'Restaurants'
  UNION ALL SELECT 'וולט',           'Restaurants'
  UNION ALL SELECT 'WOLT',           'Restaurants'
  UNION ALL SELECT '10bis',          'Restaurants'
  UNION ALL SELECT 'תן ביס',         'Restaurants'

  -- ---- Bills & utilities ----------------------------------------------
  UNION ALL SELECT 'חברת החשמל',     'Bills & Utilities'
  UNION ALL SELECT 'מקורות',         'Bills & Utilities'
  UNION ALL SELECT 'ארנונה',         'Bills & Utilities'
  UNION ALL SELECT 'בזק',            'Bills & Utilities'
  UNION ALL SELECT 'הוט',            'Bills & Utilities'
  UNION ALL SELECT 'פרטנר',          'Bills & Utilities'
  UNION ALL SELECT 'סלקום',          'Bills & Utilities'
  UNION ALL SELECT 'פלאפון',         'Bills & Utilities'
  UNION ALL SELECT 'גולן טלקום',     'Bills & Utilities'
  UNION ALL SELECT 'רמי לוי תקשורת', 'Bills & Utilities'

  -- ---- Subscriptions ---------------------------------------------------
  UNION ALL SELECT 'NETFLIX',        'Subscriptions'
  UNION ALL SELECT 'SPOTIFY',        'Subscriptions'
  UNION ALL SELECT 'YOUTUBE',        'Subscriptions'
  UNION ALL SELECT 'GOOGLE',         'Subscriptions'
  UNION ALL SELECT 'APPLE.COM',      'Subscriptions'
  UNION ALL SELECT 'MICROSOFT',      'Subscriptions'
  UNION ALL SELECT 'OPENAI',         'Subscriptions'
  UNION ALL SELECT 'ANTHROPIC',      'Subscriptions'
  UNION ALL SELECT 'SPOTIFY AB',     'Subscriptions'

  -- ---- Shopping --------------------------------------------------------
  UNION ALL SELECT 'ALIEXPRESS',     'Shopping'
  UNION ALL SELECT 'AMAZON',         'Shopping'
  UNION ALL SELECT 'EBAY',           'Shopping'
  UNION ALL SELECT 'SHEIN',          'Shopping'
  UNION ALL SELECT 'איקאה',          'Shopping'
  UNION ALL SELECT 'IKEA',           'Shopping'
  UNION ALL SELECT 'הום סנטר',       'Shopping'
  UNION ALL SELECT 'זара',           'Shopping'
  UNION ALL SELECT 'ZARA',           'Shopping'
  UNION ALL SELECT 'קסטרו',          'Shopping'
  UNION ALL SELECT 'פוקס',           'Shopping'
  UNION ALL SELECT 'גולף',           'Shopping'
  UNION ALL SELECT 'טרמינל איקס',    'Shopping'

  -- ---- Health ----------------------------------------------------------
  UNION ALL SELECT 'כללית',          'Health'
  UNION ALL SELECT 'מכבי שרותי בריאות', 'Health'
  UNION ALL SELECT 'לאומית',         'Health'
  UNION ALL SELECT 'מאוחדת',         'Health'
  UNION ALL SELECT 'סופר-פארם',      'Health'

  -- ---- Entertainment ---------------------------------------------------
  UNION ALL SELECT 'סינמה סיטי',     'Entertainment'
  UNION ALL SELECT 'יס פלאנט',       'Entertainment'
  UNION ALL SELECT 'רב חן',          'Entertainment'
  UNION ALL SELECT 'STEAM',          'Entertainment'

  -- ---- Fees & taxes ----------------------------------------------------
  UNION ALL SELECT 'עמלת',           'Fees & Taxes'
  UNION ALL SELECT 'דמי כרטיס',      'Fees & Taxes'
  UNION ALL SELECT 'ריבית',          'Fees & Taxes'

  -- ---- Insurance -------------------------------------------------------
  UNION ALL SELECT 'ביטוח לאומי',    'Insurance'
  UNION ALL SELECT 'הראל',           'Insurance'
  UNION ALL SELECT 'כלל ביטוח',      'Insurance'
  UNION ALL SELECT 'הפניקס',         'Insurance'
  UNION ALL SELECT 'ביטוח ישיר',     'Insurance'
  UNION ALL SELECT 'AIG',            'Insurance'
) r
JOIN categories c
  ON c.workspace_id = w.id AND c.name = r.cat AND c.kind = 'expense'
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.workspace_id = w.id)
  AND NOT EXISTS (
    SELECT 1 FROM category_rules x
     WHERE x.workspace_id = w.id
       AND x.merchant_value = r.value
       AND x.match_field = 'description'
  );
