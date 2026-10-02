/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PROTOTYPE (prototype/collections-showroom): coverflow showroom.
 * Tapping the centered piece grows it in place via a shared-element morph —
 * same card, dimensions animating in real time. Tap outside to shrink it back.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Award, Clock, Loader2, Plus, X } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import type { Collectible } from "../types";
import { useCurrency } from "../currency";
import { motion } from "motion/react";
import { useReducedMotion } from "../hooks/useReducedMotion";

const GROW_SPRING = { type: "spring", duration: 0.5, bounce: 0.15 } as const;

export default function CollectionView({
  phone,
  onBack,
  onNavigateToCatalog,
  onClaimed,
}: {
  phone: string;
  onBack?: () => void;
  onNavigateToCatalog?: () => void;
  onClaimed?: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const prefersReducedMotion = useReducedMotion();
  const [items, setItems] = useState<Collectible[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [morphKey, setMorphKey] = useState<string | null>(null);
  const [swipeDir, setSwipeDir] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const savedScroll = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/collectibles/${phone}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your collection.");
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || "Could not load your collection.");
      setItems([]);
    }
  }, [phone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleClaim = async (subscriptionId: string) => {
    setClaimingId(subscriptionId);
    try {
      const res = await fetch("/api/collectibles/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not claim this collectible.");
      confetti({ particleCount: 130, spread: 75, origin: { y: 0.6 } });
      toast.success(`Collectible #${String(data.collectible?.serial || 0).padStart(3, "0")} is now permanently yours!`);
      setItems((prev) => (prev || []).map((c) => (c.subscriptionId === subscriptionId ? data.collectible : c)));
      onClaimed?.();
    } catch (err: any) {
      toast.error(err.message || "Could not claim this collectible.");
    } finally {
      setClaimingId(null);
    }
  };

  const claimed = (items || []).filter((c) => c.claimedAt);
  const pending = (items || []).filter((c) => !c.claimedAt);
  const expanded = expandedId ? claimed.find((c) => c.id === expandedId) || null : null;
  const growTransition = prefersReducedMotion ? { duration: 0 } : GROW_SPRING;

  const updateActive = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el || el.children.length === 0) return;
      const first = el.children[0] as HTMLElement;
      const stride = first.offsetWidth + 12;
      if (stride <= 0) return;
      const idx = Math.round(el.scrollLeft / stride);
      setActiveIndex(Math.max(0, Math.min(idx, claimed.length - 1)));
    });
  }, [claimed.length]);

  const centerOn = (i: number) => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const target = el.children[i] as HTMLElement | undefined;
    if (!target) return;
    el.scrollTo({ left: target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const expand = (c: Collectible) => {
    if (scrollRef.current) savedScroll.current = scrollRef.current.scrollLeft;
    const idx = claimed.findIndex((x) => x.id === c.id);
    if (idx >= 0) setActiveIndex(idx);
    setMorphKey(`vault-${c.id}`);
    setExpandedId(c.id);
  };

  const collapse = () => {
    if (expanded) setMorphKey(`vault-${expanded.id}`);
    setExpandedId(null);
    setSwipeDir(0);
  };

  // Swipe navigation inside the expanded card.
  const navigate = (dir: 1 | -1) => {
    if (!expanded || claimed.length < 2) return;
    const idx = claimed.findIndex((c) => c.id === expanded.id);
    if (idx < 0) return;
    const next = (idx + dir + claimed.length) % claimed.length;
    setSwipeDir(dir);
    setExpandedId(claimed[next].id);
    setActiveIndex(next);
  };

  const handleSwipe = (_e: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -70 || info.velocity.x < -500) navigate(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) navigate(-1);
  };

  // Park the flow on the card the user ended on — but ONLY on the collapse
  // edge. Keying this on activeIndex made it fire during ordinary flow
  // scrolling and rewrite scrollLeft mid-swipe, which read as jitter.
  const wasExpanded = useRef(false);
  useLayoutEffect(() => {
    const justCollapsed = wasExpanded.current && !expandedId;
    wasExpanded.current = !!expandedId;
    if (!justCollapsed || !scrollRef.current) return;
    const el = scrollRef.current;
    const target = el.children[activeIndex] as HTMLElement | undefined;
    if (!target) return;
    el.scrollLeft = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
  }, [expandedId, activeIndex]);

  return (
    <div className="space-y-5 select-none bg-transparent text-[var(--theme-text)] p-1 relative">
      {onBack ? (
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
          <span>Back</span>
        </button>
      ) : null}

      <div className="px-1">
        <h1 className="font-display font-black text-[26px] leading-none tracking-tight">My Collection</h1>
        <p className="text-[13px] font-sans opacity-65 leading-snug max-w-[320px] mt-1.5">
          Finished runs become collectibles. Claim them to own them permanently.
        </p>
      </div>

      {items === null ? (
        <div aria-hidden="true" className="space-y-3">
          <div className="h-[300px] rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-3 animate-pulse">
                <div className="aspect-square rounded-xl bg-[var(--theme-text)]/10" />
                <div className="mt-2 h-[14px] w-2/3 rounded bg-[var(--theme-text)]/10" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 px-4 space-y-4">
          <Award className="w-10 h-10 opacity-40 mx-auto" />
          <p className="font-bold opacity-60 text-xs uppercase font-sans">No collectibles yet</p>
          <p className="text-[13px] opacity-60 font-sans">Finish your first run cycle to mint a collectible.</p>
          {onNavigateToCatalog && (
            <button
              type="button"
              onClick={onNavigateToCatalog}
              className="mx-auto inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[13px] font-sans font-black cursor-pointer active:scale-[0.97] transition-all"
            >
              <Plus className="w-4 h-4" /> Explore Runs
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Coverflow showroom — claimed collectibles */}
          {claimed.length > 0 && (
            <div className="space-y-3" onClick={expanded ? collapse : undefined}>
              <div className="flex items-baseline justify-between px-1">
                <h3 className="font-display font-black text-[15px]">Showroom</h3>
                <p className="font-display font-bold text-[12px] tabular-nums text-[var(--theme-text)] opacity-55">
                  {String(Math.min(activeIndex + 1, claimed.length)).padStart(2, "0")} / {String(claimed.length).padStart(2, "0")}
                </p>
              </div>
              {expanded ? (
                <div className="relative">
                  <motion.button
                    type="button"
                    aria-label="Close expanded view"
                    onClick={(e) => { e.stopPropagation(); collapse(); }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.25, duration: 0.2 }}
                    className="absolute left-1/2 -translate-x-1/2 -top-[38px] z-10 w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-[var(--theme-card-bg)] text-[var(--theme-text)] shadow-lg cursor-pointer active:scale-95 transition-transform"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                  <motion.div
                    key="expanded-view"
                    layoutId={morphKey ?? undefined}
                    onLayoutAnimationComplete={() => setMorphKey(null)}
                    transition={growTransition}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.14}
                    onDragEnd={handleSwipe as never}
                    onClick={(e) => e.stopPropagation()}
                    className="relative rounded-[24px] border border-[var(--theme-primary)]/50 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] p-4 overflow-hidden tile-shimmer-5s"
                  >
                    <motion.div
                      key={expanded.id}
                      initial={{ opacity: 0, x: swipeDir * 48 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: [0.23, 1, 0.32, 1] }}
                    >
                      <div
                        onClick={(e) => { e.stopPropagation(); expanded.image && setPreviewImage(expanded.image); }}
                        className="relative aspect-square rounded-2xl overflow-hidden bg-[var(--theme-text)]/5 cursor-zoom-in"
                      >
                        {expanded.image ? (
                          <img src={expanded.image} alt={expanded.itemName} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-40">
                            <Award className="w-12 h-12" />
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display font-black text-[20px] leading-tight">{expanded.itemName}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[12px] font-sans opacity-55">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{expanded.duration}d cycle</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-display font-black text-[13px] text-[var(--theme-primary)] tabular-nums">
                            #{String(expanded.serial).padStart(3, "0")}
                          </p>
                          <p className="mt-0.5 font-display font-black text-[13px] text-[var(--theme-primary)] tabular-nums">
                            Earned {formatCurrency(expanded.totalEarned)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  onScroll={updateActive}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-1 px-[7%] pb-2 pt-1"
                  style={{ perspective: "1200px" }}
                >
                  {claimed.map((c: Collectible, i: number) => {
                    const d = i - activeIndex;
                    const ad = Math.abs(d);
                    const scale = 1 - Math.min(ad * 0.1, 0.3);
                    const rotateY = prefersReducedMotion ? 0 : Math.max(-32, Math.min(32, -d * 18));
                    const dim = ad > 0;
                    return (
                      <motion.div
                        key={`vault-${c.id}`}
                        layoutId={`vault-${c.id}`}
                        transition={growTransition}
                        className="shrink-0 w-[86%] snap-center cursor-pointer"
                        onClick={() => { if (i === activeIndex) expand(c); else centerOn(i); }}
                      >
                        <div
                          className={`rounded-[24px] border backdrop-blur-[20px] p-4 overflow-hidden relative transition-colors duration-200 ${i === activeIndex ? "border-[var(--theme-primary)]/50 bg-[var(--theme-card-bg)]/60 shadow-[0_0_32px_rgba(0,0,0,0.25)]" : "border-white/10 bg-[var(--theme-card-bg)]/40"}`}
                          style={{
                            transform: `scale(${scale}) rotateY(${rotateY}deg)`,
                            opacity: ad > 2 ? 0.45 : 1,
                            filter: dim ? "blur(1px) brightness(0.85)" : "none",
                            transition: "transform 200ms ease-out, opacity 200ms ease-out, filter 200ms ease-out",
                            transformStyle: "preserve-3d",
                          }}
                        >
                          <div className="relative aspect-square rounded-2xl overflow-hidden bg-[var(--theme-text)]/5">
                            {c.image ? (
                              <img src={c.image} alt={c.itemName} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-40">
                                <Award className="w-12 h-12" />
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display font-black text-[15px] leading-tight truncate">{c.itemName}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-sans opacity-55">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{c.duration}d cycle</span>
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-display font-black text-[11px] text-[var(--theme-primary)] tabular-nums">
                                #{String(c.serial).padStart(3, "0")}
                              </p>
                              <p className="mt-0.5 font-display font-black text-[11px] text-[var(--theme-primary)] tabular-nums">
                                Earned {formatCurrency(c.totalEarned)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pending claims */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-[15px] px-1">Ready to claim <span className="opacity-50 font-bold">{pending.length}</span></h3>
              <div className="grid grid-cols-2 gap-3">
                {pending.map((c: Collectible) => (
                  <div key={c.id} className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] p-3 overflow-hidden relative">
                    <div
                      onClick={() => c.image && setPreviewImage(c.image)}
                      className="relative aspect-square rounded-xl overflow-hidden bg-[var(--theme-text)]/5 cursor-zoom-in"
                    >
                      {c.image ? (
                        <img src={c.image} alt={c.itemName} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-40">
                          <Award className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 font-display font-black text-[13px] leading-tight truncate">{c.itemName}</p>
                    <p className="text-[11px] font-sans opacity-55">
                      {c.duration}d cycle · Earned {formatCurrency(c.totalEarned)}
                    </p>
                    <button
                      type="button"
                      disabled={claimingId === c.subscriptionId}
                      onClick={() => handleClaim(c.subscriptionId)}
                      className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[12px] font-sans font-black cursor-pointer active:scale-[0.97] transition-all disabled:opacity-60"
                    >
                      {claimingId === c.subscriptionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Claim collectible
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] rounded-[var(--theme-radius)] shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
