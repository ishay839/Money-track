import { NextResponse } from "next/server";
import {
  createHolding,
  deleteHolding,
  getNetWorth,
  holdingHistory,
  updateHolding,
  type HoldingSide,
} from "@/server/db/queries/manual-holdings";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const isSide = (v: unknown): v is HoldingSide =>
  v === "asset" || v === "liability";

interface Body {
  id?: unknown;
  name?: unknown;
  side?: unknown;
  category?: unknown;
  amount?: unknown;
  currency?: unknown;
  note?: unknown;
  asOf?: unknown;
}

/** Amounts are stored as magnitudes; the side decides the sign in the rollup. */
function parseAmount(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return undefined;
  return Math.abs(Math.round(n * 100) / 100);
}

export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const raw = new URL(request.url).searchParams.get("historyFor");
  if (raw !== null) {
    const id = Number(raw);
    if (!Number.isInteger(id)) return bad("מזהה לא תקין");
    return NextResponse.json({ history: holdingHistory(ws, id) });
  }
  return NextResponse.json(getNetWorth(ws));
}

export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("גוף הבקשה אינו תקין");
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return bad("יש להזין שם");
  }
  if (!isSide(body.side)) return bad("יש לבחור נכס או התחייבות");
  const amount = parseAmount(body.amount);
  if (amount === undefined) return bad("יש להזין סכום תקין");
  if (body.asOf !== undefined && body.asOf !== null && body.asOf !== "") {
    if (typeof body.asOf !== "string" || !ISO.test(body.asOf)) {
      return bad("תאריך לא תקין");
    }
  }

  const id = createHolding(ws, {
    name: body.name.trim().slice(0, 120),
    side: body.side,
    category:
      typeof body.category === "string" ? body.category.slice(0, 80) : null,
    amount,
    currency:
      typeof body.currency === "string" && /^[A-Za-z]{3}$/.test(body.currency)
        ? body.currency
        : "ILS",
    note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
    asOf: typeof body.asOf === "string" && ISO.test(body.asOf) ? body.asOf : undefined,
  });
  return NextResponse.json({ id });
}

export async function PATCH(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("גוף הבקשה אינו תקין");
  }
  if (!Number.isInteger(body.id)) return bad("מזהה לא תקין");

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return bad("שם לא תקין");
    }
    patch.name = body.name.trim().slice(0, 120);
  }
  if (body.side !== undefined) {
    if (!isSide(body.side)) return bad("סוג לא תקין");
    patch.side = body.side;
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount);
    if (amount === undefined) return bad("סכום לא תקין");
    patch.amount = amount;
  }
  if (body.asOf !== undefined) {
    if (typeof body.asOf !== "string" || !ISO.test(body.asOf)) {
      return bad("תאריך לא תקין");
    }
    patch.asOf = body.asOf;
  }
  if (body.category !== undefined) {
    patch.category =
      typeof body.category === "string" ? body.category.slice(0, 80) : null;
  }
  if (body.note !== undefined) {
    patch.note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  }

  return NextResponse.json({
    success: updateHolding(ws, body.id as number, patch),
  });
}

export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return bad("מזהה לא תקין");
  return deleteHolding(ws, id)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "הרשומה לא נמצאה" }, { status: 404 });
}
