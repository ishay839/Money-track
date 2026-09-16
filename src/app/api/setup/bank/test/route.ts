import { NextResponse } from "next/server";
import {
  getBankCredentials,
  getRequiresManualTwoFactor,
} from "@/server/db/queries/bank-credentials";
import { scrapeBank } from "@/server/scrapers";
import { getBaseBankProvider } from "@/lib/types";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const body = (await request.json()) as { provider: string };

    console.info(`[bank-test] starting provider=${body.provider}`);

    const credentials = getBankCredentials(workspaceId, body.provider);
    if (!credentials) {
      return NextResponse.json(
        { success: false, message: "No credentials found for this provider" },
        { status: 400 }
      );
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await scrapeBank(
      workspaceId,
      getBaseBankProvider(body.provider),
      credentials,
      sevenDaysAgo,
      {
        manualTwoFactor: getRequiresManualTwoFactor(
          workspaceId,
          body.provider
        ),
      }
    );

    if (!result.success) {
      const maxLoginTimedOut =
        getBaseBankProvider(body.provider) === "max" &&
        result.errorMessage?.includes("waiting for redirect");
      return NextResponse.json({
        success: false,
        message: maxLoginTimedOut
          ? "מקס לא השלים את ההתחברות. ודאו שהוזן שם המשתמש של מקס, בדקו את הסיסמה באתר מקס ונסו שוב."
          : result.errorMessage ?? "בדיקת החיבור נכשלה",
      });
    }

    return NextResponse.json({
      success: true,
      message: "החיבור הצליח",
      accountsFound: result.accounts.length,
    });
  } catch (error) {
    console.error("[bank-test] unexpected error", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}
