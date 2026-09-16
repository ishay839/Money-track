import { NextResponse } from "next/server";
import {
  getMerchantDetail,
  listMerchantYears,
  listMerchants,
} from "@/server/db/queries/merchants";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/**
 * GET /api/merchants                    -> ranked list of parties
 * GET /api/merchants?name=X&year=2026   -> one party's mini-dashboard
 */
export function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (name) {
    const rawYear = searchParams.get("year");
    const requested = rawYear ? Number(rawYear) : null;
    if (requested !== null && !Number.isInteger(requested)) {
      return NextResponse.json({ error: "שנה לא תקינה" }, { status: 400 });
    }

    // Opening on the current year would show an empty screen for anyone who
    // stopped appearing a while ago, so fall back to their most recent year.
    const years = listMerchantYears(workspaceId, name);
    const year =
      requested ?? years[0] ?? new Date().getFullYear();

    return NextResponse.json(getMerchantDetail(workspaceId, name, year));
  }

  const limitRaw = Number(searchParams.get("limit"));
  return NextResponse.json({
    items: listMerchants(workspaceId, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      limit:
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(limitRaw, 1000)
          : undefined,
    }),
  });
}
