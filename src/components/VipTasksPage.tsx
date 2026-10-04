import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowLeft, Check, Lock, ChevronRight, Trophy, User, Users, Play, CalendarDays, Banknote, Coins, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { calcVipProgress, normalizeVipTaskboard, metricMeta, tierRewardFor, tierMetaFor, isTaskMet } from "@/src/utils/vip";
import CellsProgress from "./CellsProgress";
import { fetchJsonWithSignal } from "@/src/utils/abortableFetch";
import { useAbortSignal } from "@/src/hooks/useGatedInterval";
import { optimizedImageUrl } from "@/src/utils/imageUtils";
import type { VipTask, VipTaskboard } from "@/src/types";
import medal3d from "@/src/assets/3d/3dicons-medal-iso-premium.png";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";

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

function AchievementGlyph({ metric }: { metric?: string }) {
  const m = String(metric || "operator_points");
  const Icon =
    m === "streak_days" ? CalendarDays
    : m === "runs_started" ? Play
    : m === "active_runs" ? Zap
    : m === "completed_runs" ? Trophy
    : m === "invites_count" ? Users
    : m === "account_created" ? User
    : m === "lifetime_yield" ? Banknote
    : m === "milestones_claimed" ? Sparkles
    : Coins;
  return <Icon className="w-6 h-6 text-[var(--theme-text)] opacity-80" />;
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
  const [board, setBoard] = useState<VipTaskboard>({
    tasks: [], vipLevel: 0, stageOrder: [], tierRewards: {}, tierMeta: {}, claimedTierRewards: [],
    referralRates: { level1: 15, level2: 5, level3: 0, level4: 0 },
    progress: { level1Bonus: 0, level2Bonus: 0, level3Bonus: 0, level4Bonus: 0, accumulatedBonus: 0, totalReferralBonus: 0, operatorPoints: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [bulkStage, setBulkStage] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(focusStage || null);
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

  // CLAIM LEVEL REWARD: the single one-time payout for the whole stage.
  const handleClaimStage = async(stage: StageGroup)=>{
    if (bulkStage) return;
    if (!stage.claimable) {
      toast.info(`Complete ${stage.done}/${stage.total} tasks to unlock the stage reward.`);
      return;
    }
    setBulkStage(stage.name); const s=renew();
    try{
      const data=await fetchJsonWithSignal<{bonus:number; claimedTierRewards?:string[]}>(`/api/profile/vip-tasks/claim`, s, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({phone, category: stage.name})});
      const bonus=Number(data.bonus||0);
      toast.success(`Stage reward claimed: ${formatCurrency(bonus)} added to withdrawable balance`);
      if(userProfile&&onClaimSuccess) onClaimSuccess({...userProfile, points:Number(userProfile.points||0)+bonus, claimedTierRewards: data.claimedTierRewards || [...(userProfile.claimedTierRewards||[]), stage.name]});
      vipCache=null; await load(true);
    } catch(e:any){ if(e?.name!=="AbortError") toast.error(e.message||"Claim failed"); }
    finally{ setBulkStage(null); }
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
      <div className="w-full flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto overscroll-contain pb-8 scrollbar-none min-h-0">
          {/* Hero — frosted continuation, borderless so it blends into the page
              and adapts to any system-wide background image */}
          <div className="relative overflow-hidden border-0">
            {detail.art && (
              <img src={optimizedImageUrl(detail.art, 900)} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" />
            )}
            <div className="absolute inset-0 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] pointer-events-none" />
            <div className="relative px-4 pb-4 pt-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setSelectedStage(null)} aria-label="Back to journey" className="w-9 h-9 rounded-full border border-white/10 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] flex items-center justify-center text-[var(--theme-text)] cursor-pointer active:scale-95 transition-transform"><ArrowLeft className="w-4 h-4" /></button>
                <p className="text-[11px] font-sans font-bold tracking-[0.22em] text-[var(--theme-text)] opacity-60">STAGE {idx + 1} OF {stages.length}</p>
              </div>
              <div className="mt-2">
                <h1 className="font-display font-black text-[32px] leading-none tracking-tight text-[var(--theme-text)] mt-1">{detail.name.toUpperCase()}</h1>
                {detail.description ? (
                  <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 leading-snug mt-2 max-w-[300px]">{detail.description}</p>
                ) : (
                  <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-snug mt-2 max-w-[300px]">Complete these achievements{next ? ` to unlock ${next}.` : "."}</p>
                )}
              </div>
              {/* Stage reward — lives in the hero now: trophy + amount pill */}
              {(detail.tierReward > 0 || detail.claimedTier) && (
                <div className="mt-3">
                  {detail.claimedTier ? (
                    <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--theme-primary)]/15 border border-[var(--theme-primary)]/30 text-[var(--theme-primary)] text-[12px] font-sans font-black">
                      <img src={dollar3d} alt="" loading="lazy" decoding="async" className="w-5 h-5 object-contain" /> UGX {detail.tierReward.toLocaleString()} CLAIMED
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleClaimStage(detail)}
                      disabled={claiming}
                      aria-label={detail.claimable ? `Claim stage reward of UGX ${detail.tierReward.toLocaleString()}` : "Stage reward locked"}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-sans font-black transition-transform active:scale-[0.97] cursor-pointer ${detail.claimable ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-[0_3px_0_0_var(--theme-primary-shadow)]" : "bg-[var(--theme-card-bg)]/60 border border-white/10 text-[var(--theme-text)] opacity-70"}`}
                    >
                      <img src={dollar3d} alt="" loading="lazy" decoding="async" className="w-5 h-5 object-contain" />
                      {claiming ? "CLAIMING…" : `UGX ${detail.tierReward.toLocaleString()}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 mt-3">
            <h2 className="mb-2 text-[12px] font-sans font-black tracking-[0.22em] text-[var(--theme-text)] opacity-70">{detail.name} task list.</h2>
            <div className="flex flex-col gap-2.5">
              {visibleTasks.map((task) => {
                const met = isTaskMet(task);
                const p = calcVipProgress(task.progress, task.requiredBonus);
                const locked = task.stageLocked && !met && !detail.claimedTier;
                return (
                  <div key={task.id} className="rounded-2xl border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] p-3.5 flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {task.imageUrl ? (
                        <img src={optimizedImageUrl(task.imageUrl, 200)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <AchievementGlyph metric={task.metric} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="text-[14px] font-sans font-bold leading-tight text-[var(--theme-text)] truncate min-w-0 flex-1">{task.title}</h4>
                        {locked && <Lock className="w-3.5 h-3.5 text-[var(--theme-text)] opacity-40 shrink-0" />}
                        {(detail.claimedTier || met) && (
                          <span className="w-5 h-5 rounded-full bg-[var(--theme-primary)] flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-black" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      {task.description && <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-55 leading-snug mt-0.5">{task.description}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <div className={`flex-1 min-w-0 ${locked ? "opacity-50 saturate-50" : ""}`}>
                          <CellsProgress pct={p} />
                        </div>
                        <span className="shrink-0 text-[11px] font-sans font-bold tabular-nums leading-none text-[var(--theme-primary)]">
                          {detail.claimedTier ? "COMPLETED" : met ? "DONE" : fmtRange(task)}
                        </span>
                      </div>
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
    <div className="w-full flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 scrollbar-none min-h-0">
        <h1 className="font-display font-black text-[30px] leading-none tracking-tight text-[var(--theme-text)]">YOUR <span className="text-[var(--theme-primary)]">JOURNEY</span></h1>
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
                        <img src={optimizedImageUrl(stage.art, 200)} alt="" loading="lazy" decoding="async" className="w-14 h-[72px] rounded-xl object-contain shrink-0 bg-black/20" />
                      ) : (
                        <span className="w-14 h-[72px] rounded-xl shrink-0 bg-black/20 border border-white/10" aria-hidden />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-display font-black text-[17px] tracking-tight text-[var(--theme-text)]">{stage.name.toUpperCase()}</span>
                          <ChevronRight className="w-4 h-4 text-[var(--theme-text)] opacity-40 shrink-0" />
                        </span>
                        {stage.description && <span className="block text-[12px] font-sans text-[var(--theme-text)] opacity-60 mt-0.5 truncate">{stage.description}</span>}
                        <span className={`mt-2 block ${muted ? "opacity-50 saturate-50" : ""}`}>
                          <CellsProgress pct={barPct} />
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-sans font-bold tracking-[0.12em] text-[var(--theme-text)] opacity-60">{stage.done}/{stage.total} COMPLETE</span>
                          {stage.claimable && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); void handleClaimStage(stage); }}
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
