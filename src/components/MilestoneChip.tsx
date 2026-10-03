/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Header milestone tile — a backgroundless cluster on the right of the
 * ribbon. No card, no border: the ribbon is deliberately backgroundless so
 * the dashboard art reads through, and the tile behaves the same way. The
 * tier art sits padded inside a smooth progress ring, beside the tier name
 * and one short line — "x left to [Next]", next name in primary.
 *
 * Entrance matches the rest of the app: the tile fades/slides in on mount
 * while the ring sweeps from empty to the tier's share.
 *
 * Milestones are progressive enhancement: no board, no tile.
 */
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Trophy } from "lucide-react";
import { motion } from "motion/react";
import type { VipTaskboard } from "../types";
import { getMilestoneBoard, subscribeMilestoneBoard } from "./VipTasksPage";
import { currentTierProgress, type TierProgress } from "../utils/vip";
import { optimizedImageUrl } from "../utils/imageUtils";

interface MilestoneChipProps {
  phone: string;
  onOpen: (stage: string) => void;
}

function chipCaption(tier: TierProgress): ReactNode {
  // The next tier name rides in primary — plain text color, no badge.
  const next = tier.nextName ? (
    <span className="text-[var(--theme-primary)]">{tier.nextName}</span>
  ) : null;
  const tasks = `${tier.left} ${tier.left === 1 ? "task" : "tasks"}`;
  if (tier.readyToClaim) return <>Claim reward</>;
  if (!tier.nextName) return tier.complete ? <>Complete</> : <>{tasks} left</>;
  return tier.complete ? <>Claim to {next}</> : <>{tasks} to {next}</>;
}

function chipCaptionText(tier: TierProgress): string {
  if (tier.readyToClaim) return "Claim reward";
  const tasks = `${tier.left} ${tier.left === 1 ? "task" : "tasks"}`;
  if (!tier.nextName) return tier.complete ? "Complete" : `${tasks} left`;
  return tier.complete ? `Claim to ${tier.nextName}` : `${tasks} to ${tier.nextName}`;
}

/** Tier art padded inside a smooth circular progress ring. Sweeps from empty
 *  on mount, then eases to the live share whenever it changes. Stroke colors
 *  ride the style prop — var() inside SVG presentation attributes does not
 *  resolve and the ring would never paint. */
function TierRing({ pct, art }: { pct: number; art: string }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  const R = 15.5;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - (entered ? clamped : 0) / 100);

  return (
    <span className="relative w-14 h-14 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.5" strokeOpacity="0.14" style={{ stroke: "var(--theme-text)" }} />
        <circle
          cx="18"
          cy="18"
          r={R}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{
            stroke: "var(--theme-primary)",
            strokeDasharray: `${C}`,
            strokeDashoffset: `${offset}`,
            transition: "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <span className="absolute inset-[10px] rounded-full overflow-hidden flex items-center justify-center bg-black/20">
        {art ? (
          <img
            src={optimizedImageUrl(art, 200)}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <Trophy className="w-4 h-4 text-[var(--theme-primary)]" />
        )}
      </span>
    </span>
  );
}

export default function MilestoneChip({ phone, onOpen }: MilestoneChipProps) {
  const [board, setBoard] = useState<VipTaskboard | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setBoard(null);
    setUnavailable(false);
    void getMilestoneBoard(phone, ctrl.signal)
      .then((next) => { if (!ctrl.signal.aborted) setBoard(next); })
      .catch(() => { if (!ctrl.signal.aborted) setUnavailable(true); });
    return () => ctrl.abort();
  }, [phone]);

  // A claimed stage reward republishes the board; re-read it rather than
  // waiting for a remount that may never come.
  useEffect(() => subscribeMilestoneBoard(setBoard), []);

  const tier = useMemo(() => currentTierProgress(board), [board]);

  if (unavailable || !tier) {
    // Skeleton holds the tile's footprint so neighbors don't jump when the
    // board lands; nothing at all when milestones are unavailable.
    if (unavailable || board !== null) return null;
    return (
      <span aria-hidden="true" className="flex items-center gap-2.5 shrink-0 animate-pulse">
        <span className="w-14 h-14 rounded-full bg-[var(--theme-text)]/10 shrink-0" />
        <span className="hidden min-[400px]:block">
          <span className="block h-[12px] w-16 rounded bg-[var(--theme-text)]/10" />
          <span className="mt-1.5 block h-[11px] w-24 rounded bg-[var(--theme-text)]/10" />
        </span>
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      onClick={() => onOpen(tier.name)}
      title={`${tier.name} — open journey`}
      aria-label={`${tier.name} tier, ${tier.done} of ${tier.total} milestones done. ${chipCaptionText(tier)}. Open journey.`}
      className="flex items-center gap-2 min-w-0 shrink-0 bg-transparent border-0 p-0 cursor-pointer active:scale-[0.96] transition-transform duration-100"
    >
      <TierRing pct={tier.pct} art={tier.art} />
      <span className="hidden min-[400px]:block min-w-0 text-left leading-none">
        <span className="block font-display font-black text-[13px] uppercase tracking-tight truncate max-w-[120px]">
          {tier.name}
        </span>
        <span className="mt-1 block font-sans text-[11px] font-bold text-[var(--theme-text-muted)] truncate max-w-[120px]">
          {chipCaption(tier)}
        </span>
      </span>
    </motion.button>
  );
}
