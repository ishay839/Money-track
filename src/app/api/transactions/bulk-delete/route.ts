import { NextResponse } from "next/server";
import { deleteTransaction } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/**
 * Soft-delete many transactions in one call. The per-id DELETE already exists,
 * but firing it once per row means a partially applied delete if the network
 * drops halfway - and the month summary would then be wrong in a way the user
 * cannot see. One request, one outcome.
 */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "לא נבחרו תנועות" }, { status: 400 });
  }
  const numeric = ids.filter((n): n is number => Number.isInteger(n));
  if (numeric.length === 0) {
    return NextResponse.json({ error: "לא נבחרו תנועות" }, { status: 400 });
  }
  if (numeric.length > 500) {
    return NextResponse.json(
      { error: "אפשר למחוק עד 500 תנועות בבת אחת" },
      { status: 400 }
    );
  }

  for (const id of numeric) {
    deleteTransaction(workspaceId, id);
  }

  return NextResponse.json({ deleted: numeric.length });
}
