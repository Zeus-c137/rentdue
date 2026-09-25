/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Home: balance + progress, Rent Clock, runs, streak. Every section answers
 * "why come back tomorrow". No totals without action, no decoration.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { UserProfile, SubscribedNode, SubscriptionItem, TransactionRow } from "../types";
import { Flame, Eye, EyeOff, Plus, Check, X } from "lucide-react";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "motion/react";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import {
  getRunProgress,
  getRunEndMs,
  formatCountdownShort,
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
  onProfileUpdate: (p: UserProfile) => void;
}

interface FlightCoin {
  id: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  delay: number;
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
  onProfileUpdate,
}: DashboardViewProps) {
  const { formatCurrency } = useCurrency();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showBalance, setShowBalance] = useState(true);
  const [range, setRange] = useState<"today" | "week">("today");
  const [weekEarnings, setWeekEarnings] = useState<number | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkedInLocal, setCheckedInLocal] = useState(false);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const checkinBtnRef = useRef<HTMLButtonElement>(null);
  const todayKey = getTodayKey();
  const [streakDismissed, setStreakDismissed] = useState(
    () => localStorage.getItem(`home_streak_dismissed_${todayKey}`) === "1"
  );

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

  // Shared heartbeat: every run credits at Nairobi midnight, so every row
  // ticks to the same moment regardless of product mix.
  const creditIn = msToNairobiMidnight(new Date(nowMs));

  const checkedInToday = checkedInLocal || profile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(profile.checkinStreak) || 0);

  const deliverCheckin = (bonus: number, streak: number) => {
    // Atomic balance update: parent profile swaps the moment coins land.
    onProfileUpdate({
      ...profile,
      points: (Number(profile.points) || 0) + bonus,
      lastCheckinDate: todayKey,
      checkinStreak: streak,
    });
    setCheckedInLocal(true);
    setCoins(null);
    toast.success(bonus > 0 ? `Checked in! +${formatCurrency(bonus)}` : "Checked in! Streak kept alive.");
  };

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
      const bonus = Number(data.amount ?? data.bonus ?? 0);
      const nextStreak = Number(data.streak ?? streak + 1);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const root = rootRef.current;
      const from = checkinBtnRef.current?.getBoundingClientRect();
      const to = balanceRef.current?.getBoundingClientRect();
      if (!reduced && root && from && to) {
        // Gold coins fly from the check-in button to the balance, then the
        // balance updates — the reward visibly arrives.
        const rootRect = root.getBoundingClientRect();
        const startX = from.left + from.width / 2 - rootRect.left;
        const startY = from.top + from.height / 2 - rootRect.top;
        const endX = to.left + to.width / 2 - rootRect.left;
        const endY = to.top + to.height / 2 - rootRect.top;
        setCoins(
          Array.from({ length: 10 }, (_, i) => ({
            id: Date.now() + i,
            startX: startX + (Math.random() - 0.5) * 24,
            startY: startY + (Math.random() - 0.5) * 10,
            dx: endX - startX + (Math.random() - 0.5) * 30,
            dy: endY - startY,
            delay: i * 0.06,
          }))
        );
        window.setTimeout(() => deliverCheckin(bonus, nextStreak), 1050);
      } else {
        deliverCheckin(bonus, nextStreak);
      }
      if (!reduced) {
        confetti({
          particleCount: 25,
          spread: 60,
          startVelocity: 28,
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

  const dismissStreak = () => {
    localStorage.setItem(`home_streak_dismissed_${todayKey}`, "1");
    setStreakDismissed(true);
  };

  const rangeValue = range === "today" ? todayEarnings : weekEarnings;
  const greetingName = profile.username || "Operator";
  const balanceText = showBalance ? formatCurrency(Number(profile.points) || 0) : `${formatCurrency(0).replace(/[\d.,]+/, "••••")}`;

  return (
    <div ref={rootRef} className="relative space-y-5 text-[var(--theme-text)]">
      {/* Coin flight: check-in reward travels to the balance */}
      <AnimatePresence>
        {coins && (
          <div className="absolute inset-0 z-30 pointer-events-none overflow-visible">
            {coins.map((coin) => (
              <motion.img
                key={coin.id}
                src={dollar3d}
                alt=""
                initial={{ x: 0, y: 0, scale: 0.7, opacity: 1 }}
                animate={{ x: coin.dx, y: coin.dy, scale: 0.25, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, delay: coin.delay, ease: "easeIn" }}
                className="absolute w-9 h-9 object-contain"
                style={{ left: coin.startX - 18, top: coin.startY - 18 }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
      <p className="font-display font-black text-[22px] leading-tight tracking-tight px-1">
        {getDaypartGreeting()}, {greetingName}.
      </p>

      {/* Balance hero — one balance, plus progress */}
      <section className="px-1">
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
        <p ref={balanceRef} className="mt-1.5 font-display font-black text-[40px] leading-none tracking-tight truncate">
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

      {/* Empty state — the loop entry */}
      {activeRuns.length === 0 && (
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-5 text-center">
          <p className="font-display font-black text-lg">No active runs.</p>
          <p className="mt-1 text-[13px] font-sans text-[var(--theme-text-muted)]">Start one to put your money in motion.</p>
          <button
            type="button"
            onClick={onNavigateToCatalog}
            className="mt-4 w-full py-3.5 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Start your first Run
          </button>
        </section>
      )}

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
            const endMs = getRunEndMs(node);
            const dueMs = endMs === null ? 0 : endMs - nowMs;
            const mapped = items.find((i) => i.id === node.itemId || i.name === node.itemName);
            const thumb = mapped?.imageUrl || node.image || "";
            return (
              <button
                key={node.id}
                type="button"
                onClick={onNavigateToIncome}
                className="w-full text-left py-3.5 transition-all active:opacity-70 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" decoding="async" className="w-11 h-11 rounded-xl object-cover shrink-0 bg-[var(--theme-text)]/5" />
                  ) : (
                    <span className="w-11 h-11 rounded-xl shrink-0 bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] font-display font-black text-lg flex items-center justify-center">
                      {node.itemName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display font-black text-[15px] truncate">{node.itemName}</p>
                      <span
                        className="font-mono font-bold text-[13px] tabular-nums shrink-0 bg-clip-text text-transparent"
                        style={{
                          backgroundImage:
                            "linear-gradient(180deg, var(--hut-gold-300-glossy) 0%, var(--hut-gold-500) 70%, var(--hut-gold-700) 100%)",
                        }}
                      >
                        {Math.round(progress.percent)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 rounded-full bg-[var(--theme-text)]/10 overflow-hidden">
                      <div
                        className="h-full run-progress-fill transition-[width] duration-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-right font-mono font-bold text-xs tabular-nums text-[var(--theme-text)]">
                      {dueMs > 0 ? formatCountdownShort(creditIn) : "MATURED"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Streak — dismissible once done, back with the new day */}
      {(!checkedInToday || !streakDismissed) && (
        <section className="flex items-center gap-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-4">
          <span className="w-10 h-10 flex items-center justify-center shrink-0 bg-transparent">
            {streak > 0 ? (
              <Flame className="w-7 h-7 text-[var(--theme-primary)]" fill="currentColor" />
            ) : (
              <Flame className="w-7 h-7 text-[var(--theme-text-muted)]" />
            )}
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
            <span className="shrink-0 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] text-[13px] font-sans font-bold">
                <Check className="w-4 h-4" /> Checked in
              </span>
              <button
                type="button"
                aria-label="Dismiss streak"
                onClick={dismissStreak}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--theme-text)] opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          ) : (
            <button
              ref={checkinBtnRef}
              type="button"
              onClick={handleCheckin}
              disabled={checkinBusy}
              className="shrink-0 px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-bold transition-all active:scale-[0.97] disabled:opacity-60 cursor-pointer"
            >
              {checkinBusy ? "…" : "Check in"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
