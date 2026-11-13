/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The home page's first-run slot: not an empty state, a featured shelf.
 *
 * A new user has no bots, so the honest thing to show is the thing they came
 * for — real bots from the catalog, presented well enough to be worth tapping.
 * The shelf is a stack you push with your thumb: drag or flick anywhere on the
 * card and the product information swaps in behind it. There are deliberately no
 * dots and no arrows — the card behaves like a stack of cards, so shoving it is
 * the whole affordance, and the bot underneath is the hint that it moves.
 *
 * The shelf leans towards the user rather than showing everything: bots they can
 * afford are dealt first, then the rest by price, so the top card is always
 * something they can act on. When nothing is affordable the action row says so
 * and the tap goes to the deposit flow instead.
 */

import React, { useMemo, useRef, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { motion } from "motion/react";
import { SubscriptionItem } from "../types";
import { useCurrency } from "../currency";
import { taglineForItem } from "../utils/rarity";
import FloatingProduct from "./FloatingProduct";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface FeaturedBotCardProps {
  items: SubscriptionItem[];
  /** Trading capital available to deploy. */
  capital: number;
  /** False while the catalog is still loading — the shelf holds its shape. */
  ready: boolean;
  /** True when the home tab is on screen and the art may animate. */
  active: boolean;
  /** Reduced motion. */
  still: boolean;
  onOpenItem: (item: SubscriptionItem) => void;
  onOpenCatalog: () => void;
  onOpenDeposit: () => void;
}

function dailyPercent(item: SubscriptionItem): string {
  const amount = Number(item.amount || 0);
  if (!(amount > 0)) return "\u2014";
  const pct = (Number(item.dailyYield || 0) / amount) * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export default function FeaturedBotCard({
  items,
  capital,
  ready,
  active,
  still,
  onOpenItem,
  onOpenCatalog,
  onOpenDeposit,
}: FeaturedBotCardProps) {
  const { formatCurrency } = useCurrency();
  // The carousel is the throw; reduced motion keeps the control and drops the
  // ride, so the slide simply swaps.
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  // Bumped on every commit so the incoming slide knows which side it came from.
  const [dir, setDir] = useState(1);
  const [seq, setSeq] = useState(0);
  // True between the first pixel of travel and the click that ends the gesture,
  // so a swipe that finishes on top of the card never opens the bot.
  const draggingRef = useRef(false);

  // Affordable bots first, then the rest by price. Stable: ties break on id so
  // the shelf never reshuffles between renders.
  const shelf = useMemo(() => {
    const live = items.filter((i) => !i.outOfStock && !i.disabled);
    if (live.length === 0) return [];
    return [...live].sort((a, b) => {
      const aCost = Number(a.amount || 0);
      const bCost = Number(b.amount || 0);
      const aFits = aCost <= capital ? 0 : 1;
      const bFits = bCost <= capital ? 0 : 1;
      if (aFits !== bFits) return aFits - bFits;
      if (aCost !== bCost) return aCost - bCost;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [items, capital]);

  const count = shelf.length;
  // Guards against a shrinking catalog leaving the index out of range.
  const at = count > 0 ? ((index % count) + count) % count : 0;
  const featured = count > 0 ? shelf[at] : null;

  const go = (delta: number) => {
    if (count < 2) return;
    setDir(delta);
    setIndex((i) => (((i + delta) % count) + count) % count);
    setSeq((s) => s + 1);
  };

  if (!ready) {
    return <div className="mt-[22px] h-[212px] rounded-[26px] border border-white/10 bg-[var(--theme-card-bg)]/40 animate-pulse" />;
  }

  if (!featured) {
    return (
      <section className="mt-[22px] rounded-[26px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-5 text-center">
        <p className="font-display font-black text-lg">The shelf is being restocked.</p>
        <p className="mt-1.5 text-[13px] font-sans text-[var(--theme-text-muted)]">
          No bots are available right now. Check back shortly.
        </p>
        <button
          type="button"
          onClick={onOpenCatalog}
          className="pressable mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-6 py-3.5 text-[15px] font-sans font-bold text-[var(--theme-on-primary)]"
        >
          Open the catalog <ArrowRight className="h-4 w-4" strokeWidth={3} />
        </button>
      </section>
    );
  }

  const perDay = Number(featured.dailyYield || 0);
  const days = Number(featured.duration || 0);
  const totalReturn = perDay * days;
  const affordable = Number(featured.amount || 0) <= capital;
  const glide = !reduceMotion;
  // The card in front sits a few pixels up and slightly larger than the one
  // behind it, so the shelf reads as a stack before it is even touched.
  const front = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  const back = { x: 16, y: 8, scale: 0.94, rotate: 2.5, opacity: 0.55 };
  const open = () => {
    if (draggingRef.current) return;
    onOpenItem(featured);
  };

  return (
    <section className="relative mt-[48px] overflow-hidden rounded-[26px] border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%]">
      {/* Shelf light: depth only, no motion. Sits under the art so the product
          reads as lit from above rather than pasted on. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(100% 100% at 50% 0%, color-mix(in srgb, var(--theme-primary) 20%, transparent), transparent 72%)",
        }}
      />

      {/* The swipe surface is the whole offer — art, title and numbers — because
          that is where a thumb lands. The drag is elastic and momentum-free: it
          follows the finger for feedback, then the release decides whether to
          commit, so the card can never come to rest between two bots. The
          vertical axis is left to the page so the dashboard still scrolls. */}
      <motion.div
        drag={count > 1 ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        dragMomentum={false}
        onDragStart={() => {
          draggingRef.current = true;
        }}
        onDragEnd={(_, info) => {
          // The click that follows this pointerup is dispatched before this
          // timeout runs, so the guard is still up when it arrives.
          setTimeout(() => {
            draggingRef.current = false;
          }, 0);
          const flung = Math.abs(info.offset.x) > 900;
          if (info.offset.x < -52 || (flung && info.offset.x < -12 && info.velocity.x < 0)) go(1);
          else if (info.offset.x > 52 || (flung && info.offset.x > 12 && info.velocity.x > 0)) go(-1);
        }}
        className="relative cursor-grab touch-pan-y active:cursor-grabbing"
      >
        <div className="relative flex items-start justify-between gap-2 px-4 pt-4">
          <div className="min-w-0">
            <p className="text-[10px] font-sans font-black uppercase tracking-[0.16em] text-[var(--theme-primary)]">
              Featured bot
            </p>
            <h2 className="mt-1 truncate font-display text-[19px] font-black leading-tight tracking-tight">
              {featured.name}
            </h2>
          </div>
          <p className="font-display text-[15px] font-black leading-none tabular-nums text-[var(--theme-primary)]">
            {dailyPercent(featured)} per day
          </p>
        </div>

        <div className="relative mt-1">
          {/* The next bot, peeking out from under the top card. Only transform
              and opacity move, and it never fades through zero, which would read
              as the shelf blinking rather than dealing. */}
          {count > 1 && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-2 h-[150px] rounded-[22px] border border-white/5 bg-[var(--theme-card-bg)]/40"
              animate={back}
              transition={{ duration: glide ? 0.26 : 0, ease: [0.23, 1, 0.32, 1] }}
            />
          )}

          {/* Keying on the bot remounts the slide, so the float loop restarts
              cleanly instead of inheriting the last slide's position, and the
              incoming card always arrives from the side the finger pushed. */}
          <motion.div
            key={`${featured.id}-${seq}`}
            initial={glide ? { x: dir * 34, opacity: 0, scale: 0.96 } : false}
            animate={front}
            transition={glide ? { type: "spring", stiffness: 380, damping: 34, mass: 0.7 } : { duration: 0 }}
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenItem(featured);
              }
            }}
            aria-label={`${featured.name} — ${taglineForItem(featured)}. Open details.`}
            className="group relative block w-full border-0 bg-transparent p-0 text-left"
          >
            <FloatingProduct
              src={featured.imageUrl}
              alt={featured.name}
              active={active}
              still={still}
              width={720}
              className="mx-auto h-[150px] w-full max-w-[280px] px-9 pb-1  [--float-drift:26px]"
              imgClassName="drop-shadow-[0_16px_28px_rgba(0,0,0,0.35)]"
            />
          </motion.div>
        </div>

        <div className="relative px-4 pb-4">
          <p className="text-center text-[12px] font-sans text-[var(--theme-text-muted)]">
            {taglineForItem(featured)}
          </p>

          {/* The item's own numbers, so the card is a real offer and not a banner. */}
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl px-2 py-2.5 text-center">
              <p className="truncate font-display text-[15px] font-black leading-none tabular-nums">
                {formatCurrency(Number(featured.amount || 0))}
              </p>
              <p className="mt-1.5 text-[9.5px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                Price
              </p>
            </div>
            <div className="rounded-2xl px-2 py-2.5 text-center">
              <p className="font-display text-[15px] font-black leading-none tabular-nums">
                {days || "\u2014"}
                <span className="ml-0.5 text-[10px] font-bold opacity-60">{days ? "d" : ""}</span>
              </p>
              <p className="mt-1.5 text-[9.5px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                Cycle
              </p>
            </div>
            <div className="rounded-2xl px-2 py-2.5 text-center">
              <p className="truncate font-display text-[15px] font-black leading-none tabular-nums">
                {formatCurrency(totalReturn)}
              </p>
              <p className="mt-1.5 text-[9.5px] font-sans font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">
                Total return
              </p>
            </div>
          </div>

          {/* One primary action. Unaffordable reads as an invitation to top up
              rather than a dead button. */}
          {affordable ? (
            <button
              type="button"
              onClick={open}
              className="pressable tile-shimmer relative mt-3.5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[var(--theme-primary)] px-5 py-3.5 text-[14.5px] font-sans font-black text-[var(--theme-on-primary)]"
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
              Start for {formatCurrency(Number(featured.amount || 0))}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenDeposit}
              className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--theme-primary)] px-5 py-3.5 text-[14.5px] font-sans font-black text-[var(--theme-on-primary)]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.6} />
              Add capital to start
            </button>
          )}
        </div>
      </motion.div>
    </section>
  );
}