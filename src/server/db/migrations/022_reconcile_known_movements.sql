-- Exact bank descriptions verified in this workspace as mirrored card charges
-- or movements between the user's own accounts.
UPDATE transactions
SET kind = 'transfer',
    category_id = NULL,
    category_source = NULL,
    ai_confidence = NULL,
    needs_review = 0,
    review_reason = 'תנועת התאמה - לא נכללת בהוצאות',
    updated_at = datetime('now')
WHERE category_source IS NOT 'user'
  AND provider IN ('hapoalim', 'leumi', 'beinleumi')
  AND description IN (
    'מקס איט פיננסי',
    'מקס איט פיננסים',
    'ישראכרט בע"מ',
    'העברה לח.נוסף',
    'העברה מחשבון לחשבון'
  );
