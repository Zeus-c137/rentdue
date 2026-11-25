/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Home: balance + progress, Rent Clock, bots, streak. Every section answers
 * "why come back tomorrow". No totals without action, no decoration.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { UserProfile, SubscribedNode, SubscriptionItem, VipTask, VipTaskboard } from "../types";
import { Lock, ChevronRight, Check } from "lucide-react";
import { AchievementGlyph, beginMilestoneTaskClaim, clearMilestoneTaskClaim, confirmMilestoneTaskClaim, getMilestoneBoard } from "./VipTasksPage";
import CellsProgress from "./CellsProgress";
import { optimizedImageUrl } from "../utils/imageUtils";
import { motion, AnimatePresence } from "motion/react";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { playCheckinSound } from "../utils/checkinSound";
import { useReducedMotion } from "../hooks/useReducedMotion";
import HomeBalanceCard from "./HomeBalanceCard";
import FloatingProduct from "./FloatingProduct";
import FeaturedBotCard from "./FeaturedBotCard";
import { registerTarget } from "./fx/targets";
import { triggerCheckin } from "../features/checkin/CheckinHost";
import { recordCheckinHistory } from "../features/checkin/history";
import {
  getRunProgress,
  getRunEndMs,
  getRunState,
  formatClock,
  getTodayKey,
  getPlatformYesterdayKey,
} from "../utils/runs";

