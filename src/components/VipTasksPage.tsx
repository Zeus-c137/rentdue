import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, Check, Lock, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { calcVipProgress, normalizeVipTaskboard, metricMeta, tierRewardFor, tierMetaFor, isTaskMet } from "@/src/utils/vip";
import CellsProgress from "./CellsProgress";
import { fetchJsonWithSignal } from "@/src/utils/abortableFetch";
import { useAbortSignal } from "@/src/hooks/useGatedInterval";
import { optimizedImageUrl } from "@/src/utils/imageUtils";
import { playCheckinSound, unlockCheckinSound } from "@/src/utils/checkinSound";
import type { VipTask, VipTaskboard } from "@/src/types";
import medal3d from "@/src/assets/3d/3dicons-medal-iso-premium.png";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
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

// Anyone holding a board re-reads it the moment anyone else loads a newer one.
// The header chip is mounted on every tab, so it would otherwise sit on a
// stale tier until the app reloads.
export function subscribeMilestoneBoard(listener: (board: VipTaskboard) => void): () => void {
  boardListeners.add(listener);
  return () => { boardListeners.delete(listener); };
}

function publishBoard(board: VipTaskboard) {
  for (const listener of boardListeners) {
    try { listener(board); } catch { /* one bad listener must not break the loader */ }
  }
}

// Shared loader so Home can show the next milestone without a second fetch.
export async function getMilestoneBoard(phone: string, signal: AbortSignal): Promise<VipTaskboard> {
  if (vipCache && vipCache.phone === phone && Date.now() - vipCache.at < CACHE_TTL) return vipCache.board;
  const data = await fetchJsonWithSignal<VipTaskboard>(`/api/profile/vip-tasks/${encodeURIComponent(phone)}`, signal);
  const board = normalizeVipTaskboard(data);
  vipCache = { phone, board, at: Date.now() };
  publishBoard(board);
  return board;
}

export function bustMilestoneCache() { vipCache = null; }

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
    : m === "milestones_claimed" ? medal3d
    : m === "collectibles_claimed" ? collectible3d
    : dollar3d;
  return <img src={art} alt="" aria-hidden="true" className={`${className || "h-8 w-8"} object-contain drop-shadow-sm`} />;
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

interface FlightCoin { id: number; startX: number; startY: number; dx: number; dy: number; delay: number; }

