import { NextResponse } from "next/server";
import { getGroupSpend } from "@/server/db/queries/analytics";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/** Shifts a YYYY-MM-DD date by whole months, clamping to the month's length. */
function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  const now = new Date();
  const from =
    searchParams.get("from") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to =
    searchParams.get("to") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    ).padStart(2, "0")}`;

  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "טווח תאריכים לא תקין" }, { status: 400 });
  }

  // The comparison window is the same span one period earlier. For a calendar
  // month that is simply the previous month; for a year it is last year.
  const months = searchParams.get("months") === "12" ? 12 : 1;
  const previousFrom = shiftMonths(from, -months);
  const previousTo = shiftMonths(to, -months);

  return NextResponse.json({
    from,
    to,
    previousFrom,
    previousTo,
    groups: getGroupSpend(workspaceId, from, to, previousFrom, previousTo),
  });
}
