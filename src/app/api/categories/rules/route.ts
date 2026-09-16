import { NextResponse } from "next/server";
import {
  applyRulesToExisting,
  createRule,
  deleteRule,
  listRules,
  updateRule,
  type RuleMatchField,
  type RuleMatchType,
} from "@/server/db/queries/category-rules";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const MATCH_TYPES: RuleMatchType[] = ["contains", "equals", "starts"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

interface Body {
  id?: unknown;
  categoryId?: unknown;
  matchType?: unknown;
  matchField?: unknown;
  merchantValue?: unknown;
  amountMin?: unknown;
  amountMax?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  priority?: unknown;
  enabled?: unknown;
  note?: unknown;
}

/** Shared validation, returning either a clean payload or an error message. */
function parse(body: Body, requireCategory: boolean) {
  if (requireCategory && !Number.isInteger(body.categoryId)) {
    return { error: "יש לבחור קטגוריה" };
  }
  if (body.matchType !== undefined && !MATCH_TYPES.includes(body.matchType as RuleMatchType)) {
    return { error: "סוג ההתאמה אינו תקין" };
  }
  if (
    body.matchField !== undefined &&
    body.matchField !== "description" &&
    body.matchField !== "counterparty"
  ) {
    return { error: "שדה ההתאמה אינו תקין" };
  }

  const num = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : undefined;
  };
  const amountMin = num(body.amountMin);
  const amountMax = num(body.amountMax);
  if (amountMin === undefined && body.amountMin !== undefined) {
    return { error: "סכום מינימלי אינו תקין" };
  }
  if (amountMax === undefined && body.amountMax !== undefined) {
    return { error: "סכום מקסימלי אינו תקין" };
  }
  if (amountMin != null && amountMax != null && amountMin > amountMax) {
    return { error: "הסכום המינימלי גדול מהמקסימלי" };
  }

  const date = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return typeof v === "string" && ISO.test(v) ? v : undefined;
  };
  const dateFrom = date(body.dateFrom);
  const dateTo = date(body.dateTo);
  if (dateFrom === undefined && body.dateFrom !== undefined) {
    return { error: "תאריך התחלה אינו תקין" };
  }
  if (dateTo === undefined && body.dateTo !== undefined) {
    return { error: "תאריך סיום אינו תקין" };
  }
  if (dateFrom != null && dateTo != null && dateFrom > dateTo) {
    return { error: "תאריך ההתחלה מאוחר מתאריך הסיום" };
  }

  const merchantValue =
    body.merchantValue === undefined
      ? undefined
      : typeof body.merchantValue === "string" && body.merchantValue.trim()
        ? body.merchantValue.trim().slice(0, 200)
        : null;

  return {
    value: {
      categoryId: body.categoryId as number,
      matchType: body.matchType as RuleMatchType | undefined,
      matchField: body.matchField as RuleMatchField | undefined,
      merchantValue,
      amountMin,
      amountMax,
      dateFrom,
      dateTo,
      priority:
        body.priority === undefined ? undefined : Number(body.priority) || 100,
      enabled: body.enabled === undefined ? undefined : body.enabled !== false,
      note:
        body.note === undefined
          ? undefined
          : typeof body.note === "string" && body.note.trim()
            ? body.note.trim().slice(0, 300)
            : null,
    },
  };
}

/** A rule with no conditions would swallow every transaction. */
function hasCondition(v: {
  merchantValue?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}): boolean {
  return Boolean(
    v.merchantValue || v.amountMin != null || v.amountMax != null ||
      v.dateFrom != null || v.dateTo != null
  );
}

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const raw = new URL(request.url).searchParams.get("categoryId");
  const categoryId = raw ? Number(raw) : undefined;
  if (raw && !Number.isInteger(categoryId)) return bad("מזהה קטגוריה לא תקין");
  return NextResponse.json({ rules: listRules(ws, categoryId) });
}

export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("גוף הבקשה אינו תקין");
  }
  const parsed = parse(body, true);
  if (parsed.error) return bad(parsed.error);
  if (!hasCondition(parsed.value!)) {
    return bad("צריך להזין לפחות תנאי אחד: שם, סכום או תאריך.");
  }
  try {
    return NextResponse.json({ id: createRule(ws, parsed.value!) });
  } catch {
    return bad("שמירת הכלל נכשלה");
  }
}

export async function PATCH(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("גוף הבקשה אינו תקין");
  }
  if (!Number.isInteger(body.id)) return bad("מזהה כלל לא תקין");
  const parsed = parse(body, false);
  if (parsed.error) return bad(parsed.error);

  const patch = { ...parsed.value! };
  if (body.categoryId === undefined) {
    delete (patch as { categoryId?: number }).categoryId;
  }
  return NextResponse.json({
    success: updateRule(ws, body.id as number, patch),
  });
}

export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return bad("מזהה כלל לא תקין");
  return deleteRule(ws, id)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "הכלל לא נמצא" }, { status: 404 });
}

/**
 * Run rules over transactions that already exist. `dryRun` is the default so
 * the UI can show "this would touch 412 transactions" before anything moves.
 */
export async function PUT(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  let body: {
    ruleId?: unknown;
    onlyUncategorised?: unknown;
    dryRun?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad("גוף הבקשה אינו תקין");
  }
  const ruleId =
    body.ruleId === undefined || body.ruleId === null
      ? undefined
      : Number(body.ruleId);
  if (ruleId !== undefined && !Number.isInteger(ruleId)) {
    return bad("מזהה כלל לא תקין");
  }
  return NextResponse.json(
    applyRulesToExisting(ws, {
      ruleId,
      onlyUncategorised: body.onlyUncategorised !== false,
      dryRun: body.dryRun !== false,
    })
  );
}
