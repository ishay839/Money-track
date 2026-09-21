import "server-only";

import { runAllWorkspaces } from "@/server/sync/orchestrator";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import { syncDueBalances } from "@/server/balances/sync";

interface SchedulerState {
  timeoutId: ReturnType<typeof setTimeout> | null;
  nextRunAt: number | null;
  running: boolean;
  initialized: boolean;
  exitHandlerRegistered: boolean;
}

declare global {
  var __spentScheduler: SchedulerState | undefined;
}

function getState(): SchedulerState {
  if (!globalThis.__spentScheduler) {
    globalThis.__spentScheduler = {
      timeoutId: null,
      nextRunAt: null,
      running: false,
      initialized: false,
      exitHandlerRegistered: false,
    };
  }
  return globalThis.__spentScheduler;
}

const TZ = "Asia/Jerusalem";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** setTimeout's signed 32-bit ceiling, minus a margin. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function intlParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some Intl impls report hour 24 at midnight; normalise.
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export type SyncFrequency = "daily" | "weekly" | "monthly";

/**
 * Milliseconds until the next run, in Jerusalem local time.
 *
 * Daily   - the next occurrence of the target time.
 * Weekly  - the next Sunday at the target time (the start of the Israeli week).
 * Monthly - the target day-of-month at the target time, next month if that
 *           moment has already passed this month.
 *
 * dayOfMonth is capped at 28 upstream, so "the 30th" can never quietly skip
 * February.
 */
function computeNextDelay(
  targetHHMM: string,
  frequency: SyncFrequency = "daily",
  dayOfMonth = 1
): number {
  const [tHour, tMin] = targetHHMM.split(":").map(Number);
  const now = new Date();
  const jlm = intlParts(now);

  const nowMs = Date.UTC(
    jlm.year,
    jlm.month - 1,
    jlm.day,
    jlm.hour,
    jlm.minute,
    jlm.second
  );

  if (frequency === "monthly") {
    const day = Math.min(Math.max(dayOfMonth, 1), 28);
    let candidateMs = Date.UTC(jlm.year, jlm.month - 1, day, tHour, tMin, 0);
    if (candidateMs <= nowMs) {
      // Date.UTC normalises month 12 into January of the next year.
      candidateMs = Date.UTC(jlm.year, jlm.month, day, tHour, tMin, 0);
    }
    return candidateMs - nowMs;
  }

  if (frequency === "weekly") {
    const todayIndex = new Date(
      Date.UTC(jlm.year, jlm.month - 1, jlm.day)
    ).getUTCDay(); // 0 = Sunday
    let daysAhead = (7 - todayIndex) % 7;
    let candidateMs = Date.UTC(
      jlm.year,
      jlm.month - 1,
      jlm.day + daysAhead,
      tHour,
      tMin,
      0
    );
    // Already past the time on the target day itself: go a full week on.
    if (candidateMs <= nowMs) {
      daysAhead += 7;
      candidateMs = Date.UTC(
        jlm.year,
        jlm.month - 1,
        jlm.day + daysAhead,
        tHour,
        tMin,
        0
      );
    }
    return candidateMs - nowMs;
  }

  let candidateMs = Date.UTC(jlm.year, jlm.month - 1, jlm.day, tHour, tMin, 0);
  if (candidateMs <= nowMs) {
    candidateMs += 24 * 3600 * 1000;
  }
  return candidateMs - nowMs;
}

/**
 * The most recent moment the schedule should have fired, as epoch ms.
 *
 * Mirrors computeNextDelay backwards. Used to answer "did we miss one while
 * the machine was off?" - the schedule lives in the server process, so a
 * computer that is asleep at 06:00 simply never fires.
 */
function computePreviousSlot(
  targetHHMM: string,
  frequency: SyncFrequency,
  dayOfMonth: number
): number {
  const [tHour, tMin] = targetHHMM.split(":").map(Number);
  const jlm = intlParts(new Date());
  const nowMs = Date.UTC(
    jlm.year,
    jlm.month - 1,
    jlm.day,
    jlm.hour,
    jlm.minute,
    jlm.second
  );

  if (frequency === "monthly") {
    const day = Math.min(Math.max(dayOfMonth, 1), 28);
    const thisMonth = Date.UTC(jlm.year, jlm.month - 1, day, tHour, tMin, 0);
    // Date.UTC normalises month -1 into December of the previous year.
    return thisMonth <= nowMs
      ? thisMonth
      : Date.UTC(jlm.year, jlm.month - 2, day, tHour, tMin, 0);
  }

  if (frequency === "weekly") {
    const todayIndex = new Date(
      Date.UTC(jlm.year, jlm.month - 1, jlm.day)
    ).getUTCDay();
    const thisWeek = Date.UTC(
      jlm.year,
      jlm.month - 1,
      jlm.day - todayIndex,
      tHour,
      tMin,
      0
    );
    return thisWeek <= nowMs ? thisWeek : thisWeek - 7 * 86400000;
  }

  const today = Date.UTC(jlm.year, jlm.month - 1, jlm.day, tHour, tMin, 0);
  return today <= nowMs ? today : today - 86400000;
}

