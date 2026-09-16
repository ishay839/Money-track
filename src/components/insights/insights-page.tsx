"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { CoveragePanel } from "./coverage-panel";
import { YearComparePanel } from "./year-compare-panel";
import { RecurringPanel } from "./recurring-panel";
import { PacePanel } from "./pace-panel";

type Tab = "coverage" | "years" | "recurring" | "pace";

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "years", label: "השוואה בין שנים", hint: "כמה השתנה מול אשתקד" },
  { id: "recurring", label: "חיובים קבועים", hint: "מה יוצא בכל חודש בכל מקרה" },
  { id: "pace", label: "קצב וחריגים", hint: "איפה אני עומד החודש" },
  { id: "coverage", label: "שלמות הנתונים", hint: "האם הכל נמשך" },
];

export function InsightsPage() {
  const [tab, setTab] = useState<Tab>("years");

  return (
    <>
      <PageHeader
        title="ניתוח"
        actions={
          <a
            href="/api/export"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            ייצוא לאקסל
          </a>
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-xl border px-4 py-2.5 text-start transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                <div className="text-base font-bold">{t.label}</div>
                <div
                  className={`text-sm ${
                    active ? "opacity-80" : "text-muted-foreground"
                  }`}
                >
                  {t.hint}
                </div>
              </button>
            );
          })}
        </div>

        {tab === "years" && <YearComparePanel />}
        {tab === "recurring" && <RecurringPanel />}
        {tab === "pace" && <PacePanel />}
        {tab === "coverage" && <CoveragePanel />}
      </div>
    </>
  );
}
