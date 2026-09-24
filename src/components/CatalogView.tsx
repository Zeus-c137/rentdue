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
  Loader2
} from "lucide-react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "../currency";
import VisaMetricCard from "./VisaMetricCard";
import { toast } from "sonner";

interface CatalogViewProps {
  items: SubscriptionItem[];
  userProfile: UserProfile;
  siteConfig?: any;
  activeSubscriptions?: any[];
  onSubscribeSuccess: (newSub: any, CostAmount: number) => void;
  onRentWithMmoney: (item: SubscriptionItem) => void;
}

type CategoryType = "All" | "DS" | "D" | "G" | "E" | "F";

export default function CatalogView({
  items,
  userProfile,
  siteConfig,
  activeSubscriptions = [],
  onSubscribeSuccess,
  onRentWithMmoney
}: CatalogViewProps) {
  const { formatCurrency } = useCurrency();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

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

      toast.success(`🎉 Successfully rented ${item.name}! Your product is now generating daily passive yields.`);
      onSubscribeSuccess(data.subscription, item.amount);
      
      // Close details drawer/page on success
      setTimeout(() => {
        setSelectedItem(null);
      }, 1500);

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
            {/* Top Metrics — sticky so product list scrolls below */}
            <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2">
              <VisaMetricCard
                leftValue={String(activeSubscriptions.filter((s) => s.status === "active").length)}
                leftLabel="My products"
                rightValue={formatCurrency(userProfile.rechargeBalance || 0)}
                rightLabel="Recharge balance"
              />
            </div>

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
                        className={`py-3 px-6 text-xs font-display font-black tracking-wider uppercase transition-all cursor-pointer outline-none select-none rounded-full ${
                          isSelected
                            ? "btn-3d-primary text-white shadow-md scale-105"
                            : "btn-3d-secondary text-[var(--theme-text)] border border-[var(--theme-card-border)]/50 opacity-80 hover:opacity-100"
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
                        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-[var(--theme-primary)] text-white px-2 py-0.5 text-[10px] font-black leading-none shadow-md whitespace-nowrap">
                          ×{ownedQuantity}
                        </span>
                      )}
                    </div>

                    {/* Right portion: specs — min-w-0 prevents overflow when title/amounts are long */}
                    <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between space-y-3 font-sans">
                      <div className="min-w-0 space-y-3">
                        {/* Title Row with Rent — title truncates, rent never overflows */}
                        <div className="flex items-start justify-between gap-3 pb-1 min-w-0">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display font-black text-[15px] sm:text-base text-[var(--theme-primary)] uppercase tracking-tight leading-tight line-clamp-2 break-words min-w-0">
                              {item.name}
                            </h3>
                          </div>
                          <Button
                            variant="gold-matte"
                            size="xs"
                            glow={false}
                            onClick={() => handleSubscribe(item)}
                            disabled={submittingItemId === item.id || isOutOfStock}
                            className="shrink-0 whitespace-nowrap self-start"
                          >
                            {submittingItemId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isOutOfStock ? (
                              <span>SOLD OUT</span>
                            ) : (
                              <>
                                <ShoppingCart className="w-3 h-3" />
                                <span>RENT</span>
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Specs — relaxed spacing for mobile + desktop */}
                        <div className="space-y-2.5 text-[var(--theme-text)] min-w-0">
                          <p className="flex items-center justify-between gap-4 min-w-0 leading-relaxed">
                            <span className="text-[10.5px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 shrink-0">Cycle</span>
                            <span className="font-display font-black text-[13px] sm:text-sm tracking-tight text-[var(--theme-text)] truncate text-right min-w-0">{item.duration} Days</span>
                          </p>
                          <p className="flex items-center justify-between gap-4 min-w-0 leading-relaxed">
                            <span className="text-[10.5px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 shrink-0">Price</span>
                            <span className="font-display font-black text-[13px] sm:text-sm tracking-tight text-[var(--theme-text)] truncate text-right min-w-0">{formatCurrency(item.amount)}</span>
                          </p>
                          <p className="flex items-center justify-between gap-4 min-w-0 leading-relaxed">
                            <span className="text-[10.5px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 shrink-0">Daily income</span>
                            <span className="font-display font-black text-[13px] sm:text-sm tracking-tight text-[var(--theme-text)] truncate text-right min-w-0">{formatCurrency(item.dailyYield)}</span>
                          </p>
                          <p className="flex items-center justify-between gap-4 min-w-0 leading-relaxed">
                            <span className="text-[10.5px] font-display font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-60 shrink-0">Total income</span>
                            <span className="font-display font-black text-[13px] sm:text-sm tracking-tight text-[var(--theme-text)] truncate text-right min-w-0">{formatCurrency(totalIncome)}</span>
                          </p>
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
