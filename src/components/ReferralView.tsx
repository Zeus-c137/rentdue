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

type InviteCardProps = {
  inviteCode: string;
  inviteLink: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
};

function InviteCard({ inviteCode, inviteLink, copiedLink, onCopyLink, copiedCode, onCopyCode }: InviteCardProps) {
  return (
    <section aria-label="Invite code and link" className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 px-4 backdrop-blur-[20px]">
      <button type="button" onClick={onCopyCode} aria-label="Copy invite code" className="group flex w-full items-center gap-3 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[var(--theme-text)] opacity-50">Your invite code</span>
          <span className="mt-1 block truncate font-mono text-[18px] font-black tracking-[0.16em]">{inviteCode || "N/A"}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] transition-colors group-hover:bg-[var(--theme-primary)]/15">
          {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </span>
      </button>
      <div className="h-px bg-white/10" />
      <div className="flex items-center gap-3 py-3.5">
        <Link2 className="h-4 w-4 shrink-0 text-[var(--theme-primary)] opacity-75" />
        <p className="min-w-0 flex-1 select-all truncate font-mono text-[11px] opacity-70">{inviteLink || "No link"}</p>
        <button type="button" onClick={onCopyLink} aria-label="Copy invite link" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/10">
          {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------ earnings + levels -------------------------- */

type OverviewProps = {
  inviteLink: string;
  inviteCode: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  copiedCode: boolean;
  onCopyCode: () => void;
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  onViewTeam: () => void;
};

function OverviewView({ inviteLink, inviteCode, copiedLink, onCopyLink, copiedCode, onCopyCode, metrics, isLoading, onViewTeam }: OverviewProps) {
  const { formatCurrency } = useCurrency();
  const inviteCount = metrics.reduce((sum, metric) => sum + metric.count, 0);
  const inviteBonus = metrics.reduce((sum, metric) => sum + metric.earned, 0);
  return (
    <div className="space-y-4">
      <section aria-label="Invite summary" className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 p-4 backdrop-blur-[20px]">
        <div className="min-w-0">
          <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-55">My invites</p>
          <p className="mt-0.5 truncate font-display text-[22px] font-black tracking-tight">{isLoading ? "—" : inviteCount}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-sans text-[var(--theme-text)] opacity-55">Invite bonus</p>
          {isLoading ? <div className="mt-2 h-6 w-28 animate-pulse rounded bg-[var(--theme-card-border)]/40" /> : <p className="mt-0.5 truncate font-display text-[18px] font-black tracking-tight text-[var(--theme-primary)]">{formatCurrency(inviteBonus)}</p>}
        </div>
      </section>

      <InviteCard
        inviteCode={inviteCode}
        inviteLink={inviteLink}
        copiedLink={copiedLink}
        onCopyLink={onCopyLink}
        copiedCode={copiedCode}
        onCopyCode={onCopyCode}
      />

      <section aria-label="Referral levels" className="rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/60 p-4 backdrop-blur-[20px]">
        <div className="flex items-center justify-between gap-3 pb-2">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-black leading-tight">Referral Levels</h2>
            <p className="mt-0.5 text-[11px] text-[var(--theme-text)] opacity-55">Invite commission overview</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onViewTeam} className="shrink-0 border border-[var(--theme-primary)]/45 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/5">
            <Users className="h-4 w-4" /> My invites
          </Button>
        </div>
        <div className="divide-y divide-white/10">
          {metrics.map((metric) => (
            <div key={metric.level} className="py-3 first:pt-2 last:pb-1">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-[13px] font-black">LV{metric.level} <span className="text-[var(--theme-primary)]">{metric.pct}%</span></p>
                <p className="text-[11px] text-[var(--theme-text)] opacity-55">{metric.count} {metric.count === 1 ? "Person" : "People"}</p>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="text-[10px] text-[var(--theme-text)] opacity-50">Commission</p>
                {isLoading ? <div className="h-4 w-20 animate-pulse rounded bg-[var(--theme-card-border)]/40" /> : <p className="font-display text-[13px] font-black tabular-nums text-[var(--theme-primary)]">{formatCurrency(metric.earned)}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
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
    overview: <OverviewView inviteLink={inviteLink} inviteCode={inviteCode} copiedLink={copiedLink} onCopyLink={() => copyLink(inviteLink)} copiedCode={copiedCode} onCopyCode={() => copyCode(inviteCode)} metrics={levelMetrics} isLoading={isLoading} onViewTeam={() => setView("team")} />,
    team: <InviteTeamView stats={stats} isLoading={isLoading} activeLevel={activeLevel} onActiveLevelChange={setActiveLevel as (l: 1 | 2 | 3 | 4) => void} activeLevelStats={activeLevelStats} siteConfig={liveSiteConfig ?? siteConfig} />,
  };
  return (
    <div className="min-h-full w-full space-y-4 pb-16 text-[var(--theme-text)]">
      {(onBack || view === "team") && <button type="button" onClick={() => view === "team" ? setView("overview") : onBack?.()} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-xs font-semibold text-[var(--theme-text)] opacity-65 transition-opacity hover:opacity-100"><ArrowLeft className="h-3.5 w-3.5 text-[var(--theme-primary)]" /> {view === "team" ? "Invite" : "Profile"}</button>}
      <ErrorBanner msg={loadError} />
      <AnimatePresence mode="wait"><motion.div key={view} initial={viewMotion.initial} animate={viewMotion.animate} exit={viewMotion.exit} transition={viewMotion.transition}>{viewElements[view]}</motion.div></AnimatePresence>
    </div>
  );
}
