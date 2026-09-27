import React from "react";
import { useTheme } from "../context/ThemeContext";
import { BrandLogo } from "./BrandLogo";
import { useShimmerPulse } from "../hooks/useShimmerPulse";

interface VisaMetricCardProps {
  leftValue: string;
  leftLabel: string;
  leftSub?: string;
  rightValue?: string;
  rightLabel?: string;
  brandLabel?: string;
  variant?: "bank-dark" | "bank-light";
  mode?: "dual" | "single";
}

export default function VisaMetricCard({
  leftValue,
  leftLabel,
  leftSub,
  rightValue,
  rightLabel,
  brandLabel,
  variant,
  mode = "dual",
}: VisaMetricCardProps) {
  const { siteConfig, themeMode } = useTheme();
  // Theme-aware: no explicit variant → follow the app theme (dark theme gets
  // the bank-dark card, light theme gets bank-light). Explicit prop still wins.
  const prefersDark = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = variant ?? (themeMode === "dark" || (themeMode === "system" && prefersDark) ? "bank-dark" : "bank-light");
  const isDark = resolved === "bank-dark";

  // Slow balance shimmer pulse: one 5s drifting sweep per interval. Page-gated by
  // mount (tab views unmount off-page, killing the interval) + hidden-tab
  // gate (no queued pulses while the browser tab is hidden).
  const pulse = useShimmerPulse();

  return (
    <div className="relative select-none px-1 py-2">
      {/* Header: brand mark only — card chrome removed */}
      <div className="flex justify-end mb-2">
        <BrandLogo siteConfig={siteConfig} className="h-5 w-auto opacity-70 flex items-center justify-center shrink-0" />
      </div>

      {mode === "single" ? (
        <div className="relative mt-1 min-w-0">
          <p
            className={`text-[11px] font-sans font-medium uppercase tracking-[0.14em] leading-none ${
              isDark ? "text-white/60" : "text-black/60"
            }${pulse ? " animate-shimmer-slow" : ""}`}
          >
            {leftLabel}
          </p>
          <p
            className={`text-[20px] sm:text-[22px] font-display font-black tracking-tight leading-none mt-1.5 truncate ${
              isDark ? "text-white" : "text-[#1a1a1a]"
            }`}
          >
            {leftValue}
          </p>
          {leftSub && (
            <p className={`text-[10px] font-bold leading-none mt-1 ${isDark ? "text-white/60" : "text-black/60"}`}>{leftSub}</p>
          )}
        </div>
      ) : (
      <div className="relative grid grid-cols-2 gap-6 mt-1">
        <div className="text-left min-w-0">
          <p
            className={`text-[11px] font-sans font-medium uppercase tracking-[0.14em] leading-none ${
              isDark ? "text-white/60" : "text-black/60"
            }${pulse ? " animate-shimmer-slow" : ""}`}
          >
            {leftLabel}
          </p>
          <p
            className={`text-[20px] sm:text-[22px] font-display font-black tracking-tight leading-none mt-1.5 truncate ${
              isDark ? "text-white" : "text-[#1a1a1a]"
            }`}
          >
            {leftValue}
          </p>
          {leftSub && (
            <p className={`text-[10px] font-bold leading-none mt-1 ${isDark ? "text-white/60" : "text-black/60"}`}>{leftSub}</p>
          )}
        </div>
        <div className="text-left min-w-0">
          <p
            className={`text-[11px] font-sans font-medium uppercase tracking-[0.14em] leading-none ${
              isDark ? "text-white/60" : "text-black/60"
            }${pulse ? " animate-shimmer-slow" : ""}`}
          >
            {rightLabel}
          </p>
          <p
            className={`text-[20px] sm:text-[22px] font-display font-black tracking-tight leading-none mt-1.5 truncate ${
              isDark ? "text-white" : "text-[#1a1a1a]"
            }`}
          >
            {rightValue}
          </p>
        </div>
      </div>
      )}
    </div>
  );
}
