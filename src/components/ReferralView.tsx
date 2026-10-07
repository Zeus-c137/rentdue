import React, { useCallback, useEffect, useState } from "react";
import { Copy, Users, ArrowLeft, Check, Link2 } from "lucide-react";
import { useCurrency } from "@/src/currency";
import { Button } from "@/src/components/ui/button";
import {
  getLevelMetrics,
  getActiveLevelStats,
  buildInviteLink,
  shouldApplyConfig,
  toReferralList,
} from "@/src/utils/referral";
import { useClipboard } from "@/src/hooks/useClipboard";
import { useAbortSignal, useGatedInterval } from "@/src/hooks/useGatedInterval";
import { fetchJsonWithSignal } from "@/src/utils/api";
import InviteTeamView from "@/src/components/InviteTeamView";
import { motion, AnimatePresence } from "motion/react";
import { POLL_INTERVAL_MS, getViewMotion } from "@/src/utils/motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { BrandLogo } from "@/src/components/BrandLogo";
import type { ReferralStat, SiteConfig, UserProfile } from "@/src/types";

type Props = {
  userProfile: UserProfile;
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
  initialView?: View;
};

type View = "overview" | "team";

function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-[var(--theme-radius)] border border-amber-500/20 bg-[var(--theme-card-bg)] px-4 py-3 text-xs font-semibold text-[var(--theme-text)]">
      {msg}
    </div>
  );
}

/* ---------------------------------- hero ---------------------------------- */

type HeroProps = {
  inviteCode: string;
  inviteLink: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  topPct: number;
  siteConfig?: SiteConfig | null;
};

function InviteHero({ inviteCode, inviteLink, copiedLink, onCopyLink, copiedCode, onCopyCode, topPct, siteConfig }: HeroProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-1.5">

          <h2 className="text-center font-display font-black text-[26px] leading-[1.05] tracking-tight">
            Invite friends.<br />Earn together.
          </h2>
          <p className="text-center text-xs font-semibold opacity-60 leading-relaxed">
            Earn up to {topPct}% team income every time your network claims, paid across 4 levels.
          </p>
        </div>

        {/* invite code */}
        <button
          onClick={onCopyCode}
          className="group flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-0 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--theme-primary)] opacity-75 transition-opacity group-hover:opacity-100">
            <Link2 className="w-4 h-4" />
          </span>
          <span className="min-w-0 text-left flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] opacity-50">Your invite code</span>
            <span className="block font-mono font-black text-xl tracking-[0.2em] truncate">{inviteCode || "N/A"}</span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--theme-primary)] opacity-75 transition-opacity group-hover:opacity-100">
            {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </span>
        </button>

        {/* invite link */}
        <div className="flex items-center gap-2 py-1.5">
          <Link2 className="w-3.5 h-3.5 opacity-40 shrink-0" />
          <p className="text-[11px] font-mono opacity-70 truncate flex-1 select-text select-all">{inviteLink || "No link"}</p>
          <button
            onClick={onCopyLink}
            aria-label="Copy invite link"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[var(--theme-primary)] opacity-75 transition-opacity hover:opacity-100"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

      </div>
    </section>
  );
}

/* ------------------------------ earnings + levels -------------------------- */