interface DashboardViewProps {
  isHomeActive: boolean;
  profile: UserProfile;
  welcomeBonusAmount?: number;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onNavigateToCatalog: () => void;
  onNavigateToIncome: () => void;
  onNavigateToMilestones: (stage?: string) => void;
  onNavigateToStreaks: () => void;
  onNavigateToDeposit: () => void;
  onNavigateToWithdraw: () => void;
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

export default function DashboardView({
  isHomeActive,
  profile,
  welcomeBonusAmount = 0,
  activeNodes,
  items,
  onNavigateToCatalog,
  onNavigateToIncome,
  onNavigateToMilestones,
  onNavigateToStreaks,
  onNavigateToDeposit,
  onNavigateToWithdraw,
  onProfileUpdate,
}: DashboardViewProps) {
  const { formatCurrency } = useCurrency();
  const reduceMotion = useReducedMotion();
  const [checkinBusy, setCheckinBusy] = useState(false);
  const checkinBusyRef = useRef(false);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    registerTarget("balance", balanceRef.current);
    return () => registerTarget("balance", null);
  }, []);
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

  // Auto check-in on mount if not already checked in today
  useEffect(() => {
    if (!isHomeActive || checkedInToday || checkinBusyRef.current) return;
    
    const timer = setTimeout(() => {
      if (!checkedInToday && !checkinBusyRef.current) {
        handleCheckin("auto");
      }
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [isHomeActive, checkedInToday]);
  const handleCheckin = async (source: "tile" | "button" | "auto", event?: React.MouseEvent<HTMLElement>) => {
    if (checkedInToday || checkinBusyRef.current) return;
    // Capture tile geometry synchronously before the optimistic update re-renders it.
    const tileRect = source === "tile" && event ? event.currentTarget.getBoundingClientRect() : null;
    const previousProfile = profileRef.current;
    const optimisticBonus = Math.max(0, Number(checkinAmount) || 0);
    const optimisticStreak = previousProfile.lastCheckinDate === getPlatformYesterdayKey() ? streak + 1 : 1;

    checkinBusyRef.current = true;
    setCheckinBusy(true);
    setCheckedInLocal(true);
    // The balance is NOT credited optimistically. The server decides the amount,
    // and the count-up that plays with the coin flight needs a pre-credit value
    // to start from — writing the reward early is what made the number jump
    // before the coins arrived. Arm the hold so the mirror stands down until
    // the count takes over.
    const pointsBefore = Number(previousProfile.points) || 0;
    window.dispatchEvent(new CustomEvent("checkin:balance-priming", { detail: { from: pointsBefore } }));
    profileRef.current = { ...previousProfile, lastCheckinDate: todayKey, checkinStreak: optimisticStreak };
    onProfileUpdate(profileRef.current);

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
      const bonus = Math.max(0, Number(data.amount ?? data.bonus ?? optimisticBonus) || 0);
      const nextStreak = Number(data.streak ?? optimisticStreak);
      // Points were never credited optimistically, so the confirmed value is
      // simply the current one plus what the server says it paid.
      const latestPoints = Number(profileRef.current.points) || 0;
      const confirmedProfile = {
        ...profileRef.current,
        points: latestPoints + bonus,
        lastCheckinDate: todayKey,
        checkinStreak: nextStreak,
      };
      // Arm again in the same tick as the write, so no render can slip the
      // mirror in between and pre-empt the count-up.
      window.dispatchEvent(new CustomEvent("checkin:balance-priming", { detail: { from: latestPoints } }));
      profileRef.current = confirmedProfile;
      onProfileUpdate(confirmedProfile);
      recordCheckinHistory(profile.phone, todayKey, bonus);

      // Trigger animated check-in celebration
      triggerCheckin({
        streak: nextStreak,
        previousStreak: previousProfile.checkinStreak,
        wasBroken: previousProfile.lastCheckinDate !== getPlatformYesterdayKey(),
        prize: bonus,
        previousBalance: pointsBefore,
        newBalance: Number(confirmedProfile.points) || 0,
      });
    } catch (err: any) {
      const rollbackProfile = {
        ...profileRef.current,
        lastCheckinDate: previousProfile.lastCheckinDate,
        checkinStreak: previousProfile.checkinStreak,
      };
      profileRef.current = rollbackProfile;
      onProfileUpdate(rollbackProfile);
      window.dispatchEvent(new CustomEvent("checkin:balance-priming", { detail: { from: null } }));
      setCheckedInLocal(false);
      removeCoinFlight(flightIds);
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
    if (!beginMilestoneTaskClaim(profile.phone, task)) return;
    msClaimBusyRef.current = true;
    setMsClaimBusy(task.id);
    setMsBoard((current) => current ? {
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, claimed: true, claimStatus: "approved" } : item),
    } : current);
    profileRef.current = optimisticProfile;
    onProfileUpdate(optimisticProfile);
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
      confirmMilestoneTaskClaim(profile.phone, task.id);
      const controller = new AbortController();
      void getMilestoneBoard(profile.phone, controller.signal, true).then(setMsBoard).catch(() => {});
    } catch (err: any) {
      clearMilestoneTaskClaim(profile.phone, task.id);
      const latest = profileRef.current;
      const rollbackProfile = { ...latest, points: Math.max(0, (Number(latest.points) || 0) - optimisticReward) };
      profileRef.current = rollbackProfile;
      onProfileUpdate(rollbackProfile);
      const previousTask = previousBoard?.tasks.find((item) => item.id === task.id);
      if (previousTask) {
        setMsBoard((current) => current ? {
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id ? previousTask : item),
        } : current);
      }
      removeCoinFlight(flightIds);
      toast.error(err.message || "Could not claim this milestone reward.");
    } finally {
      msClaimBusyRef.current = false;
      setMsClaimBusy(null);
    }
  };

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
      {/* Balance + money actions — AppHeader owns the card's top edge, this closes it */}
      <HomeBalanceCard
        profile={profile}
        formatCurrency={formatCurrency}
        welcomeBonusAmount={welcomeBonusAmount}
        balanceRef={balanceRef}
        onOpenDeposit={onNavigateToDeposit}
        onOpenWithdraw={onNavigateToWithdraw}
        onProfileUpdate={onProfileUpdate}
      />

      {/* First run — a featured bot rather than an empty state, so the slot sells
          instead of apologising for being empty. */}
      {activeNodes.length === 0 && (
        <FeaturedBotCard
          items={items}
          capital={Number(profile.rechargeBalance || 0)}
          ready={listsReady}
          active={isHomeActive}
          still={reduceMotion}
          onOpenItem={onNavigateToCatalog}
          onOpenCatalog={onNavigateToCatalog}
          onOpenDeposit={onNavigateToDeposit}
        />
      )}

      {/* Bot area — skeleton while lists load (matches the bot card), then empty state or the card */}
      {!listsReady ? (
        <section aria-hidden="true" className="mt-[52px] rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 px-4 pb-2 pt-4 animate-pulse">
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
        /* Bots — one card, two rows, overflow as a count */
        <section className="mt-[52px] rounded-[24px] bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 px-4 pb-2 pt-4">
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="font-display font-black text-[15px] truncate min-w-0">
              {shownRuns.length}  {showCompletedRuns ? "Finished Bots" : "Active Bots"}
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
                {showCompletedRuns ? "No finished bots yet." : "No active bots."}
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
                className="w-full text-left py-3.5 transition-opacity active:opacity-70 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {/* The bot's own art, floating on the same loop as every other
                      product image, rather than a flat thumbnail. */}
                  {thumb ? (
                    <FloatingProduct
                      src={thumb}
                      alt={node.itemName}
                      active={isHomeActive}
                      still={reduceMotion}
                      width={240}
                      className="h-20 w-24 shrink-0 rounded-lg bg-[var(--theme-text)]/5 px-1 py-1 [--float-drift:10px]"
                    />
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

      {/* Next milestone - title + body live inside one frosted card */}
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
        <section className="relative rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-display font-black text-[15px] leading-tight">Daily tasks</h2>
              <p className="text-[11px] font-sans text-[var(--theme-text-muted)]">Your next milestone, one step at a time.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToMilestones()}
              className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-sans font-bold text-[var(--theme-primary)] opacity-90 hover:opacity-100 cursor-pointer active:scale-95 transition-transform"
            >
              All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {nextMilestone.done ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--theme-primary)]/15 text-[var(--theme-primary)]">
                <Check className="h-4 w-4" />
              </span>
              <p className="text-[12px] font-sans text-[var(--theme-text-muted)]">Every milestone claimed. New ones drop soon.</p>
            </div>
          ) : (() => {
            const task = nextMilestone.task;
            const pct = Math.min(100, (Number(task.progress || 0) / Math.max(1, Number(task.requiredBonus || 0))) * 100);
            const taskArt = task.imageUrl;
            const taskClaimed = Boolean(task.claimed || task.claimStatus === "approved");
            const taskLocked = Boolean(task.stageLocked);
            const rewardAvailable = !taskClaimed && !taskLocked && (task.socialType ? task.claimStatus === "verified" : Number(task.progress || 0) >= Number(task.requiredBonus || 0));
            const taskInProgress = !task.socialType && Number(task.progress || 0) > 0 && !rewardAvailable && !taskClaimed;
            return (
              <div className="w-full rounded-xl bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigateToMilestones(task.category)}
                    aria-label={`View milestone: ${task.title}`}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer transition-opacity active:opacity-75"
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-black/20 flex items-center justify-center">
                      {taskArt ? (
                        <img src={optimizedImageUrl(taskArt, 200)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <AchievementGlyph metric={task.metric} socialType={task.socialType} />
                      )}
                      {taskClaimed && (
                        <span className="absolute inset-0 grid place-items-center bg-black/55 text-[9px] font-sans font-black uppercase tracking-wide text-[var(--theme-primary)]">Claimed</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-display font-black leading-tight text-[var(--theme-text)]">{task.title}</p>
                      {task.description ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] font-sans leading-snug text-[var(--theme-text-muted)]">{task.description}</p>
                      ) : null}
                    </div>
                  </button>
                  {taskClaimed ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] font-sans font-black tabular-nums text-[var(--theme-text)] opacity-45">
                      <img src={dollar3d} alt="" className="h-3.5 w-3.5 object-contain grayscale" />
                      {formatCurrency(task.reward)}
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => { void handleClaimMilestoneTask(task, event); }}
                      disabled={!rewardAvailable || task.reward <= 0 || msClaimBusy !== null}
                      aria-label={rewardAvailable ? `Claim ${task.title} reward of ${formatCurrency(task.reward)}` : `${task.title} reward unavailable`}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-sans font-black tabular-nums transition-transform active:scale-95 ${rewardAvailable && task.reward > 0 ? "cursor-pointer border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : taskInProgress && task.reward > 0 ? "cursor-not-allowed border-[var(--theme-primary)] bg-[var(--theme-primary)]/70 text-[var(--theme-on-primary)] opacity-50 saturate-50" : "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-[var(--theme-text)] opacity-45"}`}
                    >
                      {!rewardAvailable && <Lock className="h-3 w-3" aria-hidden="true" />}
                      <img src={dollar3d} alt="" className="h-3.5 w-3.5 object-contain" />
                      {formatCurrency(task.reward)}
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-[56px]">
                  <div className="min-w-0 flex-1"><CellsProgress pct={pct} /></div>
                  <span className="shrink-0 font-display font-bold text-[11px] tabular-nums text-[var(--theme-primary)]">{Math.round(pct)}%</span>
                </div>
              </div>
            );
          })()}
        </section>
      )}

    </div>
  );
}
