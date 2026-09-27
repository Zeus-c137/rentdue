/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BrandLogo } from "./BrandLogo";

interface GuideViewProps {
  siteConfig?: any;
  onBack: () => void;
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Getting started",
    body: [
      "Deposit funds into your rechargeable balance.",
      "Use that balance to rent products in the system.",
      "Each product has a cycle — its duration in days.",
    ],
  },
  {
    title: "Daily income",
    body: [
      "Every rented product earns daily income.",
      "Daily income is credited to your withdrawable balance.",
      "Track totals on the Income page.",
    ],
  },
  {
    title: "Withdrawals",
    body: [
      "Withdraw from your withdrawable balance only.",
      "Withdrawals need at least one product — no product, no withdrawal.",
      "We support instant Mobile Money (MTN / Airtel) and USDT.",
    ],
  },
  {
    title: "Referrals",
    body: [
      "Share your referral link from the Invite page.",
      "You earn Level 1–4 commissions when invitees activate products.",
      "Rewards only pay while the invitee keeps an active product.",
    ],
  },
  {
    title: "Deposits",
    body: [
      "Top up via instant Mobile Money or USDT.",
      "Deposits land in your rechargeable balance.",
      "Use that balance to rent products.",
    ],
  },
  {
    title: "Daily check-in",
    body: [
      "Open Profile → Check-in every day.",
      "Each day pays a bonus into withdrawable balance.",
      "Longer streaks unlock bigger rewards.",
    ],
  },
  {
      title: "Milestones",
    body: [
      "Grow referral bonus totals to climb tiers.",
      "Each tier unlocks a one-time reward.",
      "Claim rewards from the Milestones page.",
    ],
  },
  {
    title: "App installation",
    body: [
      "Tap Profile → Install App on your phone.",
      "Installed app enables update checks.",
      "Check Profile → Software updates anytime.",
    ],
  },
  {
    title: "Gift codes & community",
    body: [
      "New gift codes drop daily in the community groups.",
      "Redeem them from Profile → Gift Code.",
      "Join the groups below so you never miss a drop.",
    ],
  },
];

function GuideSection({ title, body, open, onToggle }: { title: string; body: string[]; open: boolean; onToggle: () => void; key?: unknown }) {
  return (
    <div className="rounded-[20px] border-0 bg-transparent overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 py-3 text-left cursor-pointer"
      >
        <span className="text-[13px] font-display font-black text-[var(--theme-text)] tracking-tight">{title}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--theme-primary)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="overflow-hidden"
          >
            <ul className="pb-3 space-y-1.5">
              {body.map((line, i) => (
                <li key={i} className="text-[12px] font-sans text-[var(--theme-text)] opacity-80 leading-relaxed flex gap-2">
                  <span className="text-[var(--theme-primary)] font-black shrink-0">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function GuideView({ siteConfig, onBack }: GuideViewProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const brandName = siteConfig?.brandName || "Guide";

  // One-shot intro shimmer: plays once per visit (iteration-count 1 runs on
  // mount; GuideView remounts every time the tab opens). No interval, so the
  // paint cost ends with the sweep. Class clears on animationend so the text
  // returns to its normal styling.
  const [intro, setIntro] = useState(true);

  return (
    <div className="bg-[var(--theme-card-bg)]/40 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 rounded-[24px] p-4 text-[var(--theme-text)] space-y-5 pb-16">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-extrabold opacity-70 hover:opacity-100 py-1.5 px-3 rounded-[var(--theme-radius)] bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-sm cursor-pointer">
        <ArrowLeft className="w-3.5 h-3.5 text-[var(--theme-primary)]" /> Profile
      </button>

      <div className="flex flex-col items-center text-center space-y-2 pt-1">
        <BrandLogo siteConfig={siteConfig} className="w-16 h-16 flex items-center justify-center" />
        <h4 onAnimationEnd={() => setIntro(false)} className={`font-display font-black text-lg text-[var(--theme-text)] tracking-tight${intro ? " animate-shimmer-slow" : ""}`}>{brandName} Guide</h4>
        <p className={`text-[12px] font-sans text-[var(--theme-text)] opacity-60 leading-relaxed max-w-[280px]${intro ? " animate-shimmer-slow" : ""}`}>
          Everything about balances, products, withdrawals and rewards.
        </p>
      </div>

      <div className="space-y-1">
        {SECTIONS.map((s, i) => (
          <GuideSection
            key={s.title}
            title={s.title}
            body={s.body}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </div>

      {(siteConfig?.whatsappLink || siteConfig?.telegramLink) && (
        <div className="space-y-2">
          <h5 className="font-display font-black text-xs uppercase tracking-wider opacity-70">Community</h5>
          {siteConfig?.whatsappLink && (
            <a href={siteConfig.whatsappLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-2xl bg-transparent border-0 hover:opacity-80 transition-colors group">
              <img src="/whatsapp.svg" alt="WhatsApp" className="w-10 h-10 rounded-xl shrink-0 object-contain bg-transparent p-0 shadow-none" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-black text-[var(--theme-text)] leading-none">WhatsApp Support</span>
                <span className="block text-[11px] font-bold text-[var(--theme-text)] opacity-60 leading-none mt-1 truncate">{siteConfig.whatsappLink}</span>
              </span>
              <ExternalLink className="w-4 h-4 text-[var(--theme-text)] opacity-40 group-hover:opacity-60 shrink-0" />
            </a>
          )}
          {siteConfig?.telegramLink && (
            <a href={siteConfig.telegramLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-2xl bg-transparent border-0 hover:opacity-80 transition-colors group">
              <img src="/telegram.svg" alt="Telegram" className="w-10 h-10 rounded-xl shrink-0 object-contain bg-transparent p-0 shadow-none" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-black text-[var(--theme-text)] leading-none">Telegram Channel</span>
                <span className="block text-[11px] font-bold text-[var(--theme-text)] opacity-60 leading-none mt-1 truncate">{siteConfig.telegramLink}</span>
              </span>
              <ExternalLink className="w-4 h-4 text-[var(--theme-text)] opacity-40 group-hover:opacity-60 shrink-0" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
