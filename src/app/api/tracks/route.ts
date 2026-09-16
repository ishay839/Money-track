import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  createTrack,
  deleteTrack,
  setTrackCategories,
  trackCategoryBreakdown,
  trackMonthlyHistory,
  trackSummaries,
  trackTransactions,
  updateTrack,
  type TrackMode,
} from "@/server/db/queries/tracks";

const MODES: TrackMode[] = ["excluded", "net_income", "included"];
const isMode = (v: unknown): v is TrackMode =>
  typeof v === "string" && MODES.includes(v as TrackMode);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => Number.isInteger(v))) return null;
  return Array.from(new Set(value as number[]));
}

/**
 * GET /api/tracks?year=2026            -> every track, with a year summary
 * GET /api/tracks?id=3&year=2026       -> one track: history, breakdown, rows
 */
export async function GET(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return bad("שנה לא תקינה");
  }
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const idParam = params.get("id");
  if (idParam !== null) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return bad("מזהה מסלול לא תקין");
    const track = trackSummaries(ws, from, to).find((t) => t.id === id);
    if (!track) {
      return NextResponse.json({ error: "המסלול לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({
      track,
      history: trackMonthlyHistory(ws, id, from, to),
      breakdown: trackCategoryBreakdown(ws, id, from, to),
      transactions: trackTransactions(ws, id, from, to),
    });
  }

  return NextResponse.json({ tracks: trackSummaries(ws, from, to), year });
}

export async function POST(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string") return bad("נתונים חסרים");
  const name = body.name.trim();
  if (!name || name.length > 80) return bad("יש להזין שם מסלול");
  if (!isMode(body.mode)) return bad("אופן הצגה לא תקין");
  const categoryIds = parseIds(body.categoryIds ?? []);
  if (categoryIds === null) return bad("רשימת הקטגוריות אינה תקינה");
  const color =
    typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color
      : "#0F766E";
  try {
    return NextResponse.json({
      id: createTrack(ws, name, body.mode, color, categoryIds),
    });
  } catch {
    return bad("לא ניתן ליצור מסלול. ייתכן שהשם כבר קיים.");
  }
}

export async function PATCH(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.id)) return bad("מזהה מסלול לא תקין");

  if (body.categoryIds !== undefined) {
    const categoryIds = parseIds(body.categoryIds);
    if (categoryIds === null) return bad("רשימת הקטגוריות אינה תקינה");
    setTrackCategories(ws, body.id, categoryIds);
  }

  const patch: { name?: string; mode?: TrackMode; color?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return bad("שם מסלול לא תקין");
    }
    patch.name = body.name.trim().slice(0, 80);
  }
  if (body.mode !== undefined) {
    if (!isMode(body.mode)) return bad("אופן הצגה לא תקין");
    patch.mode = body.mode;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
    patch.color = body.color;
  }
  if (Object.keys(patch).length > 0) {
    try {
      updateTrack(ws, body.id, patch);
    } catch {
      return bad("לא ניתן לעדכן. ייתכן שהשם כבר קיים.");
    }
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const ws = getWorkspaceIdFromRequest(request);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return bad("מזהה מסלול לא תקין");
  return deleteTrack(ws, id)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "המסלול לא נמצא" }, { status: 404 });
}
