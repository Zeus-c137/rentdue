import { motion, AnimatePresence } from "motion/react";
import { useCurrency } from "@/src/currency";
import { formatPhoneMasked } from "@/src/utils/referral";
import type { ReferralStat, SiteConfig } from "@/src/types";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/src/components/BrandLogo";
import { getDrag, getInitial, getExit, getSpring } from "@/src/utils/motion";
import link3d from "@/src/assets/3d/3dicons-link-iso-premium.png";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

type Props = {
  stats: ReferralStat[];
  isLoading: boolean;
  activeLevel: 1 | 2 | 3 | 4;
  onActiveLevelChange: (l: 1 | 2 | 3 | 4) => void;
  activeLevelStats: ReferralStat[];
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
};

function formatJoinedDate(v?: string): string {
  if (!v) return "Recently";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return v;
  }
}

function TeamSummaryStrip({
  stats,
  isLoading,
}: {
  stats: ReferralStat[];
  isLoading: boolean;
}) {
  const { formatCurrency } = useCurrency();
  const total = stats.reduce((s, r) => s + Number((r as { rewardAmount?: unknown }).rewardAmount || 0), 0);
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[var(--theme-primary)]/15 via-[var(--theme-primary)]/[0.07] to-transparent border border-[var(--theme-primary)]/20 px-5 py-4 flex items-center justify-between gap-3">
      {isLoading ? (
        <>
          <div className="h-7 w-28 bg-[var(--theme-card-border)]/40 rounded-lg animate-pulse" />
          <div className="h-7 w-36 bg-[var(--theme-card-border)]/40 rounded-lg animate-pulse" />
        </>
      ) : (
        <>
          <p className="font-display font-black text-[22px] leading-none tracking-tight">
            {stats.length} <span className="text-[15px] opacity-60">{stats.length === 1 ? "invite" : "invites"}</span>
          </p>
          <strong className="font-display font-black text-[22px] leading-none tracking-tight text-[var(--theme-primary)] shrink-0">{formatCurrency(total)}</strong>
        </>
      )}
    </div>
  );
}

function LevelTabs({
  activeLevel,
  onChange,
}: {
  activeLevel: number;
  onChange: (l: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="flex justify-center gap-1 overflow-x-auto scrollbar-none pb-1 px-1 border-b border-[var(--theme-card-border)]">
      {[1, 2, 3, 4].map((lvl) => (
        <button
          key={lvl}
          onClick={() => onChange(lvl as 1 | 2 | 3 | 4)}
          className={`px-4 py-2.5 relative text-xs font-black uppercase tracking-wider shrink-0 transition-colors cursor-pointer ${activeLevel === lvl ? "text-[var(--theme-text)]" : "text-[var(--theme-text)] opacity-50 hover:opacity-100"}`}
        >
          Level {lvl}
          {activeLevel === lvl && <span className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-[var(--theme-primary)] rounded-full" />}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ stat, siteConfig }: { stat: ReferralStat; siteConfig?: SiteConfig | null; key?: unknown }) {
  const { formatCurrency } = useCurrency();
  const masked = formatPhoneMasked(stat.phone ?? "");
  const activeCount = Number((stat as { activeProductsCount?: unknown }).activeProductsCount || 0);
  return (
    <div className="rounded-2xl bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] p-3 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-full shrink-0 overflow-hidden">
          <BrandLogo siteConfig={siteConfig} className="w-full h-full flex items-center justify-center" />
        </span>
        <div className="min-w-0">
          <span className="font-bold truncate block">{masked}</span>
          <span className="text-[10px] opacity-50 block mt-0.5">Joined {formatJoinedDate(stat.joinedDate)}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="font-bold font-mono text-[13px] text-[var(--theme-primary)] block">{formatCurrency(Number((stat as { rewardAmount?: unknown }).rewardAmount || 0))}</span>
        <span className="text-[10px] opacity-50 block mt-0.5">{activeCount} active {activeCount === 1 ? "run" : "runs"}</span>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[64px] rounded-[var(--theme-radius)] bg-[var(--theme-card-border)]/30 animate-pulse border border-[var(--theme-card-border)]"
        />
      ))}
    </div>
  );
}

function EmptyState({ level }: { level: number }) {
  return (
    <div className="min-h-[440px] flex flex-col items-center justify-center text-center py-8">
      <img src={link3d} alt="" loading="lazy" decoding="async" className="w-16 h-16 object-contain opacity-80" />
      <p className="text-xs font-semibold tracking-wide mt-3">No invites · Level {level}</p>
      <p className="text-[11px] opacity-50 mt-1">Share invite link</p>
    </div>
  );
}

function FilteredList({
  isLoading,
  filtered,
  activeLevel,
  siteConfig,
}: {
  isLoading: boolean;
  filtered: ReferralStat[];
  activeLevel: number;
  siteConfig?: SiteConfig | null;
}) {
  if (isLoading) return <ListSkeleton />;
  if (filtered.length === 0) return <EmptyState level={activeLevel} />;
  return (
    <div className="space-y-2">
      {filtered.map((s, idx) => (
        <MemberRow key={`${s.phone ?? idx}-${idx}`} stat={s} siteConfig={siteConfig} />
      ))}
    </div>
  );
}

export default function InviteTeamView({ stats, isLoading, activeLevel, onActiveLevelChange, activeLevelStats, siteConfig }: Props) {
  const reduced = useReducedMotion();
  const spring = getSpring(reduced);
  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-transparent p-1 text-[var(--theme-text)] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-black text-[19px] leading-tight tracking-tight">My Team</h3>
          <p className="text-[11px] font-semibold opacity-50 mt-0.5 leading-relaxed">Everyone who joined with your code, and what their runs earn you.</p>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--theme-primary)] shrink-0" />}
      </div>
      <TeamSummaryStrip stats={stats} isLoading={isLoading} />
      <LevelTabs activeLevel={activeLevel} onChange={onActiveLevelChange} />
      <motion.div drag={getDrag(reduced)} dragElastic={0.2} dragConstraints={{ top: 0, bottom: 0 }} className="flex-1 overflow-y-auto overscroll-contain space-y-2 pb-8 scrollbar-none min-h-[520px] select-text" transition={spring}>
        <AnimatePresence mode="wait"><motion.div key={`level-${activeLevel}-${String(isLoading)}`} initial={getInitial(reduced)} animate={{ opacity: 1, y: 0 }} exit={getExit(reduced)} transition={spring} className="space-y-2"><FilteredList isLoading={isLoading} filtered={activeLevelStats} activeLevel={activeLevel} siteConfig={siteConfig} /></motion.div></AnimatePresence>
      </motion.div>
    </div>
  );
}
