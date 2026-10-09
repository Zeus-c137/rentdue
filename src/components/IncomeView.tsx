import React, { useCallback, useEffect, useRef, useState } from "react";
import { SubscribedNode, SubscriptionItem, UserProfile, Collectible } from "../types";
import {
  Lock,
  Clock,
  Plus,
  Cpu,
  Loader,
  ShoppingCartIcon,
  Zap,
  SlidersHorizontal,
  Calendar,
  ChevronRight,
  Loader2,
  Award,
  Rows3,
  LayoutGrid,
} from "lucide-react";
import MetricCard from "./MetricCard";
import CellsProgress from "./CellsProgress";
import { Button } from "./ui/button";
import { useCurrency } from "../currency";
import { getRunElapsedDays, getRunTotalDays, getRunDailyRate, getRunState } from "../utils/runs";
import { rarityMapForCatalog } from "../utils/rarity";
import RarityBadge from "./RarityBadge";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";
import { useReducedMotion } from "../hooks/useReducedMotion";

const RUNS_LAYOUT_KEY = "rentdue_runs_layout";

interface IncomeViewProps {
  profile: UserProfile;
  activeNodes: SubscribedNode[];
  items: SubscriptionItem[];
  onNavigateToCatalog: () => void;
  onNavigateToIncomeHistory: () => void;
  onNavigateToCollection?: () => void;
  onRenew?: (item: SubscriptionItem) => void;
  onClaimSuccess?: (pointsEarned: number, newBalance: number, subId: string) => void;
  onCollectibleClaimed?: () => void;
}

