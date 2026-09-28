import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight, Loader2, Flame } from "lucide-react";
import { useCurrency } from "../currency";
import { formatClock, getPlatformDayParts, msUntilPlatformMidnight } from "../utils/runs";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";

export interface CheckinSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current streak (claimed days in the live run). */
  streak: number;
  checkedInToday: boolean;
  baseBonus: number;
  increment: number;
  /** Join date caps backward panning (plus one month behind when new). */
  createdAt?: string;
  /** Ledger truth (UTC ISO day keys). Null = run-based current-month fallback. */
  claimedDays?: Set<string> | null;
  /** Per-day claimed amounts (UTC ISO day keys) for the accrued panel. */
  claimedLedger?: Record<string, number> | null;
  /** Run-mode only: first claimed day-of-month of the live run. */
  runStartDay?: number;
  claiming?: boolean;
  onClaimToday?: (e: React.MouseEvent<HTMLElement>) => void;
}

interface Cursor { y: number; m: number; }

/**
 * Shared Daily check-in sheet: hero payout, month calendar with panning,
 * tap-today-to-claim. Used by Profile and Home.
 */
export default function CheckinSheet({
  open,
  onClose,
  streak,
  checkedInToday,
  baseBonus,
  increment,
  createdAt,
  claimedDays = null,
  claimedLedger = null,
  runStartDay = 1,
  claiming = false,
  onClaimToday,
}: CheckinSheetProps) {
  const { formatCurrency } = useCurrency();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  useEffect(() => { if (open) setCursor(null); }, [open]);
  // Countdown heartbeat while the sheet is open.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const today = useMemo(() => {
    const { y, m, d } = getPlatformDayParts();
    return { y, m, d };
  }, [open]);

  const bounds = useMemo(() => {
    const max = { y: today.y, m: today.m };
    const joined = new Date(createdAt || "").getTime();
    const base = Number.isFinite(joined) ? new Date(joined) : new Date();
    const basePlat = getPlatformDayParts(base);
    let y = basePlat.y;
    let m = basePlat.m;
    if (y === max.y && m === max.m) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    return { min: { y, m }, max };
  }, [createdAt, today]);

  const view = cursor || bounds.max;
  const atMin = view.y < bounds.min.y || (view.y === bounds.min.y && view.m <= bounds.min.m);
  const atMax = view.y > bounds.max.y || (view.y === bounds.max.y && view.m >= bounds.max.m);
  const step = (delta: number) => {
    let y = view.y;
    let m = view.m + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    const { min, max } = bounds;
    if (y < min.y || (y === min.y && m < min.m)) return;
    if (y > max.y || (y === max.y && m > max.m)) return;
    setCursor({ y, m });
  };

  const todayStreak = checkedInToday ? streak : streak + 1;
  const todayAmount = baseBonus + (todayStreak - 1) * increment;
  const isCurrentMonth = view.y === today.y && view.m === today.m;

  const { dim, lead, monthClaimed, monthSum, monthName } = useMemo(() => {
    const dimCount = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const leadCount = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    const prefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
    let claimed = 0;
    let sum = 0;
    if (claimedDays) {
      for (const key of claimedDays) {
        if (key.startsWith(prefix)) claimed += 1;
      }
      if (claimedLedger) {
        for (const [key, amount] of Object.entries(claimedLedger)) {
          if (key.startsWith(prefix)) sum += Number(amount) || 0;
        }
      }
    } else if (isCurrentMonth) {
      for (let d = 1; d <= today.d; d += 1) {
        if (d >= runStartDay && (d < today.d || checkedInToday)) claimed += 1;
      }
    }
    return {
      dim: dimCount,
      lead: leadCount,
      monthClaimed: claimed,
      monthSum: sum,
      monthName: new Date(Date.UTC(view.y, view.m, 1)).toLocaleString("default", { month: "long" }),
    };
  }, [view, claimedDays, claimedLedger, isCurrentMonth, runStartDay, today.d, checkedInToday]);

  const nextIn = useMemo(() => msUntilPlatformMidnight(nowMs), [nowMs]);

  const dayState = (dayNum: number): { claimed: boolean; missed: boolean; isToday: boolean; isFuture: boolean } => {
    const isToday = isCurrentMonth && dayNum === today.d;
    const isFuture = view.y > today.y || (view.y === today.y && (view.m > today.m || (view.m === today.m && dayNum > today.d)));
    let claimed: boolean;
    if (claimedDays) {
      claimed = claimedDays.has(`${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`);
    } else {
      claimed = isCurrentMonth && !isFuture && dayNum >= runStartDay && (!isToday || checkedInToday);
    }
    return { claimed, missed: !isFuture && !isToday && !claimed, isToday, isFuture };
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-xs"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.94, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 15, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            className="relative w-full max-w-[440px] max-h-[90vh] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] rounded-[24px] shadow-2xl text-[var(--theme-text)] text-left flex flex-col overflow-hidden backdrop-blur-xl"
          >
            {/* Top Banner - streak identity */}
            <div className=" relative px-5 py-4 text-[var(--theme-text)] flex flex-col gap-3 shrink-0">
              <button
                onClick={onClose}
                className="absolute right-4 top-4 text-[var(--theme-text)] opacity-60 hover:opacity-100 p-2 rounded-full hover:bg-[var(--theme-bg)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Flame className="w-11 h-11 text-[var(--theme-primary)] shrink-0" fill="currentColor" />
                <h3 className="font-display font-black text-xl tracking-tight text-[var(--theme-text)] leading-none">Streaks</h3>
              </div>
            </div>

            <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-5 scrollbar-none">
              {/* Accrued this month — days then amount, follows the viewed month */}
              <div className="px-1 py-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-55 leading-none">
                  Accrued {isCurrentMonth ? "this month" : monthName}
                </p>
                <p className="text-[13px] font-sans font-black text-[var(--theme-primary)] mt-2">
                  {monthClaimed} day{monthClaimed === 1 ? "" : "s"}
                </p>
                {claimedLedger && (
                  <p className="font-display font-black text-2xl text-[var(--theme-text)] tracking-tight leading-none mt-1.5">
                    {formatCurrency(monthSum)}
                  </p>
                )}
                <p className={`text-[12px] font-sans font-bold mt-2 tabular-nums ${checkedInToday ? "text-[var(--theme-text)] opacity-70" : "text-[var(--theme-primary)]"}`}>
                  {checkedInToday ? `Next check-in ${formatClock(nextIn)}` : `Day ${todayStreak} reward • ${formatCurrency(todayAmount)}`}
                </p>
              </div>

              {/* Month & Count Header */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 gap-2">
                  <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Previous month" className="w-8 h-8 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="font-display font-black text-sm text-[var(--theme-text)] flex-1 text-center">
                    {monthName} {view.y}
                  </span>
                  <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Next month" className="w-8 h-8 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronRight className="w-4 h-4" /></button>
                </div>

                {/* Calendar Grid — bare tiles on the modal */}
                <div className="rounded-2xl p-2.5 space-y-1.5">
                  {/* Weekdays Row */}
                  <div className="grid grid-cols-7 gap-1 text-center font-sans font-bold text-[10px] text-[var(--theme-text)] opacity-60 pb-1">
                    <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Empty offset slots */}
                    {Array.from({ length: lead }).map((_, i) => (
                      <div key={`empty-${i}`} className="w-full aspect-square" />
                    ))}

                    {/* Day cards 1 to daysInMonth */}
                    {Array.from({ length: dim }).map((_, i) => {
                      const dayNum = i + 1;
                      const { claimed, missed, isToday, isFuture } = dayState(dayNum);
                      const claimable = isToday && !checkedInToday && !claiming;

                      return (
                        <div
                          key={`day-${dayNum}`}
                          onClick={(e) => {
                            if (claimable && onClaimToday) {
                              onClaimToday(e as unknown as React.MouseEvent<HTMLElement>);
                            }
                          }}
                            className={`aspect-square rounded-xl relative flex items-center justify-center transition-all select-none ${
                            claimable ? "cursor-pointer ring-2 ring-[var(--theme-primary)] bg-[var(--theme-primary)]/10 tile-shimmer overflow-hidden" : ""
                          }`}
                        >
                          {claiming && isToday ? (
                            <Loader2 className="w-5 h-5 animate-spin text-[var(--theme-primary)]" />
                          ) : (
                            <img
                              src={dollar3d}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className={`w-9 h-9 object-contain drop-shadow ${
                                claimable
                                  ? "animate-pulse"
                                  : claimed
                                    ? ""
                                    : missed
                                      ? "opacity-60"
                                      : "opacity-40 saturate-50"
                              }`}
                            />
                          )}
                          {missed && (
                            <div className="absolute inset-0 rounded-xl bg-red-500/45 pointer-events-none" />
                          )}
                        </div>
                      );
                    })}
                    {/* Trailing blanks lock the grid to 6 rows so 30/31-day months never shift layout */}
                    {Array.from({ length: Math.max(0, 42 - lead - dim) }).map((_, i) => (
                      <div key={`tail-${i}`} className="w-full aspect-square" />
                    ))}
                  </div>
                  <div className="flex items-center gap-4 pt-1 text-[11px] font-sans font-bold opacity-70">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--theme-primary)] shadow-[0_0_6px_var(--theme-primary)]" />Claimed</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />Missed</span>
                  </div>
                </div>
              </div>
              {/* Tiles handle claim directly */}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
