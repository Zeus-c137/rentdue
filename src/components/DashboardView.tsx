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
import { Eye, EyeOff, Plus } from "lucide-react";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "motion/react";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import {
  getRunProgress,
  getRunEndMs,
  formatClock,
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

function WeekSpark({ data }: { data: number[] }) {
  const W = 120;
  const H = 36;
  const P = 3;
  const max = Math.max(...data, 0);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = P + (i * (W - P * 2)) / Math.max(1, data.length - 1);
    const y = H - P - ((v - min) / span) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lastX, lastY] = pts[pts.length - 1].split(",");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--theme-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-draw"
      />
      <circle cx={lastX} cy={lastY} r="3" fill="var(--theme-primary)" className="spark-dot" />
    </svg>
  );
}

const PROGRESS_GRADIENT: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, var(--hut-gold-300-glossy) 0%, var(--hut-gold-500) 70%, var(--hut-gold-700) 100%)",
};

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
  const [weekSeries, setWeekSeries] = useState<number[] | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkedInLocal, setCheckedInLocal] = useState(false);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const checkinBtnRef = useRef<HTMLButtonElement>(null);
  const todayKey = getTodayKey();

  // Rent Clock tick — gated to visible tab.
  useGatedInterval(
    () => {
      if (!document.hidden) setNowMs(Date.now());
    },
    1000,
    { enabled: true, visibilityGate: true }
  );

  const weekTotal = weekSeries === null ? null : weekSeries.reduce((sum, v) => sum + v, 0);

  // Week sparkline: everything credited to withdrawable, per day.
  useEffect(() => {
    if (weekSeries !== null) return;
    const ctrl = new AbortController();
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${profile.phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || !Array.isArray(rows)) return;
        const days: number[] = [0, 0, 0, 0, 0, 0, 0];
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startMs = startOfToday.getTime();
        for (const tx of rows) {
          const type = String(tx.type || "").toLowerCase();
          if (!CREDIT_TYPES.has(type)) continue;
          if (!["SUCCESSFUL", "COMPLETED"].includes(String(tx.status || "").toUpperCase())) continue;
          const ts = new Date(tx.timestamp).getTime();
          if (!Number.isFinite(ts)) continue;
          const dayIndex = Math.floor((ts - startMs) / (24 * 3600 * 1000)) + 6;
          if (dayIndex < 0 || dayIndex > 6) continue;
          days[dayIndex] += Number(tx.amount) || 0;
        }
        setWeekSeries(days);
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.phone]);

  const activeRuns = useMemo(() => {
    const list = activeNodes.filter((n) => n.status === "active");
    list.sort((a, b) => (getRunEndMs(a) ?? Infinity) - (getRunEndMs(b) ?? Infinity));
    return list;
  }, [activeNodes]);

  // Next check-in opens at UTC midnight (check-ins settle on UTC days).
  const nextCheckinIn = useMemo(() => {
    const n = new Date(nowMs);
    const midnight = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
    return Math.max(0, midnight - nowMs);
  }, [nowMs]);

  const checkedInToday = checkedInLocal || profile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(profile.checkinStreak) || 0);

  // Full-month streak, same math as the original check-in modal: the server
  // keeps streaks consecutive, so the live run is exactly `todayStreak` days
  // ending today (claimed) or yesterday (claimable). Tiles derive from it.
  const weekTiles = useMemo(() => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const todayMs = Date.UTC(year, month, now.getUTCDate());
    const todayStreak = checkedInToday ? streak : streak + 1;
    const runStartMs = todayMs - (Math.max(1, todayStreak) - 1) * 86400000;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      month: now.toLocaleString("default", { month: "long" }),
      days: Array.from({ length: daysInMonth }, (_, i) => {
        const ms = Date.UTC(year, month, i + 1);
        const key = new Date(ms).toISOString().split("T")[0];
        const isToday = ms === todayMs;
        return {
          key,
          label: String(i + 1),
          isToday,
          isFuture: ms > todayMs,
          // Claimed: inside the live run and (past, or today already checked).
          claimed: ms >= runStartMs && ms <= todayMs && (ms < todayMs || checkedInToday),
        };
      }),
    };
  }, [checkedInToday, streak, todayKey]);
  const tilesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tilesRef.current
      ?.querySelector('[data-today="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, []);

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

  // Every ledger type that credits the withdrawable (Cash Out) balance.
  const CREDIT_TYPES = useMemo(
    () =>
      new Set([
        "daily_yield",
        "referral_signup_bonus",
        "referral_level_income",
        "daily_checkin_bonus",
        "gift_code",
        "vip_task",
        "registration_bonus",
      ]),
    []
  );

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
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-sans font-bold text-[var(--theme-primary)]">
            {weekTotal === null ? (
              <span className="opacity-60">Tallying the week…</span>
            ) : (
              <>+{formatCurrency(weekTotal)} this week</>
            )}
          </p>
          {weekSeries && <WeekSpark data={weekSeries} />}
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
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] px-4 pb-2 pt-4">
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
                        className="font-display font-bold text-[13px] tabular-nums shrink-0 bg-clip-text text-transparent"
                        style={PROGRESS_GRADIENT}
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
                    <p className="mt-1.5 text-right">
                      <span
                        className="font-display font-bold tabular-nums text-xs bg-clip-text text-transparent"
                        style={PROGRESS_GRADIENT}
                      >
                        +{formatCurrency(node.totalEarned || 0)}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Daily streak — mini 7-day run, Mon–Sun */}
      <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display font-black text-[15px] leading-tight">Daily streak</h2>
            <p className="text-[11px] font-sans text-[var(--theme-text-muted)]">
              {weekTiles.month}
            </p>
          </div>
          {checkedInToday ? (
            <span className="shrink-0 font-display font-bold tabular-nums text-[15px] text-[var(--theme-text)]">
              {formatClock(nextCheckinIn)}
            </span>
          ) : (
            <button
              ref={checkinBtnRef}
              type="button"
              onClick={handleCheckin}
              disabled={checkinBusy}
              className="shrink-0 px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-bold transition-all active:scale-[0.97] disabled:opacity-60 cursor-pointer tile-shimmer"
            >
              {checkinBusy ? "…" : "Check in"}
            </button>
          )}
        </div>
        <div ref={tilesRef} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekTiles.days.map((d) => {
            const missed = !d.isFuture && !d.isToday && !d.claimed;
            const active = d.isToday && !d.claimed;
            const inner = (
              <>
                <img
                  src={dollar3d}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`w-7 h-7 object-contain ${missed || d.isFuture ? "grayscale" : ""}`}
                />
                {missed && <div className="absolute inset-0 rounded-xl bg-black/45 pointer-events-none" />}
                <span
                  className={`text-[8px] font-sans font-black uppercase tracking-wide ${
                    d.claimed ? "text-[var(--theme-primary)]" : "text-[var(--theme-text-muted)]"
                  }`}
                >
                  {d.label}
                </span>
              </>
            );
            const cls = `relative rounded-xl w-11 shrink-0 aspect-[4/5] flex flex-col items-center justify-center gap-1 ${
              d.claimed
                ? "bg-[var(--theme-primary)]/15"
                : active
                  ? "border border-[var(--theme-primary)]/70 tile-shimmer"
                  : d.isFuture
                    ? "opacity-40"
                    : ""
            }`;
            return active ? (
              <button
                key={d.key}
                type="button"
                onClick={handleCheckin}
                disabled={checkinBusy}
                aria-label="Check in today"
                data-today="true"
                className={`${cls} cursor-pointer active:scale-95 transition-transform`}
              >
                {inner}
              </button>
            ) : (
              <div key={d.key} data-today={d.isToday || undefined} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
