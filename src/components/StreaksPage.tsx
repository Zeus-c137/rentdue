import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "../currency";
import { fetchJsonWithSignal } from "../utils/abortableFetch";
import { formatClock, getTodayKey, getPlatformDayKey, getPlatformDayParts, msUntilPlatformMidnight } from "../utils/runs";
import type { TransactionRow, UserProfile } from "../types";
import dollar3d from "@/src/assets/3d/3dicons-dollar-iso-premium.png";

interface Props {
  phone: string;
  userProfile: UserProfile;
  siteConfig?: any;
  onClaimSuccess?: (p: UserProfile) => void;
  onBack?: () => void;
}

interface Cursor { y: number; m: number; }

/**
 * Streaks page: accrued panel, month panning capped to the join month,
 * and home-style day tiles. Linked from Home's calendar icon and Profile's
 * check-in button — no modals.
 */
export default function StreaksPage({ phone, userProfile, siteConfig, onClaimSuccess, onBack }: Props) {
  const { formatCurrency } = useCurrency();
  const [claimedDays, setClaimedDays] = useState<Set<string>>(new Set());
  const [claimedLedger, setClaimedLedger] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) setNowMs(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = getTodayKey();
  const checkedInToday = userProfile.lastCheckinDate === todayKey;
  const streak = Math.max(0, Number(userProfile.checkinStreak) || 0);
  const base = siteConfig?.checkinBaseBonus ?? 0;
  const inc = siteConfig?.checkinIncrement ?? 0;

  // Ledger truth from daily_checkin_bonus transactions.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchJsonWithSignal<TransactionRow[]>(`/api/profile/transactions/${phone}`, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted || !Array.isArray(rows)) return;
        const days = new Set<string>();
        const ledger: Record<string, number> = {};
        for (const tx of rows) {
          if (String(tx.type || "").toLowerCase() !== "daily_checkin_bonus") continue;
          if (!["SUCCESSFUL", "COMPLETED"].includes(String(tx.status || "").toUpperCase())) continue;
          const ts = new Date(tx.timestamp).getTime();
          if (!Number.isFinite(ts)) continue;
          const key = getPlatformDayKey(new Date(ts));
          days.add(key);
          ledger[key] = (ledger[key] || 0) + (Number(tx.amount) || 0);
        }
        setClaimedDays(days);
        setClaimedLedger(ledger);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [phone]);

  // Bounds: back to the join month (plus one behind when new), forward to today.
  // Platform calendar — the grid lays out platform YMDs.
  const now = new Date();
  const nowPlat = getPlatformDayParts(now);
  const bounds = useMemo(() => {
    const max = { y: nowPlat.y, m: nowPlat.m };
    const joined = new Date(userProfile.createdAt || "").getTime();
    const baseDate = Number.isFinite(joined) ? new Date(joined) : now;
    const basePlat = getPlatformDayParts(baseDate);
    let y = basePlat.y;
    let m = basePlat.m;
    if (y === max.y && m === max.m) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    return { min: { y, m }, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile.createdAt, todayKey]);
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

  const isCurrentMonth = view.y === nowPlat.y && view.m === nowPlat.m;
  const dim = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const monthName = new Date(Date.UTC(view.y, view.m, 1)).toLocaleString("default", { month: "long" });
  const prefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;

  let monthClaimed = 0;
  let monthSum = 0;
  for (const key of claimedDays) {
    if (key.startsWith(prefix)) {
      monthClaimed += 1;
      monthSum += Number(claimedLedger[key]) || 0;
    }
  }

  const todayMs = Date.UTC(nowPlat.y, nowPlat.m, nowPlat.d);
  const tomorrowMs = todayMs + 86400000;
  const nextIn = msUntilPlatformMidnight(nowMs);
  const todayStreak = checkedInToday ? streak : streak + 1;
  const todayAmount = base + (todayStreak - 1) * inc;

  const handleCheckin = async (e?: React.MouseEvent<HTMLElement>) => {
    if (e) e.stopPropagation();
    if (checkedInToday || claimBusy) return;
    setClaimBusy(true);
    try {
      const res = await fetch("/api/user/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check-in failed.");
      const bonus = Number(data.amount ?? data.bonus ?? 0);
      const nextStreak = Number(data.streak ?? streak + 1);
      const key = getTodayKey();
      setClaimedDays((prev) => new Set(prev).add(key));
      setClaimedLedger((prev) => ({ ...prev, [key]: (prev[key] || 0) + bonus }));
      toast.success(bonus > 0 ? `Checked in! +${formatCurrency(bonus)}` : "Checked in! Streak kept alive.");
      if (onClaimSuccess) {
        onClaimSuccess({ ...userProfile, points: (Number(userProfile.points) || 0) + bonus, lastCheckinDate: key, checkinStreak: nextStreak });
      }
    } catch (err: any) {
      toast.error(err.message || "Check-in failed.");
    } finally {
      setClaimBusy(false);
    }
  };

  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length < 42) cells.push(null);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 scrollbar-none min-h-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] flex items-center justify-center text-[var(--theme-text)] cursor-pointer active:scale-95 transition-all shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Flame className="w-8 h-8 text-[var(--theme-primary)] shrink-0" fill="currentColor" />
          <h1 className="font-display font-black text-[26px] leading-none tracking-tight text-[var(--theme-text)]">Streaks</h1>
        </div>

        {/* Accrued — days then amount, follows the viewed month */}
        <div className="px-1 py-1 mt-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-55 leading-none">
            Accrued {isCurrentMonth ? "this month" : monthName}
          </p>
          <p className="text-[13px] font-sans font-black text-[var(--theme-primary)] mt-2">
            {monthClaimed} day{monthClaimed === 1 ? "" : "s"}
          </p>
          <p className="font-display font-black text-2xl text-[var(--theme-text)] tracking-tight leading-none mt-1.5">
            {formatCurrency(monthSum)}
          </p>
          {!checkedInToday && (
            <p className="text-[12px] font-sans font-bold mt-2 tabular-nums text-[var(--theme-primary)]">
              {`Day ${todayStreak} reward • ${formatCurrency(todayAmount)}`}
            </p>
          )}
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-1 gap-2 mt-4 mb-3">
          <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Previous month" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-display font-black text-sm text-[var(--theme-text)] flex-1 text-center">
            {monthName} {view.y}
          </span>
          <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Next month" className="w-9 h-9 rounded-full border border-[var(--theme-card-border)] flex items-center justify-center cursor-pointer disabled:opacity-30 active:scale-95 transition-all"><ChevronRight className="w-4 h-4" /></button>
        </div>

        {/* Home-style day tiles */}
        <div className="rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-3">
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[10px] font-sans font-black opacity-40 py-1">{d}</span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const ms = Date.UTC(view.y, view.m, day);
              const key = new Date(ms).toISOString().split("T")[0];
              const claimed = claimedDays.has(key);
              const isToday = ms === todayMs;
              const isFuture = ms > todayMs;
              const isNext = checkedInToday && ms === tomorrowMs;
              const missed = !isFuture && !isToday && !claimed;
              const dimmed = (missed || isFuture) && !isNext;
              const active = isToday && !claimed;
              const inner = (
                <>
                  <img
                    src={dollar3d}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`w-6 h-6 object-contain ${dimmed ? "grayscale" : ""}`}
                  />
                  {missed && <div className="absolute inset-0 rounded-xl bg-black/45 pointer-events-none" />}
                  <span className={`text-[8px] font-sans font-black uppercase tracking-wide ${claimed || isNext ? "text-[var(--theme-primary)]" : "text-[var(--theme-text-muted)]"}`}>
                    {day}
                  </span>
                </>
              );
              const cls = `relative rounded-xl w-full aspect-[4/5] flex flex-col items-center justify-center gap-0.5 ${
                claimed
                  ? ""
                  : active
                    ? "border border-[var(--theme-primary)]/70 tile-shimmer"
                    : isNext
                      ? "border border-dashed border-[var(--theme-primary)]/70 bg-[var(--theme-primary)]/5 tile-shimmer"
                      : isFuture
                        ? "opacity-40"
                        : ""
              }`;
              return active ? (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => void handleCheckin(e)}
                  disabled={claimBusy}
                  aria-label="Check in today"
                  className={`${cls} cursor-pointer active:scale-95 transition-transform`}
                >
                  {claimBusy ? <span className="text-[10px] font-black text-[var(--theme-primary)]">…</span> : inner}
                </button>
              ) : (
                <div key={key} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] font-sans font-bold opacity-70">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--theme-primary)] shadow-[0_0_6px_var(--theme-primary)]" />Claimed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />Missed</span>
          </div>
          {checkedInToday && (
            <p className="mt-2 text-[12px] font-sans font-bold tabular-nums text-[var(--theme-primary)]">
              Come back in {formatClock(nextIn)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
