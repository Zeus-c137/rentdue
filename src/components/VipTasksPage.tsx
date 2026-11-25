import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, Check, Lock, ChevronRight, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { calcVipProgress, normalizeVipTaskboard, metricMeta, tierRewardFor, tierMetaFor, isTaskMet } from "@/src/utils/vip";
import CellsProgress from "./CellsProgress";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { useAbortSignal } from "../hooks/useGatedInterval";
import { optimizedImageUrl } from "../utils/imageUtils";
import { playCheckinSound } from "../utils/checkinSound";
import { registerTarget } from "./fx/targets";
import { useCountedMoney } from "./fx/useCountedMoney";
import { useClaimFx } from "../features/milestones/ClaimFx";
import type { VipTask, VipTaskboard } from "../types";
import medal3d from "@/src/assets/3d/3dicons-medal-iso-premium.png";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import wallet3d from "@/src/assets/3d/3dicons-wallet-iso-premium.png";
import calendar3d from "@/src/assets/3d/3dicons-calendar-iso-premium.png";
import play3d from "@/src/assets/3d/3dicons-play-iso-premium.png";
import flash3d from "@/src/assets/3d/3dicons-flash-iso-premium.png";
import trophy3d from "@/src/assets/3d/3dicons-trophy-iso-premium.png";
import link3d from "@/src/assets/3d/3dicons-link-iso-premium.png";
import account3d from "@/src/assets/3d/3dicons-boy-iso-premium.png";
import collectible3d from "@/src/assets/3d/3dicons-gift-box-iso-premium.png";

let vipCache: { phone: string; board: VipTaskboard; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;
const boardListeners = new Set<(board: VipTaskboard) => void>();
const boardVersions = new Map<string, number>();
const boardRequestIds = new Map<string, number>();
const appliedBoardRequestIds = new Map<string, number>();
const taskClaimOverlays = new Map<string, Map<string, { task: VipTask; status: "pending" | "confirmed" }>>();
const tierClaimOverlays = new Map<string, Map<string, "pending" | "confirmed">>();

function bumpBoardVersion(phone: string): number {
  const version = (boardVersions.get(phone) || 0) + 1;
  boardVersions.set(phone, version);
  return version;
}

function applyTaskClaimOverlays(phone: string, board: VipTaskboard): VipTaskboard {
  const overlays = taskClaimOverlays.get(phone);
  const tierOverlays = tierClaimOverlays.get(phone);
  if (!overlays?.size && !tierOverlays?.size) return board;
  let changed = false;
  const tasks = board.tasks.map((task) => {
    if (!overlays?.has(task.id) || (task.claimed && task.claimStatus === "approved")) return task;
    changed = true;
    return { ...task, claimed: true, claimStatus: "approved" as const };
  });
  let claimedTierRewards = board.claimedTierRewards || [];
  if (tierOverlays?.size) {
    for (const category of tierOverlays.keys()) {
      if (!claimedTierRewards.some((name) => name.toLowerCase() === category.toLowerCase())) {
        claimedTierRewards = [...claimedTierRewards, category];
        changed = true;
      }
    }
  }
  return changed ? { ...board, tasks, claimedTierRewards } : board;
}

function clearServerConfirmedClaims(phone: string, board: VipTaskboard) {
  const overlays = taskClaimOverlays.get(phone);
  if (overlays) {
    for (const task of board.tasks) {
      if (task.claimed && task.claimStatus === "approved" && overlays.get(task.id)?.status === "confirmed") {
        overlays.delete(task.id);
      }
    }
    if (overlays.size === 0) taskClaimOverlays.delete(phone);
  }

  const tierOverlays = tierClaimOverlays.get(phone);
  if (!tierOverlays) return;
  const claimedTiers = new Set((board.claimedTierRewards || []).map((name) => name.toLowerCase()));
  for (const [category, status] of tierOverlays) {
    if (status === "confirmed" && claimedTiers.has(category.toLowerCase())) tierOverlays.delete(category);
  }
  if (tierOverlays.size === 0) tierClaimOverlays.delete(phone);
}

function cacheAndPublishBoard(phone: string, board: VipTaskboard) {
  vipCache = { phone, board, at: Date.now() };
  for (const listener of boardListeners) {
    try { listener(board); } catch { /* one bad listener must not break the loader */ }
  }
}

// Anyone holding a board re-reads it the moment anyone else loads a newer one.
// The header chip is mounted on every tab, so it would otherwise sit on a
// stale tier until the app reloads.
export function subscribeMilestoneBoard(listener: (board: VipTaskboard) => void): () => void {
  boardListeners.add(listener);
  return () => { boardListeners.delete(listener); };
}

// Synchronous read of the cached board, so a remount can render last week's
// data on the first frame instead of flashing a skeleton while an effect runs.
export function peekMilestoneBoard(phone: string): VipTaskboard | null {
  if (vipCache && vipCache.phone === phone) return vipCache.board;
  return null;
}

// Where the user last was inside the Journey. The page unmounts on every tab
// switch, so component state alone loses their place.
const lastStageByPhone = new Map<string, string>();

export function rememberMilestoneStage(phone: string, stage: string | null) {
  if (stage) lastStageByPhone.set(phone, stage);
  else lastStageByPhone.delete(phone);
}

export function peekMilestoneStage(phone: string): string | null {
  return lastStageByPhone.get(phone) ?? null;
}

// Shared loader so Home can show the next milestone without a second fetch.
export async function getMilestoneBoard(phone: string, signal: AbortSignal, force = false): Promise<VipTaskboard> {
  if (!force && vipCache && vipCache.phone === phone && Date.now() - vipCache.at < CACHE_TTL) return vipCache.board;
  const versionAtStart = boardVersions.get(phone) || 0;
  const requestId = (boardRequestIds.get(phone) || 0) + 1;
  boardRequestIds.set(phone, requestId);
  const data = await fetchJsonWithSignal<VipTaskboard>(`/api/profile/vip-tasks/${encodeURIComponent(phone)}`, signal);
  if (
    (boardVersions.get(phone) || 0) !== versionAtStart ||
    requestId < (appliedBoardRequestIds.get(phone) || 0)
  ) {
    if (vipCache?.phone === phone) return vipCache.board;
  }
  const normalizedBoard = normalizeVipTaskboard(data);
  clearServerConfirmedClaims(phone, normalizedBoard);
  const board = applyTaskClaimOverlays(phone, normalizedBoard);
  appliedBoardRequestIds.set(phone, requestId);
  cacheAndPublishBoard(phone, board);
  return board;
}

export function beginMilestoneTaskClaim(phone: string, task: VipTask): boolean {
  const overlays = taskClaimOverlays.get(phone) || new Map();
  if (overlays.has(task.id)) return false;
  overlays.set(task.id, { task, status: "pending" });
  taskClaimOverlays.set(phone, overlays);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, vipCache.board));
  return true;
}

