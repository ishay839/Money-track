"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Landmark,
  ArrowLeftRight,
  ChartColumnIncreasing,
  Layers,
  TrendingDown,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface NavDef {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

const NAV: NavDef[] = [
  {
    href: "/",
    labelKey: "home",
    Icon: LayoutDashboard,
    match: (p: string) => p === "/",
  },
  {
    href: "/budget",
    labelKey: "budget",
    Icon: Wallet,
    match: (p: string) => p.startsWith("/budget"),
  },
  {
    href: "/income",
    labelKey: "income",
    Icon: TrendingDown,
    match: (p: string) => p.startsWith("/income"),
  },
  {
    href: "/transactions",
    labelKey: "transactions",
    Icon: ArrowLeftRight,
    match: (p: string) => p.startsWith("/transactions"),
  },
  {
    href: "/insights",
    labelKey: "insights",
    Icon: ChartColumnIncreasing,
    match: (p: string) => p.startsWith("/insights"),
  },
  {
    href: "/tracks",
    labelKey: "tracks",
    Icon: Layers,
    match: (p: string) => p.startsWith("/tracks"),
  },
  {
    href: "/investments",
    labelKey: "investments",
    Icon: TrendingUp,
    match: (p: string) => p.startsWith("/investments"),
  },
  {
    href: "/balances",
    labelKey: "balances",
    Icon: Landmark,
    match: (p: string) => p.startsWith("/balances"),
  },
];

const FOOTER_NAV: NavDef[] = [
  {
    href: "/settings",
    labelKey: "settings",
    Icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pb-1 pt-3">
        <Link
          href="/"
          className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors duration-200 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">₪</span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-serif text-[17px] font-semibold leading-tight tracking-tight">
              מעקב כלכלי
            </div>
            <div className="mt-0.5 text-xs font-medium leading-tight text-muted-foreground">
              {t("brandTagline")}
            </div>
          </div>
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const label = t(item.labelKey);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href}>
                          <item.Icon />
                          <span>{label}</span>
                        </Link>
                      }
                      isActive={item.match(pathname)}
                      tooltip={label}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {FOOTER_NAV.map((item) => {
                const label = t(item.labelKey);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href}>
                          <item.Icon />
                          <span>{label}</span>
                        </Link>
                      }
                      isActive={item.match(pathname)}
                      tooltip={label}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
