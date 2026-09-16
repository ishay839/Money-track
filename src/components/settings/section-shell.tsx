import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  /**
   * Forms read badly when stretched across a wide monitor, so a section keeps
   * a comfortable measure by default. Pages that lay content out in columns -
   * the category board - opt out and use the full width instead.
   */
  fullWidth?: boolean;
}

export function SectionShell({
  title,
  description,
  children,
  fullWidth = false,
}: SectionShellProps) {
  return (
    <div className={cn("space-y-5", !fullWidth && "max-w-4xl")}>
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

interface SettingCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function SettingCard({
  title,
  description,
  children,
}: SettingCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="font-medium">{title}</h3>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
