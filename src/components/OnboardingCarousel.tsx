/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Onboarding carousel: greyed hero image + headline + CTA, autoplaying.
 * Used at the top of Home (dismissible, takes the Runs slot) and Store.
 */

import React, { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { useReducedMotion } from "../hooks/useReducedMotion";

export interface OnboardingSlide {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
  image?: string;
  ctaLabel?: string;
}

export const DEFAULT_ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    eyebrow: "YOUR NEXT RUN",
    title: <>Rare Collectibles.<br /><span className="text-[var(--theme-primary)]">Real Progress.</span></>,
    sub: "Activate a Run, earn rare virtual collectibles, and they become yours permanently after the cycle.",
    ctaLabel: "Explore Store",
  },
  {
    eyebrow: "YOUR JOURNEY",
    title: <>Milestones that<br /><span className="text-[var(--theme-primary)]">move you up.</span></>,
    sub: "Finish achievements, claim finished runs as collectibles, unlock new stages.",
    ctaLabel: "View Milestones",
  },
  {
    eyebrow: "DAILY HABIT",
    title: <>One tap keeps<br /><span className="text-[var(--theme-primary)]">the streak.</span></>,
    sub: "Check in daily, autocredit runs till the cycle is done, then claim your collectible.",
    ctaLabel: "Start a Run",
  },
];

export default function OnboardingCarousel({
  slides = DEFAULT_ONBOARDING_SLIDES,
  onCta,
  onDismiss,
  dismissLabel = "Dismiss intro",
}: {
  slides?: OnboardingSlide[];
  onCta?: (index: number) => void;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    if (prefersReducedMotion || slides.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % slides.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [prefersReducedMotion, slides.length]);

  const slide = slides[index] || slides[0];
  if (!slide) return null;

  return (
    <section aria-label="Getting started" className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px]">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="absolute right-2.5 top-2.5 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white cursor-pointer active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          className="relative min-h-[232px] p-6 pb-14 flex flex-col justify-end overflow-hidden"
        >
          {slide.image ? (
            <>
              <img
                src={slide.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover grayscale opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10 pointer-events-none" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--theme-primary)]/25 via-transparent to-transparent pointer-events-none" />
          )}
          <div className="relative">
            <p className="text-[10px] font-sans font-black uppercase tracking-[0.18em] text-[var(--theme-text)] opacity-60">
              {slide.eyebrow}
            </p>
            <h2 className="mt-1.5 font-display font-black text-[26px] leading-[1.1] tracking-tight text-white">
              {slide.title}
            </h2>
            <p className="mt-2 text-[13px] font-sans text-white/70 leading-relaxed max-w-[300px]">{slide.sub}</p>
          </div>
          {slide.ctaLabel && (
            <button
              type="button"
              onClick={() => onCta?.(index)}
              className="absolute bottom-3 right-4 z-10 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--theme-primary)] text-[var(--theme-on-primary)] text-[12px] font-sans font-black cursor-pointer active:scale-[0.97] transition-all"
            >
              {slide.ctaLabel} <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          )}
        </motion.div>
      </AnimatePresence>
      {slides.length > 1 && (
        <div className="absolute bottom-3 left-5 z-10 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full cursor-pointer relative"
            >
              {i === index ? (
                <motion.span
                  layoutId={`onboarding-dot-${uid}`}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  className="block h-1.5 w-5 rounded-full bg-[var(--theme-primary)]"
                />
              ) : (
                <span className="block h-1.5 w-1.5 rounded-full bg-white/30" />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