function getLastScheduledRunMs(): number | null {
  const raw = getGlobalSetting("auto_sync_last_run_slot");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setLastScheduledRunMs(slotMs: number): void {
  setGlobalSetting("auto_sync_last_run_slot", String(slotMs));
}

function readSettings(): {
  enabled: boolean;
  time: string;
  frequency: SyncFrequency;
  dayOfMonth: number;
} {
  const enabled = getGlobalSetting("auto_sync_enabled") === "true";
  const time = getGlobalSetting("auto_sync_time");
  const safeTime = time && TIME_RE.test(time) ? time : "06:00";

  const rawFreq = getGlobalSetting("auto_sync_frequency");
  const frequency: SyncFrequency =
    rawFreq === "weekly" || rawFreq === "monthly" ? rawFreq : "daily";

  const rawDay = Number(getGlobalSetting("auto_sync_day_of_month") ?? "1");
  const dayOfMonth =
    Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 28 ? rawDay : 1;

  return { enabled, time: safeTime, frequency, dayOfMonth };
}

function cancel(): void {
  const state = getState();
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
    state.nextRunAt = null;
    console.log("[scheduler] cancelled");
  }
}

function armNext(): void {
  const state = getState();
  const { enabled, time, frequency, dayOfMonth } = readSettings();
  if (!enabled) {
    state.nextRunAt = null;
    return;
  }

  const delayMs = computeNextDelay(time, frequency, dayOfMonth);
  state.nextRunAt = Date.now() + delayMs;

  // setTimeout stores its delay in a signed 32-bit int (~24.8 days). A larger
  // value silently wraps and fires immediately, which for a monthly schedule
  // would mean syncing in a tight loop instead of once a month. Wait in hops
  // and re-check, so any delay is safe.
  const scheduleHop = () => {
    const remaining = (state.nextRunAt ?? Date.now()) - Date.now();
    if (remaining <= MAX_TIMEOUT_MS) {
      state.timeoutId = setTimeout(fire, Math.max(remaining, 0));
    } else {
      state.timeoutId = setTimeout(scheduleHop, MAX_TIMEOUT_MS);
    }
  };
  scheduleHop();
  console.log(
    `[scheduler] armed (${frequency}) for ${new Date(
      state.nextRunAt
    ).toISOString()} (in ${Math.round(delayMs / 1000)}s)`
  );
}

async function fire(reason: "due" | "catch-up" = "due"): Promise<void> {
  const state = getState();
  state.timeoutId = null;

  if (state.running) {
    console.warn("[scheduler] skip fire — previous run still in progress");
    armNext();
    return;
  }

  const { time, frequency, dayOfMonth } = readSettings();

  state.running = true;
  console.log(`[scheduler] running (${reason})`);
  try {
    await runAllWorkspaces(undefined, undefined, "scheduled");
    await syncDueBalances();
    // Recorded only on success, so a failed run is retried as a missed slot
    // the next time the server starts rather than being counted as done.
    setLastScheduledRunMs(computePreviousSlot(time, frequency, dayOfMonth));
    console.log("[scheduler] done");
  } catch (err) {
    console.error("[scheduler] run failed:", err);
  } finally {
    state.running = false;
    armNext();
  }
}

export { computeNextDelay as __computeNextDelayForTests };

export function reschedule(): void {
  cancel();
  armNext();
}

/**
 * Runs a slot that was missed while the machine was off.
 *
 * The schedule lives in the server process, so a computer asleep at 06:00 -
 * or simply switched off for a fortnight - never fires. On startup we compare
 * the slot that should most recently have run against the last one actually
 * recorded, and if the machine missed it, sync now.
 *
 * Deliberately at most one catch-up: someone returning from a month away wants
 * current data, not thirty sequential scrapes of the same accounts.
 */
function runCatchUpIfMissed(): void {
  const { enabled, time, frequency, dayOfMonth } = readSettings();
  if (!enabled) return;

  const previousSlot = computePreviousSlot(time, frequency, dayOfMonth);
  const lastRun = getLastScheduledRunMs();

  if (lastRun === null) {
    // First time with auto-sync on: treat the current slot as satisfied rather
    // than scraping the banks the moment the setting is switched on.
    setLastScheduledRunMs(previousSlot);
    return;
  }

  if (lastRun >= previousSlot) return;

  const missedDays = Math.round((previousSlot - lastRun) / 86400000);
  console.log(
    `[scheduler] missed a scheduled run (last ${new Date(
      lastRun
    ).toISOString()}, due ${new Date(previousSlot).toISOString()}, ` +
      `${missedDays}d) - catching up now`
  );
  // Fire and forget: startup must not block on a bank scrape.
  void fire("catch-up");
}

export function initScheduler(): void {
  const state = getState();
  if (state.initialized) {
    cancel();
    armNext();
    return;
  }
  state.initialized = true;
  armNext();
  registerExitHandlers();
  runCatchUpIfMissed();
}

export function getNextRunAt(): string | null {
  const state = getState();
  if (state.nextRunAt == null) return null;
  return new Date(state.nextRunAt).toISOString();
}

function registerExitHandlers(): void {
  const state = getState();
  if (state.exitHandlerRegistered) return;
  state.exitHandlerRegistered = true;
  const stop = () => cancel();
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
}
