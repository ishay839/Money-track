"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The month the user is looking at, shared across Budget, Transactions and
 * Income.
 *
 * Each page used to keep its own `selectedDate`, so stepping back to July on
 * one screen and switching to another dropped you back into the current month -
 * you had to navigate back every time you changed page. The value lives in
 * sessionStorage rather than component state so it survives navigation, and
 * in session rather than local storage so a fresh window starts on the current
 * month instead of resuming wherever you were days ago.
 *
 * Opening the home page clears it, which is the one place that always means
 * "where do things stand now".
 */

const KEY = "spent:selected-month";

/** YYYY-MM, the only shape stored. Anything else is treated as absent. */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Noon, so a DST shift can never roll the date into an adjacent month. */
function dateFromMonthKey(key: string): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0);
}

function readStored(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw && MONTH_RE.test(raw) ? dateFromMonthKey(raw) : null;
  } catch {
    // Private windows and locked-down browsers throw on access.
    return null;
  }
}

function writeStored(date: Date | null): void {
  if (typeof window === "undefined") return;
  try {
    if (date === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, monthKeyOf(date));
  } catch {
    // Not being able to remember the month is not worth breaking the page for.
  }
}

/** Same-tab listeners; the storage event only fires in *other* tabs. */
const listeners = new Set<(date: Date | null) => void>();

function broadcast(date: Date | null): void {
  for (const listener of listeners) listener(date);
}

export function clearSelectedMonth(): void {
  writeStored(null);
  broadcast(null);
}

export function isCurrentMonth(date: Date): boolean {
  return monthKeyOf(date) === monthKeyOf(new Date());
}

/**
 * `null` means "no explicit choice" - the caller decides what that defaults to,
 * because the pages disagree: Transactions falls back to the newest
 * transaction's month, the others to today.
 */
export function useSelectedMonth(): {
  selectedDate: Date | null;
  setSelectedDate: (date: Date | null) => void;
} {
  // Starts null on the server and on first paint, so the markup matches; the
  // effect below fills in the stored value.
  const [selectedDate, setLocal] = useState<Date | null>(null);

  useEffect(() => {
    setLocal(readStored());
    const listener = (date: Date | null) => setLocal(date);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setSelectedDate = useCallback((date: Date | null) => {
    writeStored(date);
    setLocal(date);
    broadcast(date);
  }, []);

  return { selectedDate, setSelectedDate };
}
