import { NextResponse } from "next/server";
import {
  getBankCredentials,
  nextBankConnectionKey,
  saveBankCredentials,
} from "@/server/db/queries/bank-credentials";
import { BANK_PROVIDERS } from "@/lib/types";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as {
    provider: string;
    connectionKey?: string;
    createNew?: boolean;
    credentials: Record<string, string>;
    requiresManualTwoFactor?: boolean;
  };

  if (!body.provider || !body.credentials) {
    return NextResponse.json(
      { success: false, message: "חסרים ספק או פרטי התחברות" },
      { status: 400 }
    );
  }

  // If any password-type field is blank, keep the existing value.
  // Lets users update non-secret fields without retyping their password.
  const baseProvider = body.provider.split(":", 1)[0];
  const providerKey = body.connectionKey ?? (body.createNew
    ? nextBankConnectionKey(workspaceId, baseProvider)
    : body.provider);
  const info = BANK_PROVIDERS.find((b) => b.id === baseProvider);
  const passwordKeys =
    info?.credentialFields.filter((f) => f.type === "password").map((f) => f.key) ?? [];
  const existing = getBankCredentials(workspaceId, providerKey);

  const merged: Record<string, string> = { ...body.credentials };
  for (const key of passwordKeys) {
    if (!merged[key] || merged[key].trim() === "") {
      if (existing && existing[key]) {
        merged[key] = existing[key];
      }
    }
  }

  // Reject if we still don't have a value for required password fields
  for (const key of passwordKeys) {
    if (!merged[key]) {
      return NextResponse.json(
        { success: false, message: `חסר שדה חובה: ${key}` },
        { status: 400 }
      );
    }
  }

  // Preserve any previously stored long-term OTP token across credential
  // updates. Users edit email/password/phone independently of the token, and
  // the form never sends it back.
  if (existing?.otpLongTermToken && !merged.otpLongTermToken) {
    merged.otpLongTermToken = existing.otpLongTermToken;
  }

  saveBankCredentials(workspaceId, providerKey, merged, {
    requiresManualTwoFactor: body.requiresManualTwoFactor,
  });

  return NextResponse.json({ success: true, provider: providerKey });
}
