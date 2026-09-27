import React, { useState, useEffect } from "react";
import { SubscribedNode, SubscriptionItem, UserProfile } from "../types";
import {
  Lock,
  Clock,
  Plus,
  Cpu,
  Loader,
  ShoppingCartIcon,
  Zap,
  Coins,
  SlidersHorizontal
} from "lucide-react";
import MetricCard from "./MetricCard";
import { Button } from "./ui/button";
import { useCurrency } from "../currency";
import { getRunElapsedDays, getRunTotalDays, getRunDailyRate, getRunState } from "../utils/runs";
import confetti from "canvas-confetti";
import { toast } from "sonner";

interface IncomeViewProps {
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onNavigateToCatalog: () => void;
  onRenew?: (item: SubscriptionItem) => void;
  onClaimSuccess?: (pointsEarned: number, newBalance: number, subId: string) => void;
}

export default function IncomeView({
  profile,
  activeNodes,
  items,
  onNavigateToCatalog,
  onRenew,
  onClaimSuccess
}: IncomeViewProps) {
  const { formatCurrency } = useCurrency();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Re-run bar fill-ins whenever the filter flips.
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shownNodes = showCompleted
    ? activeNodes.filter((n) => getRunState(n, items) !== "active")
    : activeNodes.filter((n) => getRunState(n, items) === "active");

  // Calculate Cumulative total earnings — resolve daily rate from catalog so every product counts
  const rateOf = (node: SubscribedNode) => {
    const mapped = items.find((item) => item.id === node.itemId || item.name === node.itemName);
    return mapped?.dailyYield !== undefined ? mapped.dailyYield : (node.dailyYield || 0);
  };
  const nodeStatus = (node: SubscribedNode): string => String(node.status || "").toLowerCase();
  const totalDailyYield = activeNodes.filter(n => nodeStatus(n) === "active").reduce((acc, node) => acc + rateOf(node), 0);

  const handleClaim = async (subId: string) => {
    setClaimingId(subId);
    try {
      const res = await fetch("/api/subscriptions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subId, phone: profile.phone })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to claim node earnings.");
      }

      // Trigger Confetti!
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Claimed UGX ${data.pointsClaimed.toLocaleString()} Shs income from ${data.itemName}!`);

      if (onClaimSuccess) {
        onClaimSuccess(data.pointsClaimed, data.updatedPoints, subId);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to claim earnings.");
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="space-y-5 select-none bg-transparent text-[var(--theme-text)] p-1 rounded-[var(--theme-radius)] relative">
      
      <h1 className="font-display font-black text-[26px] leading-none tracking-tight text-[var(--theme-text)] px-1">My Active Runs</h1>
      <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 leading-snug max-w-[320px] px-1">Your runs are working. Watch your returns grow daily and move to your withdrawable balance.</p>

      {/* Aggregate Stats — sticky so run list scrolls below */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2">
        <div className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] p-4 grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-sans text-[var(--theme-text)] opacity-55">Today&apos;s Returns</p>
            <p className="font-display font-black text-[18px] text-[var(--theme-primary)] tracking-tight truncate mt-0.5">{formatCurrency(totalDailyYield)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-sans text-[var(--theme-text)] opacity-55">Withdrawable</p>
            <p className="font-display font-black text-[18px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{formatCurrency(Number(profile.points) || 0)}</p>
          </div>
        </div>
      </div>

      {/* Active runs list section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2">
          <h3 className="font-display font-black text-[15px] text-[var(--theme-text)]">
            {showCompleted ? "Completed Runs" : "Active Runs"} <span className="text-[var(--theme-text-muted)] font-bold">{shownNodes.length}</span>
          </h3>
          <button
            type="button"
            onClick={() => { setShowCompleted((v) => !v); setBarsIn(false); requestAnimationFrame(() => requestAnimationFrame(() => setBarsIn(true))); }}
            aria-label={showCompleted ? "Show active runs" : "Show completed runs"}
            className={`p-2 rounded-full cursor-pointer active:scale-95 transition-all text-[var(--theme-primary)] ${showCompleted ? "bg-[var(--theme-primary)]/15" : ""}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {shownNodes.length === 0 ? (
          <div className="text-center py-12 px-4 max-w-xl mx-auto space-y-4">
            <Clock className="w-10 h-10 text-[var(--theme-text)] opacity-40 mx-auto animate-pulse" />
            <div className="space-y-1">
              <h4 className="font-bold text-[var(--theme-text)] opacity-60 text-xs uppercase font-sans">{showCompleted ? "No Completed Runs" : "No Active Runs"}</h4>
            </div>
            {!showCompleted && (
              <button
                type="button"
                onClick={onNavigateToCatalog}
                className="mx-auto inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-black cursor-pointer active:scale-[0.97] transition-all"
              >
                <Plus className="w-4 h-4" />
                Explore Runs
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {shownNodes.map((node) => {
              // Find the mapped item from catalog
              const mappedItem = items.find(
                (item) => item.id === node.itemId || item.name === node.itemName
              );
              const imageUrl = mappedItem?.imageUrl;
              const itemName = mappedItem?.name || node.itemName;
              const totalDays = getRunTotalDays(node, items);
              const dailyYield = getRunDailyRate(node, items);

              const elapsedDays = getRunElapsedDays(node, items);
              const runState = getRunState(node, items);
              const isExpired = runState === "expired";
              const isReadyToClaim = nodeStatus(node) === "active" && elapsedDays >= totalDays;
              const totalIncome = dailyYield * totalDays;
              const progressPercent = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

              return (
                <div
                  key={node.id}
                  className="group flex flex-row bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-3 overflow-hidden relative shadow-sm hover:border-[var(--theme-primary)]/30"
                >
                  {/* Left portion: Hardware Image full height — transparent bg like income, contain */}
                  <div onClick={() => imageUrl && setPreviewImage(imageUrl)} className="w-28 h-28 sm:w-32 sm:h-32 md:w-44 md:h-44 relative overflow-hidden rounded-[var(--theme-radius)] bg-transparent border-0 shrink-0 cursor-zoom-in group-hover:border-[var(--theme-primary)]/30 transition-colors p-2 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-transparent text-[var(--theme-text)] opacity-40">
                        <Cpu className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  {/* Right portion details */}
                  <div className="flex-1 pl-3 flex flex-col justify-between min-w-0 font-sans">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        {/* Name in theme text */}
                        <h4 className="font-display font-black text-[var(--theme-text)] text-sm leading-tight pb-1 min-w-0 flex-1">
                          {itemName}
                        </h4>
                        {runState !== "active" && (
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black bg-[var(--theme-text)]/10 text-[var(--theme-text)] opacity-60">
                            {isExpired ? "Expired" : "Completed"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-3 mt-2">
                        <div className="space-y-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Daily Return</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{formatCurrency(dailyYield)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Earned (to date)</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-primary)] tracking-tight truncate mt-0.5">{formatCurrency(node.totalEarned || (dailyYield * elapsedDays))}</p>
                          </div>
                        </div>
                        <div className="min-w-0 text-right shrink-0">
                          <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Cycle</p>
                          <p className="font-display font-black text-[13px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{elapsedDays}/{totalDays} days</p>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar with percentage at the end */}
                    <div className="pt-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 bg-[var(--theme-text)]/10 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full run-progress-fill transition-all duration-500 ${
                              isExpired ? "opacity-30 saturate-50" : ""
                            }`}
                            style={{ width: barsIn ? `${progressPercent}%` : "0%" }}
                          />
                        </div>
                        <span className="text-[11px] font-sans font-bold text-[var(--theme-text)] opacity-70 tabular-nums shrink-0">
                          {isExpired ? "Completed" : `${Math.round(progressPercent)}%`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expired banner overlay for completed/expired nodes */}
                  {isExpired && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
                      <span className="text-2xl md:text-3xl font-sans font-black tracking-wide text-white drop-shadow-md select-none">
                        EXPIRED
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {previewImage && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] rounded-[var(--theme-radius)] shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
