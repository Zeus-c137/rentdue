/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared Run helpers: progress estimates, maturity countdowns, greetings.
 * Used by Home today; Income adopts them when its own estimate is replaced.
 */
import type { SubscribedNode } from "../types";

export interface RunProgress {
  elapsed: number;
  total: number;
  percent: number;
}

/**
 * Day-count estimate from credited earnings. Matches IncomeView's current
 * math so both screens agree until Income moves to date-based progress.
 */
export function getRunElapsedDays(node: SubscribedNode): number {
  const total = Math.max(1, Math.floor(Number(node.duration) || 0));
  const daily = Number(node.dailyYield) || 0;
  if (daily <= 0) return 1;
  const earned = Number(node.totalEarned) || 0;
  return Math.min(total, Math.max(1, Math.floor(earned / daily)));
}

export function getRunProgress(node: SubscribedNode): RunProgress {
  const total = Math.max(1, Math.floor(Number(node.duration) || 0));
  const elapsed = getRunElapsedDays(node);
  return { elapsed, total, percent: Math.min(100, Math.max(0, (elapsed / total) * 100)) };
}

export function getRunEndMs(node: SubscribedNode): number | null {
  const ms = new Date(node.endDate).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Nearest-maturing active run — the Rent Clock target. */
export function getNextMaturingRun(nodes: SubscribedNode[]): SubscribedNode | null {
  let best: SubscribedNode | null = null;
  let bestMs = Infinity;
  for (const node of nodes) {
    if (node.status !== "active") continue;
    const ms = getRunEndMs(node);
    if (ms === null) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = node;
    }
  }
  return best;
}

/** "06D 14:22:08" — days + clock, zero-padded. Clamps at zero. */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(days).padStart(2, "0")}D ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Ms until the next Africa/Nairobi midnight — the daily-credit heartbeat. */
export function msToNairobiMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // Nairobi is UTC+3 with no DST: Nairobi midnight starting date D == 21:00
  // UTC on date D itself (00:00+03:00). Next midnight from date D is 21:00 UTC
  // on date D — NOT D+1, which overshoots by a full day.
  const utcMidnight = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    21,
    0,
    0
  );
  let remaining = utcMidnight - now.getTime();
  // Exactly at/after midnight UTC artificats: roll to the next one.
  if (remaining <= 0) remaining += 24 * 3600 * 1000;
  return remaining;
}

/** Clock "07:12:44" for the sub-24h daily countdown. */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Compact "12D 04:00:11" for run rows — seconds included so rows visibly tick. */
export function formatCountdownShort(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}D ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Time-of-day greeting on platform time (Africa/Nairobi). */
export function getDaypartGreeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** UTC day key — matches dailyCheckin and ProfileView's todayStr. */
export function getTodayKey(date = new Date()): string {
  return date.toISOString().split("T")[0];
}