export function confirmMilestoneTaskClaim(phone: string, taskId: string) {
  const overlays = taskClaimOverlays.get(phone) || new Map();
  const cachedTask = vipCache?.phone === phone ? vipCache.board.tasks.find((task) => task.id === taskId) : undefined;
  const previous = overlays.get(taskId);
  if (!previous && !cachedTask) return;
  overlays.set(taskId, { task: previous?.task || cachedTask!, status: "confirmed" });
  taskClaimOverlays.set(phone, overlays);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, vipCache.board));
}

export function clearMilestoneTaskClaim(phone: string, taskId: string) {
  const overlays = taskClaimOverlays.get(phone);
  const previous = overlays?.get(taskId);
  if (!overlays || !previous || previous.status === "confirmed") return;
  overlays.delete(taskId);
  if (overlays.size === 0) taskClaimOverlays.delete(phone);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) {
    const restored = {
      ...vipCache.board,
      tasks: vipCache.board.tasks.map((task) => task.id === taskId ? previous.task : task),
    };
    cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, restored));
  }
}

export function beginMilestoneTierClaim(phone: string, category: string): boolean {
  const claims = tierClaimOverlays.get(phone) || new Map();
  if (Array.from(claims.keys()).some((name) => name.toLowerCase() === category.toLowerCase())) return false;
  claims.set(category, "pending");
  tierClaimOverlays.set(phone, claims);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, vipCache.board));
  return true;
}

export function confirmMilestoneTierClaim(phone: string, category: string) {
  const claims = tierClaimOverlays.get(phone) || new Map();
  claims.set(category, "confirmed");
  tierClaimOverlays.set(phone, claims);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, vipCache.board));
}

export function clearMilestoneTierClaim(phone: string, category: string) {
  const claims = tierClaimOverlays.get(phone);
  const foundCategory = claims && Array.from(claims.keys()).find((name) => name.toLowerCase() === category.toLowerCase());
  if (!claims || !foundCategory || claims.get(foundCategory) === "confirmed") return;
  claims.delete(foundCategory);
  if (claims.size === 0) tierClaimOverlays.delete(phone);
  bumpBoardVersion(phone);
  if (vipCache?.phone === phone) {
    const claimedTierRewards = (vipCache.board.claimedTierRewards || []).filter((name) => name.toLowerCase() !== foundCategory.toLowerCase());
    cacheAndPublishBoard(phone, applyTaskClaimOverlays(phone, { ...vipCache.board, claimedTierRewards }));
  }
}

interface Props { phone: string; siteConfig?: any; userProfile?: any; onClaimSuccess?: (p: any) => void; onBack?: () => void; focusStage?: string | null; }

