import { ASSET_KINDS, type AssetKind, type BalanceReading } from "@/lib/balances";

type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("מבנה הנתונים של הגוף השתנה");
  return value as Row;
}
export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("לא התקבלה רשימת חשבונות תקינה");
  return value;
}
export function amount(value: unknown): number {
  // Never coerce null, an empty string, or a missing balance into zero.
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))) throw new Error("לא התקבלה יתרה מספרית");
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1e13) throw new Error("יתרה לא תקינה");
  return Math.round(result * 100) / 100;
}
export function inferKind(label: string): AssetKind {
  if (label.includes("השתלמות")) return "study";
  if (label.includes("פנסיה")) return "pension";
  if (label.includes("גמל")) return "provident";
  if (label.includes("מנהלים")) return "insurance";
  if (/השקעות|מסחר|תיק|portfolio|investment/i.test(label)) return "investment";
  return "unknown";
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

/** Parses only visible, currency-labelled balances from an authenticated portal. */
export function parseGenericPortalText(value: string, providerName: string): BalanceReading[] {
  const lines = value.split(/\r?\n/).map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,5000);
  const context = /יתרה|צבירה|שווי|פנסי|גמל|השתלמות|חיסכון|ביטוח מנהלים|תיק השקעות|חשבון מסחר|balance|portfolio value|account value/i;
  const currencyAmount = /(?:₪|ש[\"״']?ח)\s*(-?\d[\d,]*(?:\.\d{1,2})?)|(-?\d[\d,]*(?:\.\d{1,2})?)\s*(?:₪|ש[\"״']?ח)/g;
  const currencyAmountForLabel = /(?:₪|ש[\"״']?ח)\s*-?\d[\d,]*(?:\.\d{1,2})?|-?\d[\d,]*(?:\.\d{1,2})?\s*(?:₪|ש[\"״']?ח)/g;
  const cleanLabel = (line: string) => line.replace(currencyAmountForLabel,"").replace(/[|:·-]+$/g,"").trim();
  const candidates: Array<BalanceReading & { aggregate: boolean }> = [];
  for (let index=0; index<lines.length; index++) {
    const window = lines.slice(Math.max(0,index-1),Math.min(lines.length,index+2));
    if (!context.test(window.join(" "))) continue;
    currencyAmount.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = currencyAmount.exec(lines[index]))) {
      const parsed = Number((match[1] ?? match[2]).replace(/,/g,""));
      if (!Number.isFinite(parsed) || Math.abs(parsed)>1e13) continue;
      const current = lines[index], previous = lines[index-1] ?? "", next = lines[index+1] ?? "";
      const labelLine = [current,previous,next].find(line=>context.test(line) && !/^(יתרה|שווי|צבירה)( נוכחית| כוללת)?$/i.test(cleanLabel(line))) ?? [current,previous,next].find(line=>context.test(line)) ?? providerName;
      const label = cleanLabel(labelLine).slice(0,180) || providerName;
      const scope = `${labelLine} ${current}`;
      const kind = inferKind(scope);
      const aggregate = /סה["״']?כ|סך הכל|יתרה כוללת|total/i.test(scope);
      candidates.push({key:"",label,kind,amount:Math.round(parsed*100)/100,currency:"ILS",aggregate});
    }
  }
  const specificKinds = new Set(candidates.filter(item=>!item.aggregate).map(item=>item.kind));
  const unique = new Map<string, BalanceReading>();
  for (const item of candidates) {
    if (item.aggregate && specificKinds.has(item.kind)) continue;
    const identity = `${item.kind}:${item.label.toLocaleLowerCase("he-IL")}`;
    const key = `portal:${stableKey(identity)}`;
    const previous = unique.get(key);
    if (previous && previous.amount !== item.amount) continue;
    unique.set(key,{key,label:item.label,kind:item.kind,amount:item.amount,currency:item.currency});
  }
  return validateReadings([...unique.values()]);
}
export function validateReadings(readings: BalanceReading[]): BalanceReading[] {
  if (!readings.length) throw new Error("לא נמצאו יתרות. היתרות הקודמות נשמרו");
  const keys = new Set<string>();
  for (const reading of readings) {
    if (!reading.key || reading.key.length > 300 || !reading.label || reading.label.length > 300 || !Object.hasOwn(ASSET_KINDS,reading.kind) || !/^[A-Z]{3}$/.test(reading.currency) || keys.has(reading.key)) throw new Error("התקבלו חשבונות כפולים או נתונים לא מזוהים");
    amount(reading.amount);
    keys.add(reading.key);
  }
  return readings;
}
export function parseMeitav(value: unknown): BalanceReading[] {
  const root = object(value);
  const data = object(root.t ?? root);
  const byKey = new Map<string, BalanceReading>();
  for (const [field, defaultKind] of [["CustomPensionAccountMain", "pension"], ["CustomAccountMain", "unknown"]] as const) {
    for (const item of rows(data[field] ?? [])) {
      const row = object(item);
      if (typeof row.AccountNum !== "string" && typeof row.AccountNum !== "number") throw new Error("לא זוהה מספר חשבון יציב");
      const key = `${field}:${row.AccountNum}`;
      const label = typeof row.AccountNumForShow === "string" ? row.AccountNumForShow.trim() : "";
      const reading: BalanceReading = {key, label, kind: defaultKind === "pension" ? "pension" : inferKind(label), amount: amount(row.YitrotAccountSum), currency: "ILS"};
      const previous = byKey.get(key);
      // Period ordering is not documented. Conflicting periods must not silently
      // select the maximum balance (which could be historical, not current).
      if (previous && (previous.amount !== reading.amount || previous.label !== reading.label)) throw new Error("התקבלו כמה תקופות לאותו חשבון; נדרש בירור תאריך היתרה");
      byKey.set(key, reading);
    }
  }
  return validateReadings([...byKey.values()]);
}
export function parseMenora(value: unknown): BalanceReading[] {
  const data = object(object(value).data);
  const totals = new Map<string, BalanceReading>();
  for (const [field, fallback] of [["pension","pension"],["socialBenefit","unknown"],["managerFund","insurance"],["annuity","unknown"]] as const) {
    for (const item of rows(data[field] ?? [])) {
      const row = object(item);
      if (typeof row.title !== "string" || !row.title.trim()) throw new Error("לא זוהה סוג החיסכון");
      const kind = fallback === "unknown" ? inferKind(row.title) : fallback;
      // This endpoint is a product summary, not a policy list. Keep explicitly
      // labelled aggregates instead of inventing individual policy identifiers.
      const key = `${field}:${kind}`;
      // Must cover every AssetKind for the lookup below to be total, even
      // though a pension portal never reports a current account.
      const labels = {checking:"עובר ושב",pension:"פנסיה",study:"השתלמות",provident:"גמל",insurance:"ביטוח מנהלים",unknown:"חיסכון אחר",investment:"השקעות"};
      const previous = totals.get(key);
      const sum = amount((previous?.amount ?? 0) + amount(row.cashSurrenderValue));
      totals.set(key,{key,kind,label:`${labels[kind]} - סך המוצרים בקבוצה`,amount:sum,currency:"ILS"});
    }
  }
  return validateReadings([...totals.values()]);
}