function EarningsHeader({
  amount,
  isLoading,
  onViewTeam,
}: {
  amount: number;
  isLoading: boolean;
  onViewTeam: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const [intro, setIntro] = useState(true);
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p onAnimationEnd={() => setIntro(false)} className={`text-[10px] font-black uppercase tracking-[0.14em] opacity-50${intro ? " animate-shimmer-slow" : ""}`}>
          Team income
        </p>
        {isLoading ? (
          <div className="h-8 w-36 bg-[var(--theme-card-border)]/40 rounded-xl animate-pulse mt-1.5" />
        ) : (
          <strong onAnimationEnd={() => setIntro(false)} className={`block font-display font-black text-[30px] leading-none tracking-tight text-[var(--theme-primary)] mt-1${intro ? " animate-shimmer-slow" : ""}`}>
            {formatCurrency(Number(amount || 0))}
          </strong>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onViewTeam} className="shrink-0 border border-[var(--theme-primary)]/45 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/5">
        <Users className="w-4 h-4" /> Invites
      </Button>
    </div>
  );
}

function LevelGrid({
  metrics,
  isLoading,
}: {
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
}) {
  return (
    <section>
      <h3 className="font-display font-black text-[11px] uppercase tracking-[0.14em] opacity-50">Commission by level</h3>
      <div className="mt-3">
        {metrics.map((m) => {
          const live = m.pct > 0;
          return (
            <div key={m.level} className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1">
              <div>
                <p className="font-display text-[13px] font-bold">Level {m.level}</p>
                <p className="mt-0.5 text-[10px] text-[var(--theme-text)] opacity-50">Commission rate</p>
              </div>
              {isLoading ? <div className="h-5 w-12 animate-pulse rounded bg-[var(--theme-card-border)]/40" /> : <span className={`font-display text-[18px] font-black tabular-nums ${live ? "text-[var(--theme-primary)]" : "opacity-40"}`}>{m.pct}%</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type OverviewProps = {
  inviteLink: string;
  inviteCode: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  referralRewardsEarned: number;
  onViewTeam: () => void;
  siteConfig?: SiteConfig | null;
};

function OverviewView({ inviteLink, inviteCode, copiedLink, onCopyLink, copiedCode, onCopyCode, metrics, isLoading, referralRewardsEarned, onViewTeam, siteConfig }: OverviewProps) {
  const topPct = Math.max(0, ...metrics.map((m) => m.pct));
  return (
    <div className="space-y-5">
      <InviteHero
        inviteCode={inviteCode}
        inviteLink={inviteLink}
        copiedLink={copiedLink}
        onCopyLink={onCopyLink}
        copiedCode={copiedCode}
        onCopyCode={onCopyCode}
        topPct={topPct}
        siteConfig={siteConfig}
      />
      <div className="space-y-3">
        <EarningsHeader amount={referralRewardsEarned} isLoading={isLoading} onViewTeam={onViewTeam} />
        <LevelGrid metrics={metrics} isLoading={isLoading} />
      </div>
    </div>
  );
}

/* --------------------------------- fetching -------------------------------- */

function useReferralFetch(phone: string, initialConfig?: SiteConfig | null) {
  const [stats, setStats] = useState<ReferralStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [liveSiteConfig, setLiveSiteConfig] = useState<SiteConfig | null>(initialConfig ?? null);
  const { renew } = useAbortSignal();
  const load = useCallback(async () => {
    const sig = renew(); setIsLoading(true);
    try {
      const ref = await fetchJsonWithSignal<ReferralStat[]>(`/api/profile/referrals/${phone}`, sig);
      const cfg = await fetchJsonWithSignal<SiteConfig>("/api/config/site", sig);
      if (sig.aborted) return;
      setStats(toReferralList(ref));
      if (shouldApplyConfig(cfg)) setLiveSiteConfig(cfg);
      setLoadError("");
    } catch (e) {
      const err = e as Error;
      if (err?.name !== "AbortError") setLoadError(err.message || "Referral data unavailable.");
    } finally { if (!sig.aborted) setIsLoading(false); }
  }, [phone, renew]);
  useEffect(() => { void load(); }, [load]);
  useGatedInterval(load, POLL_INTERVAL_MS, { enabled: !!phone, visibilityGate: true, runOnVisible: true });
  return { stats, isLoading, loadError, liveSiteConfig };
}

export default function ReferralView({ userProfile, siteConfig, onBack, initialView = "overview" }: Props) {
  const { stats, isLoading, loadError, liveSiteConfig } = useReferralFetch(userProfile.phone, siteConfig ?? null);
  const { copied: copiedLink, copy: copyLink } = useClipboard();
  const { copied: copiedCode, copy: copyCode } = useClipboard();
  const [view, setView] = useState<View>(initialView);
  useEffect(() => { setView(initialView); }, [initialView]);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const inviteCode = userProfile.inviteCode || "";
  const inviteLink = buildInviteLink(inviteCode);
  const levelMetrics = getLevelMetrics(stats, liveSiteConfig ?? siteConfig);
  const activeLevelStats = getActiveLevelStats(stats, activeLevel);
  const reduced = useReducedMotion();
  const viewMotion = getViewMotion(reduced);
  const viewElements: Record<View, React.ReactElement> = {
    overview: <OverviewView inviteLink={inviteLink} inviteCode={inviteCode} copiedLink={copiedLink} onCopyLink={() => copyLink(inviteLink)} copiedCode={copiedCode} onCopyCode={() => copyCode(inviteCode)} metrics={levelMetrics} isLoading={isLoading} referralRewardsEarned={Number(userProfile.referralRewardsEarned || 0)} onViewTeam={() => setView("team")} siteConfig={liveSiteConfig ?? siteConfig} />,
    team: <InviteTeamView stats={stats} isLoading={isLoading} activeLevel={activeLevel} onActiveLevelChange={setActiveLevel as (l: 1 | 2 | 3 | 4) => void} activeLevelStats={activeLevelStats} siteConfig={liveSiteConfig ?? siteConfig} />,
  };
  return (
    <div className="min-h-full w-full space-y-5 rounded-[28px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-4 pb-16 text-[var(--theme-text)] shadow-sm backdrop-blur-[20px] backdrop-saturate-[180%] sm:p-5">
      {(onBack || view === "team") && <button type="button" onClick={() => view === "team" ? setView("overview") : onBack?.()} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-xs font-semibold text-[var(--theme-text)] opacity-65 transition-opacity hover:opacity-100"><ArrowLeft className="h-3.5 w-3.5 text-[var(--theme-primary)]" /> {view === "team" ? "Invite" : "Profile"}</button>}
      <ErrorBanner msg={loadError} />
      <AnimatePresence mode="wait"><motion.div key={view} initial={viewMotion.initial} animate={viewMotion.animate} exit={viewMotion.exit} transition={viewMotion.transition}>{viewElements[view]}</motion.div></AnimatePresence>
    </div>
  );
}
