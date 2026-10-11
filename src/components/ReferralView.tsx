import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coins, Copy, Info, Share2, Users, X } from "lucide-react";
import { useCurrency } from "@/src/currency";
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
import { toast } from "sonner";
import inviteUserArt from "@/src/assets/3d/3dicons-boy-iso-premium.png";
import inviteLinkArt from "@/src/assets/3d/3dicons-link-iso-premium.png";

type Props = {
  userProfile: UserProfile;
  siteConfig?: SiteConfig | null;
  onBack?: () => void;
  initialView?: View;
};

type View = "overview" | "code" | "team";

function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-[var(--theme-radius)] border border-amber-500/20 bg-[var(--theme-card-bg)] px-4 py-3 text-xs font-semibold text-[var(--theme-text)]">
      {msg}
    </div>
  );
}

type OverviewProps = {
  metrics: ReturnType<typeof getLevelMetrics>;
  isLoading: boolean;
  brandName: string;
  onViewTeam: () => void;
  onInvite: () => void;
  onHowItWorks: () => void;
};

function OverviewView({ metrics, isLoading, brandName, onViewTeam, onInvite, onHowItWorks }: OverviewProps) {
  const { formatCurrency } = useCurrency();
  const directInvites = metrics.find((metric) => metric.level === 1)?.count || 0;
  const totalEarned = metrics.reduce((sum, metric) => sum + metric.earned, 0);
  const firstLevelRate = metrics.find((metric) => metric.level === 1)?.pct ?? 0;

  return (
    <div className="space-y-6">
      <section aria-label="Invite friends" className="space-y-3">
        <p className="max-w-[28rem] font-display text-[25px] font-black leading-tight tracking-tight">
          Share your code, get up to <span className="text-[var(--theme-primary)]">{firstLevelRate}% on verified invites</span>
        </p>
     
        <p className="pt-1 text-[16px] font-sans leading-relaxed">
          Let’s invite your friends to <span className="font-bold">{brandName}</span>
        </p>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onViewTeam}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--theme-primary)]/40 px-3 py-2 text-[11px] font-sans font-black text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/10"
          >
           
            My invites
          </button>
        </div>
      </section>

      <section aria-label="Referral summary" className="grid grid-cols-2 divide-x divide-white/10 rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 p-4 backdrop-blur-[20px] backdrop-saturate-[180%]">
        <div className="flex flex-col items-center gap-1.5 px-2 text-center">
          <Coins className="h-10 w-10 p-2 text-[var(--theme-text-muted)]" strokeWidth={1.8} />
          {isLoading ? (
            <div className="h-6 w-24 animate-pulse rounded bg-[var(--theme-card-border)]/40" />
          ) : (
            <p className="max-w-full truncate font-display text-[17px] font-black tabular-nums text-white">{formatCurrency(totalEarned)}</p>
          )}
          <p className="text-[11px] font-sans opacity-60">Total earned</p>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-2 text-center">
          <Users className="h-10 w-10 p-2 text-[var(--theme-text-muted)]" strokeWidth={1.8} />
          <p className="font-display text-[22px] font-black tabular-nums text-white">{isLoading ? "—" : directInvites}</p>
          <p className="text-[11px] font-sans opacity-60">Friends referred</p>
        </div>
      </section>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onInvite}
          className="w-full rounded-full bg-[var(--theme-primary)] px-5 py-3.5 text-[16px] font-sans font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98]"
        >
          <span className="inline-flex items-center justify-center gap-2">
            Invite friends
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          onClick={onHowItWorks}
          className="inline-flex w-full items-center justify-center gap-2 py-2 text-[13px] font-sans font-bold text-[var(--theme-text)] opacity-70 underline decoration-white/20 underline-offset-4 transition-opacity hover:opacity-100"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          How does it work?
        </button>
      </div>
    </div>
  );
}

type CodeViewProps = {
  inviteLink: string;
  copiedLink: boolean;
  onCopyLink: () => void;
  onShare: () => void;
  onHowItWorks: () => void;
};

function CodeView({ inviteLink, copiedLink, onCopyLink, onShare, onHowItWorks }: CodeViewProps) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center pt-2 text-center">
        <img src={inviteLinkArt} alt="" aria-hidden="true" className="mb-3 h-16 w-16 object-contain" />
        <h1 className="max-w-[18rem] font-display text-[23px] font-black leading-tight tracking-tight">
          Here’s your referral link. Share it.
        </h1>
        
      </section>

      <section aria-label="Your referral link" className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-[var(--theme-card-bg)]/40 px-4 py-4 backdrop-blur-[20px] backdrop-saturate-[180%]">
        <p className="min-w-0 flex-1 select-all break-all text-[16px]  leading-relaxed">{inviteLink || "N/A"}</p>
        <button
          type="button"
          onClick={onCopyLink}
          aria-label={copiedLink ? "Referral link copied" : "Copy referral link"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/10"
        >
          {copiedLink ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </button>
      </section>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onShare}
          disabled={!inviteLink}
          className="w-full rounded-full bg-[var(--theme-primary)] px-5 py-3.5 text-[16px] font-sans font-black text-[var(--theme-on-primary)] transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share invite link
          </span>
        </button>
        <button
          type="button"
          onClick={onHowItWorks}
          className="inline-flex w-full items-center justify-center gap-2 py-2 text-[13px] font-sans font-bold text-[var(--theme-text)] opacity-70 underline decoration-white/20 underline-offset-4 transition-opacity hover:opacity-100"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          How does it work?
        </button>
      </div>
    </div>
  );
}

