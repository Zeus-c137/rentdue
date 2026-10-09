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
import { Plus, Lock, ChevronRight, CalendarDays, SlidersHorizontal } from "lucide-react";
import flameSvg from "@/src/assets/svg/flame.svg";
import { AchievementGlyph, bustMilestoneCache, getMilestoneBoard } from "./VipTasksPage";
import CellsProgress from "./CellsProgress";
import OnboardingCarousel, { DEFAULT_ONBOARDING_SLIDES, OnboardingSlide } from "./OnboardingCarousel";
import { optimizedImageUrl } from "../utils/imageUtils";
import { motion, AnimatePresence } from "motion/react";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { unlockCheckinSound, playCheckinSound } from "../utils/checkinSound";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  getRunProgress,
  getRunEndMs,
  getRunState,
  formatClock,
  getTodayKey,
  getPlatformDayParts,
  getPlatformYesterdayKey,
  msUntilPlatformMidnight,
} from "../utils/runs";

interface DashboardViewProps {
  isHomeActive: boolean;
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

/* Week climb — extra small sparkline riding the same line as the weekly
   total. No day labels, no baseline: just the cumulative line and the
   endpoint pulse. Always spans the full 7 days. */
function WeekClimb({ data }: { data: number[] }) {
  const W = 56;
  const H = 32;
  const P = 3;
  const plotH = H - P * 2;
  const days = 7;
  const padded: number[] = [];
  for (let i = 0; i < days; i++) padded.push(Number(data[i]) || 0);
  const cum: number[] = [];
  let acc = 0;
  for (const v of padded) {
    acc += v;
    cum.push(acc);
  }
  const total = cum.length > 0 ? cum[cum.length - 1] : 0;
  const max = Math.max(total, 1);
  const span = days - 1;
  const x = (i: number) => P + (i * (W - P * 2)) / span;
  const y = (v: number) => P + plotH - (Math.max(0, v) / max) * plotH;
  const last = days - 1;
  let d = `M ${x(0).toFixed(1)},${y(cum[0] ?? 0).toFixed(1)}`;
  for (let i = 1; i < days; i++) {
    d += ` L ${x(i).toFixed(1)},${y(cum[i]).toFixed(1)}`;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-14 h-8 overflow-visible shrink-0"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="var(--theme-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="climb-draw"
      />
      <circle cx={x(last)} cy={y(cum[last])} r="5" fill="var(--theme-primary)" opacity="0.2" />
      <circle cx={x(last)} cy={y(cum[last])} r="2.5" fill="none" stroke="var(--theme-primary)" strokeWidth="1.5" className="runway-ping" style={{ animationDelay: "1.3s" }} />
    </svg>
  );
}

export default function DashboardView({
  isHomeActive,
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
  const checkinBusyRef = useRef(false);
  const checkinRevisionRef = useRef(0);
  const [checkedInLocal, setCheckedInLocal] = useState(false);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const [msBoard, setMsBoard] = useState<VipTaskboard | null>(null);
  const [msClaimBusy, setMsClaimBusy] = useState<string | null>(null);
  const msClaimBusyRef = useRef(false);
  const [checkinEcon, setCheckinEcon] = useState<{ base: number; inc: number } | null>(null);
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
  const msUnit = (m?: string) => (m === "streak_days" ? "days" : m === "invites_count" ? "invites" : m === "milestones_claimed" ? "claimed" : m === "collectibles_claimed" ? "collectibles" : m === "account_created" ? "" : "runs");
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const coinFlightSequence = useRef(0);

  const launchCoinFlight = (sourceRect: DOMRect | null, targetElement: HTMLElement | null) => {
    const root = rootRef.current;
    const target = targetElement?.getBoundingClientRect();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !sourceRect || !root || !target) return [] as number[];
    const rootRect = root.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2 - rootRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - rootRect.top;
    const endX = target.left + target.width / 2 - rootRect.left;
    const endY = target.top + target.height / 2 - rootRect.top;
    const flight = ++coinFlightSequence.current;
    const ids = Array.from({ length: 10 }, (_, i) => Date.now() * 100 + flight * 10 + i);
    setCoins((current) => [
      ...(current || []),
      ...ids.map((id, i) => ({
        id,
        startX: startX + (Math.random() - 0.5) * 24,
        startY: startY + (Math.random() - 0.5) * 10,
        dx: endX - startX + (Math.random() - 0.5) * 30,
        dy: endY - startY,
        delay: i * 0.06,
      })),
    ]);
    window.setTimeout(() => {
      setCoins((current) => {
        const remaining = current?.filter((coin) => !ids.includes(coin.id)) || [];
        return remaining.length > 0 ? remaining : null;
      });
    }, 1050);
    return ids;
  };

  const removeCoinFlight = (ids: number[]) => {
    if (ids.length === 0) return;
    setCoins((current) => {
      const remaining = current?.filter((coin) => !ids.includes(coin.id)) || [];
      return remaining.length > 0 ? remaining : null;
    });
  };
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
        setCheckinEcon({ base: Number.isFinite(base) ? base : 0, inc: Number.isFinite(inc) ? inc : 0 });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Week sparkline: everything credited to withdrawable, per day.
  // Re-fetches when the profile changes (e.g. after a claim) so the chart
  // and weekly total stay atomic with the balance card.
  useEffect(() => {
    const ctrl = new AbortController();
    const revision = checkinRevisionRef.current;
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${profile.phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || checkinBusyRef.current || revision !== checkinRevisionRef.current || !Array.isArray(rows)) return;
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
  }, [profile.phone, profile.points]);

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
  // Catalog + subs arrive in one batch after login — before that, hold a
  // dimension-matched skeleton instead of flashing the empty state.
  const listsReady = items.length > 0;

  // Onboarding carousel takes the Runs slot until dismissed — dismissing
  // reveals the Runs section underneath. Art comes from live catalog items.
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem("rentdue_onboarding_dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem("rentdue_onboarding_dismissed", "1");
    } catch {
      // persistence is best-effort
    }
  };
  const homeSlides: OnboardingSlide[] = useMemo(() => {
    const art = (i: number) => items[i]?.imageUrl || "";
    return DEFAULT_ONBOARDING_SLIDES.map((s, i) => ({ ...s, image: art(i) || undefined }));
  }, [items]);
  const handleOnboardingCta = (index: number) => {
    if (index === 1) onNavigateToMilestones();
    else if (index === 2) onNavigateToStreaks();
    else onNavigateToCatalog();
  };

  // Next check-in opens at platform midnight (check-ins settle on platform days).
  const nextCheckinIn = useMemo(() => msUntilPlatformMidnight(nowMs), [nowMs]);

  const checkedInToday = checkedInLocal || profile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(profile.checkinStreak) || 0);

