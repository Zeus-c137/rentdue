/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App header — the top edge of the home card, and a finished card on its own
 * everywhere else.
 *
 * This ribbon is shared by every tab, so it cannot know about the withdrawable
 * balance or the money actions: those belong to Home. What it does instead is
 * carry the card *material* — frosted surface and top-edge highlight — with no
 * bottom edge of its own, so whatever sits underneath reads as the same object
 * rather than a second card stacked on it.
 *
 * So: trading capital on the left, the icon rail on the right, and a square
 * bottom edge that the next block decides what to do with.
 */
import React from "react";
import { Bell, CalendarDays, MessagesSquare } from "lucide-react";
import { UserProfile } from "../types";
import CapitalChip from "./CapitalChip";

interface AppHeaderProps {
  profile: UserProfile;
  formatCurrency: (amountUgx: number) => string;
  chatUnread: number;
  alertsUnread: number;
  /** The history tab is already showing; a link to it would be a dead tap. */
  showHistoryLink: boolean;
  onOpenDeposit: () => void;
  onOpenHistory: () => void;
  onOpenChat: () => void;
  onOpenAlerts: () => void;
}

/** Icon rail button — same geometry as the original ribbon icons. */
function RailButton({
  label,
  onClick,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={badge ? `${label}. ${badge} unread.` : label}
      className="relative p-1 flex items-center justify-center border-0 transition-[transform,opacity] duration-100 cursor-pointer outline-none h-9 w-9 shrink-0 bg-transparent active:scale-[0.97] will-change-transform opacity-80 hover:opacity-100"
    >
      {children}
      {badge ? (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[var(--theme-card-bg)] shadow-xs">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}

export default function AppHeader({
  profile,
  formatCurrency,
  chatUnread,
  alertsUnread,
  showHistoryLink,
  onOpenDeposit,
  onOpenHistory,
  onOpenChat,
  onOpenAlerts,
}: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 flex h-[calc(72px+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 overflow-hidden bg-[var(--theme-card-bg)]/45 px-3.5 pt-[env(safe-area-inset-top)] backdrop-blur-[20px] backdrop-saturate-[180%] sm:px-4.5"
    >
      {/* Depth only: a soft top-edge highlight, no motion. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{ background: "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--theme-primary) 16%, transparent), transparent 70%)" }}
      />

      <div className="relative flex min-w-0 flex-1 items-center">
        <CapitalChip
          amount={profile.rechargeBalance || 0}
          formatCurrency={formatCurrency}
          onOpen={onOpenDeposit}
        />
      </div>

      <div className="relative flex shrink-0 items-center gap-0.5 sm:gap-1">
        {showHistoryLink && (
          <RailButton label="Transaction history" onClick={onOpenHistory}>
            <CalendarDays className="w-6 h-6 text-[var(--theme-text)]" />
          </RailButton>
        )}
        <RailButton label="Messages" onClick={onOpenChat} badge={chatUnread}>
          <MessagesSquare className="w-6 h-6 text-[var(--theme-text)]" />
        </RailButton>
        <RailButton label="View Alerts & Notifications" onClick={onOpenAlerts} badge={alertsUnread}>
          <Bell className="w-6 h-6 text-[var(--theme-text)]" />
        </RailButton>
      </div>
    </header>
  );
}