export function AchievementGlyph({ metric, socialType, className }: { metric?: string; socialType?: string; className?: string }) {
  const socialIcon = socialType?.startsWith("facebook_")
    ? "/facebook.svg"
    : socialType === "telegram_join"
      ? "/telegram.svg"
      : socialType === "whatsapp_join"
        ? "/whatsapp.svg"
        : "";
  if (socialIcon) return <img src={socialIcon} alt="" aria-hidden="true" className={`${className || "h-8 w-8"} object-contain`} />;

  const m = String(metric || "operator_points");
  const art =
    m === "streak_days" ? calendar3d
    : m === "runs_started" ? play3d
    : m === "active_runs" ? flash3d
    : m === "completed_runs" ? trophy3d
    : m === "invites_count" ? link3d
    : m === "account_created" ? account3d
    : m === "lifetime_yield" ? dollar3d
    : m === "successful_deposits" ? dollar3d
    : m === "successful_withdrawals" ? wallet3d
    : m === "milestones_claimed" ? medal3d
    : m === "collectibles_claimed" ? collectible3d
    : dollar3d;
  return <img src={art} alt="" aria-hidden="true" className={`${className || "h-8 w-8"} object-contain drop-shadow-sm`} />;
}

function socialActionLabel(socialType?: string) {
  switch (socialType) {
    case "facebook_follow": return "Follow Page";
    case "facebook_like": return "Like Page";
    case "facebook_comment": return "Comment";
    case "facebook_share": return "Share";
    case "telegram_join":
    case "whatsapp_join": return "Join Group";
    default: return "Open";
  }
}

interface StageGroup {
  name: string;
  description: string;
  tasks: VipTask[];
  done: number;
  total: number;
  locked: boolean;
  claimedTier: boolean;
  claimable: boolean;
  tierReward: number;
  art: string;
}