export default function VipTasksPage({ phone, userProfile, onClaimSuccess, focusStage }: Props) {
  const { formatCurrency } = useCurrency();
  const [board, setBoard] = useState<VipTaskboard>({
    tasks: [], vipLevel: 0, stageOrder: [], tierRewards: {}, tierMeta: {}, claimedTierRewards: [],
    referralRates: { level1: 15, level2: 5, level3: 0, level4: 0 },
    progress: { level1Bonus: 0, level2Bonus: 0, level3Bonus: 0, level4Bonus: 0, accumulatedBonus: 0, totalReferralBonus: 0, operatorPoints: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [bulkStage, setBulkStage] = useState<string | null>(null);
  const [submittingTask, setSubmittingTask] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(focusStage || null);
  const [coins, setCoins] = useState<FlightCoin[] | null>(null);
  const [rewardFlightBusy, setRewardFlightBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const balanceRef = useRef<HTMLDivElement>(null);
  // A header-tile tap while the journey is already open retargets the detail
  // instead of stranding it on the old stage.
  useEffect(() => { if (focusStage) setSelectedStage(focusStage); }, [focusStage]);
  // Bar fill-in on mount / stage open — same treatment as Home Active Runs.
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    setBarsIn(false);
    const frame = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(frame);
  }, [selectedStage]);
  const { renew, abort } = useAbortSignal();

  const load = useCallback(async (force=false) => {
    if (!force && vipCache && vipCache.phone===phone && Date.now()-vipCache.at < CACHE_TTL) { setBoard(vipCache.board); return; }
    if (typeof document !== "undefined" && document.hidden) return;
    setLoading(true);
    const s=renew();
    try { const data=await fetchJsonWithSignal<VipTaskboard>(`/api/profile/vip-tasks/${encodeURIComponent(phone)}`, s); const n=normalizeVipTaskboard(data); setBoard(n); vipCache={phone, board:n, at:Date.now()}; publishBoard(n); }
    catch(e:any){ if(s.aborted||e?.name==="AbortError") return; toast.error(e.message||"Journey unavailable"); }
    finally{ setLoading(false); }
  }, [phone]);

  useEffect(()=>{ void load(); const onVis=()=>{ if(!document.hidden) void load(); }; document.addEventListener("visibilitychange", onVis); return()=>{ document.removeEventListener("visibilitychange", onVis); abort(); }; }, [load]);

  useEffect(() => {
    if (!board.tasks.some((task) => task.claimStatus === "pending")) return;
    const pollId = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 15000);
    return () => window.clearInterval(pollId);
  }, [board.tasks, load]);

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

  const animateRewardClaim = useCallback((sourceRect: DOMRect | null, nextProfile: any) => new Promise<void>((resolve) => {
    playCheckinSound();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = rootRef.current;
    const target = balanceRef.current?.getBoundingClientRect();
    const finish = () => {
      setCoins(null);
      if (userProfile && onClaimSuccess) onClaimSuccess(nextProfile);
      resolve();
    };
    if (!reduced && sourceRect && root && target) {
      const rootRect = root.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2 - rootRect.left;
      const startY = sourceRect.top + sourceRect.height / 2 - rootRect.top;
      const endX = target.left + target.width / 2 - rootRect.left;
      const endY = target.top + target.height / 2 - rootRect.top;
      setCoins(Array.from({ length: 10 }, (_, i) => ({
        id: Date.now() + i,
        startX: startX + (Math.random() - 0.5) * 24,
        startY: startY + (Math.random() - 0.5) * 10,
        dx: endX - startX + (Math.random() - 0.5) * 30,
        dy: endY - startY,
        delay: i * 0.06,
      })));
      window.setTimeout(finish, 1050);
    } else finish();
  }), [onClaimSuccess, userProfile]);

  // CLAIM LEVEL REWARD: the single one-time payout for the whole stage.
  const handleClaimStage = async(stage: StageGroup, event?: React.MouseEvent<HTMLElement>)=>{
    if (bulkStage || rewardFlightBusy) return;
    if (!stage.claimable) {
      toast.info(`Complete ${stage.done}/${stage.total} tasks to unlock the stage reward.`);
      return;
    }
    const sourceRect = event?.currentTarget.getBoundingClientRect() ?? null;
    unlockCheckinSound();
    setBulkStage(stage.name); setRewardFlightBusy(true); const s=renew();
    try{
      const data=await fetchJsonWithSignal<{bonus:number; claimedTierRewards?:string[]}>(`/api/profile/vip-tasks/claim`, s, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({phone, category: stage.name})});
      const bonus=Number(data.bonus||0);
      toast.success(`Stage reward claimed: ${formatCurrency(bonus)} added to withdrawable balance`);
      await animateRewardClaim(sourceRect, {...userProfile, points:Number(userProfile?.points||0)+bonus, claimedTierRewards: data.claimedTierRewards || [...(userProfile?.claimedTierRewards||[]), stage.name]});
      vipCache=null; await load(true);
    } catch(e:any){ if(e?.name!=="AbortError") toast.error(e.message||"Claim failed"); }
    finally{ setBulkStage(null); setRewardFlightBusy(false); }
  };

  const handleTaskAction = async (task: VipTask, event?: React.MouseEvent<HTMLElement>) => {
    if (task.claimStatus === "approved" || (task.socialType && task.claimStatus === "pending") || rewardFlightBusy) return;
    const claimingVerifiedSocial = Boolean(task.socialType) && task.claimStatus === "verified";
    const isRewardClaim = !task.socialType || claimingVerifiedSocial;
    if (!task.socialType && !isTaskMet(task)) {
      toast.info("Complete this task requirement first.");
      return;
    }
    if (submittingTask) return;
    const sourceRect = isRewardClaim ? (event?.currentTarget.getBoundingClientRect() ?? null) : null;
    if (isRewardClaim) { unlockCheckinSound(); setRewardFlightBusy(true); }
    setSubmittingTask(task.id);
    const s = renew();
    try {
      const endpoint = task.socialType && !claimingVerifiedSocial ? "/api/profile/vip-tasks/verify" : "/api/profile/vip-tasks/claim";
      const result = await fetchJsonWithSignal<{ status: "pending" | "verified" | "approved"; reward: number }>(endpoint, s, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, taskId: task.id })
      });
      if (result.status === "pending") {
        toast.success("Task is being verified.");
      } else if (result.status === "verified") {
        toast.success("Task verified. Tap its reward to claim.");
      } else {
        const reward = Number(result.reward || 0);
        toast.success(`${formatCurrency(reward)} added to your balance.`);
        await animateRewardClaim(sourceRect, { ...userProfile, points: Number(userProfile?.points || 0) + reward });
      }
      vipCache = null;
      await load(true);
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error(error.message || "Could not complete this task.");
    } finally {
      setSubmittingTask(null);
      if (isRewardClaim) setRewardFlightBusy(false);
    }
  };

  const isInitial = loading && board.tasks.length===0;

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
        <AnimatePresence>
          {coins && <div className="absolute inset-0 z-30 pointer-events-none overflow-visible" aria-hidden="true">
            {coins.map((coin) => <motion.img key={coin.id} src={dollar3d} alt="" initial={{ x: 0, y: 0, scale: 0.7, opacity: 1 }} animate={{ x: coin.dx, y: coin.dy, scale: 0.25, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, delay: coin.delay, ease: "easeOut" }} className="absolute w-9 h-9 object-contain" style={{ left: coin.startX - 18, top: coin.startY - 18 }} />)}
          </div>}
        </AnimatePresence>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-8 scrollbar-none min-h-0">
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/5 bg-[var(--theme-card-bg)]/80 px-4 py-2 backdrop-blur-xl">
            <button type="button" onClick={() => setSelectedStage(null)} aria-label="Back to journey" className="w-9 h-9 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 flex items-center justify-center text-[var(--theme-text)] cursor-pointer active:scale-95 transition-transform"><ArrowLeft className="w-4 h-4" /></button>
            <div ref={balanceRef} className="text-right">
              <p className="text-[8px] font-sans font-normal tracking-[0.13em] text-[var(--theme-text)] opacity-65">WITHDRAWABLE BALANCE</p>
              <p className="mt-0.5 font-display font-black text-[16px] leading-none text-[var(--theme-primary)]">{formatCurrency(Number(userProfile?.points || 0))}</p>
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
                <h1 className="font-display font-black text-[32px] leading-none tracking-tight text-[var(--theme-text)] mt-1">{detail.name.toUpperCase()}</h1>
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
                  <button type="button" onClick={(event) => void handleClaimStage(detail, event)} disabled={claiming || rewardFlightBusy || !detail.claimable} aria-label={detail.claimable ? `Claim stage reward of ${formatCurrency(detail.tierReward)}` : "Stage reward locked"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-sans font-black transition-transform active:scale-[0.97] disabled:cursor-not-allowed ${detail.claimable ? "streak-tile-pulse tile-shimmer-5s overflow-hidden bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_3px_0_0_var(--theme-primary-shadow)]" : "border border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/70 text-[var(--theme-on-primary)] opacity-55 saturate-50"}`}>
                    {!detail.claimable && <Lock className="w-3.5 h-3.5" aria-hidden="true" />}
                    <img src={dollar3d} alt="" loading="lazy" decoding="async" className="w-4 h-4 object-contain" /> {claiming ? "CLAIMING…" : formatCurrency(detail.tierReward)}
                  </button>
                ))}
                <span className="text-right text-[11px] font-sans font-normal tabular-nums text-[var(--theme-primary)]">{detail.done}/{detail.total} COMPLETE</span>
              </div>
            </div>
          </div>

          <div className="px-4 mt-3">
            <h2 className="mb-2 text-[12px] font-sans font-black tracking-[0.22em] text-[var(--theme-text)] opacity-70">{detail.name} task list.</h2>
            <div className="flex flex-col gap-2.5">
              {visibleTasks.map((task) => {
                const met = isTaskMet(task);
                const p = calcVipProgress(task.progress, task.requiredBonus);
                const locked = task.stageLocked && !detail.claimedTier;
                const taskPending = Boolean(task.socialType) && task.claimStatus === "pending";
                const taskVerified = Boolean(task.socialType) && task.claimStatus === "verified";
                const taskApproved = task.claimStatus === "approved";
                const socialTask = Boolean(task.socialType);
                const rewardAvailable = taskVerified || (!socialTask && met && !taskApproved);
                const taskInProgress = !socialTask && Number(task.progress || 0) > 0 && !rewardAvailable && !taskApproved;
                return (
                  <div key={task.id} className="rounded-2xl border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] p-3.5 flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {task.imageUrl ? (
                        <img src={optimizedImageUrl(task.imageUrl, 200)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <AchievementGlyph metric={task.metric} socialType={task.socialType} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="text-[14px] font-sans font-bold leading-tight text-[var(--theme-text)] truncate min-w-0 flex-1">{task.title}</h4>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {taskApproved ? <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 px-2 py-1 text-[10px] font-sans font-black tabular-nums text-[var(--theme-text)]">
                            {locked && <Lock className="w-3 h-3 opacity-55" aria-hidden="true" />}
                            <img src={dollar3d} alt="" className="h-4 w-4 object-contain" />{formatCurrency(task.reward)}
                          </span> : <button
                            type="button"
                            onClick={(event) => void handleTaskAction(task, event)}
                            disabled={locked || !rewardAvailable || task.reward <= 0 || Boolean(submittingTask) || rewardFlightBusy}
                            aria-label={`Claim ${task.title} for ${formatCurrency(task.reward)}`}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-sans font-black tabular-nums transition-transform disabled:cursor-not-allowed ${rewardAvailable && !locked && task.reward > 0 ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-[var(--theme-on-primary)] tile-shimmer-5s streak-tile-pulse overflow-hidden cursor-pointer active:scale-[0.97] disabled:opacity-45" : taskInProgress && task.reward > 0 ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/70 text-[var(--theme-on-primary)] opacity-50 saturate-50 cursor-not-allowed" : "border-white/10 bg-[var(--theme-card-bg)]/60 text-[var(--theme-text)] cursor-not-allowed disabled:opacity-45"}`}
                          >
                            {locked && <Lock className="w-3 h-3 opacity-70" aria-hidden="true" />}
                            <img src={dollar3d} alt="" className="h-4 w-4 object-contain" />
                            {submittingTask === task.id ? "CLAIMING…" : formatCurrency(task.reward)}
                          </button>}
                        </span>
                      </div>
                      {task.description && <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-55 leading-snug mt-0.5">{task.description}</p>}
                      {socialTask ? (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {task.socialType && task.actionUrl ? <a href={task.actionUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/10 bg-[var(--theme-card-bg)]/55 px-3 py-1.5 text-[10px] font-sans font-black text-[var(--theme-text)]">VIEW LINK</a> : <span />}
                          {taskPending ? <span className="shrink-0 text-[10px] font-sans font-black tracking-[0.08em] animate-shimmer">VERIFYING</span>
                            : taskApproved ? <span className="shrink-0 text-[10px] font-sans font-black tracking-[0.08em] text-[var(--theme-primary)]">CLAIMED</span>
                            : taskVerified ? <span className="shrink-0 text-[10px] font-sans font-black tracking-[0.08em] text-[var(--theme-primary)]">VERIFIED · TAP REWARD</span>
                            : <button type="button" onClick={(event) => void handleTaskAction(task, event)} disabled={locked || task.reward <= 0 || Boolean(submittingTask) || rewardFlightBusy} className="shrink-0 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/55 px-3 py-1.5 text-[10px] font-sans font-black text-[var(--theme-text)] cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-45" aria-label={`Verify ${task.title}`}>
                                {submittingTask === task.id ? "VERIFYING…" : "VERIFY"}
                              </button>}
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] font-sans font-normal tabular-nums leading-none text-[var(--theme-primary)]">{fmtRange(task)}</span>
                            {taskApproved && <span className="text-[9px] font-sans font-black tracking-[0.08em] text-[var(--theme-primary)]">CLAIMED</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`flex-1 min-w-0 ${taskApproved || locked ? "opacity-50 saturate-50" : ""}`}><CellsProgress pct={p} /></div>
                            <span className="w-9 text-right shrink-0 text-[10px] font-sans font-normal tabular-nums leading-none text-[var(--theme-primary)]">{Math.round(p)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
      <AnimatePresence>
        {coins && <div className="absolute inset-0 z-30 pointer-events-none overflow-visible" aria-hidden="true">
          {coins.map((coin) => <motion.img key={coin.id} src={dollar3d} alt="" initial={{ x: 0, y: 0, scale: 0.7, opacity: 1 }} animate={{ x: coin.dx, y: coin.dy, scale: 0.25, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, delay: coin.delay, ease: "easeOut" }} className="absolute w-9 h-9 object-contain" style={{ left: coin.startX - 18, top: coin.startY - 18 }} />)}
        </div>}
      </AnimatePresence>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 scrollbar-none min-h-0">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 flex-1 font-display font-black text-[26px] leading-none tracking-tight text-[var(--theme-text)] sm:text-[30px]">YOUR <span className="text-[var(--theme-primary)]">JOURNEY</span></h1>
          <div ref={balanceRef} className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[7px] font-sans font-normal tracking-[0.08em] text-[var(--theme-text)] opacity-65">WITHDRAWABLE BALANCE</p>
            <p className="mt-0.5 font-display font-black text-[16px] leading-none text-[var(--theme-primary)]">{formatCurrency(Number(userProfile?.points || 0))}</p>
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
          <div className="relative mt-5">
            <div className="flex flex-col gap-3">
              {stages.map((stage, i) => {
                const isCurrent = i === currentIdx;
                const claiming = bulkStage === stage.name;
                const barPct = calcVipProgress(stage.done, Math.max(1, stage.total));
                const muted = stage.locked && !isCurrent;
                // Rail segment to the next node: teal along the travelled path and
                // into the current stage so the next target always glows; grey
                // beyond. Teal draws itself downward on mount.
                const reached = currentIdx === -1 || i < currentIdx || (currentIdx === 0 && i === 0);
                return (
                  <div key={stage.name} className="relative flex gap-2">
                    {i < stages.length - 1 && (
                      <span
                        aria-hidden
                        className={`absolute left-[11px] top-3 -bottom-5 w-[2px] origin-top transition-transform duration-700 ease-out ${reached ? "bg-[var(--theme-primary)] shadow-[0_0_8px_var(--theme-primary)]" : "bg-white/10"}`}
                        style={reached ? { transform: barsIn ? "scaleY(1)" : "scaleY(0)", transitionDelay: `${i * 160}ms` } : undefined}
                      />
                    )}
                    <span className={`relative z-10 w-6 h-6 rounded-full shrink-0 flex items-center justify-center border ${stage.claimedTier || isCurrent ? "bg-[var(--theme-primary)] border-[var(--theme-primary)]" : "bg-[var(--theme-card-bg)] border-white/15"}`}>
                      {stage.claimedTier || (isCurrent && stage.done === stage.total && stage.total > 0)
                        ? <Check className="w-3 h-3 text-black" strokeWidth={3} />
                        : isCurrent
                          ? <span className="text-[11px] font-sans font-black text-black">{i + 1}</span>
                          : <Lock className="w-3 h-3 text-[var(--theme-text)] opacity-50" />}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedStage(stage.name)}
                      className={`flex-1 min-w-0 text-left rounded-2xl border p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-[transform] duration-[160ms] ease-out bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] ${isCurrent ? "border-[var(--theme-primary)]/70 shadow-[0_0_24px_rgba(0,0,0,0.18)]" : "border-white/10"} ${muted ? "opacity-70" : ""}`}
                    >
                      {stage.art ? (
                        <img src={optimizedImageUrl(stage.art, 200)} alt="" loading="lazy" decoding="async" className="w-14 h-[72px] rounded-xl object-cover shrink-0 bg-black/20" />
                      ) : (
                        <span className="w-14 h-[72px] rounded-xl shrink-0 bg-black/20 border border-white/10 flex items-center justify-center"><AchievementGlyph metric={stage.tasks[0]?.metric} socialType={stage.tasks[0]?.socialType} /></span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-display font-black text-[17px] tracking-tight text-[var(--theme-text)]">{stage.name.toUpperCase()}</span>
                          <ChevronRight className="w-4 h-4 text-[var(--theme-text)] opacity-40 shrink-0" />
                        </span>
                        {stage.description && <span className="block text-[12px] font-sans text-[var(--theme-text)] opacity-60 mt-0.5 truncate">{stage.description}</span>}
                        <span className={`mt-2 block ${stage.claimedTier || muted ? "opacity-50 saturate-50" : ""}`}>
                          <CellsProgress pct={barPct} />
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-sans font-bold tracking-[0.12em] text-[var(--theme-text)] opacity-60">{stage.done}/{stage.total} COMPLETE</span>
                          {stage.claimable && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); void handleClaimStage(stage, e); }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); void handleClaimStage(stage); } }}
                              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[11px] font-sans font-black cursor-pointer active:scale-95"
                            >
                              {claiming ? "CLAIMING…" : <>CLAIM REWARD <ChevronRight className="w-3.5 h-3.5" strokeWidth={3} /></>}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Promo banner */}
        <div className="mt-5 rounded-[24px] overflow-hidden border border-white/10 relative">
          <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0.45) 60%, var(--theme-primary) 160%)" }} />
          <div className="relative p-5 flex items-end justify-between gap-3 min-h-[130px]">
            <p className="font-display font-black italic text-[24px] leading-[1.02] text-[var(--theme-primary)]">More<br />Levels.<br />Bigger<br />Rewards.</p>
            <p className="text-right text-[10px] font-sans font-bold tracking-[0.2em] text-white/75 leading-relaxed">STAY ACTIVE.<br />KEEP GROWING.<br />UNLOCK MORE.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
