export interface ReviewDecision {
  needsReview: boolean;
  reason: string | null;
}

const PERSON_TO_PERSON_PATTERN =
  /(?:^|\s)(?:paybox|bit)(?:\s|$)|פייבוקס|העברה\s+ב\s*bit|העברה\s+ביט/i;

const GENERIC_DESCRIPTION_PATTERN =
  /^(?:עסקה|חיוב|רכישה|קנייה|שונות|העברה|תשלום|אתר חו["״']?ל)$/i;

export function isPersonToPersonTransfer(description: string): boolean {
  return PERSON_TO_PERSON_PATTERN.test(description.trim());
}

export function decideReview(input: {
  description: string;
  amount: number;
  confidence: number | null;
  learnedReview?: boolean;
  learnedReason?: string | null;
}): ReviewDecision {
  if (isPersonToPersonTransfer(input.description)) {
    return {
      needsReview: true,
      reason: "העברת BIT או PayBox דורשת סיווג ידני לפי מטרת ההעברה.",
    };
  }

  if (input.learnedReview) {
    return {
      needsReview: true,
      reason: input.learnedReason ?? "ההיסטוריה אינה מספיקה לסיווג חד-משמעי.",
    };
  }

  if (input.confidence == null || input.confidence <= 4) {
    return {
      needsReview: true,
      reason: "רמת הביטחון בסיווג נמוכה.",
    };
  }

  if (Math.abs(input.amount) >= 1000 && input.confidence <= 5) {
    return {
      needsReview: true,
      reason: "הוצאה גדולה עם סיווג שאינו ודאי מספיק.",
    };
  }

  if (
    GENERIC_DESCRIPTION_PATTERN.test(input.description.trim()) &&
    input.confidence <= 5
  ) {
    return {
      needsReview: true,
      reason: "תיאור העסקה כללי מדי לסיווג אוטומטי.",
    };
  }

  return { needsReview: false, reason: null };
}
