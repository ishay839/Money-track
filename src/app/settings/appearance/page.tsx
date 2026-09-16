"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";

export default function AppearanceSettingsPage() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  const active = hydrated ? (theme ?? "system") : null;


  const themeOptions = [
    { value: "light" as const, label: t("themeLight"), description: t("themeLightDesc") },
    { value: "dark" as const, label: t("themeDark"), description: t("themeDarkDesc") },
    { value: "system" as const, label: t("themeSystem"), description: t("themeSystemDesc") },
  ];

  return (
    <SectionShell title={t("title")} description={t("description")}>
      <SettingCard title={t("themeCardTitle")}>
        <div className="grid gap-2 sm:grid-cols-3">
          {themeOptions.map((o) => {
            const isActive = active === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">{o.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {o.description}
                </div>
              </button>
            );
          })}
        </div>
      </SettingCard>
    </SectionShell>
  );
}
