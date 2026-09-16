import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  SettingsSidebar,
  SettingsMobileNav,
} from "@/components/settings/settings-sidebar";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} />
      <div className="flex min-h-[calc(100vh-4rem)] flex-1">
        <SettingsSidebar />
        <main className="min-w-0 flex-1">
          {/* No width cap here: pages decide for themselves. Forms keep a
              readable measure via SectionShell, while board-style pages
              (categories) use the whole screen. */}
          <div className="px-4 py-6 md:px-8 md:py-8">
            <SettingsMobileNav />
            {children}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
