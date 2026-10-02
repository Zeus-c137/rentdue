/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Virtual gallery: every finished run owns one collectible. Unclaimed rows
 * (cycle done, tap pending) can be claimed right from the gallery.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Award, Loader2, Plus, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import type { Collectible } from "../types";
import { useCurrency } from "../currency";
import RarityBadge from "./RarityBadge";
import { motion } from "motion/react";

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
  const [items, setItems] = useState<Collectible[] | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
  const totalCount = (items || []).length;
  const claimedPct = totalCount > 0 ? Math.round((claimed.length / totalCount) * 100) : 0;

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

      {/* Vault progress */}
      <div className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-sans font-black uppercase tracking-wider opacity-55">Vault completion</p>
          <p className="font-display font-black text-[14px] text-[var(--theme-primary)] tabular-nums">{claimedPct}%</p>
        </div>
        <div className="h-2 rounded-full bg-[var(--theme-text)]/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[var(--theme-primary)]"
            initial={{ width: 0 }}
            animate={{ width: `${claimedPct}%` }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          />
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <p className="text-[11px] font-sans opacity-55">{claimed.length} claimed</p>
          <p className="text-[11px] font-sans opacity-55">{pending.length} awaiting claim</p>
        </div>
      </div>

      {items === null ? (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-3 animate-pulse">
              <div className="aspect-square rounded-xl bg-[var(--theme-text)]/10" />
              <div className="mt-2 h-[14px] w-2/3 rounded bg-[var(--theme-text)]/10" />
            </div>
          ))}
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
          {/* Achievement wall — claimed collectibles */}
          {claimed.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-[15px] px-1">Vault <span className="opacity-50 font-bold">{claimed.length}</span></h3>
              <div className="grid grid-cols-2 gap-3">
                {claimed.map((c: Collectible, i: number) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] p-3 overflow-hidden relative"
                  >
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
                      <div className="absolute top-1.5 left-1.5">
                        <RarityBadge rarity={c.rarity} serial={c.serial} />
                      </div>
                    </div>
                    <p className="mt-2 font-display font-black text-[13px] leading-tight truncate">{c.itemName}</p>
                    <p className="text-[11px] font-sans opacity-55">
                      {c.duration}d cycle · Earned {formatCurrency(c.totalEarned)}
                    </p>
                  </motion.div>
                ))}
              </div>
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
                      <div className="absolute top-1.5 left-1.5">
                        <RarityBadge rarity={c.rarity} serial={c.serial} />
                      </div>
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