  // Button preview mirrors the server formula: base + (nextStreak - 1) * inc,
  // where the streak continues only from yesterday.
  const checkinAmount = useMemo(() => {
    const base = checkinEcon && Number.isFinite(checkinEcon.base) ? checkinEcon.base : 0;
    const inc = checkinEcon && Number.isFinite(checkinEcon.inc) ? checkinEcon.inc : 0;
    const yesterday = getPlatformYesterdayKey();
    const next = profile.lastCheckinDate === yesterday ? streak + 1 : 1;
    return base + (next - 1) * inc;
  }, [checkinEcon, profile.lastCheckinDate, streak]);

  // Full-month streak, same math as the original check-in modal: the server
  // keeps streaks consecutive, so the live run is exactly `todayStreak` days
  // ending today (claimed) or yesterday (claimable). Tiles derive from it.
  const weekTiles = useMemo(() => {
    // Platform calendar boundaries (Date.UTC is only a sortable day grid here —
    // the y/m/d itself comes from the platform timezone).
    const { y: year, m: month, d: day } = getPlatformDayParts();
    const todayMs = Date.UTC(year, month, day);
    const todayStreak = checkedInToday ? streak : streak + 1;
    const runStartMs = todayMs - (Math.max(1, todayStreak) - 1) * 86400000;
    const tomorrowMs = todayMs + 86400000;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return {
      month: new Date(Date.UTC(year, month, 1)).toLocaleString("default", { month: "long" }),
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
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!isHomeActive) return;
    let resetFrame = 0;
    let scrollFrame = 0;
    const resetAndScrollFrame = requestAnimationFrame(() => {
      const tiles = tilesRef.current;
      const targetTile = tiles?.querySelector<HTMLElement>('[data-next="true"]')
        || tiles?.querySelector<HTMLElement>('[data-today="true"]');
      if (!tiles || !targetTile) return;

      // Reset to the month's beginning first, then bring today into focus.
      // scrollIntoView can skip the motion when today's tile is already barely
      // visible and can also scroll the page vertically.
      tiles.scrollLeft = 0;
      resetFrame = requestAnimationFrame(() => {
        const tileLeft = targetTile.getBoundingClientRect().left - tiles.getBoundingClientRect().left + tiles.scrollLeft;
        const destination = Math.max(0, Math.min(tiles.scrollWidth - tiles.clientWidth, tileLeft - (tiles.clientWidth - targetTile.clientWidth) / 2));
        if (reduceMotion || destination === 0) {
          tiles.scrollLeft = destination;
          return;
        }

        const startedAt = performance.now();
        const duration = 520;
        const animateScroll = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / duration);
          const eased = 1 - Math.pow(1 - progress, 4);
          tiles.scrollLeft = destination * eased;
          if (progress < 1) scrollFrame = requestAnimationFrame(animateScroll);
        };
        scrollFrame = requestAnimationFrame(animateScroll);
      });
    });
    return () => {
      cancelAnimationFrame(resetAndScrollFrame);
      cancelAnimationFrame(resetFrame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [isHomeActive, reduceMotion]);

  const handleCheckin = async (source: "tile" | "button", event?: React.MouseEvent<HTMLElement>) => {
    if (checkedInToday || checkinBusyRef.current) return;
    // Capture tile geometry synchronously before the optimistic update re-renders it.
    const tileRect = source === "tile" && event ? event.currentTarget.getBoundingClientRect() : null;
    const previousProfile = profileRef.current;
    const optimisticBonus = Math.max(0, Number(checkinAmount) || 0);
    const optimisticStreak = previousProfile.lastCheckinDate === getPlatformYesterdayKey() ? streak + 1 : 1;
    const optimisticProfile = {
      ...previousProfile,
      points: (Number(previousProfile.points) || 0) + optimisticBonus,
      lastCheckinDate: todayKey,
      checkinStreak: optimisticStreak,
    };

    checkinRevisionRef.current += 1;
    checkinBusyRef.current = true;
    setCheckinBusy(true);
    setCheckedInLocal(true);
    profileRef.current = optimisticProfile;
    onProfileUpdate(optimisticProfile);
    setWeekSeries((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[6] = (next[6] || 0) + optimisticBonus;
      return next;
    });
    unlockCheckinSound();
    playCheckinSound();

    // Coin travel is immediate feedback; it never delays the balance.
    const flightIds = source === "tile" ? launchCoinFlight(tileRect, balanceRef.current) : [];

    try {
      const res = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check-in failed.");
      checkinRevisionRef.current += 1;
      const bonus = Math.max(0, Number(data.amount ?? data.bonus ?? optimisticBonus) || 0);
      const nextStreak = Number(data.streak ?? optimisticStreak);
      const latest = profileRef.current;
      const confirmedProfile = {
        ...latest,
        points: (Number(latest.points) || 0) + bonus - optimisticBonus,
        lastCheckinDate: todayKey,
        checkinStreak: nextStreak,
      };
      profileRef.current = confirmedProfile;
      onProfileUpdate(confirmedProfile);
      if (bonus !== optimisticBonus) {
        setWeekSeries((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[6] = Math.max(0, (next[6] || 0) + bonus - optimisticBonus);
          return next;
        });
      }
      toast.success(`Daily ${nextStreak} check-in complete 🔥`, {
        description: bonus > 0
          ? `${formatCurrency(bonus)} credited to your balance. See you tomorrow.`
          : "Streak kept alive. See you tomorrow.",
        duration: 6000,
      });
    } catch (err: any) {
      checkinRevisionRef.current += 1;
      const latest = profileRef.current;
      const rollbackProfile = {
        ...latest,
        points: Math.max(0, (Number(latest.points) || 0) - optimisticBonus),
        lastCheckinDate: previousProfile.lastCheckinDate,
        checkinStreak: previousProfile.checkinStreak,
      };
      profileRef.current = rollbackProfile;
      onProfileUpdate(rollbackProfile);
      setCheckedInLocal(false);
      removeCoinFlight(flightIds);
      setWeekSeries((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[6] = Math.max(0, (next[6] || 0) - optimisticBonus);
        return next;
      });
      toast.error(err.message || "Check-in failed.");
    } finally {
      checkinBusyRef.current = false;
      setCheckinBusy(false);
    }
  };

  const handleClaimMilestoneTask = async (task: VipTask, event: React.MouseEvent<HTMLButtonElement>) => {
    if (msClaimBusyRef.current) return;
    const isSocialVerified = Boolean(task.socialType) && task.claimStatus === "verified";
    const isMetricReady = !task.socialType && Number(task.progress || 0) >= Number(task.requiredBonus || 0);
    if (task.claimed || task.stageLocked || !(isSocialVerified || isMetricReady)) return;

    const sourceRect = event.currentTarget.getBoundingClientRect();
    const optimisticReward = Math.max(0, Number(task.reward) || 0);
    const previousBoard = msBoard;
    const previousProfile = profileRef.current;
    const optimisticProfile = { ...previousProfile, points: (Number(previousProfile.points) || 0) + optimisticReward };
    msClaimBusyRef.current = true;
    setMsClaimBusy(task.id);
    setMsBoard((current) => current ? {
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, claimed: true, claimStatus: "approved" } : item),
    } : current);
    profileRef.current = optimisticProfile;
    onProfileUpdate(optimisticProfile);
    unlockCheckinSound();
    playCheckinSound();

