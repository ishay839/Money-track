"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startSync, type SyncProgressEvent } from "@/lib/api";

export interface SyncState {
  syncing: boolean;
  stage: string;
}

export function useBankSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Record<string, SyncState>>({});

  const start = useCallback(
    (provider: string) => {
      setState((prev) => ({
        ...prev,
        [provider]: { syncing: true, stage: "מתחבר…" },
      }));
      const { cancel } = startSync(provider, (event: SyncProgressEvent) => {
        if (event.type === "provider-start") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: true, stage: "מושך תנועות…" },
          }));
        } else if (event.type === "provider-2fa-needed") {
          // The settings page doesn't mount the SyncProgressDialog with an OTP
          // input. Cancel this sync and direct the user to the dashboard sync
          // where the OTP input is wired up. Once the long-term token is
          // saved, future syncs from this page will work without 2FA.
          cancel();
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: false, stage: "" },
          }));
          toast.warning("נדרש קוד אימות דו־שלבי", {
            description:
              "יש לבצע סנכרון מהמסך הראשי ולהזין שם את הקוד החד־פעמי. הקוד הקבוע שיתקבל יישמר לסנכרונים הבאים.",
            duration: 12000,
            closeButton: true,
          });
        } else if (event.type === "provider-2fa-manual") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: true, stage: "יש להשלים אימות בחלון שנפתח…" },
          }));
        } else if (event.type === "stage") {
          const s = event.data.stage as string;
          setState((prev) => ({
            ...prev,
            [provider]: {
              syncing: true,
              stage: s === "categorizing" ? "מסווג…" : "עובד…",
            },
          }));
        } else if (event.type === "complete") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: false, stage: "" },
          }));
          const data = event.data as {
            added: number;
            updated: number;
            categorized: number;
          };
          toast.success(
            `הסנכרון הושלם: ${data.added} חדשות, ${data.updated} עודכנו, ${data.categorized} סווגו`
          );
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: false, stage: "" },
          }));
          toast.error((event.data.message as string) ?? "הסנכרון נכשל", {
            duration: Infinity,
            closeButton: true,
          });
        }
      });
    },
    [queryClient]
  );

  const stateFor = (provider: string): SyncState =>
    state[provider] ?? { syncing: false, stage: "" };

  const anySyncing = Object.values(state).some((s) => s.syncing);

  return { start, stateFor, anySyncing };
}
