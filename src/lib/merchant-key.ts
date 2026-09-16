/**
 * Resolving a transaction to the party behind it.
 *
 * Transfer descriptions name the channel ("העברה בBIT", "PAYBOX"), never the
 * person, so the counterparty has to be recovered from the memo. The banks use
 * three shapes:
 *
 *   "לטובת: X. עבור: <purpose>."   outgoing, marker-led
 *   "המבצע: Y. עבור: <purpose>."   incoming, marker-led
 *   "יצחק לוי"                     the bare memo IS the name (max)
 *
 * This mirrors the SQL in server/db/queries/merchants.ts. Both must agree, or
 * clicking a row would open a different party than the one it aggregates
 * under - so the rules live here once, in plain data, and the SQL is written
 * to match.
 */

export const TO_MARKER = "לטובת:";
export const BY_MARKER = "המבצע:";
export const FOR_MARKER = "עבור:";

/** Description patterns where a bare memo holds a person, not a note. */
export const TRANSFER_PATTERNS = [
  "BIT",
  "bit",
  "PAYBOX",
  "פייבוקס",
  "העבר",
  "זיכוי",
] as const;

/** Memos that describe the payment mechanism rather than a counterparty. */
export const NON_NAME_PATTERNS = [
  "הוראת קבע",
  "מזהה",
  "החזר מדמי",
  "מח-ן",
] as const;

const MIN_NAME = 2;
const MAX_NAME = 40;

function afterMarker(memo: string, marker: string): string | null {
  const at = memo.indexOf(marker);
  if (at < 0) return null;
  return memo.slice(at + marker.length);
}

/** Cuts at whichever terminator comes first: "." or "עבור:". */
function upToTerminator(value: string): string {
  const dot = value.indexOf(".");
  const forAt = value.indexOf(FOR_MARKER);
  const candidates = [dot, forAt].filter((i) => i >= 0);
  const cut = candidates.length > 0 ? Math.min(...candidates) : -1;
  return (cut >= 0 ? value.slice(0, cut) : value).trim();
}

/**
 * The counterparty behind a transfer, or null when the row is an ordinary
 * merchant charge (or the bank simply sent no name).
 */
export function counterpartyOf(
  description: string,
  memo: string | null | undefined
): string | null {
  if (!memo) return null;
  const trimmed = memo.trim();
  if (!trimmed) return null;

  for (const marker of [TO_MARKER, BY_MARKER]) {
    const rest = afterMarker(trimmed, marker);
    if (rest !== null) {
      const name = upToTerminator(rest.startsWith(" ") ? rest.slice(1) : rest);
      return name || null;
    }
  }

  // Bare-memo case: only for transfer-like rows, and only when the memo looks
  // like a name rather than a mechanism.
  const isTransfer = TRANSFER_PATTERNS.some((p) => description.includes(p));
  if (!isTransfer) return null;
  if (trimmed.includes(FOR_MARKER)) return null;
  if (NON_NAME_PATTERNS.some((p) => trimmed.includes(p))) return null;
  if (/תשלום .*מתוך/.test(trimmed)) return null;
  if (trimmed.length < MIN_NAME || trimmed.length > MAX_NAME) return null;

  return trimmed;
}

/**
 * The key a transaction aggregates under: the counterparty when there is one,
 * otherwise the description itself.
 */
export function merchantKeyOf(
  description: string,
  memo: string | null | undefined
): string {
  return counterpartyOf(description, memo) ?? description;
}