    const flightIds = launchCoinFlight(sourceRect, balanceRef.current);

    try {
      const result = await fetchJsonWithSignal<{ status: string; reward: number }>("/api/profile/vip-tasks/claim", new AbortController().signal, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone, taskId: task.id }),
      });
      const reward = Math.max(0, Number(result.reward) || 0);
      if (reward !== optimisticReward) {
        const latest = profileRef.current;
        const confirmedProfile = { ...latest, points: (Number(latest.points) || 0) + reward - optimisticReward };
        profileRef.current = confirmedProfile;
        onProfileUpdate(confirmedProfile);
      }
      toast.success(`${formatCurrency(reward)} added to your balance.`);
      bustMilestoneCache();
      const controller = new AbortController();
      void getMilestoneBoard(profile.phone, controller.signal).then(setMsBoard).catch(() => {});
    } catch (err: any) {
      const latest = profileRef.current;
      const rollbackProfile = { ...latest, points: Math.max(0, (Number(latest.points) || 0) - optimisticReward) };
      profileRef.current = rollbackProfile;
      onProfileUpdate(rollbackProfile);
      setMsBoard(previousBoard);
      removeCoinFlight(flightIds);
      toast.error(err.message || "Could not claim this milestone reward.");
    } finally {
      msClaimBusyRef.current = false;
      setMsClaimBusy(null);
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
                transition={{ duration: 0.6, delay: coin.delay, ease: "easeOut" }}
                className="absolute w-9 h-9 object-contain"
                style={{ left: coin.startX - 18, top: coin.startY - 18 }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
      {/* Balance hero — one balance, plus progress */}
      <section className="px-1 mt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
              Withdrawable balance
            </p>
            <p ref={balanceRef} className="mt-1.5 font-display font-black text-[40px] leading-none tracking-tight truncate">
              {formatCurrency(Number(profile.points) || 0)}
            </p>
            <p className="mt-3 flex items-center gap-2 text-[13px] font-sans font-bold text-[var(--theme-primary)]">
              {weekTotal === null ? (
                <span className="opacity-60">Tallying the week…</span>
              ) : (
                <>+{formatCurrency(weekTotal)} this week</>
              )}
              {weekSeries ? (
                <span className="relative ml-4 inline-flex w-14 h-8 shrink-0">
                  <span className="absolute inset-0 -m-1">
                    <WeekClimb data={weekSeries} />
                  </span>
                </span>
              ) : (
                <span aria-hidden="true" className="ml-auto inline-block h-8 w-14 rounded-full bg-[var(--theme-text)]/10 animate-pulse shrink-0" />
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Daily streak — frosted to match Store/Runs */}
      <section className="relative rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="inline-flex items-center gap-1.5 font-display font-black text-[15px] leading-tight min-w-0">
            <CalendarDays className="w-5 h-5 text-[var(--theme-primary)] shrink-0" />
            {weekTiles.month} streak
          </h2>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={onNavigateToStreaks}
              aria-label="Open streaks"
              className="inline-flex items-center gap-1 px-1 py-1 text-[var(--theme-primary)] cursor-pointer active:scale-95 transition-transform"
            >
              <img src={flameSvg} alt="" aria-hidden="true" className="h-4 w-auto" />
              <span className="text-[13px] font-sans font-bold tabular-nums leading-none">
                {streak} day{streak === 1 ? "" : "s"}
              </span>
            </button>
            <div className="min-h-[20px] text-right">
              {checkedInToday ? (
                <span className="font-display font-bold tabular-nums text-[12px] text-[var(--theme-primary)]">
                  {formatClock(nextCheckinIn)}
                </span>
              ) : checkinEcon === null ? (
                <span aria-hidden className="ml-auto block h-[20px] w-[92px] rounded-full bg-[var(--theme-text)]/10 animate-pulse" />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 text-[12px] font-sans font-bold tabular-nums text-[var(--theme-primary)]">
                  <img src={dollar3d} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                  {checkinBusy ? "…" : formatCurrency(checkinAmount)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div ref={tilesRef} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekTiles.days.map((d) => {
            const isNext = (d as { isNext?: boolean }).isNext === true;
            const missed = !d.isFuture && !d.isToday && !d.claimed;
            const active = d.isToday && !d.claimed;
            const dimmed = missed || d.isFuture;
            const inner = (
              <>
                <img
                  src={dollar3d}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`w-8 h-8 object-contain ${dimmed ? "grayscale" : ""}`}
                />
                {missed && <div className="absolute inset-0 rounded-xl bg-black/45 pointer-events-none" />}
                <span
                  className={`text-[9px] font-sans font-black uppercase tracking-wide ${
                    d.claimed ? "text-[var(--theme-primary)]" : "text-[var(--theme-text-muted)]"
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
                  ? "border border-[var(--theme-primary)]/70 tile-shimmer streak-tile-pulse"
                  : isNext
                    ? "border border-dashed border-[var(--theme-text)]/25 bg-[var(--theme-text)]/[0.03] opacity-40"
                    : d.isFuture
                      ? "opacity-40"
                      : ""
            }`;
            return active ? (
              <button
                key={d.key}
                type="button"
                onClick={(e) => {
                  void handleCheckin("tile", e);
                }}
                disabled={checkinBusy}
                aria-label="Check in today"
                data-today="true"
                className={`${cls} cursor-pointer active:scale-95 transition-transform`}
              >
                {inner}
              </button>
            ) : d.claimed ? (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  toast.info(`Day ${d.label} • Already checked-in`);
                }}
                aria-label={`Claimed day ${d.label}`}
                className={`${cls} cursor-pointer active:scale-95 transition-transform`}
              >
                {inner}
              </button>
            ) : isNext ? (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  toast.info(`Day ${d.label} • Come back in ${formatClock(nextCheckinIn)}`);
                }}
                aria-label="Next check-in"
                data-next="true"
                className={`${cls} cursor-pointer active:scale-95 transition-transform`}
              >
                {inner}
              </button>
            ) : (
              <div key={d.key} data-today={d.isToday || undefined} data-next={isNext || undefined} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {listsReady && activeNodes.length === 0 && (
        <section className="rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 p-5 text-center">
          <p className="font-display font-black text-lg">No active runs.</p>
          <button
            type="button"
            onClick={onNavigateToCatalog}
            className="mt-4 w-full py-3.5 px-6 rounded-2xl bg-[var(--theme-primary)] text-[var(--theme-on-primary)] font-sans font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer tile-shimmer overflow-hidden"
          >
            <Plus className="w-4 h-4" /> Start your first Run
          </button>
        </section>
      )}

      {/* Onboarding banner — sits above milestones */}
      {!onboardingDismissed && listsReady ? (
        <OnboardingCarousel slides={homeSlides} onCta={handleOnboardingCta} onDismiss={dismissOnboarding} />
      ) : null}

      {/* Next milestone — title + body live inside one frosted card */}
      {!nextMilestone && msBoard === null && (
        <section aria-hidden="true" className="relative rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 p-4 animate-pulse">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="h-[18px] w-32 rounded-md bg-[var(--theme-text)]/10" />
              <div className="mt-1.5 h-[14px] w-52 max-w-full rounded-md bg-[var(--theme-text)]/10" />
            </div>
            <div className="mt-0.5 h-4 w-16 rounded-md bg-[var(--theme-text)]/10 shrink-0" />
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 p-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-[var(--theme-text)]/10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-[18px] w-1/2 rounded bg-[var(--theme-text)]/10" />
                  <div className="h-[12px] w-12 rounded bg-[var(--theme-text)]/10 shrink-0" />
                </div>
                <div className="mt-2 flex gap-[3px]" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="h-4 flex-1 rounded-[5px] bg-[var(--theme-text)]/10" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {nextMilestone && (
        <section className="relative rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display font-black text-[15px] leading-tight">Daily tasks</h2>
              <p className="text-[11px] font-sans text-[var(--theme-text-muted)]">Track and complete your daily tasks to upgrade your rank.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToMilestones()}
              className="shrink-0 inline-flex items-center gap-1 mt-0.5 text-[12px] font-sans font-bold text-[var(--theme-primary)] opacity-90 hover:opacity-100 cursor-pointer active:scale-95 transition-transform"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {nextMilestone.done ? (
            <p className="mt-3 text-[12px] font-sans text-[var(--theme-text-muted)]">Every milestone claimed. Keep operating — new ones drop soon.</p>
          ) : (() => {
            const task = nextMilestone.task;
            const pct = Math.min(100, (Number(task.progress || 0) / Math.max(1, Number(task.requiredBonus || 0))) * 100);
            const taskArt = task.imageUrl;
            const taskClaimed = Boolean(task.claimed || task.claimStatus === "approved");
            const taskLocked = Boolean(task.stageLocked);
            const rewardAvailable = !taskClaimed && !taskLocked && (task.socialType ? task.claimStatus === "verified" : Number(task.progress || 0) >= Number(task.requiredBonus || 0));
            const taskInProgress = !task.socialType && Number(task.progress || 0) > 0 && !rewardAvailable && !taskClaimed;
            const cntP = Math.max(0, Math.floor(Number(task.progress) || 0));
            const cntQ = Math.max(0, Math.floor(Number(task.requiredBonus) || 0));
            const counts = msIsMoney(task.metric)
              ? `${formatCurrency(task.progress)} / ${formatCurrency(task.requiredBonus)}`
              : `${cntP.toLocaleString()}/${cntQ.toLocaleString()}${msUnit(task.metric) ? ` ${msUnit(task.metric)}` : ""}`;
            return (
              <div className="mt-3 w-full rounded-2xl p-3">
                <button
                  type="button"
                  onClick={() => onNavigateToMilestones(task.category)}
                  aria-label={`View milestone: ${task.title}`}
                  className="w-full text-left transition-[transform] duration-[160ms] ease-out active:scale-[0.99] cursor-pointer"
                >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white/[0.05] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {taskArt ? (
                      <img src={optimizedImageUrl(taskArt, 200)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <AchievementGlyph metric={task.metric} socialType={task.socialType} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[15px] font-display font-black truncate min-w-0">{task.title}</p>
                      <span className="shrink-0 font-display font-bold tabular-nums text-[11px] text-[var(--theme-text-muted)]">
                        {counts}
                      </span>
                    </div>
                    {/* Cells — battery blocks charge left to right; the boundary
                        cell fills fractionally. Percent rides at the end. */}
                    <div className="mt-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <CellsProgress pct={pct} />
                        </div>
                        <span className="font-display font-bold text-[13px] tabular-nums shrink-0 text-[var(--theme-primary)]">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                </button>
                <div className="mt-2 flex justify-end">
                  {taskClaimed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 px-3 py-1.5 text-[10px] font-sans font-black tabular-nums text-[var(--theme-text)]">
                      <img src={dollar3d} alt="" className="h-4 w-4 object-contain" />{formatCurrency(task.reward)}
                    </span>
                  ) : (
                    <button type="button" onClick={(event) => void handleClaimMilestoneTask(task, event)} disabled={!rewardAvailable || task.reward <= 0 || msClaimBusy !== null} aria-label={rewardAvailable ? `Claim ${task.title} reward of ${formatCurrency(task.reward)}` : `${task.title} reward unavailable`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-sans font-black tabular-nums transition-transform disabled:cursor-not-allowed ${rewardAvailable && task.reward > 0 ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] tile-shimmer-5s streak-tile-pulse overflow-hidden active:scale-[0.97] disabled:opacity-45" : taskInProgress && task.reward > 0 ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/70 text-[var(--theme-on-primary)] opacity-50 saturate-50" : "border-white/10 bg-[var(--theme-card-bg)]/60 text-[var(--theme-text)] opacity-60"}`}>
                      {!rewardAvailable && <Lock className="h-3 w-3" aria-hidden="true" />}
                      <img src={dollar3d} alt="" className="h-4 w-4 object-contain" />{msClaimBusy === task.id ? "CLAIMING…" : formatCurrency(task.reward)}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Runs area — skeleton while lists load (matches the runs card), then empty state or the card */}
      {!listsReady ? (
        <section aria-hidden="true" className="rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 px-4 pb-2 pt-4 animate-pulse">
          <div className="flex items-center justify-between py-2.5">
            <div className="h-[18px] w-36 rounded-md bg-[var(--theme-text)]/10" />
            <div className="h-4 w-14 rounded-md bg-[var(--theme-text)]/10" />
          </div>
          <div className="min-h-[196px]">
            {[0, 1].map((i) => (
              <div key={i} className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-[var(--theme-text)]/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-[18px] w-2/3 rounded bg-[var(--theme-text)]/10" />
                    <div className="mt-2 flex gap-[3px]" aria-hidden="true">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="h-4 flex-1 rounded-[5px] bg-[var(--theme-text)]/10" />
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="h-[14px] w-14 rounded bg-[var(--theme-text)]/10" />
                      <div className="h-[14px] w-20 rounded bg-[var(--theme-text)]/10" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (activeRuns.length > 0 || completedRuns.length > 0) ? (
        /* Runs — one card, two rows, overflow as a count */
        <section className="rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 px-4 pb-2 pt-4">
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="font-display font-black text-[15px] truncate min-w-0">
                {showCompletedRuns ? "Completed Runs" : "Active Runs"}
              </h2>
              <button
                type="button"
                onClick={() => setShowCompletedRuns((v) => !v)}
                aria-label={showCompletedRuns ? "Show active runs" : "Show completed runs"}
                className={`p-1.5 rounded-full cursor-pointer active:scale-95 transition-all shrink-0 text-[var(--theme-primary)] ${showCompletedRuns ? "bg-[var(--theme-primary)]/15" : ""}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={onNavigateToIncome}
              className="text-[13px] font-sans font-bold text-[var(--theme-primary)] hover:underline cursor-pointer shrink-0"
            >
              View all {shownRuns.length}
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
                    <img src={thumb} alt="" loading="lazy" decoding="async" className="w-24 h-20 rounded-lg object-cover shrink-0 bg-[var(--theme-text)]/5" />
                  ) : (
                    <span className="w-14 h-14 rounded-xl shrink-0 bg-[var(--theme-primary)]/15 text-[var(--theme-primary)] font-display font-black text-xl flex items-center justify-center">
                      {node.itemName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display font-black text-[15px] truncate">{node.itemName}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <CellsProgress pct={progress.percent} />
                        </div>
                        <span className="font-display font-bold text-[13px] tabular-nums shrink-0 text-[var(--theme-primary)]">
                          {Math.round(progress.percent)}%
                        </span>
                      </div>
                    <p className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-sans text-[var(--theme-text-muted)]">Collected</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 font-display text-[11px] font-bold tabular-nums text-[var(--theme-primary)]">
                        <img src={dollar3d} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                        {formatCurrency(node.totalEarned || 0)}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
