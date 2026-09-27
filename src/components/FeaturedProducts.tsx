import React, { useRef, useEffect, useMemo } from "react";
import { useGatedInterval } from "../hooks/useGatedInterval";
import { ArrowUpRight, Cpu } from "lucide-react";
import { SubscriptionItem } from "../types";
import { useCurrency } from "../currency";
import heart3d from "@/src/assets/3d/heart.png";

interface FeaturedProductsProps {
  items: SubscriptionItem[];
  onBrowseProducts: () => void;
}

const POPULARITY = ["2.1k+", "1.4k+", "980+", "560+", "310+", "180+"];

export default function FeaturedProducts({ items, onBrowseProducts }: FeaturedProductsProps) {
  const { formatCurrency } = useCurrency();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const featuredItems = useMemo(() => items.filter((item) => !item.disabled && !item.outOfStock).slice(0, 6), [items]);

  const doScroll = () => {
    const el = scrollRef.current;
    if (!el || pausedRef.current || document.visibilityState !== "visible") return;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = 10;
    const step = first ? first.offsetWidth + gap : 212;
    const max = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= max - 4) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: step, behavior: "smooth" });
  };

  useGatedInterval(() => { doScroll(); }, 2800, { enabled: featuredItems.length > 1, visibilityGate: true });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || featuredItems.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let resumeTimer: number | null = null;
    const pause = () => {
      pausedRef.current = true;
      if (resumeTimer) window.clearTimeout(resumeTimer);
    };
    const scheduleResume = () => {
      if (resumeTimer) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => { pausedRef.current = false; }, 3200);
    };
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", scheduleResume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", scheduleResume);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("pointerup", scheduleResume);
    let scrollPause: number | null = null;
    const onScroll = () => {
      if (!pausedRef.current) {
        pause();
        if (scrollPause) window.clearTimeout(scrollPause);
        scrollPause = window.setTimeout(scheduleResume, 3200);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (resumeTimer) window.clearTimeout(resumeTimer);
      if (scrollPause) window.clearTimeout(scrollPause);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", scheduleResume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", scheduleResume);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("pointerup", scheduleResume);
      el.removeEventListener("scroll", onScroll);
    };
  }, [featuredItems.length]);

  if (featuredItems.length === 0) return null;

  return (
    <section className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-3 sm:p-4 space-y-3" aria-labelledby="trending-products-title">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-1.5">
            <img src={heart3d} alt="" loading="lazy" decoding="async" className="w-4 h-4 object-contain" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--theme-primary)]">Trending products</span>
          </div>
          <h2 id="trending-products-title" className="text-[15px] font-black text-[var(--theme-text)] mt-0.5 leading-tight">
            Most chosen this week
          </h2>
        </div>
        <button
          type="button"
          onClick={onBrowseProducts}
          className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--theme-primary)] hover:opacity-75 transition-opacity cursor-pointer shrink-0"
        >
          Browse all <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-1 px-1 pb-1 touch-pan-x overscroll-x-contain" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {featuredItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={onBrowseProducts}
            className="shrink-0 w-[200px] sm:w-[220px] snap-start rounded-[var(--theme-radius)] border-0 bg-transparent overflow-hidden text-left cursor-pointer group transition-colors flex flex-col shadow-sm"
            aria-label={`View ${item.name}`}
          >
            <div
              className="relative h-32 sm:h-40 bg-transparent overflow-hidden shrink-0 p-3 flex items-center justify-center"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--theme-primary)] opacity-40">
                  <Cpu className="w-8 h-8" />
                </div>
              )}
              <span className="absolute top-2 right-2 rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-black flex items-center gap-1 shadow-sm">
                <img src={heart3d} alt="" className="w-3 h-3 object-contain shrink-0" /> {POPULARITY[index] ?? "100+"}
              </span>
            </div>
            <div className="p-2.5 flex flex-col gap-1.5 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[var(--theme-text)] leading-tight line-clamp-1 flex-1 min-w-0">{item.name}</h3>
                <span className="shrink-0 rounded-full bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)] px-2 py-0.5 text-[10px] font-black text-[var(--theme-text)] opacity-60">
                  {item.duration} days
                </span>
              </div>
              <div className="rounded-[calc(var(--theme-radius)-4px)] bg-[var(--theme-card-bg)]/90 backdrop-blur-xl border border-[var(--theme-card-border)]/60 px-2.5 py-2">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-50 leading-none">You withdraw</p>
                <p className="text-[12px] font-black text-[var(--theme-primary)] leading-none mt-1 truncate">{formatCurrency(item.dailyYield)}<span className="font-bold opacity-70"> / day</span></p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
