/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { SubscriptionItem, UserProfile } from "../types";
import {
  AlertTriangle,
  Sparkles,
  Info,
  ShieldAlert,
  Coins,
  Lock,
  DollarSign,
  ShoppingCart,
  Loader2,
  Wallet,
  ArrowRight,
  Plus,
  Check,
  Percent,
  LayoutGrid,
  Rows3,
  Calendar
} from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "../currency";
import { toast } from "sonner";
import { useReducedMotion } from "../hooks/useReducedMotion";
import RarityBadge from "./RarityBadge";
import { rarityMapForCatalog } from "../utils/rarity";

interface CatalogViewProps {
  items: SubscriptionItem[];
  userProfile: UserProfile;
  siteConfig?: any;
  activeSubscriptions?: any[];
  onSubscribeSuccess: (newSub: any, CostAmount: number) => void;
  onRentWithMmoney: (item: SubscriptionItem) => void;
  onActivationContinue: () => void;
  onNavigateToDeposit: () => void;
}

type CategoryType = "All" | "DS" | "D" | "G" | "E" | "F";

const LAYOUT_KEY = "rentdue_catalog_layout";

function dailyPct(item: SubscriptionItem): string {
  const amt = Number(item.amount || 0);
  if (!(amt > 0)) return "-";
  const pct = (Number(item.dailyYield || 0) / amt) * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}% Daily`;
}

export default function CatalogView({
  items,
  userProfile,
  siteConfig,
  activeSubscriptions = [],
  onSubscribeSuccess,
  onRentWithMmoney,
  onActivationContinue,
  onNavigateToDeposit
}: CatalogViewProps) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activated, setActivated] = useState<{ item: SubscriptionItem; dayOne: number } | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<SubscriptionItem | null>(null);
  const [modalPhase, setModalPhase] = useState<"confirm" | "loading" | "success">("confirm");
  // Vertical/horizontal A/B: persisted, toggleable from the list header.
  // Portrait (vertical) is the default; landscape (horizontal) is the other option.
  const [layout, setLayout] = useState<"horizontal" | "vertical">(() => {
    try {
      const stored = localStorage.getItem(LAYOUT_KEY);
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

  const setLayoutAndPersist = (next: "horizontal" | "vertical") => {
    setLayout(next);
    setHorizontalActiveIndex(0);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // persistence is best-effort
    }
  };

  // Resolves true only when the run was actually activated. Callers use the
  // result to drop the modal back out of its loading state — otherwise a
  // pre-flight refusal (sold out, low balance) leaves the button stuck on
  // "Starting..." with no way back.
  const handleSubscribe = async (item: SubscriptionItem): Promise<boolean> => {
    if (item.outOfStock || item.disabled) {
      toast.error("This product is currently out of stock.");
      return false;
    }

    const rechargeBal = userProfile.rechargeBalance || 0;
    if (rechargeBal < item.amount) {
      toast.error(
        `Insufficient recharge balance. Buying ${item.name} requires ${formatCurrency(item.amount)}. Your account recharge balance is ${formatCurrency(rechargeBal)}. Please deposit funds first.`
      );
      return false;
    }

    setSubmittingItemId(item.id);

    try {
      const res = await fetch("/api/items/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: userProfile.phone, itemId: item.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to activate this product subscription.");
      }

      onSubscribeSuccess(data.subscription, item.amount);

      // Deliberate confirmation: the activation modal carries the moment,
      // the user chooses when to continue to Income.
      setActivated({ item, dayOne: Number(data.subscription?.totalEarned) || item.dailyYield || 0 });
      setConfirmingItem(null);
      setModalPhase("success");
      return true;

    } catch (err: any) {
      toast.error(err.message || "Failed to lock asset. Please try again.");
      return false;
    } finally {
      setSubmittingItemId(null);
    }
  };

  const handleStartRun = (item: SubscriptionItem) => {
    if (item.outOfStock || item.disabled) {
      toast.error("This product is currently out of stock.");
      return;
    }
    setConfirmingItem(item);
    setModalPhase("confirm");
  };

  const handleConfirmSubscribe = async () => {
    if (!confirmingItem) return;
    const item = confirmingItem;
    setModalPhase("loading");
    const ok = await handleSubscribe(item);
    // Failure (server error or pre-flight refusal): restore the buttons so
    // the modal is retryable or cancellable instead of frozen mid-spinner.
    if (!ok) setModalPhase("confirm");
  };

  const handleCloseModal = () => {
    if (modalPhase === "loading") return;
    setConfirmingItem(null);
    setActivated(null);
    setModalPhase("confirm");
  };

  // Build dynamic categories list
  const categoryList = React.useMemo(() => {
    const customConfigCats = siteConfig?.categories || [];
    const itemCats = items.map(i => i.category).filter(Boolean);
    const combined = Array.from(new Set([...customConfigCats, ...itemCats]));
    if (items.some((item) => !item.category) && !combined.includes("Runs")) combined.push("Runs");
    return ["All", ...combined];
  }, [siteConfig?.categories, items]);

  const rarityMap = React.useMemo(() => rarityMapForCatalog(items), [items]);

  const filteredItems = items.filter((item) => {
    if (activeCategory === "All") return true;
    return item.category === activeCategory;
  });

  const carouselItems = activeCategory === "All"
    ? categoryList
      .filter((category) => category !== "All")
      .flatMap((category) => filteredItems.filter((item) => (item.category || "Runs") === category))
    : filteredItems;
  const safeHorizontalActiveIndex = Math.max(0, Math.min(horizontalActiveIndex, Math.max(carouselItems.length - 1, 0)));
  const horizontalActiveItem = carouselItems[safeHorizontalActiveIndex] || carouselItems[0] || null;
  const visibleCategory = layout === "horizontal" && activeCategory === "All"
    ? (horizontalActiveItem ? horizontalActiveItem.category || "Runs" : "All")
    : activeCategory;

  const updateHorizontalActive = React.useCallback(() => {
    cancelAnimationFrame(horizontalRafRef.current);
    horizontalRafRef.current = requestAnimationFrame(() => {
      const scroller = horizontalScrollRef.current;
      if (!scroller || scroller.children.length === 0) return;
      const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      Array.from(scroller.children).forEach((child, index) => {
        const card = child as HTMLElement;
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setHorizontalActiveIndex(nearestIndex);
    });
  }, []);

  React.useEffect(() => () => cancelAnimationFrame(horizontalRafRef.current), []);

  const filteredItemsKey = carouselItems.map((item) => `${item.id}:${item.category || ""}`).join("|");
  React.useEffect(() => {
    setHorizontalActiveIndex(0);
    if (layout === "horizontal") horizontalScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [activeCategory, filteredItemsKey, layout]);

  React.useEffect(() => {
    if (layout !== "horizontal") return;
    const scroller = categoryTabsRef.current;
    const tab = categoryTabRefs.current[categoryList.indexOf(visibleCategory)];
    if (!scroller || !tab) return;
    const containerRect = scroller.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const left = scroller.scrollLeft + tabRect.left - containerRect.left - (scroller.clientWidth - tabRect.width) / 2;
    scroller.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [categoryList, layout, prefersReducedMotion, visibleCategory]);

  // Grouped sections: one "X Collection" header per category when browsing All.
  const groups = React.useMemo(() => {
    if (activeCategory !== "All") return [{ category: activeCategory, items: filteredItems }];
    const cats = categoryList.filter((c) => c !== "All");
    const ordered = cats.length > 0 ? cats : Array.from(new Set(filteredItems.map((i) => i.category || "Runs")));
    return ordered
      .map((cat) => ({ category: cat, items: filteredItems.filter((i) => (i.category || "Runs") === cat) }))
      .filter((g) => g.items.length > 0);
  }, [activeCategory, filteredItems, categoryList]);

  const getCategoryLabel = (cat: string) => {
    if (cat === "All") return "All";
    if (cat.toLowerCase().endsWith("series")) return cat;
    if (cat.length <= 3) return `${cat} series`;
    return cat;
  };

  const renderStartButton = (item: SubscriptionItem) => {
    const isOutOfStock = item.outOfStock || item.disabled;
    return (
      <button
        type="button"
        onClick={() => handleStartRun(item)}
        disabled={submittingItemId === item.id || isOutOfStock}
        aria-label={`Start ${item.name} run`}
        className="shrink-0 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[11px] font-sans font-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
      >
        {submittingItemId === item.id ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <><Plus className="w-3.5 h-3.5" strokeWidth={3} /> Start Run</>
        )}
      </button>
    );
  };

  const renderVerticalSpecs = (item: SubscriptionItem) => {
    const row = (label: string, value: string, highlight = false) => (
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-sans font-bold uppercase tracking-wider ${highlight ? "text-[var(--theme-secondary)]" : "opacity-55"}`}>{label}</span>
        <span className={`font-display font-black text-[13px] tabular-nums truncate ${highlight ? "text-[var(--theme-secondary)]" : ""}`}>{value}</span>
      </div>
    );
    return (
      <div className="mt-2 space-y-1.5">
        {row("Duration", `${item.duration} Days`)}
        {row("Daily", formatCurrency(item.dailyYield))}
        {row("Price", formatCurrency(item.amount))}
        {row("Total return", formatCurrency(item.dailyYield * item.duration), true)}
      </div>
    );
  };

  const renderVerticalCard = (item: SubscriptionItem, idx: number) => {
    const isOutOfStock = item.outOfStock || item.disabled;
    const ownedQuantity = activeSubscriptions.filter(
      (sub) => (sub.itemId === item.id || sub.itemName === item.name) && sub.status === "active"
    ).length;

    return (
      <motion.div
        key={item.id}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: prefersReducedMotion ? 0 : Math.min(idx, 5) * 0.03, duration: prefersReducedMotion ? 0.15 : 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="relative flex flex-col bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] overflow-hidden transition-all duration-150 group select-none shadow-sm hover:border-[var(--theme-primary)]/30"
      >
        <div onClick={() => item.imageUrl && setPreviewImage(item.imageUrl)} className="relative aspect-[16/10] overflow-hidden cursor-zoom-in">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-[var(--theme-bg)] flex items-center justify-center text-[var(--theme-text)] opacity-40 text-xs font-mono">
              No Image
            </div>
          )}
          <div className="absolute inset-x-0 top-0 p-2.5 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
          <div className="absolute top-2.5 left-2.5">
            <RarityBadge rarity={rarityMap[item.id] || "common"} />
          </div>
          {ownedQuantity > 0 && (
            <span className="absolute top-2.5 right-2.5 rounded-full border border-[var(--theme-primary)] bg-[var(--theme-card-bg)]/85 backdrop-blur-md text-[var(--theme-text)] px-2 py-0.5 text-[10px] font-black leading-none shadow-md whitespace-nowrap">
              ×{ownedQuantity}
            </span>
          )}
        </div>
        <div className="p-3 flex flex-col gap-1 font-sans">
          <h3 className="font-display font-black text-[14px] text-[var(--theme-text)] tracking-tight leading-tight line-clamp-1">
            {item.name}
          </h3>
          {renderVerticalSpecs(item)}
          <div className="mt-2 flex justify-center">{renderStartButton(item)}</div>
        </div>
        {isOutOfStock ? (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
            <span className="text-xl font-sans font-black tracking-wide text-white drop-shadow-md select-none">
              SOLD OUT
            </span>
          </div>
        ) : null}
      </motion.div>
    );
  };

  const renderCarouselCard = (item: SubscriptionItem, idx: number) => {
    const isOutOfStock = item.outOfStock || item.disabled;
    const ownedQuantity = activeSubscriptions.filter(
      (sub) => (sub.itemId === item.id || sub.itemName === item.name) && sub.status === "active"
    ).length;
    return (
      <motion.div
        key={item.id}
        className="relative shrink-0 w-[86%] max-w-[390px] snap-center cursor-pointer"
      >
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/50 shadow-sm backdrop-blur-[20px]">
          <div
            onClick={() => {
              if (idx !== horizontalActiveIndex) {
                const scroller = horizontalScrollRef.current;
                const target = scroller?.children[idx] as HTMLElement | undefined;
                if (scroller && target) {
                  const left = target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;
                  scroller.scrollTo({ left, behavior: prefersReducedMotion ? "auto" : "smooth" });
                }
              } else if (item.imageUrl) {
                setPreviewImage(item.imageUrl);
              }
            }}
            className="relative aspect-[16/10] overflow-hidden cursor-zoom-in bg-[var(--theme-bg)]"
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover pointer-events-none" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-mono opacity-40">No Image</div>
            )}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
            <div className="absolute left-3 top-3"><RarityBadge rarity={rarityMap[item.id] || "common"} /></div>
            {ownedQuantity > 0 && (
              <span className="absolute right-3 top-3 rounded-full border border-[var(--theme-primary)] bg-[var(--theme-card-bg)]/85 px-2 py-1 text-[10px] font-black leading-none text-[var(--theme-text)] backdrop-blur-md">
                ×{ownedQuantity} owned
              </span>
            )}
            {isOutOfStock && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45">
                <span className="text-2xl font-black tracking-wide text-white drop-shadow-md">SOLD OUT</span>
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-[18px] font-black tracking-tight text-[var(--theme-text)]">{item.name}</h3>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--theme-primary)]/15 px-2.5 py-1 text-[10px] font-black text-[var(--theme-primary)]">{dailyPct(item)}</span>
            </div>
            {renderVerticalSpecs(item)}
            <div className="mt-3 flex justify-center">{renderStartButton(item)}</div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="w-full bg-transparent text-[var(--theme-text)] select-none pb-16 relative">
      <AnimatePresence mode="wait">
        <motion.div
          key="list"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="space-y-4 px-1"
        >
            {/* Account balance — what can be deployed into runs (above shifting title) */}
            <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2">
              <div className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-60">Account Balance</p>
                  <p className="font-display font-black text-[22px] text-[var(--theme-text)] tracking-tight leading-tight truncate">{formatCurrency(userProfile.rechargeBalance || 0)}</p>
                  <p className="text-[10px] font-sans text-[var(--theme-text)] opacity-50">Available for runs</p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToDeposit}
                  className="shrink-0 inline-flex items-center gap-1 px-4 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[12px] font-sans font-black cursor-pointer active:scale-[0.97] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={3} /> Recharge
                </button>
              </div>
            </div>

            {/* Category selection Tabs — no container bg (transparent) */}
            <div className="relative p-1.5 -mx-1 mb-2">
              <div ref={categoryTabsRef} className="overflow-x-auto scrollbar-none">
                <div className="flex gap-2 min-w-max px-1">
                  {categoryList.map((cat, i) => {
                    const isSelected = (layout === "horizontal" ? visibleCategory : activeCategory) === cat;
                    return (
                      <button
                        key={cat}
                        ref={(el) => { categoryTabRefs.current[i] = el; }}
                        onClick={() => {
                          setActiveCategory(cat);
                          setHorizontalActiveIndex(0);
                          setErrorMsg("");
                        }}
                        className={`py-2.5 px-5 text-[11px] font-sans font-black tracking-wider uppercase transition-all cursor-pointer outline-none select-none rounded-full ${
                          isSelected
                            ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)] shadow-md"
                            : "border border-white/10 text-[var(--theme-text)] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <span>{getCategoryLabel(cat)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* List header: layout toggle and active position */}
            <div className="flex items-center justify-end pt-1 px-1">
              <div className="flex items-center gap-1 rounded-full border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setLayoutAndPersist("horizontal")}
                  aria-label="Horizontal cards"
                  className={`p-1.5 rounded-full cursor-pointer active:scale-95 transition-all ${layout === "horizontal" ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "opacity-60"}`}
                >
                  <Rows3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutAndPersist("vertical")}
                  aria-label="Vertical cards"
                  className={`p-1.5 rounded-full cursor-pointer active:scale-95 transition-all ${layout === "vertical" ? "bg-[var(--theme-primary)] text-[var(--theme-on-primary)]" : "opacity-60"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Horizontal showroom: swipe between runs, keeping the active
                collection title and category tab aligned to the centered card. */}
            {layout === "horizontal" && carouselItems.length > 0 ? (
              <div className="space-y-3 pt-1">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <h2 className="mt-1 truncate font-display text-[17px] font-black tracking-tight">
                      {getCategoryLabel(horizontalActiveItem?.category || activeCategory)} Collection
                    </h2>
                    {horizontalActiveItem && <p className="mt-0.5 truncate text-[11px] font-sans opacity-55">{horizontalActiveItem.name}</p>}
                  </div>
                  <span className="shrink-0 pb-0.5 text-[10px] font-sans font-bold tabular-nums opacity-50">
                    {horizontalActiveItem ? `${horizontalActiveItem.duration} days` : ""}
                  </span>
                </div>
                <div
                  ref={horizontalScrollRef}
                  onScroll={updateHorizontalActive}
                  className="relative flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scrollbar-none -mx-1 px-[7%] pb-3 pt-1 touch-pan-x"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {carouselItems.map((item, idx) => renderCarouselCard(item, idx))}
                </div>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.category} className="space-y-3 pt-1">
                  {activeCategory === "All" && groups.length > 1 && (
                    <h2 className="font-display font-black text-[17px] tracking-tight px-1">
                      {getCategoryLabel(group.category)} Collection
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {group.items.map((item, idx) => renderVerticalCard(item, idx))}
                  </div>
                </div>
              ))
            )}

            {filteredItems.length === 0 && (
              <div className="text-center py-12 text-xs font-sans text-[var(--theme-text)] opacity-60 theme-card border border-dashed border-[var(--theme-card-border)] rounded-[var(--theme-radius)]">
                NO PRODUCTS FOUND HERE.
              </div>
            )}
          </motion.div>
      </AnimatePresence>
      <div className="mt-4 rounded-[20px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-3.5 flex items-start gap-2.5">
        <Calendar className="w-4 h-4 text-[var(--theme-primary)] shrink-0 mt-0.5" />
        <p className="text-[12px] font-sans opacity-70 leading-relaxed">
          Earnings are credited to your withdrawable balance daily. Completed runs become art collectibles in your account.
        </p>
      </div>
      {/* Single modal: confirm → loading → success */}
      <AnimatePresence>
        {(confirmingItem || activated) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
              onClick={handleCloseModal}
            />
            <motion.div
              initial={{ scale: 0.94, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.94, y: 15, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 360 }}
              className="relative w-full max-w-[440px] max-h-[90vh] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[24px] shadow-2xl text-[var(--theme-text)] text-center flex flex-col overflow-hidden backdrop-blur-xl"
            >
              {modalPhase === "success" && activated ? (
                <div className="p-6 sm:p-8 flex flex-col items-center gap-4 overflow-y-auto scrollbar-none">
                  <span className="w-14 h-14 rounded-full bg-[var(--theme-primary)] flex items-center justify-center shadow-[0_0_24px_var(--theme-primary)]">
                    <Check className="w-7 h-7 text-black" strokeWidth={3} />
                  </span>
                  <div className="text-center">
                    <h3 className="font-display font-black text-[22px] tracking-tight">Run Activated</h3>
                    <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 mt-1 leading-snug">{activated.item.name} is live and earning for you.</p>
                  </div>
                  {activated.item.imageUrl && (
                    <img src={activated.item.imageUrl} alt={activated.item.name} loading="lazy" referrerPolicy="no-referrer" className="w-24 h-24 object-contain" />
                  )}
                  <div className="w-full divide-y divide-[var(--theme-card-border)]/60 border-y border-[var(--theme-card-border)]/60">
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Price paid</span>
                      <span className="font-display font-black text-[14px] text-[var(--theme-text)] tabular-nums">{formatCurrency(activated.item.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Day 1 return credited</span>
                      <span className="font-display font-black text-[14px] text-[var(--theme-primary)] tabular-nums">+{formatCurrency(activated.dayOne)}</span>
                    </div>
                  </div>
                  <div className="w-full rounded-2xl border border-dashed border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 px-4 py-3">
                    <p className="text-[12px] font-sans text-[var(--theme-text)] leading-relaxed">
                      When the {activated.item.duration}-day cycle ends, this run becomes a <span className="font-black">collectible</span>. Claim it to own it permanently.
                    </p>
                  </div>
                  <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed text-center -mt-1">
                    Your first day&apos;s return is already in your withdrawable balance. New returns land daily while the run stays active.
                  </p>
                  <div className="w-full space-y-2 mt-1">
                    <button
                      type="button"
                      onClick={() => { handleCloseModal(); onActivationContinue(); }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[14px] font-sans font-black cursor-pointer active:scale-[0.98] transition-all"
                    >
                      My Active Runs <ArrowRight className="w-4 h-4" strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="w-full px-5 py-2.5 rounded-full text-[13px] font-sans font-bold text-[var(--theme-text)] opacity-70 hover:opacity-100 cursor-pointer transition-all"
                    >
                      Keep exploring
                    </button>
                  </div>
                </div>
              ) : confirmingItem ? (
                <div className="w-full overflow-y-auto">
                  {confirmingItem.imageUrl && (
                    <div className="w-full overflow-hidden rounded-t-[24px] bg-[var(--theme-bg)]">
                      <img
                        src={confirmingItem.imageUrl}
                        alt={confirmingItem.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-48 w-full object-cover sm:h-56"
                      />
                    </div>
                  )}
                  <div className="flex w-full flex-col items-center gap-4 p-6 pt-5">
                    <div className="text-center">
                      <h3 className="font-display font-black text-[20px] tracking-tight">
                        {modalPhase === "loading" ? "Starting your run..." : "Start this run?"}
                      </h3>
                      <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 mt-1 leading-snug">{confirmingItem.name}</p>
                    </div>
                    <div className="w-full divide-y divide-[var(--theme-card-border)]/60 border-y border-[var(--theme-card-border)]/60">
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Price</span>
                        <span className="font-display font-black text-[14px] text-[var(--theme-text)] tabular-nums">{formatCurrency(confirmingItem.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Duration</span>
                        <span className="font-display font-black text-[14px] text-[var(--theme-text)] tabular-nums">{confirmingItem.duration} Days</span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-[12px] font-sans text-[var(--theme-text)] opacity-60">Daily return</span>
                        <span className="font-display font-black text-[14px] text-[var(--theme-primary)] tabular-nums">{formatCurrency(confirmingItem.dailyYield)}</span>
                      </div>
                    </div>
                    {modalPhase === "loading" ? (
                      <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed">
                        Processing payment and activating your run...
                      </p>
                    ) : (
                      <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed">
                        {formatCurrency(confirmingItem.amount)} will be deducted from your recharge balance.
                      </p>
                    )}
                    <div className="w-full space-y-2 mt-1">
                      {modalPhase === "loading" ? (
                        <button
                          type="button"
                          disabled
                          className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[14px] font-sans font-black cursor-wait opacity-80"
                        >
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Starting...
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={handleConfirmSubscribe}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[14px] font-sans font-black cursor-pointer active:scale-[0.98] transition-all"
                          >
                            <Check className="w-4 h-4" strokeWidth={3} />
                            Confirm & Start
                          </button>
                          <button
                            type="button"
                            onClick={handleCloseModal}
                            className="w-full px-5 py-2.5 rounded-full text-[13px] font-sans font-bold text-[var(--theme-text)] opacity-70 hover:opacity-100 cursor-pointer transition-all"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Full preview */}
      <AnimatePresence>
        {previewImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] rounded-[var(--theme-radius)] shadow-2xl object-contain" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
