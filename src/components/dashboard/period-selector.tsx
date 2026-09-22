"use client";

import { Button } from "@/components/ui/button";

interface PeriodSelectorProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /**
   * Shown under the month, only while looking at some other month. Omit it and
   * nothing renders, so callers that have no notion of "current" are unchanged.
   */
  onCurrent?: () => void;
  /** False while viewing another month; that is when the way back is offered. */
  isCurrent?: boolean;
  currentLabel?: string;
}

export function PeriodSelector({
  label,
  onPrev,
  onNext,
  onCurrent,
  isCurrent = true,
  currentLabel = "חזרה לחודש הנוכחי",
}: PeriodSelectorProps) {
  const showBack = Boolean(onCurrent) && !isCurrent;

  return (
    // The wrapper is only a positioning context for the link below, so the
    // control itself keeps the exact height it had before.
    <div className="relative">
      <div className="flex items-center gap-0.5 rounded-md border border-input bg-background px-1">
        <Button variant="ghost" size="icon-sm" onClick={onPrev}>
          <svg
            className="h-3.5 w-3.5 rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Button>
        <span className="min-w-[120px] text-center text-sm font-medium tabular-nums">
          {label}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onNext}>
          <svg
            className="h-3.5 w-3.5 rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Button>
      </div>

      {showBack ? (
        <button
          type="button"
          onClick={onCurrent}
          className="absolute inset-x-0 top-full mt-0.5 truncate text-center text-[11px] font-medium text-primary hover:underline"
        >
          {currentLabel}
        </button>
      ) : null}
    </div>
  );
}
