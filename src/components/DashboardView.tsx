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
import { UserProfile, SubscribedNode, SubscriptionItem, TransactionRow, VipTask, VipTaskboard } from "../types";
import { Plus, Trophy, ChevronRight, CalendarDays, SlidersHorizontal } from "lucide-react";
import { getMilestoneBoard } from "./VipTasksPage";
import { tierMetaFor } from "../utils/vip";
import { motion, AnimatePresence } from "motion/react";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import {
  getRunProgress,
  getRunEndMs,
  getRunState,
  formatClock,
  getTodayKey,
} from "../utils/runs";

interface DashboardViewProps {
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onNavigateToCatalog: () => void;
  onNavigateToIncome: () => void;
  onNavigateToMilestones: (stage?: string) => void;
  onNavigateToStreaks: () => void;
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
  const W = 300;
  const H = 56;
  const P = 4;
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-14 overflow-visible"
      aria-hidden
    >
      <polygon
        points={`${P},${H} ${pts.join(" ")} ${W - P},${H}`}
        fill="var(--theme-primary)"
        opacity="0.12"
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--theme-primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
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

export default function DashboardView({
  profile,
  activeNodes,
  items,
  onNavigateToCatalog,
  onNavigateToIncome,
  onNavigateToMilestones,
  onNavigateToStreaks,
  onProfileUpdate,
}: DashboardViewProps) {
  const { formatCurrency } = useCurrency();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [weekSeries, setWeekSeries] = useState<number[] | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkedInLocal, setCheckedInLocal] = useState(false);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const [barsIn, setBarsIn] = useState(false);
  const [msBoard, setMsBoard] = useState<VipTaskboard | null>(null);
  const [checkinEcon, setCheckinEcon] = useState<{ base: number; inc: number } | null>(null);
  const [claimedDays, setClaimedDays] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    void getMilestoneBoard(profile.phone, ctrl.signal)
      .then((b) => { if (!cancelled) setMsBoard(b); })
      .catch(() => { /* milestones are progressive enhancement; home works without them */ });
    return () => { cancelled = true; ctrl.abort(); };
  }, [profile.phone]);
  // Next incomplete achievement in an open stage — never a finished one.
  const nextMilestone = useMemo(() => {
    if (!msBoard || msBoard.tasks.length === 0) return null;
    const claimedTiers = msBoard.claimedTierRewards || [];
    const openStages = (msBoard.stageOrder || []).filter(
      (stage) => !claimedTiers.includes(stage) && msBoard.tasks.some((t) => t.category === stage && !t.stageLocked)
    );
    if (openStages.length === 0) return { done: true as const };
    const pool = msBoard.tasks.filter((t) => openStages.includes(t.category));
    const task = (pool.find((t) => Number(t.progress || 0) < Number(t.requiredBonus || 0)) || pool[0]) as VipTask;
    return { done: false as const, task };
  }, [msBoard]);
  const msIsMoney = (m?: string) => !m || m === "operator_points" || m === "lifetime_yield";
  const msUnit = (m?: string) => (m === "streak_days" ? "days" : m === "invites_count" ? "invites" : m === "milestones_claimed" ? "claimed" : m === "account_created" ? "" : "runs");
  useEffect(() => {
    setBarsIn(false);
    const frame = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
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

  // Check-in economics preview (server is authoritative at claim time).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchJsonWithSignal<{ checkinBaseBonus?: number; checkinIncrement?: number }>(`/api/config/site`, ctrl.signal)
      .then((cfg) => {
        if (ctrl.signal.aborted) return;
        const base = Number(cfg.checkinBaseBonus);
        const inc = Number(cfg.checkinIncrement);
        setCheckinEcon({ base: Number.isFinite(base) ? base : 1000, inc: Number.isFinite(inc) ? inc : 100 });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

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
    const list = activeNodes.filter((n) => getRunState(n, items) === "active");
    list.sort((a, b) => (getRunEndMs(a) ?? Infinity) - (getRunEndMs(b) ?? Infinity));
    return list;
  }, [activeNodes, items]);
  const [showCompletedRuns, setShowCompletedRuns] = useState(false);
  const completedRuns = useMemo(() => {
    const list = activeNodes.filter((n) => getRunState(n, items) !== "active");
    list.sort((a, b) => (getRunEndMs(b) ?? -Infinity) - (getRunEndMs(a) ?? -Infinity));
    return list;
  }, [activeNodes, items]);
  const shownRuns = showCompletedRuns ? completedRuns : activeRuns;

  // Next check-in opens at UTC midnight (check-ins settle on UTC days).
  const nextCheckinIn = useMemo(() => {
    const n = new Date(nowMs);
    const midnight = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
    return Math.max(0, midnight - nowMs);
  }, [nowMs]);

  const checkedInToday = checkedInLocal || profile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(profile.checkinStreak) || 0);

  // Button preview mirrors the server formula: base + (nextStreak - 1) * inc,
  // where the streak continues only from yesterday.
  const checkinAmount = useMemo(() => {
    const base = checkinEcon && Number.isFinite(checkinEcon.base) ? checkinEcon.base : 1000;
    const inc = checkinEcon && Number.isFinite(checkinEcon.inc) ? checkinEcon.inc : 100;
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split("T")[0];
    const next = profile.lastCheckinDate === yesterday ? streak + 1 : 1;
    return base + (next - 1) * inc;
  }, [checkinEcon, profile.lastCheckinDate, streak]);

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
    const tomorrowMs = todayMs + 86400000;
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
          // Next countdown tile: tomorrow once today is claimed. Distinct from greyed futures.
          isNext: checkedInToday && ms === tomorrowMs,
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

  const handleCheckin = async (source: "tile" | "button", event?: React.MouseEvent<HTMLElement>) => {
    if (checkedInToday || checkinBusy) return;
    // Capture tile geometry synchronously — React synthetic events go stale after await.
    const tileRect = source === "tile" && event ? (event.currentTarget as HTMLElement).getBoundingClientRect() : null;
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
      // Coin flight plays only on tile tap, flying to the balance hero. Header
      // button claims instantly with no animation and no confetti.
      if (source === "tile" && !reduced && tileRect) {
        const root = rootRef.current;
        const to = balanceRef.current?.getBoundingClientRect();
        if (root && to) {
          const rootRect = root.getBoundingClientRect();
          const startX = tileRect.left + tileRect.width / 2 - rootRect.left;
          const startY = tileRect.top + tileRect.height / 2 - rootRect.top;
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
      } else {
        deliverCheckin(bonus, nextStreak);
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
      {/* Balance hero — one balance, plus progress */}
      <section className="px-1">
        <p className="text-[11px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
          Withdrawable
        </p>
        <p ref={balanceRef} className="mt-1.5 font-display font-black text-[40px] leading-none tracking-tight truncate">
          {formatCurrency(Number(profile.points) || 0)}
        </p>
        <p className="mt-3 text-[13px] font-sans font-bold text-[var(--theme-primary)]">
          {weekTotal === null ? (
            <span className="opacity-60">Tallying the week…</span>
          ) : (
            <>+{formatCurrency(weekTotal)} this week</>
          )}
        </p>
        {weekSeries && (
          <div className="mt-2">
            <WeekSpark data={weekSeries} />
          </div>
        )}
      </section>

      {/* Empty state — the loop entry */}
      {activeNodes.length === 0 && (
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-5 text-center">
          <p className="font-display font-black text-lg">No active runs.</p>
          <p className="mt-1 text-[13px] font-sans text-[var(--theme-text-muted)]">Start one to put your money in motion.</p>
          <button
            type="button"
            onClick={onNavigateToCatalog}
            className="mt-4 w-full py-3.5 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer tile-shimmer overflow-hidden"
          >
            <Plus className="w-4 h-4" /> Start your first Run
          </button>
        </section>
      )}

      {/* Runs — one card, two rows, overflow as a count */}
      {(activeRuns.length > 0 || completedRuns.length > 0) && (
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] px-4 pb-2 pt-4">
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => { setShowCompletedRuns((v) => !v); setBarsIn(false); requestAnimationFrame(() => requestAnimationFrame(() => setBarsIn(true))); }}
                aria-label={showCompletedRuns ? "Show active runs" : "Show completed runs"}
                className={`p-2 -ml-2 rounded-full cursor-pointer active:scale-95 transition-all shrink-0 text-[var(--theme-primary)] ${showCompletedRuns ? "bg-[var(--theme-primary)]/15" : ""}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <h2 className="font-display font-black text-[15px] truncate">
                {showCompletedRuns ? "Completed Runs" : "Active Runs"} <span className="text-[var(--theme-text-muted)] font-bold">{shownRuns.length}</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onNavigateToIncome}
              className="text-[13px] font-sans font-bold text-[var(--theme-primary)] hover:underline cursor-pointer shrink-0"
            >
              View all
            </button>
          </div>
          <div className="min-h-[196px]">
            {shownRuns.length === 0 ? (
              <p className="py-4 text-center text-[12px] font-sans text-[var(--theme-text-muted)]">
                {showCompletedRuns ? "No completed runs yet." : "No active runs."}
              </p>
            ) : null}
            {shownRuns.slice(0, 2).map((node) => {
            const progress = getRunProgress(node, items);
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
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0 h-2.5 rounded-full bg-[var(--theme-text)]/10 overflow-hidden">
                          <div
                            className="h-full run-progress-fill transition-[width] duration-1000 ease-out"
                            style={{ width: barsIn ? `${progress.percent}%` : "0%" }}
                          />
                        </div>
                        <span className="font-display font-bold text-[13px] tabular-nums shrink-0 text-[var(--theme-text)] opacity-80">
                          {Math.round(progress.percent)}%
                        </span>
                      </div>
                    <p className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-sans text-[var(--theme-text-muted)]">Accrued</span>
                      <span className="font-display font-bold tabular-nums text-xs text-[var(--theme-text-muted)]">
                        +{formatCurrency(node.totalEarned || 0)}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </section>
      )}

      {/* Daily streak — mini 7-day run, Mon–Sun */}
      <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onNavigateToStreaks}
              aria-label="Open streaks"
              className="text-[var(--theme-primary)] cursor-pointer active:scale-95 transition-all shrink-0 p-1"
            >
              <CalendarDays className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="font-display font-black text-[15px] leading-tight">Daily streak</h2>
              <p className="text-[11px] font-sans text-[var(--theme-text-muted)]">
                {weekTiles.month}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            {checkedInToday ? (
              <span className="font-display font-bold tabular-nums text-[15px] text-[var(--theme-text)]">
                {formatClock(nextCheckinIn)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleCheckin("button")}
                disabled={checkinBusy}
                className="px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-bold tabular-nums transition-all active:scale-[0.97] disabled:opacity-60 cursor-pointer"
              >
                {checkinBusy ? "…" : `+${formatCurrency(checkinAmount)}`}
              </button>
            )}
          </div>
        </div>
        <div ref={tilesRef} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekTiles.days.map((d) => {
            const isNext = (d as { isNext?: boolean }).isNext === true;
            const missed = !d.isFuture && !d.isToday && !d.claimed;
            const active = d.isToday && !d.claimed;
            const dimmed = (missed || d.isFuture) && !isNext;
            const inner = (
              <>
                <img
                  src={dollar3d}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`w-7 h-7 object-contain ${dimmed ? "grayscale" : ""}`}
                />
                {missed && <div className="absolute inset-0 rounded-xl bg-black/45 pointer-events-none" />}
                <span
                  className={`text-[8px] font-sans font-black uppercase tracking-wide ${
                    d.claimed || isNext ? "text-[var(--theme-primary)]" : "text-[var(--theme-text-muted)]"
                  }`}
                >
                  {d.label}
                </span>
              </>
            );
            const cls = `relative rounded-xl w-11 shrink-0 aspect-[4/5] flex flex-col items-center justify-center gap-1 ${
              d.claimed
                ? ""
                : active
                  ? "border border-[var(--theme-primary)]/70 tile-shimmer"
                  : isNext
                    ? "border border-dashed border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/5 tile-shimmer"
                    : d.isFuture
                      ? "opacity-40"
                      : ""
            }`;
            return active ? (
              <button
                key={d.key}
                type="button"
                onClick={(e) => void handleCheckin("tile", e)}
                disabled={checkinBusy}
                aria-label="Check in today"
                data-today="true"
                className={`${cls} cursor-pointer active:scale-95 transition-transform`}
              >
                {inner}
              </button>
            ) : (
              <div key={d.key} data-today={d.isToday || undefined} data-next={isNext || undefined} title={isNext ? "Next check-in" : undefined} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* Next milestone — mockup strip: art tile, reward, thin progress, inline claim */}
      {nextMilestone && (
        <section className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-display font-black text-[15px] leading-tight">Next milestone</h2>
              <p className="text-[11px] font-sans text-[var(--theme-text-muted)]">Track and complete your daily tasks to upgrade your rank.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToMilestones()}
              className="shrink-0 inline-flex items-center gap-1 mt-0.5 text-[12px] font-sans font-bold text-[var(--theme-primary)] opacity-90 hover:opacity-100 cursor-pointer"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {nextMilestone.done ? (
            <p className="text-[12px] font-sans text-[var(--theme-text-muted)]">Every milestone claimed. Keep operating — new ones drop soon.</p>
          ) : (() => {
            const task = nextMilestone.task;
            const pct = Math.min(100, (Number(task.progress || 0) / Math.max(1, Number(task.requiredBonus || 0))) * 100);
            const tierArt = tierMetaFor(msBoard?.tierMeta, task.category).imageUrl || task.imageUrl;
            const cntP = Math.max(0, Math.floor(Number(task.progress) || 0));
            const cntQ = Math.max(0, Math.floor(Number(task.requiredBonus) || 0));
            const counts = msIsMoney(task.metric)
              ? `${formatCurrency(task.progress)} / ${formatCurrency(task.requiredBonus)}`
              : `${cntP.toLocaleString()}/${cntQ.toLocaleString()}${msUnit(task.metric) ? ` ${msUnit(task.metric)}` : ""}`;
            return (
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[var(--theme-primary)]/12 border border-[var(--theme-primary)]/20 overflow-hidden shrink-0 flex items-center justify-center">
                  {tierArt ? (
                    <img src={tierArt} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    <Trophy className="w-5 h-5 text-[var(--theme-primary)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans font-black uppercase tracking-wider text-[var(--theme-primary)]">
                    {task.category}
                  </span>
                  <p className="text-[13px] font-sans font-extrabold truncate mt-0.5">{task.title}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/20 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{ ...PROGRESS_GRADIENT, width: barsIn ? `${pct}%` : "0%" }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <p className="text-[11px] font-sans font-bold text-[var(--theme-text)] opacity-80">{counts}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateToMilestones(task.category)}
                  aria-label="View journey stage"
                  className="shrink-0 p-2 rounded-full opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
