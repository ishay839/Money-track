"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface CardShellProps {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * When set, the card can be folded away and the choice is remembered under
   * this localStorage key. The heading stays put with a chevron beside it, so
   * a hidden card is still one click from coming back.
   */
  collapsibleKey?: string;
}

export function CardShell({
  label,
  action,
  children,
  className,
  collapsibleKey,
}: CardShellProps) {
  const collapsible = collapsibleKey != null;
  // Start expanded on the server and on the first client paint, then adopt the
  // stored preference in an effect - reading localStorage during render would
  // make the markup differ between server and client.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!collapsibleKey) return;
    try {
      setCollapsed(window.localStorage.getItem(collapsibleKey) === "1");
    } catch {
      // Storage unavailable (private window, blocked cookies): stay expanded.
    }
  }, [collapsibleKey]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (!collapsibleKey) return;
    try {
      window.localStorage.setItem(collapsibleKey, next ? "1" : "0");
    } catch {
      // Preference simply will not persist; the toggle still works this visit.
    }
  };

  return (
    <div className={cn("surface flex h-full flex-col p-5 md:p-6", className)}>
      {(label || action || collapsible) && (
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            collapsed ? "mb-0" : "mb-4"
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {label && <h3 className="card-label">{label}</h3>}
            {collapsible && (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                title={collapsed ? "הצגה" : "הסתרה"}
                aria-label={collapsed ? `הצגת ${label ?? ""}` : `הסתרת ${label ?? ""}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    collapsed && "-rotate-90 rtl:rotate-90"
                  )}
                />
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-sm">
            {!collapsed && action}
            {collapsible && (
              <button
                type="button"
                onClick={toggle}
                title={collapsed ? "הצגה" : "הסתרה"}
                aria-label={collapsed ? `הצגת ${label ?? ""}` : `הסתרת ${label ?? ""}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                {collapsed ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
      {!collapsed && children}
    </div>
  );
}

export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-accent"
    >
      {children}
      <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
    </Link>
  );
}

export function CardSkeleton({
  label,
  height = 140,
  className,
}: {
  label?: string;
  height?: number;
  className?: string;
}) {
  return (
    <CardShell label={label} className={className}>
      <Skeleton className="w-full rounded-lg" style={{ height }} />
    </CardShell>
  );
}

export function CardError({ label, className }: { label?: string; className?: string }) {
  const t = useTranslations("home");
  return (
    <CardShell label={label} className={className}>
      <div className="flex flex-1 items-center justify-center py-8 text-base text-muted-foreground">
        {t("couldntLoad")}
      </div>
    </CardShell>
  );
}