type HowItWorksSheetProps = {
  metrics: ReturnType<typeof getLevelMetrics>;
  onClose: () => void;
};

function HowItWorksSheet({ metrics, onClose }: HowItWorksSheetProps) {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const steps = [
    {
      title: "Share your invite code",
      description: "First, share your referral link with your friends or family."
    },
    {
      title: "Make your friend use your code",
      description: "Your friend must enter your invite code to complete signup."
    },
    {
      title: "Your friend must make a transaction",
      description: "A referral is verified when your friend activates one run. Visit our store to get started."
    }
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close how it works" className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-how-title"
        initial={reducedMotion ? { opacity: 0 } : { y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { y: 48, opacity: 0 }}
        transition={reducedMotion ? { duration: 0.12 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[10] flex h-[80vh] h-[80dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[26px] border border-[var(--theme-card-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] shadow-2xl sm:rounded-[26px]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4 sm:gap-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--theme-primary)]">Referral guide</p>
            <h2 id="invite-how-title" className="mt-1 font-display text-[22px] font-black leading-tight tracking-tight sm:text-[21px]">What counts as a referral?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
          <ol className="space-y-0">
            {steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-3 pb-5 last:pb-2">
                {index < steps.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 bottom-0 w-px bg-white/15" />}
                <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/10 text-[14px] xt-[var(--theme-primary)]">
                  {index + 1}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[13px] font-bold">{step.title}</span>
                  <span className="mt-1 block text-[14px] ed opacity-65">{step.description}</span>
                </span>
              </li>
            ))}
          </ol>

          <section aria-label="Referral commission rates" className="mt-4 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-end justify-between gap-3">
              <h3 className="font-display text-[16px] font-black">Commission rates</h3>
              <span className="text-[10px] opacity-55">per verified run</span>
            </div>
            <div className="divide-y divide-white/10">
              {metrics.map((metric) => (
                <div key={metric.level} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px] ">Level {metric.level}</span>
                  <span className="font-display text-[13px] font-black tabular-nums text-[var(--theme-primary)]">{metric.pct}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.section>
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
    const sig = renew();
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
  const [view, setView] = useState<View>(initialView);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  useEffect(() => { setView(initialView); }, [initialView]);
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const inviteCode = userProfile.inviteCode || "";
  const inviteLink = buildInviteLink(inviteCode);
  const levelMetrics = getLevelMetrics(stats, liveSiteConfig ?? siteConfig);
  const activeLevelStats = getActiveLevelStats(stats, activeLevel);
  const brandName = liveSiteConfig?.brandName || siteConfig?.brandName || "us";
  const reduced = useReducedMotion();
  const viewMotion = getViewMotion(reduced);
  const closeHowItWorks = useCallback(() => setShowHowItWorks(false), []);
  const goBack = () => {
    if (view !== "overview") {
      setView("overview");
    } else {
      onBack?.();
    }
  };
  const shareInvite = async () => {
    if (!inviteLink) return;
    const shareData = {
      title: `Join ${brandName}`,
      text: `Join ${brandName} using my referral link and start earning by completing daily tasks.`,
      url: inviteLink
    };

    if (typeof navigator.share !== "function") {
      await copyLink(inviteLink, "Invite link copied");
      return;
    }

    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not open the share menu. Please try again.");
    }
  };
  const viewElements: Record<View, React.ReactElement> = {
    overview: <OverviewView
      metrics={levelMetrics}
      isLoading={isLoading}
      brandName={brandName}
      onViewTeam={() => setView("team")}
      onInvite={() => setView("code")}
      onHowItWorks={() => setShowHowItWorks(true)}
    />,
    code: <CodeView
      inviteLink={inviteLink}
      copiedLink={copiedLink}
      onCopyLink={() => copyLink(inviteLink, "Referral link copied")}
      onShare={() => void shareInvite()}
      onHowItWorks={() => setShowHowItWorks(true)}
    />,
    team: <InviteTeamView stats={stats} isLoading={isLoading} activeLevel={activeLevel} onActiveLevelChange={setActiveLevel as (l: 1 | 2 | 3 | 4) => void} activeLevelStats={activeLevelStats} siteConfig={liveSiteConfig ?? siteConfig} />,
  };
  return (
    <div className="min-h-full w-full space-y-4 pb-16 text-[var(--theme-text)]">
      {(onBack || view !== "overview") && (
        <button type="button" onClick={goBack} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-xs font-semibold text-[var(--theme-text)] opacity-65 transition-opacity hover:opacity-100">
          <ArrowLeft className="h-3.5 w-3.5 text-[var(--theme-primary)]" />
          {view === "overview" ? "Profile" : "Invite"}
        </button>
      )}
      <ErrorBanner msg={loadError} />
      <AnimatePresence mode="wait"><motion.div key={view} initial={viewMotion.initial} animate={viewMotion.animate} exit={viewMotion.exit} transition={viewMotion.transition}>{viewElements[view]}</motion.div></AnimatePresence>
      <AnimatePresence>
        {showHowItWorks && <HowItWorksSheet metrics={levelMetrics} onClose={closeHowItWorks} />}
      </AnimatePresence>
    </div>
  );
}
