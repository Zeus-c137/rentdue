import React, { useEffect, useState, useCallback } from "react";
import { X, CheckCircle2, Lock, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { calcVipProgress, getNextVipRequirement, normalizeVipTaskboard } from "@/src/utils/vip";
import { fetchJsonWithSignal } from "@/src/utils/abortableFetch";
import { useAbortSignal } from "@/src/hooks/useGatedInterval";
import type { VipTask, VipTaskboard } from "@/src/types";
import trophy3d from "@/src/assets/3d/3dicons-trophy-iso-premium.png";
import medal3d from "@/src/assets/3d/3dicons-medal-iso-premium.png";
import { Button } from "@/src/components/ui/button";

let vipCache: { phone: string; board: VipTaskboard; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

interface Props { phone: string; siteConfig?: any; userProfile?: any; onClaimSuccess?: (p: any) => void; onBack?: () => void; }

export default function VipTasksPage({ phone, userProfile, onClaimSuccess, onBack }: Props) {
  const { formatCurrency } = useCurrency();
  const [board, setBoard] = useState<VipTaskboard>({
    tasks: [], vipLevel: 0, referralRates: { level1: 15, level2: 5, level3: 0, level4: 0 },
    progress: { level1Bonus: 0, level2Bonus: 0, level3Bonus: 0, level4Bonus: 0, accumulatedBonus: 0, totalReferralBonus: 0, operatorPoints: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const { renew, abort } = useAbortSignal();

  const load = useCallback(async (force=false) => {
    if (!force && vipCache && vipCache.phone===phone && Date.now()-vipCache.at < CACHE_TTL) { setBoard(vipCache.board); return; }
    if (typeof document !== "undefined" && document.hidden) return;
    setLoading(true);
    const s=renew();
    try { const data=await fetchJsonWithSignal<VipTaskboard>(`/api/profile/vip-tasks/${encodeURIComponent(phone)}`, s); const n=normalizeVipTaskboard(data); setBoard(n); vipCache={phone, board:n, at:Date.now()}; }
    catch(e:any){ if(s.aborted||e?.name==="AbortError") return; toast.error(e.message||"Milestones unavailable"); }
    finally{ setLoading(false); }
  }, [phone]);

  useEffect(()=>{ void load(); const onVis=()=>{ if(!document.hidden) void load(); }; document.addEventListener("visibilitychange", onVis); return()=>{ document.removeEventListener("visibilitychange", onVis); abort(); }; }, [load]);

  const { operatorPoints } = board.progress;
  const nextReq = getNextVipRequirement(board.tasks, operatorPoints);
  const overall = calcVipProgress(operatorPoints, nextReq);
  const toGo = Math.max(0, nextReq - operatorPoints);
  const nextTask = board.tasks.find((t) => !t.unlocked && !t.claimed);

  const handleClaim = async(task:VipTask)=>{
    setClaimingId(task.id); const s=renew();
    try{
      const data=await fetchJsonWithSignal<{bonus:number; claimedVipTasks?:string[]}>(`/api/profile/vip-tasks/claim`, s, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({phone, taskId: task.id})});
      const bonus=Number(data.bonus||0); toast.success(`${formatCurrency(bonus)} available in withdrawable balance`);
      if(userProfile&&onClaimSuccess) onClaimSuccess({...userProfile, points:Number(userProfile.points||0)+bonus, claimedVipTasks: data.claimedVipTasks || [...(userProfile.claimedVipTasks||[]), task.id]});
      vipCache=null; await load(true);
    } catch(e:any){ if(e?.name!=="AbortError") toast.error(e.message||"Claim failed"); }
    finally{ setClaimingId(null); }
  };

  const isInitial = loading && board.tasks.length===0;
  const heroTrophy = board.vipLevel>=3 ? trophy3d : board.vipLevel>=1 ? medal3d : trophy3d;
  const trophyBg = (i:number, total:number) => {
    if(i===total-1) return "bg-transparent border-white/10";
    const presets=["bg-[var(--theme-primary)]/12 border-[var(--theme-primary)]/15","bg-amber-500/10 border-amber-500/15","bg-emerald-500/10 border-emerald-500/15","bg-sky-500/10 border-sky-500/15"];
    return presets[i%presets.length];
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border-0 rounded-none p-0">
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-8 scrollbar-none min-h-0 space-y-3">
        {isInitial ? (
          <div className="space-y-3 animate-pulse">
            <div className="rounded-[24px] bg-white/10 border border-white/10 h-[168px]" />
            <div className="rounded-2xl bg-white/10 border border-white/10 h-[158px]" />
            <div className="rounded-2xl bg-white/10 border border-white/10 h-[158px]" />
            <div className="rounded-2xl bg-white/10 border border-white/10 h-[158px]" />
          </div>
        ) : (
          <>
            {/* Progress hero — mockvip hero adapted to hut12 frost, no header above */} 
            <div className="rounded-[24px] bg-transparent border-0 p-5 relative overflow-hidden">
              {onBack && <button onClick={onBack} className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5"/></button>}
              <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{background:"radial-gradient(600px 200px at 20% 0%, var(--theme-primary), transparent)"}}/>
              <div className="flex gap-4 items-start relative">
                <img src={heroTrophy} alt="" className="w-14 h-14 object-contain shrink-0 drop-shadow-sm mt-1"/>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-[11px] font-sans font-medium opacity-50">Operator points</p>
                  <p className="text-[28px] font-display font-bold leading-none tracking-tight mt-1" style={{fontVariantNumeric:"tabular-nums"}}>{formatCurrency(operatorPoints)}</p>
                  <p className="text-[11px] font-sans opacity-40 mt-1">Lifetime points across yields, referrals, check-ins and gifts.</p>
                </div>
              </div>
              <div className="relative mt-4">
                <div className="flex justify-end">
                  <span className="text-[11px] font-sans font-semibold px-2.5 py-1 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] border border-[var(--theme-primary)]/15">{formatCurrency(toGo)} to {nextTask ? nextTask.category : "next tier"}</span>
                </div>
                <div className="w-full h-3 bg-black/10 rounded-full overflow-hidden mt-2 border border-white/10">
                  <div className="h-full bg-[var(--theme-primary)] rounded-full transition-all" style={{width:`${overall}%`}}/>
                </div>
                <div className="flex justify-end mt-1.5 text-[11px] font-sans">
                  <span className="font-semibold text-[var(--theme-primary)]">{formatCurrency(operatorPoints)}</span>
                  <span className="opacity-50 mx-1">/</span>
                  <span className="opacity-50">{formatCurrency(nextReq)}</span>
                </div>
              </div>
            </div>

            {/* Section head — like mockvip legend */}
            {board.tasks.length>0 && (
              <div className="px-1 pt-1">
                <h2 className="text-[15px] font-display font-bold tracking-tight">Milestone tiers</h2>
                <p className="text-[11px] font-sans opacity-50 mt-1 leading-snug">Each tier has its own points target. Reach it with your operator points to unlock the reward.</p>
                <div className="flex gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-sans opacity-60"><span className="w-2 h-2 rounded-full bg-[var(--theme-primary)]"/>Balance</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-sans opacity-60"><span className="w-2 h-2 rounded-full bg-black/20 border border-white/10"/>Target</span>
                </div>
              </div>
            )}

            {board.tasks.length===0 ? (
              <div className="py-10 text-center rounded-[24px] bg-white/[0.03] border border-white/10">
                <img src={medal3d} alt="" className="w-14 h-14 mx-auto opacity-50"/>
                <p className="text-sm font-sans font-semibold mt-3 opacity-70">No milestones yet</p>
                <p className="text-[11px] font-sans opacity-40 mt-1">Check back soon</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {board.tasks.map((task,i)=>{
                  const p=calcVipProgress(task.progress, task.requiredBonus);
                  const state: "claimed"|"unlocked"|"locked" = task.claimed ? "claimed" : task.unlocked ? "unlocked" : "locked";
                  const isLast=i===board.tasks.length-1;
                  const need=Math.max(0, task.requiredBonus - task.progress);
                  return (
                    <div key={task.id} className={`rounded-[22px] border p-4 flex flex-col gap-3 backdrop-blur-xl ${state==="claimed"?"bg-[var(--theme-bg)]/20 border-white/5 opacity-70": state==="unlocked"?"bg-white/5 border-[var(--theme-primary)]/20": "bg-white/[0.03] border-white/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold px-2.5 py-1 rounded-full border ${trophyBg(i, board.tasks.length)} ${isLast?"bg-transparent":""}`}>
                          <img src={trophy3d} alt="" className="w-3.5 h-3.5 object-contain"/>
                          {task.category}
                        </span>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1 justify-end text-[13px] font-sans font-bold text-[var(--theme-primary)]">+{formatCurrency(task.reward)}</div>
                          <div className="text-[10px] font-sans opacity-40 text-right">reward</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {task.imageUrl && (
                          <img src={task.imageUrl} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-xl object-cover shrink-0 bg-[var(--theme-text)]/5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-display font-semibold leading-tight">{task.title}</h4>
                          {task.description && <p className="text-[12px] font-sans opacity-50 leading-snug mt-1">{task.description}</p>}
                        </div>
                      </div>
                      <div>
                        <div className="w-full h-3 bg-black/10 rounded-full overflow-hidden border border-white/5">
                          <div className={`h-full rounded-full transition-all ${state==="claimed"?"bg-emerald-500":"bg-[var(--theme-primary)]"}`} style={{width:`${p}%`}}/>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[11px] font-sans">
                          <span className="flex items-center gap-1.5 opacity-60"><span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)]"/>Balance <b className="font-semibold text-[var(--theme-primary)]">{formatCurrency(task.progress)}</b></span>
                          <span className="flex items-center gap-1.5 opacity-60"><span className="w-1.5 h-1.5 rounded-full bg-black/20 border border-white/10"/>Target <b className="font-semibold opacity-80">{formatCurrency(task.requiredBonus)}</b></span>
                        </div>
                      </div>
                      {state==="unlocked" ? (
                        <Button size="xs" variant="gold-glossy" onClick={()=>void handleClaim(task)} disabled={claimingId===task.id} className="w-full mt-1">
                          {claimingId===task.id ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>}{claimingId===task.id ? "..." : `Claim ${formatCurrency(task.reward)}`}
                        </Button>
                      ) : state==="claimed" ? (
                        <span className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-emerald-600 text-[13px] font-sans font-bold text-center flex items-center justify-center gap-1.5"><CheckCircle2 className="w-4 h-4"/>Claimed</span>
                      ) : (
                        <span className="w-full py-2.5 rounded-xl bg-transparent border border-dashed border-white/15 text-[13px] font-sans font-semibold text-center opacity-50 flex items-center justify-center gap-1.5"><Lock className="w-3.5 h-3.5"/>{formatCurrency(need)} to go</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
