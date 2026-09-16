"use client";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import type { BankProviderInfo } from "@/lib/types";

interface TwoFactorSectionProps {
  info: BankProviderInfo;
  requiresManualTwoFactor: boolean;
  hasTwoFactorToken?: boolean;
  onChangeManualFlag: (next: boolean) => void;
  onResetToken?: () => void;
  resetPending?: boolean;
  /**
   * When true, render the "Reset 2FA" button. Only meaningful for
   * programmatic-2FA banks (OneZero today).
   */
  showResetButton?: boolean;
}

export function TwoFactorSection({
  info,
  requiresManualTwoFactor,
  hasTwoFactorToken = false,
  onChangeManualFlag,
  onResetToken,
  resetPending = false,
  showResetButton = false,
}: TwoFactorSectionProps) {
  const supportsProgrammatic = Boolean(info.supportsProgrammaticTwoFactor);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        אימות דו־שלבי
      </div>

      {supportsProgrammatic ? (
        <p className="text-xs text-muted-foreground">
          בסנכרון הראשון יישלח קוד חד־פעמי בהודעת טקסט. המערכת תשמור אישור
          ארוך־טווח כדי שסנכרונים עתידיים לא ידרשו קוד חדש.
          {hasTwoFactorToken && " כבר קיים אישור שמור."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          אם מופעל אימות דו־שלבי בחשבון, הפעילו אפשרות זו כדי שייפתח חלון
          התחברות בעת הסנכרון. השלימו בו את האימות והסנכרון ימשיך.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={`${info.id}-manual-2fa`}
          className="text-sm font-medium"
        >
          חשבון זה דורש אימות דו־שלבי
        </Label>
        <Switch
          id={`${info.id}-manual-2fa`}
          checked={requiresManualTwoFactor}
          onCheckedChange={onChangeManualFlag}
          disabled={supportsProgrammatic}
        />
      </div>
      {supportsProgrammatic ? (
        <p className="text-sm text-muted-foreground">
          אין צורך בהגדרה ידנית עבור ספק זה - האימות הדו־שלבי מטופל אוטומטית.
        </p>
      ) : null}

      {showResetButton && supportsProgrammatic && hasTwoFactorToken ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div>
            <div className="text-sm font-medium">אישור אימות דו־שלבי שמור</div>
            <div className="text-sm text-muted-foreground">
              האיפוס ידרוש קוד חדש בהודעת טקסט בסנכרון הבא.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetToken}
            disabled={resetPending}
          >
            {resetPending ? "מאפס…" : "איפוס אימות דו־שלבי"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
