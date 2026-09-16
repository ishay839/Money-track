-- Bank-side card settlements mirror itemized card transactions and must not
-- be counted as a second expense.
UPDATE transactions
SET kind = 'transfer',
    category_id = NULL,
    category_source = NULL,
    ai_confidence = NULL,
    needs_review = 0,
    review_reason = 'חיוב אשראי מרוכז - לא נכלל בהוצאות',
    updated_at = datetime('now')
WHERE kind = 'expense'
  AND provider IN (
    'hapoalim', 'leumi', 'mizrahi', 'discount', 'mercantile',
    'beinleumi', 'otsarHahayal', 'union', 'pagi', 'yahav', 'massad'
  )
  AND (
    description LIKE '%מקס איט פיננסי%'
    OR description LIKE '%מקס איט פיננסים%'
    OR description LIKE '%מקס איט%'
  );