export default function IncomeView({
  profile,
  activeNodes,
  items,
  onNavigateToCatalog,
  onNavigateToIncomeHistory,
  onNavigateToCollection,
  onRenew,
  onClaimSuccess,
  onCollectibleClaimed
}: IncomeViewProps) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingCollectibleId, setClaimingCollectibleId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [collectibles, setCollectibles] = useState<Record<string, Collectible>>({});
  const [activeCategory, setActiveCategory] = useState("All");
  const [layout, setLayout] = useState<"horizontal" | "vertical">(() => {
    try {
      const stored = localStorage.getItem(RUNS_LAYOUT_KEY);
      return stored === "horizontal" || stored === "vertical" ? stored : "vertical";
    } catch {
      return "vertical";
    }
  });
  const [horizontalActiveIndex, setHorizontalActiveIndex] = useState(0);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const horizontalRafRef = useRef<number>(0);
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const categoryTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const shownNodes = React.useMemo(
    () => showCompleted
      ? activeNodes.filter((n) => getRunState(n, items) !== "active")
      : activeNodes.filter((n) => getRunState(n, items) === "active"),
    [activeNodes, items, showCompleted]
  );

  const rarityMap = React.useMemo(() => rarityMapForCatalog(items), [items]);
  const runEntries = React.useMemo(
    () => shownNodes.map((node) => {
      const mappedItem = items.find((item) => item.id === node.itemId || item.name === node.itemName);
      return { node, mappedItem, category: mappedItem?.category || "Runs" };
    }),
    [items, shownNodes]
  );
  const categoryList = React.useMemo(
    () => ["All", ...Array.from(new Set(runEntries.map((entry) => entry.category)))],
    [runEntries]
  );
  const filteredRuns = React.useMemo(
    () => runEntries.filter((entry) => activeCategory === "All" || entry.category === activeCategory),
    [activeCategory, runEntries]
  );
  const safeHorizontalActiveIndex = Math.max(0, Math.min(horizontalActiveIndex, Math.max(filteredRuns.length - 1, 0)));
  const horizontalActiveRun = filteredRuns[safeHorizontalActiveIndex] || filteredRuns[0] || null;
  const visibleCategory = layout === "horizontal" && activeCategory === "All"
    ? (horizontalActiveRun?.category || "All")
    : activeCategory;

  const setLayoutAndPersist = (next: "horizontal" | "vertical") => {
    setLayout(next);
    setHorizontalActiveIndex(0);
    try {
      localStorage.setItem(RUNS_LAYOUT_KEY, next);
    } catch {
      // persistence is best-effort
    }
  };

  const updateHorizontalActive = useCallback(() => {
    cancelAnimationFrame(horizontalRafRef.current);
    horizontalRafRef.current = requestAnimationFrame(() => {
      const scroller = horizontalScrollRef.current;
      if (!scroller || scroller.children.length === 0) return;
      const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      Array.from(scroller.children).forEach((child, index) => {
        const card = child as HTMLElement;
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewportCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setHorizontalActiveIndex(nearestIndex);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(horizontalRafRef.current), []);

  const filteredRunsKey = filteredRuns.map(({ node }) => node.id).join("|");
  useEffect(() => {
    setHorizontalActiveIndex(0);
    if (layout === "horizontal") horizontalScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [activeCategory, filteredRunsKey, layout, showCompleted]);

  useEffect(() => {
    if (layout !== "horizontal") return;
    const scroller = categoryTabsRef.current;
    const tab = categoryTabRefs.current[categoryList.indexOf(visibleCategory)];
    if (!scroller || !tab) return;
    const containerRect = scroller.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const left = scroller.scrollLeft + tabRect.left - containerRect.left - (scroller.clientWidth - tabRect.width) / 2;
    scroller.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [categoryList, layout, prefersReducedMotion, visibleCategory]);

  const loadCollectibles = useCallback(async () => {
    try {
      const res = await fetch(`/api/collectibles/${profile.phone}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) return;
      const map: Record<string, Collectible> = {};
      for (const c of data as Collectible[]) map[c.subscriptionId] = c;
      setCollectibles(map);
    } catch {
      // gallery still works without the claimed flags
    }
  }, [profile.phone]);

  useEffect(() => {
    void loadCollectibles();
  }, [loadCollectibles, activeNodes.length]);

  const nodeStatus = (node: SubscribedNode): string => String(node.status || "").toLowerCase();
  const activeCount = activeNodes.filter((n) => getRunState(n, items) === "active").length;
  const activeTotalCollected = activeNodes.filter((n) => getRunState(n, items) === "active").reduce((acc, n) => acc + (Number(n.totalEarned) || 0), 0);
  const completedNodes = activeNodes.filter((n) => getRunState(n, items) !== "active");
  const completedCount = completedNodes.length;
  const completedTotalCollected = completedNodes.reduce((acc, n) => acc + (Number(n.totalEarned) || 0), 0);

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

  const handleClaimCollectible = async (node: SubscribedNode) => {
    setClaimingCollectibleId(node.id);
    try {
      const res = await fetch("/api/collectibles/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone, subscriptionId: node.id })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not claim this collectible.");
      }
      confetti({
        particleCount: 130,
        spread: 75,
        origin: { y: 0.6 }
      });
      toast.success(`Collectible #${String(data.collectible?.serial || 0).padStart(3, "0")} is now permanently yours!`);
      setCollectibles((prev) => ({ ...prev, [node.id]: data.collectible }));
      onCollectibleClaimed?.();
    } catch (err: any) {
      toast.error(err.message || "Could not claim this collectible.");
    } finally {
      setClaimingCollectibleId(null);
    }
  };

  return (
    <div className="space-y-5 select-none bg-transparent text-[var(--theme-text)] p-1 rounded-[var(--theme-radius)] relative">

      {/* Aggregate Stats — sticky so run list scrolls below */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2">
        {onNavigateToCollection && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onNavigateToCollection}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/40 px-3.5 py-2 text-[12px] font-sans font-black text-[var(--theme-primary)] transition-all active:scale-95"
            >
              <Award className="h-4 w-4" /> My Collections
            </button>
          </div>
        )}
        <div className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] p-4 grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="min-w-0">
            <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-55">{showCompleted ? "Completed Runs" : "Active Runs"}</p>
            <p className="font-display font-black text-[22px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{showCompleted ? completedCount : activeCount}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-55">{showCompleted ? "Total Earnings" : "Collected"}</p>
            <p className="font-display font-black text-[18px] text-[var(--theme-primary)] tracking-tight truncate mt-0.5">{formatCurrency(showCompleted ? completedTotalCollected : activeTotalCollected)}</p>
          </div>
        </div>
      </div>

      {/* Active runs list section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <h3 className="font-display font-black text-[15px] text-[var(--theme-text)]">
            {showCompleted ? "Completed Runs" : "Active Runs"}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCompleted((value) => !value);
                setActiveCategory("All");
                setHorizontalActiveIndex(0);
              }}
              aria-label={showCompleted ? "Show active runs" : "Show completed runs"}
              className={`p-2 rounded-full cursor-pointer active:scale-95 transition-all text-[var(--theme-primary)] ${showCompleted ? "bg-[var(--theme-primary)]/15" : ""}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 rounded-full border border-white/10 p-1">
              <button
                type="button"
                onClick={() => setLayoutAndPersist("horizontal")}
                aria-label="Horizontal cards"
                aria-pressed={layout === "horizontal"}
                className={`p-1.5 rounded-full cursor-pointer active:scale-95 transition-all ${layout === "horizontal" ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "opacity-60"}`}
              >
                <Rows3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLayoutAndPersist("vertical")}
                aria-label="Vertical cards"
                aria-pressed={layout === "vertical"}
                className={`p-1.5 rounded-full cursor-pointer active:scale-95 transition-all ${layout === "vertical" ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "opacity-60"}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {shownNodes.length > 0 && (
          <div className="relative p-1.5 -mx-1 mb-2">
            <div ref={categoryTabsRef} className="overflow-x-auto scrollbar-none">
              <div className="flex gap-2 min-w-max px-1">
                {categoryList.map((category, index) => {
                  const isSelected = visibleCategory === category;
                  return (
                    <button
                      key={category}
                      ref={(element) => { categoryTabRefs.current[index] = element; }}
                      type="button"
                      onClick={() => {
                        setActiveCategory(category);
                        setHorizontalActiveIndex(0);
                      }}
                      aria-pressed={isSelected}
                      className={`py-2.5 px-5 text-[11px] font-sans font-black tracking-wider uppercase transition-all cursor-pointer outline-none select-none rounded-full ${
                        isSelected
                          ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-md"
                          : "border border-white/10 text-[var(--theme-text)] opacity-70 hover:opacity-100"
                      }`}
                    >
                      {category === "All" ? category : category.toLowerCase().endsWith("series") ? category : category.length <= 3 ? `${category} series` : category}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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
        ) : filteredRuns.length === 0 ? (
          <div className="py-10 text-center text-xs font-sans opacity-60">
            <p>No runs in this category.</p>
            <button
              type="button"
              onClick={() => setActiveCategory("All")}
              className="mt-3 font-bold text-[var(--theme-primary)] underline underline-offset-4"
            >
              Show all runs
            </button>
          </div>
        ) : (
          <div
            ref={layout === "horizontal" ? horizontalScrollRef : undefined}
            onScroll={layout === "horizontal" ? updateHorizontalActive : undefined}
            className={layout === "horizontal"
              ? "relative flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scrollbar-none -mx-1 px-[7%] pb-3 pt-1 touch-pan-x"
              : "grid grid-cols-1 sm:grid-cols-2 gap-3.5"}
            style={layout === "horizontal" ? { WebkitOverflowScrolling: "touch" } : undefined}
          >
            {filteredRuns.map(({ node, mappedItem }) => {
              const imageUrl = mappedItem?.imageUrl || node.image;
              const itemName = mappedItem?.name || node.itemName;
              const totalDays = getRunTotalDays(node, items);
              const dailyYield = getRunDailyRate(node, items);

              const elapsedDays = getRunElapsedDays(node, items);
              const runState = getRunState(node, items);
              const isExpired = runState === "expired";
              const isDone = runState !== "active";
              const isReadyToClaim = nodeStatus(node) === "active" && elapsedDays >= totalDays;
              const progressPercent = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
              const collectible = collectibles[node.id];
              const rarity = collectible?.rarity || (mappedItem ? rarityMap[mappedItem.id] : undefined) || "common";

              return (
                <div
                  key={node.id}
                  className={layout === "horizontal"
                    ? "group relative shrink-0 w-[86%] max-w-[390px] snap-center bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 overflow-hidden shadow-sm"
                    : "group bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 overflow-hidden relative shadow-sm hover:border-[var(--theme-primary)]/30 transition-colors"}
                >
                  <div className="flex flex-col gap-4">
                    {/* Art with rarity banner */}
                    <div
                      onClick={() => imageUrl && setPreviewImage(imageUrl)}
                      className="relative aspect-[16/10] overflow-hidden rounded-2xl cursor-zoom-in bg-[var(--theme-text)]/5"
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-transparent text-[var(--theme-text)] opacity-40">
                          <Cpu className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 scale-90 origin-top-left">
                        <RarityBadge rarity={rarity} serial={collectible?.serial} />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 font-sans">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="min-w-0 flex-1 font-sans font-bold text-[var(--theme-text)] text-[18px] sm:text-[20px] leading-tight line-clamp-2">
                          {itemName}
                        </h4>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--theme-primary)]">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="tabular-nums">{totalDays} days</span>
                          </span>
                          {isDone && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] bg-[var(--theme-text)]/5 text-[var(--theme-text)] opacity-60">
                              {isExpired ? "Expired" : "Completed"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-5 space-y-3">
                        <div className="flex items-baseline justify-between gap-2 text-[13px] text-[var(--theme-text)]">
                          <span className="text-[11px] font-medium opacity-65">Daily return</span>
                          <span className="font-semibold tabular-nums text-right">{formatCurrency(dailyYield)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-[13px] text-[var(--theme-text)]">
                          <span className="text-[11px] font-medium opacity-65">Total return</span>
                          <span className="font-semibold tabular-nums text-right">{formatCurrency(dailyYield * totalDays)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-sans text-[var(--theme-text)] opacity-60">
                        Day {Math.min(elapsedDays, totalDays)} of {totalDays}
                      </span>
                      <span className="font-sans font-semibold text-[12px] tabular-nums shrink-0 text-[var(--theme-text)]">
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                    <div className="mt-1">
                      <CellsProgress pct={progressPercent} />
                    </div>
                  </div>

                  {/* Earnings split */}
                  <div className="mt-3 flex items-baseline justify-between gap-3 text-[var(--theme-primary)]">
                    <p className="text-[12px] font-semibold tracking-tight">Collected</p>
                    <button
                      type="button"
                      onClick={onNavigateToIncomeHistory}
                      aria-label={`View product income history. Collected ${formatCurrency(Number(node.totalEarned) || 0)}`}
                      title="View product income history"
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-[var(--theme-primary)]/10 px-2.5 py-1 font-sans text-[12px] font-bold tracking-tight tabular-nums transition-colors hover:bg-[var(--theme-primary)]/20 active:scale-95"
                    >
                      <img src={dollar3d} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />
                      {formatCurrency(Number(node.totalEarned) || 0)}
                    </button>
                  </div>

                  {/* Finished-run ownership actions */}
                  {isDone && (
                    <div className="mt-2.5">
                      {!collectible || !collectible.claimedAt ? (
                        <button
                          type="button"
                          disabled={claimingCollectibleId === node.id}
                          onClick={() => handleClaimCollectible(node)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-black cursor-pointer active:scale-[0.98] transition-all disabled:opacity-60"
                        >
                          {claimingCollectibleId === node.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                          Claim collectible
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onNavigateToCollection}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full border border-[var(--theme-primary)]/50 text-[var(--theme-primary)] text-[13px] font-sans font-black cursor-pointer active:scale-[0.98] transition-all"
                        >
                          <Award className="w-4 h-4" /> In your Collection ✓
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-[20px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-3.5 flex items-start gap-2.5">
        <Calendar className="w-4 h-4 text-[var(--theme-primary)] shrink-0 mt-0.5" />
        <p className="text-[12px] font-sans opacity-70 leading-relaxed">
          Earnings are credited to your withdrawable balance daily, once your run is active. Finished runs become collectibles. Claim them to own them permanently.
        </p>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] rounded-[var(--theme-radius)] shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
