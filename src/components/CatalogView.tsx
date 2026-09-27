/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SubscriptionItem, UserProfile } from "../types";
import {
  ChevronLeft,
  ChevronRight,
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
  Check
} from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "../currency";
import { toast } from "sonner";

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
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activated, setActivated] = useState<{ item: SubscriptionItem; dayOne: number } | null>(null);

  const handleSubscribe = async (item: SubscriptionItem) => {
    if (item.outOfStock || item.disabled) {
      toast.error("This product is currently out of stock.");
      return;
    }

    const rechargeBal = userProfile.rechargeBalance || 0;
    if (rechargeBal < item.amount) {
      toast.error(
        `Insufficient recharge balance. Buying ${item.name} requires ${formatCurrency(item.amount)}. Your account recharge balance is ${formatCurrency(rechargeBal)}. Please deposit funds first.`
      );
      return;
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

    } catch (err: any) {
      toast.error(err.message || "Failed to lock asset. Please try again.");
    } finally {
      setSubmittingItemId(null);
    }
  };

  // Build dynamic categories list
  const categoryList = React.useMemo(() => {
    const customConfigCats = siteConfig?.categories || [];
    const itemCats = items.map(i => i.category).filter(Boolean);
    const combined = Array.from(new Set([...customConfigCats, ...itemCats]));
    return ["All", ...combined];
  }, [siteConfig?.categories, items]);

  const filteredItems = items.filter((item) => {
    if (activeCategory === "All") return true;
    return item.category === activeCategory;
  });

  const getCategoryLabel = (cat: string) => {
    if (cat === "All") return "All";
    if (cat.toLowerCase().endsWith("series") || cat.toLowerCase().endsWith("series")) return cat;
    if (cat.length <= 3) return `${cat} series`;
    return cat;
  };

  const DEFAULT_STORE_TITLE = "The Store";
  const DEFAULT_STORE_DESC = "Choose your runs and begin your journey from our carefully curated categories.";
  const activeTitle = activeCategory === "All" ? DEFAULT_STORE_TITLE : getCategoryLabel(activeCategory);
  const activeDesc =
    activeCategory === "All"
      ? DEFAULT_STORE_DESC
      : (siteConfig?.categoryMeta?.[activeCategory]?.description?.trim() ||
        `Choose your runs from ${getCategoryLabel(activeCategory)}.`);


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

            {/* Shifting title + description — swaps with the active category tab */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                <h1 className="font-display font-black text-[26px] leading-none tracking-tight text-[var(--theme-text)]">{activeTitle}</h1>
                <p className="text-[13px] font-sans text-[var(--theme-text)] opacity-65 leading-snug max-w-[320px] mt-1.5">{activeDesc}</p>
              </motion.div>
            </AnimatePresence>

            {/* Category selection Tabs — no container bg (transparent) */}
            <div className="relative p-1.5 -mx-1 mb-2">
              <div className="overflow-x-auto scrollbar-none">
                <div className="flex gap-2 min-w-max px-1">
                  {categoryList.map((cat) => {
                    const isSelected = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setActiveCategory(cat);
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

            {/* Horizontal elegant cards column container */}
            <div className="space-y-3 pt-1">
              {filteredItems.map((item, idx) => {
                const isOutOfStock = item.outOfStock || item.disabled;
                const ownedQuantity = activeSubscriptions.filter(
                  (sub) => (sub.itemId === item.id || sub.itemName === item.name) && sub.status === "active"
                ).length;

                // Cumulative calculated total income
                const totalIncome = item.dailyYield * item.duration;

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="relative flex flex-row items-stretch bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] overflow-hidden transition-all duration-150 group select-none shadow-sm hover:border-[var(--theme-primary)]/30"
                  >
                    {/* Left portion: Hardware Image — fills parent height */}
                    <div onClick={() => item.imageUrl && setPreviewImage(item.imageUrl)} className="w-32 sm:w-36 md:w-44 self-stretch relative overflow-hidden rounded-l-[var(--theme-radius)] bg-transparent border-0 shrink-0 cursor-zoom-in group-hover:border-[var(--theme-primary)]/30 transition-colors p-4 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--theme-bg)] flex items-center justify-center text-[var(--theme-text)] opacity-40 text-xs font-mono">
                          No Image
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                      {ownedQuantity > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded-full border border-[var(--theme-primary)] bg-[var(--theme-card-bg)]/85 backdrop-blur-md text-[var(--theme-text)] px-2 py-0.5 text-[10px] font-black leading-none shadow-md whitespace-nowrap">
                          ×{ownedQuantity}
                        </span>
                      )}
                    </div>

                    {/* Right portion: tier, specs grid, plus action — min-w-0 prevents overflow when title/amounts are long */}
                    <div className="flex-1 min-w-0 p-4 flex flex-col justify-between gap-2.5 font-sans">
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display font-black text-[16px] text-[var(--theme-text)] uppercase tracking-tight leading-tight line-clamp-1 break-words min-w-0">
                              {item.name}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSubscribe(item)}
                            disabled={submittingItemId === item.id || isOutOfStock}
                            aria-label={`Buy ${item.name}`}
                            className="shrink-0 w-9 h-9 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            {submittingItemId === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" strokeWidth={3} />
                            )}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-2.5">
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Cycle</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{item.duration} days</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Daily Return</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{formatCurrency(item.dailyYield)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Price</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-text)] tracking-tight truncate mt-0.5">{formatCurrency(item.amount)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text)] opacity-55">Total Return</p>
                            <p className="font-display font-black text-[13px] text-[var(--theme-primary)] tracking-tight truncate mt-0.5">+{formatCurrency(totalIncome)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full card status banner overlay */}
                    {isOutOfStock ? (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
                        <span className="text-2xl md:text-3xl font-sans font-black tracking-wide text-white drop-shadow-md select-none">
                          SOLD OUT
                        </span>
                      </div>
                    ) : null}
                  </motion.div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-xs font-sans text-[var(--theme-text)] opacity-60 theme-card border border-dashed border-[var(--theme-card-border)] rounded-[var(--theme-radius)]">
                  NO PRODUCTS FOUND HERE.
                </div>
              )}
            </div>
          </motion.div>
      </AnimatePresence>
      {/* Activation confirmation — frost treatment mirrors the check-in sheet */}
      <AnimatePresence>
        {activated && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
              onClick={() => setActivated(null)}
            />
            <motion.div
              initial={{ scale: 0.94, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.94, y: 15, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 360 }}
              className="relative w-full max-w-[440px] max-h-[90vh] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[24px] shadow-2xl text-[var(--theme-text)] text-center flex flex-col overflow-hidden backdrop-blur-xl"
            >
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
                <p className="text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed text-center -mt-1">
                  Your first day&apos;s return is already in your withdrawable balance. New returns land daily while the run stays active.
                </p>
                <div className="w-full space-y-2 mt-1">
                  <button
                    type="button"
                    onClick={() => { setActivated(null); onActivationContinue(); }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[14px] font-sans font-black cursor-pointer active:scale-[0.98] transition-all"
                  >
                    My Active Runs <ArrowRight className="w-4 h-4" strokeWidth={3} />                  </button>
                  <button
                    type="button"
                    onClick={() => setActivated(null)}
                    className="w-full px-5 py-2.5 rounded-full text-[13px] font-sans font-bold text-[var(--theme-text)] opacity-70 hover:opacity-100 cursor-pointer transition-all"
                  >
                    Keep exploring
                  </button>
                </div>
              </div>
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
