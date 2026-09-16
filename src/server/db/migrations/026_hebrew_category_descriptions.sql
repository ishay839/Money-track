UPDATE categories
SET description = CASE name
  WHEN 'Groceries' THEN 'סופרמרקטים, מכולות ושווקי מזון. לא מסעדות או אוכל מוכן.'
  WHEN 'Restaurants' THEN 'מסעדות, משלוחי אוכל, ברים ופאבים. לא קניות מזון לבית.'
  WHEN 'Transport' THEN 'תחבורה ציבורית, מוניות, דלק, חניה, שטיפת רכב וכבישי אגרה.'
  WHEN 'Shopping' THEN 'קניות כלליות, ביגוד, אלקטרוניקה ומוצרים לבית.'
  WHEN 'Entertainment' THEN 'קולנוע, הופעות, תיאטרון, מוזיאונים, משחקים ופארקי שעשועים.'
  WHEN 'Health' THEN 'בתי מרקחת, רופאים, רופאי שיניים, מרפאות, בדיקות וציוד רפואי.'
  WHEN 'Education' THEN 'בתי ספר, שכר לימוד, קורסים, ספרי לימוד, ציוד לימודי ודמי בחינות.'
  WHEN 'Bills & Utilities' THEN 'חשמל, מים, גז, אינטרנט, טלפון, ארנונה ועד בית.'
  WHEN 'Subscriptions' THEN 'שירותים דיגיטליים חוזרים, תוכנה, חדשות ואחסון בענן.'
  WHEN 'Travel' THEN 'טיסות, מלונות, דירות נופש, סוכנויות נסיעות והשכרת רכב בחוץ לארץ.'
  WHEN 'Cash & ATM' THEN 'משיכות מזומן, מקדמות מזומן והמרת מטבע.'
  WHEN 'Transfers' THEN 'העברות בין חשבונות והעברות לאנשים, כולל ביט ופייבוקס.'
  WHEN 'Insurance' THEN 'ביטוח רכב, דירה, בריאות וחיים.'
  WHEN 'Home' THEN 'ריהוט, מכשירי חשמל, תיקונים, כלי עבודה ושירותים לבית.'
  WHEN 'Personal Care' THEN 'מספרות, טיפוח, קוסמטיקה וספא.'
  WHEN 'Salary' THEN 'תשלומי שכר קבועים ממעסיק.'
  WHEN 'Coffee & Cafes' THEN 'בתי קפה, מאפיות וקפה יומיומי. לא מסעדות.'
  WHEN 'Pet Care' THEN 'וטרינר, מזון, ציוד, טיפוח ופנסיון לחיות מחמד.'
  WHEN 'Gifts & Donations' THEN 'תרומות, מתנות לאחרים וגיוסי כספים.'
  WHEN 'Kids & Childcare' THEN 'מעון, שמרטפות, צהרונים והוצאות שמזוהות בבירור עם הילדים.'
  WHEN 'Freelance & Side Income' THEN 'תשלומים מלקוחות, עבודות צד וייעוץ.'
  WHEN 'Investment Income' THEN 'דיבידנדים, ריבית ותקבולים ממימוש השקעות.'
  WHEN 'Refunds & Reimbursements' THEN 'החזרי קנייה, החזרי הוצאות, תגמולי ביטוח וביטולים.'
  WHEN 'Sports & Hobbies' THEN 'חדרי כושר, מועדוני ספורט, חוגים, ציוד ופעילויות פנאי.'
  WHEN 'Food' THEN 'קטגוריית על למצרכים, מסעדות ובתי קפה.'
  WHEN 'Transportation' THEN 'קטגוריית על לתחבורה יומיומית ולנסיעות.'
  WHEN 'Lifestyle' THEN 'קטגוריית על לקניות, בידור, טיפוח ותחביבים.'
  WHEN 'Home & Bills' THEN 'קטגוריית על לחשבונות, תחזוקת הבית, ביטוח ומנויים.'
  WHEN 'Health & Family' THEN 'קטגוריית על לבריאות, השכלה, ילדים וחיות מחמד.'
  WHEN 'Money Movement' THEN 'קטגוריית על לתנועות כספים שאינן הוצאה שוטפת רגילה.'
  WHEN 'Fees & Taxes' THEN 'עמלות בנק וכרטיס, עמלות העברה, מסים והיטלים ממשלתיים.'
  ELSE description
END
WHERE name IN (
  'Groceries','Restaurants','Transport','Shopping','Entertainment','Health',
  'Education','Bills & Utilities','Subscriptions','Travel','Cash & ATM',
  'Transfers','Insurance','Home','Personal Care','Salary','Coffee & Cafes',
  'Pet Care','Gifts & Donations','Kids & Childcare','Freelance & Side Income',
  'Investment Income','Refunds & Reimbursements','Sports & Hobbies','Food',
  'Transportation','Lifestyle','Home & Bills','Health & Family','Money Movement',
  'Fees & Taxes'
);
