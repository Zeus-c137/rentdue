/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Home: balance + progress, Rent Clock, runs, streak. Every section answers
 * "why come back tomorrow". No totals without action, no decoration.
 */
import React, { useState, useEffect, useMemo } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { UserProfile, SubscribedNode, SubscriptionItem, TransactionRow } from "../types";
import { Flame, Clock, Eye, EyeOff, ChevronRight, Plus, Check } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import {
  getRunProgress,
  getRunEndMs,
  formatCountdownShort,
  formatClock,
  msToNairobiMidnight,
  getDaypartGreeting,
  getTodayKey,
} from "../utils/runs";

interface DashboardViewProps {
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onNavigateToCatalog: () => void;
  onNavigateToIncome: () => void;
}

function themeConfettiColors(): string[] {
  try {
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--theme-primary").trim() || "#C6FF00";
    const secondary = styles.getPropertyValue("--theme-secondary").trim() || "#A3E635";
    return [primary, secondary, "#FFFFFF"];
  } catch {
    return ["#C6FF00", "#A3E635", "#FFFFFF"];
  }
}

export default function DashboardView({
  profile,
  activeNodes,
  items,
  onNavigateToCatalog,
  onNavigateToIncome,
}: DashboardViewProps) {
  const { formatCurrency } = useCurrency();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showBalance, setShowBalance] = useState(true);
  const [range, setRange] = useState<"today" | "week">("today");
  const [weekEarnings, setWeekEarnings] = useState<number | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkedInLocal, setCheckedInLocal] = useState(false);

  // Rent Clock tick — gated to visible tab.
  useGatedInterval(
    () => {
      if (!document.hidden) setNowMs(Date.now());
    },
    1000,
    { enabled: true, visibilityGate: true }
  );

  const todayEarnings = useMemo(() => {
    let today = 0;
    for (const n of activeNodes) {
      if (n.status !== "active") continue;
      const mapped = items.find((i) => i.id === n.itemId || i.name === n.itemName);
      today += mapped?.dailyYield !== undefined ? mapped.dailyYield : n.dailyYield || 0;
    }
    return today;
  }, [activeNodes, items]);

  // Week progress: credited daily yields from the ledger, fetched lazily on
  // first toggle so today-only views cost nothing.
  useEffect(() => {
    if (range !== "week" || weekEarnings !== null || weekLoading) return;
    const ctrl = new AbortController();
    setWeekLoading(true);
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${profile.phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || !Array.isArray(rows)) return;
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        let sum = 0;
        for (const tx of rows) {
          if (String(tx.type || "").toLowerCase() !== "daily_yield") continue;
          if (!["SUCCESSFUL", "COMPLETED"].includes(String(tx.status || "").toUpperCase())) continue;
          const ts = new Date(tx.timestamp).getTime();
          if (!Number.isFinite(ts) || ts < cutoff) continue;
          sum += Number(tx.amount) || 0;
        }
        setWeekEarnings(sum);
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setWeekLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, profile.phone]);

  const activeRuns = useMemo(() => {
    const list = activeNodes.filter((n) => n.status === "active");
    list.sort((a, b) => (getRunEndMs(a) ?? Infinity) - (getRunEndMs(b) ?? Infinity));
    return list;
  }, [activeNodes]);

  // Rent Clock: shared daily-credit heartbeat — identical for every run,
  // so mixed products/durations never make it meaningless.
  const dailyRemaining = useMemo(() => msToNairobiMidnight(new Date(nowMs)), [nowMs]);

  const todayKey = getTodayKey();
  const checkedInToday = checkedInLocal || profile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(profile.checkinStreak) || 0);

  const handleCheckin = async () => {
    if (checkedInToday || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const res = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check-in failed.");
      setCheckedInLocal(true);
      const bonus = Number(data.amount ?? data.bonus ?? 0);
      toast.success(bonus > 0 ? `Checked in! +${formatCurrency(bonus)}` : "Checked in! Streak kept alive.");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({
          particleCount: 45,
          spread: 70,
          startVelocity: 32,
          origin: { y: 0.7 },
          colors: themeConfettiColors(),
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Check-in failed.");
    } finally {
      setCheckinBusy(false);
    }
  };

  const rangeValue = range === "today" ? todayEarnings : weekEarnings;
  const greetingName = profile.username || "Operator";
  const balanceText = showBalance ? formatCurrency(Number(profile.points) || 0) : `${formatCurrency(0).replace(/[\d.,]+/, "••••")}`;

  return (
    <div className="space-y-5 text-[var(--theme-text)]">
      {/* Balance hero — one balance, plus progress */}
      <section className="px-1 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
            Balance
          </p>
          <button
            type="button"
            aria-label={showBalance ? "Hide balance" : "Show balance"}
            onClick={() => setShowBalance((v) => !v)}
            className="w-8 h-8 flex items-center justify-center text-[var(--theme-text)] opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            {showBalance ? <Eye className="w-4.5 h-4.5" /> : <EyeOff className="w-4.5 h-4.5" />}
          </button>
        </div>
        <p className="mt-1 font-display font-black text-[34px] leading-none tracking-tight truncate">
          {balanceText}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[13px] font-sans font-bold text-[var(--theme-primary)]">
            {range === "today" ? (
              <>+{formatCurrency(todayEarnings)} today</>
            ) : weekLoading || rangeValue === null ? (
              <span className="opacity-60">Tallying the week…</span>
            ) : (
              <>+{formatCurrency(rangeValue)} this week</>
            )}
          </p>
          <div className="flex rounded-full border border-[var(--theme-card-border)] p-0.5 text-[11px] font-sans font-bold">
            {(["today", "week"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-full capitalize transition-colors cursor-pointer ${
                  range === r ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "text-[var(--theme-text-muted)]"
                }`}
              >
                {r === "today" ? "Today" : "Week"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="font-display font-bold text-[15px] text-[var(--theme-text-muted)] px-1 -mt-2">
        {getDaypartGreeting()}, {greetingName}.
      </p>

      {/* Rent Clock — shared daily heartbeat; per-run paydays live in the rows */}
      <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-5">
        <div className="flex items-center gap-2 text-[var(--theme-primary)]">
          <Clock className="w-4 h-4" />
          <p className="text-[11px] font-display font-black uppercase tracking-[0.14em]">Next progress in</p>
        </div>
        <p className="mt-2 font-mono font-bold text-[30px] leading-none tracking-tight tabular-nums">
          {formatClock(dailyRemaining)}
        </p>
        {activeRuns.length > 0 ? (
          <p className="mt-2 text-[13px] font-sans text-[var(--theme-text-muted)]">
            Active runs credit automatically.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13px] font-sans text-[var(--theme-text-muted)]">
              Start a Run to earn daily progress.
            </p>
            <button
              type="button"
              onClick={onNavigateToCatalog}
              className="mt-4 w-full py-3.5 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Start your first Run
            </button>
          </>
        )}
      </section>

      {/* Runs — one card, two rows, overflow as a count */}
      {activeRuns.length > 0 && (
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] px-4 py-2">
          <div className="flex items-center justify-between py-2.5">
            <h2 className="font-display font-black text-[15px]">
              Active Runs <span className="text-[var(--theme-text-muted)] font-bold">{activeRuns.length}</span>
            </h2>
            <button
              type="button"
              onClick={onNavigateToIncome}
              className="text-[13px] font-sans font-bold text-[var(--theme-primary)] hover:underline cursor-pointer"
            >
              View all{activeRuns.length > 2 ? ` • +${activeRuns.length - 2}` : ""}
            </button>
          </div>
          {activeRuns.slice(0, 2).map((node) => {
            const progress = getRunProgress(node);
            const dailyPct = node.amount > 0 ? ((node.dailyYield / node.amount) * 100).toFixed(1) : "0.0";
            const endMs = getRunEndMs(node);
            const dueMs = endMs === null ? 0 : endMs - nowMs;
            return (
              <button
                key={node.id}
                type="button"
                onClick={onNavigateToIncome}
                  className="w-full text-left py-3.5 border-t border-[var(--theme-card-border)] transition-all active:opacity-70 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-black text-[15px] truncate">{node.itemName}</p>
                  <ChevronRight className="w-4 h-4 opacity-40 shrink-0" />
                </div>
                <p className="mt-0.5 text-xs font-sans text-[var(--theme-text-muted)]">
                  {formatCurrency(node.amount)} • {node.duration}d • {dailyPct}% daily
                </p>
                <div className="mt-3 h-2.5 rounded-full bg-[var(--theme-text)]/10 overflow-hidden">
                  <div
                    className="h-full run-progress-fill transition-[width] duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-sans">
                  <span className="text-[var(--theme-text-muted)] font-semibold">
                    {progress.elapsed} / {progress.total} days
                    {dueMs > 0 ? ` • due in ${formatCountdownShort(dueMs)}` : " • matured"}
                  </span>
                  <span className="font-bold text-[var(--theme-primary)]">+{formatCurrency(node.totalEarned || 0)}</span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Streak */}
      <section className="flex items-center gap-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-4">
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            streak > 0 ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "bg-[var(--theme-text)]/10 text-[var(--theme-text-muted)]"
          }`}
        >
          <Flame className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black text-[15px] leading-tight">
            {streak > 0 ? `${streak} day streak` : "Start your streak"}
          </p>
          <p className="text-xs font-sans text-[var(--theme-text-muted)]">
            {checkedInToday ? "Checked in — see you tomorrow." : "Check in today to keep it alive."}
          </p>
        </div>
        {checkedInToday ? (
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] flex items-center justify-center">
            <Check className="w-4.5 h-4.5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={handleCheckin}
            disabled={checkinBusy}
            className="shrink-0 px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-bold transition-all active:scale-[0.97] disabled:opacity-60 cursor-pointer"
          >
            {checkinBusy ? "…" : "Check in"}
          </button>
        )}
      </section>
    </div>
  );
}