export default function VipTasksPage({ phone, userProfile, onClaimSuccess, focusStage }: Props) {
  const { formatCurrency } = useCurrency();
  const [board, setBoard] = useState<VipTaskboard>(() => peekMilestoneBoard(phone) || {
    tasks: [], vipLevel: 0, stageOrder: [], tierRewards: {}, tierMeta: {}, claimedTierRewards: [],
    referralRates: { level1: 15, level2: 5, level3: 0, level4: 0 },
    progress: { level1Bonus: 0, level2Bonus: 0, level3Bonus: 0, level4Bonus: 0, accumulatedBonus: 0, totalReferralBonus: 0, operatorPoints: 0 },
  });
  const [loading, setLoading] = useState(() => !peekMilestoneBoard(phone));
  const [hasLoadedBoard, setHasLoadedBoard] = useState(() => Boolean(peekMilestoneBoard(phone)));
  const [bulkStage, setBulkStage] = useState<string | null>(null);
  const [submittingTasks, setSubmittingTasks] = useState<Set<string>>(() => new Set());
  const [openedTaskLinks, setOpenedTaskLinks] = useState<Set<string>>(() => new Set());
  // Restore where the user was: an explicit deep link wins, otherwise the last
  // stage they opened on this account.
  const [selectedStage, setSelectedStage] = useState<string | null>(() => focusStage || peekMilestoneStage(phone));
  const [previousFocusStage, setPreviousFocusStage] = useState(focusStage);
  const rootRef = useRef<HTMLDivElement>(null);
  // Callback ref: the list and detail headers are different elements, and the
  // coin flight needs whichever one is on screen.
  const setBalanceRef = useCallback((el: HTMLDivElement | null) => {
    registerTarget("vipBalance", el);
  }, []);
  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const taskClaimsInFlight = useRef(new Set<string>());
  const stageClaimsInFlight = useRef(new Set<string>());
  const { display: displayPoints, countTo: countPoints } = useCountedMoney(Number(userProfile?.points || 0));
  const { play: playClaimFx, layer: claimFxLayer, flightMs } = useClaimFx();
  // Apply route focus before React commits. An effect here let one frame of the
  // tier list show before switching to the requested tier detail.
  if (focusStage !== previousFocusStage) {
    setPreviousFocusStage(focusStage);
    setSelectedStage(focusStage || null);
    if (focusStage) rememberMilestoneStage(phone, focusStage);
  }
  // Bar fill-in on mount / stage open — same treatment as Home Active Runs.
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    setBarsIn(false);
    const frame = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(frame);
  }, [selectedStage]);
  const { renew, abort } = useAbortSignal();

  // Cache-first and TTL-aware: getMilestoneBoard returns the cached board when
  // it is fresh and only hits the network when it is missing or stale. `silent`
  // refreshes without a spinner, so returning to the tab (or the app coming
  // back to the foreground) never makes the user wait.
  const load = useCallback(async (opts: { force?: boolean; silent?: boolean } = {}) => {
    const { force = false, silent = false } = opts;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!silent) setLoading(true);
    const s=renew();
    try {
      const n=await getMilestoneBoard(phone, s, force);
      if (!s.aborted) { setBoard(n); setHasLoadedBoard(true); }
    }
    catch(e:any){ if(s.aborted||e?.name==="AbortError") return; if (!silent) toast.error(e.message||"Journey unavailable"); }
    finally{ if (!s.aborted && !silent) setLoading(false); }
  }, [phone]);

  // Render from the cache on the first frame, then refresh it in the
  // background. Navigation between tabs remounts this page, so a cache miss
  // here is what made every visit look like a load.
  useEffect(()=>{
    void load();
    const onVis=()=>{ if(!document.hidden) void load({ silent: true }); };
    document.addEventListener("visibilitychange", onVis);
    return()=>{ document.removeEventListener("visibilitychange", onVis); abort(); };
  }, [load]);

  // A social task pending admin verification is the one case where the board
  // can change without the user doing anything, so poll — cache-first, so this
  // only hits the network when the cache has actually gone stale.
  useEffect(() => {
    if (!board.tasks.some((task) => task.claimStatus === "pending")) return;
    const pollId = window.setInterval(() => {
      if (!document.hidden) void load({ silent: true });
    }, 15000);
    return () => window.clearInterval(pollId);
  }, [board.tasks, load]);

  // Remember where the user was so a remount lands them back in the same level.
  useEffect(() => { rememberMilestoneStage(phone, selectedStage); }, [phone, selectedStage]);

  // Stages in admin order (older top, new below). Descriptions, art, and
  // rewards come from admin tier settings only — no hardcoded fallbacks.
  // Completion is pure progress; claiming happens once per stage.
  const stages: StageGroup[] = useMemo(() => {
    const claimedTiers = board.claimedTierRewards || [];
    const order: string[] = [];
    for (const t of board.tasks) {
      const name = String(t.category || "Milestone");
      if (!order.includes(name)) order.push(name);
    }
    return order.map((name) => {
      const tasks = board.tasks.filter((t) => String(t.category || "Milestone") === name);
      const done = tasks.filter(isTaskMet).length;
      const claimedTier = claimedTiers.includes(name);
      const locked = tasks.length > 0 && tasks.every((t) => t.stageLocked);
      const tierReward = tierRewardFor(board.tierRewards, name);
      const meta = tierMetaFor(board.tierMeta, name);
      return {
        name,
        description: meta.description || "",
        tasks,
        done,
        total: tasks.length,
        locked: locked && !claimedTier,
        claimedTier,
        claimable: tasks.length > 0 && done === tasks.length && !claimedTier && !locked && tierReward > 0,
        tierReward,
        art: meta.imageUrl || "",
      };
    });
  }, [board.tasks, board.claimedTierRewards, board.tierRewards, board.tierMeta]);

  const currentIdx = stages.findIndex((s) => !s.claimedTier);
  const detail = selectedStage ? stages.find((s) => s.name === selectedStage) || null : null;

  // Compact range semantics: "3/4 days", never "3 days of 4 days".
  const fmtRange = useCallback((task: VipTask) => {
    const meta = metricMeta(task.metric);
    if (meta.isMoney) return `${formatCurrency(task.progress)} / ${formatCurrency(task.requiredBonus)}`;
    const p = Math.max(0, Math.floor(Number(task.progress) || 0));
    const q = Math.max(0, Math.floor(Number(task.requiredBonus) || 0));
    return `${p.toLocaleString()}/${q.toLocaleString()}${meta.unit ? ` ${meta.unit}` : ""}`;
  }, [formatCurrency]);

  const applyPointsDelta = useCallback((delta: number, extra: Record<string, any> = {}) => {
    const current = userProfileRef.current;
    if (!current || !onClaimSuccess) return;
    const next = { ...current, ...extra, points: (Number(current.points) || 0) + delta };
    userProfileRef.current = next;
    onClaimSuccess(next);
  }, [onClaimSuccess]);

  /**
   * The claim celebration: a burst where the user tapped, coins arcing to the
   * withdrawable balance, and the balance counting up to meet them. Call BEFORE
   * the optimistic balance write — the count-up must own the number, or the
   * write lands first and the reward looks like it paid twice.
   */
  const celebrateClaim = useCallback((sourceRect: DOMRect | null, nextPoints: number) => {
    playCheckinSound();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Claim the number now (so the optimistic write cannot land underneath) but
    // hold the visible count until the coins arrive.
    countPoints(nextPoints, 900, reduced ? 0 : flightMs);
    if (reduced || !sourceRect) return;
    playClaimFx({
      x: sourceRect.left + sourceRect.width / 2,
      y: sourceRect.top + sourceRect.height / 2,
    }, 8);
  }, [countPoints, playClaimFx, flightMs]);

  // CLAIM LEVEL REWARD: the single one-time payout for the whole stage.
  const handleClaimStage = async (stage: StageGroup, event?: React.MouseEvent<HTMLElement>) => {
    if (!stage.claimable || stageClaimsInFlight.current.has(stage.name) || !beginMilestoneTierClaim(phone, stage.name)) return;
    const sourceRect = event?.currentTarget.getBoundingClientRect() ?? null;
    const optimisticReward = Math.max(0, Number(stage.tierReward) || 0);
    const previousBoard = board;
    const previousProfile = userProfileRef.current;
    const previousProfileTiers = previousProfile?.claimedTierRewards || [];
    const optimisticTiers = [...new Set([...(board.claimedTierRewards || []), stage.name])];

    stageClaimsInFlight.current.add(stage.name);
    setBulkStage(stage.name);
    setBoard((current) => ({ ...current, claimedTierRewards: optimisticTiers }));
    const previousPoints = Number(previousProfile?.points || 0);
    celebrateClaim(sourceRect, previousPoints + optimisticReward);
    applyPointsDelta(optimisticReward, { claimedTierRewards: optimisticTiers });

    try {
      const s = renew();
      const data = await fetchJsonWithSignal<{ bonus: number; claimedTierRewards?: string[] }>("/api/profile/vip-tasks/claim", s, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, category: stage.name }),
      });
      const reward = Math.max(0, Number(data.bonus) || 0);
      const claimedTierRewards = data.claimedTierRewards || optimisticTiers;
      if (reward !== optimisticReward) {
        countPoints(previousPoints + reward);
        applyPointsDelta(reward - optimisticReward, { claimedTierRewards });
      } else if (data.claimedTierRewards) {
        applyPointsDelta(0, { claimedTierRewards });
      }
      setBoard((current) => ({ ...current, claimedTierRewards }));
      confirmMilestoneTierClaim(phone, stage.name);
      void load({ force: true, silent: true });
    } catch (error: any) {
      clearMilestoneTierClaim(phone, stage.name);
      countPoints(previousPoints);
      applyPointsDelta(-optimisticReward, { claimedTierRewards: previousProfileTiers });
      setBoard((current) => ({ ...current, claimedTierRewards: previousBoard.claimedTierRewards }));
      if (error?.name !== "AbortError") toast.error(error.message || "Claim failed");
    } finally {
      stageClaimsInFlight.current.delete(stage.name);
      setBulkStage(null);
    }
  };

  const handleTaskAction = async (task: VipTask, event?: React.MouseEvent<HTMLElement>) => {
    if (task.claimStatus === "approved" || (task.socialType && task.claimStatus === "pending") || taskClaimsInFlight.current.has(task.id)) return;
    const claimingVerifiedSocial = Boolean(task.socialType) && task.claimStatus === "verified";
    const isRewardClaim = !task.socialType || claimingVerifiedSocial;
    if (!task.socialType && !isTaskMet(task)) {
      toast.info("Complete this task requirement first.");
      return;
    }

    const sourceRect = isRewardClaim ? (event?.currentTarget.getBoundingClientRect() ?? null) : null;
    const optimisticReward = isRewardClaim ? Math.max(0, Number(task.reward) || 0) : 0;
    if (isRewardClaim && !beginMilestoneTaskClaim(phone, task)) return;
    taskClaimsInFlight.current.add(task.id);
    setSubmittingTasks((current) => new Set(current).add(task.id));

    if (isRewardClaim) {
      setBoard((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, claimed: true, claimStatus: "approved" } : item),
      }));
      const previousPoints = Number(userProfileRef.current?.points || 0);
      celebrateClaim(sourceRect, previousPoints + optimisticReward);
      applyPointsDelta(optimisticReward);
    }

    const s = renew();
    try {
      const endpoint = task.socialType && !claimingVerifiedSocial ? "/api/profile/vip-tasks/verify" : "/api/profile/vip-tasks/claim";
      const result = await fetchJsonWithSignal<{ status: "pending" | "verified" | "approved"; reward: number }>(endpoint, s, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, taskId: task.id }),
      });

      if (result.status === "approved") {
        const reward = Math.max(0, Number(result.reward) || 0);
        const previousPoints = Number(userProfileRef.current?.points || 0) - (isRewardClaim ? optimisticReward : 0);
        if (!isRewardClaim) {
          setBoard((current) => ({
            ...current,
            tasks: current.tasks.map((item) => item.id === task.id ? { ...item, claimed: true, claimStatus: "approved" } : item),
          }));
          celebrateClaim(sourceRect, previousPoints + reward);
          applyPointsDelta(reward);
        } else if (reward !== optimisticReward) {
          countPoints(previousPoints + reward);
          applyPointsDelta(reward - optimisticReward);
        }
        confirmMilestoneTaskClaim(phone, task.id);
        void load({ force: true, silent: true });
      } else {
        if (isRewardClaim) {
          clearMilestoneTaskClaim(phone, task.id);
          countPoints(Number(userProfileRef.current?.points || 0) - optimisticReward);
          applyPointsDelta(-optimisticReward);
        }
        setBoard((current) => ({
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id ? { ...item, claimed: false, claimStatus: result.status } : item),
        }));
        toast.info(result.status === "pending" ? "Task is being verified." : "Task verified. Tap its reward to claim.");
        void load({ force: true, silent: true });
      }
    } catch (error: any) {
      if (isRewardClaim) {
        clearMilestoneTaskClaim(phone, task.id);
        countPoints(Number(userProfileRef.current?.points || 0) - optimisticReward);
        applyPointsDelta(-optimisticReward);
        setBoard((current) => ({
          ...current,
          tasks: current.tasks.map((item) => item.id === task.id ? task : item),
        }));
      }
      if (error?.name !== "AbortError") toast.error(error.message || "Could not complete this task.");
    } finally {
      taskClaimsInFlight.current.delete(task.id);
      setSubmittingTasks((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const isInitial = (loading && board.tasks.length===0) || (Boolean(focusStage) && !hasLoadedBoard);

  if (isInitial) {
    return (
      <div className="w-full flex-1 flex flex-col min-h-0 p-3 pb-8 space-y-3">
        <div className="space-y-3 animate-pulse">
          <div className="rounded-[24px] bg-white/10 border border-white/10 h-[120px]" />
          <div className="rounded-2xl bg-white/10 border border-white/10 h-[110px]" />
          <div className="rounded-2xl bg-white/10 border border-white/10 h-[110px]" />
          <div className="rounded-2xl bg-white/10 border border-white/10 h-[110px]" />
        </div>
      </div>
    );
  }

  // ---------- Stage detail (mockup screen 2) ----------
  if (detail) {
    const idx = stages.indexOf(detail);
    const next = stages[idx + 1]?.name;
    const claiming = bulkStage === detail.name;
    const visibleTasks = detail.tasks;
    return (
      <div ref={rootRef} className="relative w-full flex-1 flex flex-col min-h-0">
      {claimFxLayer}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-8 scrollbar-none min-h-0">
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-[var(--theme-card-bg)]/80 px-4 py-2 backdrop-blur-xl">
            <button type="button" onClick={() => setSelectedStage(null)} aria-label="Back to journey" className="w-9 h-9 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 flex items-center justify-center text-[var(--theme-text)] cursor-pointer active:scale-95 transition-transform shrink-0"><ArrowLeft className="w-4 h-4" /></button>
            <h1 className="min-w-0 flex-1 truncate font-display font-black text-[16px] leading-none tracking-tight text-[var(--theme-text)]">{detail.name.toUpperCase()}</h1>
            <div ref={setBalanceRef} className="shrink-0 text-right">
              <p className="text-[8px] font-sans font-normal tracking-[0.13em] text-[var(--theme-text)] opacity-65">WITHDRAWABLE BALANCE</p>
              <p className="mt-0.5 font-display font-black text-[16px] leading-none text-[var(--theme-primary)]">{formatCurrency(displayPoints)}</p>
            </div>
          </div>
          {/* Hero — frosted continuation, borderless so it blends into the page
              and adapts to any system-wide background image */}
          <div className="relative overflow-hidden border-0">
            {detail.art && (
              <img src={optimizedImageUrl(detail.art, 900)} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />
            )}
            <div className="absolute inset-0 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] pointer-events-none" />
            <div className="relative px-4 pb-4 pt-2">
              <div className="mt-2">
                {detail.description ? (
                  <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 leading-snug mt-2 max-w-[300px]">{detail.description}</p>
                ) : (
                  <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-snug mt-2 max-w-[300px]">Complete these achievements{next ? ` to unlock ${next}.` : "."}</p>
                )}
              </div>
              {/* Stage reward — lives in the hero now: trophy + amount pill */}
              <div className="mt-4 flex items-center justify-between gap-3">
                {(detail.tierReward > 0 || detail.claimedTier) && (detail.claimedTier ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 px-4 py-2 text-[11px] font-sans font-black text-[var(--theme-text)]">
                    <img src={dollar3d} alt="" loading="lazy" decoding="async" className="w-4 h-4 object-contain" /> {formatCurrency(detail.tierReward)}
                  </span>
                ) : (
                  <button type="button" onClick={(event) => void handleClaimStage(detail, event)} disabled={claiming || !detail.claimable} aria-label={detail.claimable ? `Claim stage reward of ${formatCurrency(detail.tierReward)}` : "Stage reward locked"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-sans font-black transition-transform active:scale-[0.97] disabled:cursor-not-allowed ${detail.claimable ? "streak-tile-pulse tile-shimmer-5s overflow-hidden bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_3px_0_0_var(--theme-primary-shadow)]" : "border border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/70 text-[var(--theme-on-primary)] opacity-55 saturate-50"}`}>
                    {!detail.claimable && <Lock className="w-3.5 h-3.5" aria-hidden="true" />}
                    <img src={dollar3d} alt="" loading="lazy" decoding="async" className="w-4 h-4 object-contain" /> {claiming ? "CLAIMING…" : formatCurrency(detail.tierReward)}
                  </button>
                ))}
                <span className="text-right text-[11px] font-sans font-normal tabular-nums text-[var(--theme-primary)]">{detail.done}/{detail.total} COMPLETE</span>
              </div>
            </div>
          </div>

          <div className="px-2 mt-5">
            <div className="flex flex-col gap-3">
              {visibleTasks.map((task) => {
                const met = isTaskMet(task);
                const p = calcVipProgress(task.progress, task.requiredBonus);
                const locked = task.stageLocked && !detail.claimedTier;
                const taskPending = Boolean(task.socialType) && task.claimStatus === "pending";
                const taskVerified = Boolean(task.socialType) && task.claimStatus === "verified";
                const taskApproved = task.claimStatus === "approved";
                const socialTask = Boolean(task.socialType);
                const actionLinkKey = `${task.id}:${task.actionUrl || ""}`;
                const actionLinkOpened = openedTaskLinks.has(actionLinkKey);
                const rewardAvailable = taskVerified || (!socialTask && met && !taskApproved);
                const claimDisabled = locked || !rewardAvailable || task.reward <= 0 || submittingTasks.has(task.id);
                return (
                  <article
                    key={task.id}
                    className={`relative flex flex-col gap-2.5 overflow-hidden rounded-[18px] border px-3 py-3 transition-colors ${
                      rewardAvailable
                        ? "border-[var(--theme-primary)]/25 bg-[var(--theme-primary)]/[0.045]"
                        : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
                        {task.imageUrl ? (
                          <img src={optimizedImageUrl(task.imageUrl, 200)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        ) : (
                          <AchievementGlyph metric={task.metric} socialType={task.socialType} className="h-7 w-7" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[14px] font-sans font-bold leading-snug text-[var(--theme-text)]">{task.title}</h4>
                        {task.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] font-sans font-normal leading-snug text-[var(--theme-text)] opacity-50">
                            {task.description}
                          </p>
                        ) : null}
                      </div>
                      {/* One affordance per card: the coin + amount chip IS the
                          claim button. No second "Claim" verb underneath. */}
                      {taskApproved ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.06] px-2 py-1.5 text-[11px] font-sans font-black tabular-nums text-[var(--theme-text)] opacity-45">
                          <img src={dollar3d} alt="" className="h-3.5 w-3.5 object-contain grayscale" />
                          {formatCurrency(task.reward)}
                          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => void handleTaskAction(task, event)}
                          disabled={claimDisabled}
                          aria-label={`Claim ${task.title} for ${formatCurrency(task.reward)}`}
                          className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1.5 text-[11px] font-sans font-black tabular-nums transition-transform active:scale-95 ${
                            !claimDisabled
                              ? "cursor-pointer border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)]"
                              : "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-[var(--theme-text)] opacity-45"
                          }`}
                        >
                          {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
                          {submittingTasks.has(task.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <img src={dollar3d} alt="" className="h-3.5 w-3.5 object-contain" />
                          )}
                          {formatCurrency(task.reward)}
                        </button>
                      )}
                    </div>

                    {/* Progress and the quiet social action sit on one indented
                        second line. A hairline, not a second box — the negative
                        space does the separating. */}
                    <div className="pl-[56px]">
                      {socialTask ? (
                        <div className="flex items-center justify-between gap-3">
                          {task.actionUrl ? (
                            <a
                              href={task.actionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setOpenedTaskLinks((current) => new Set(current).add(actionLinkKey))}
                              aria-label={`${socialActionLabel(task.socialType)}: ${task.title}`}
                              className="cursor-pointer text-[11px] font-sans font-bold text-[var(--theme-primary)] underline underline-offset-4 decoration-[var(--theme-primary)]/40 transition-opacity hover:opacity-75 active:opacity-55"
                            >
                              {socialActionLabel(task.socialType)}
                            </a>
                          ) : (
                            <span className="text-[11px] font-sans font-bold text-[var(--theme-primary)]/50 underline underline-offset-4">
                              {socialActionLabel(task.socialType)}
                            </span>
                          )}
                          {taskPending ? (
                            <span role="status" className="inline-flex items-center gap-1.5 text-[10px] font-sans font-black tracking-[0.1em] text-[var(--theme-text)] opacity-60">
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> VERIFYING
                            </span>
                          ) : taskVerified ? (
                            <span className="text-[10px] font-sans font-black tracking-[0.1em] text-[var(--theme-primary)]">TAP AMOUNT TO CLAIM</span>
                          ) : taskApproved ? null : (
                            <button
                              type="button"
                              onClick={(event) => void handleTaskAction(task, event)}
                              disabled={locked || task.reward <= 0 || submittingTasks.has(task.id) || !actionLinkOpened}
                              title={task.actionUrl ? `Open the link and ${socialActionLabel(task.socialType).toLowerCase()} before verifying.` : "This task needs a social link before it can be verified."}
                              className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-sans font-black tracking-[0.1em] text-[var(--theme-text)] opacity-70 transition-opacity active:opacity-40 disabled:cursor-not-allowed disabled:opacity-30"
                              aria-label={`Verify ${task.title}. Open and ${socialActionLabel(task.socialType).toLowerCase()} the social link first.`}
                            >
                              <Info className="h-3 w-3" aria-hidden="true" />
                              {submittingTasks.has(task.id) ? "VERIFYING" : "VERIFY"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className={`space-y-2 ${taskApproved || locked ? "opacity-45 saturate-50" : ""}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-sans font-normal tabular-nums leading-none text-[var(--theme-primary)]">{fmtRange(task)}</span>
                            <span className="text-[10px] font-sans font-normal tabular-nums leading-none text-[var(--theme-text)] opacity-50">{Math.round(p)}%</span>
                          </div>
                          <CellsProgress pct={p} cellClass="h-3" />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Journey list (mockup screen 1) ----------
  return (
    <div ref={rootRef} className="relative w-full flex-1 flex flex-col min-h-0">
      {claimFxLayer}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 scrollbar-none min-h-0">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 flex-1 font-display font-black text-[20px] leading-none tracking-tight text-[var(--theme-text)] sm:text-[23px]">YOUR <span className="text-[var(--theme-primary)]">JOURNEY</span></h1>
          <div ref={setBalanceRef} className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[7px] font-sans font-normal tracking-[0.08em] text-[var(--theme-text)] opacity-65">WITHDRAWABLE BALANCE</p>
            <p className="mt-0.5 font-display font-black text-[16px] leading-none text-[var(--theme-primary)]">{formatCurrency(displayPoints)}</p>
          </div>
        </div>
        <p className="mt-2 text-[13px] font-sans text-[var(--theme-text)] opacity-65 leading-snug max-w-[300px]">Complete achievements, unlock new stages, and level up your Operator status.</p>

        {stages.length === 0 ? (
          <div className="py-10 text-center rounded-[24px] bg-white/[0.03] border border-white/10 mt-4">
            <img src={medal3d} alt="" className="w-14 h-14 mx-auto opacity-50" />
            <p className="text-sm font-sans font-semibold mt-3 opacity-70">No stages yet</p>
            <p className="text-[11px] font-sans opacity-40 mt-1">Check back soon</p>
          </div>
        ) : (
          <div className="relative mt-6">
            <div className="flex flex-col gap-4">
              {stages.map((stage, i) => {
                const isCurrent = i === currentIdx;
                const barPct = calcVipProgress(stage.done, Math.max(1, stage.total));
                const muted = stage.locked && !isCurrent;
                const reached = currentIdx === -1 || i < currentIdx || (currentIdx === 0 && i === 0);
                const complete = stage.claimedTier || (isCurrent && stage.done === stage.total && stage.total > 0);
                return (
                  <div key={stage.name} className="relative flex items-stretch gap-3">
                    {i < stages.length - 1 && (
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute left-[11px] top-4 -bottom-6 w-0.5 origin-top transition-transform duration-700 ease-out ${reached ? "bg-[var(--theme-primary)] shadow-[0_0_10px_var(--theme-primary)]" : "bg-white/[0.08]"}`}
                        style={reached ? { transform: barsIn ? "scaleY(1)" : "scaleY(0)", transitionDelay: `${i * 140}ms` } : undefined}
                      />
                    )}
                    <span className={`relative z-10 mt-4 flex h-6 w-6 shrink-0 self-start items-center justify-center rounded-full border transition-colors ${complete || isCurrent ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]" : "border-white/15 bg-[var(--theme-card-bg)]"} ${isCurrent && !complete ? "ring-4 ring-[var(--theme-primary)]/15" : ""}`}>
                      {complete ? (
                        <Check className="h-3 w-3 text-black" strokeWidth={3} />
                      ) : isCurrent ? (
                        <span className="text-[11px] font-sans font-black text-black">{i + 1}</span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-text)]/30" />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedStage(stage.name)}
                      aria-label={`${stage.name}, ${stage.done} of ${stage.total} tasks complete${isCurrent ? ", current level" : ""}${muted ? ", locked" : ""}`}
                      className={`relative flex-1 min-w-0 self-start flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left cursor-pointer active:scale-[0.99] transition-[transform,border-color,background-color] duration-[180ms] ease-out bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] ${isCurrent ? "border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/[0.045] shadow-[0_0_24px_rgba(0,0,0,0.18)]" : "border-white/[0.06]"} ${muted ? "opacity-60" : ""}`}
                    >
                      {isCurrent && <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-[var(--theme-primary)]" />}
                      {stage.art ? (
                        <img src={optimizedImageUrl(stage.art, 200)} alt="" loading="lazy" decoding="async" className={`h-[68px] w-14 shrink-0 rounded-xl bg-black/20 object-cover ${isCurrent ? "ring-1 ring-[var(--theme-primary)]/50" : ""}`} />
                      ) : (
                        <span className={`flex h-[68px] w-14 shrink-0 items-center justify-center rounded-xl border bg-black/20 ${isCurrent ? "border-[var(--theme-primary)]/50" : "border-white/10"}`}><AchievementGlyph metric={stage.tasks[0]?.metric} socialType={stage.tasks[0]?.socialType} /></span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 break-words font-display font-black text-[16px] leading-tight tracking-tight text-[var(--theme-text)]">{stage.name.toUpperCase()}</span>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-text)] opacity-35" />
                        </span>
                        {/* Progress and count share one quiet row; the second
                            text line is gone so each stage can breathe. */}
                        <span className={`mt-3 block ${stage.claimedTier || muted ? "opacity-50 saturate-50" : ""}`}>
                          <span className="mb-1.5 flex items-center justify-between tabular-nums">
                            <span className="text-[9px] font-bold tracking-[0.12em] text-[var(--theme-primary)]/80">{stage.done}/{stage.total} TASKS</span>
                            <span className="text-[9px] font-bold text-[var(--theme-text)]/45">{Math.round(barPct)}%</span>
                          </span>
                          <CellsProgress pct={barPct} cellClass="h-3" />
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* End of track — a quiet rule, not a promotional banner. */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-[var(--theme-text)] opacity-40">More levels ahead</p>
          <p className="text-[10px] font-sans font-bold tabular-nums tracking-[0.12em] text-[var(--theme-primary)] opacity-75">{stages.length} STAGES</p>
        </div>
      </div>
    </div>
  );
}
