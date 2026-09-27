import React from "react";
import { useTheme } from "../context/ThemeContext";

interface MetricCardProps {
  key?: React.Key;
  title: string;
  value: string | number;
  subtitle?: string;
  isLoading?: boolean;
  titleColor?: "primary" | "secondary" | "accent" | string;
  icon?: React.ReactNode;
  variant?: "hero" | "muted";
}

export default function MetricCard({ title, value, subtitle, isLoading, titleColor, icon, variant = "hero" }: MetricCardProps) {
  const { cardStyle } = useTheme();
  const isMuted = variant === "muted";
  const isImageIcon = React.isValidElement(icon) && (icon as any).type === 'img';

  let accent: { bg: string; shadow: string; text: string } = { bg: "var(--theme-card-border)", shadow: "var(--theme-card-shadow)", text: "var(--theme-text)" };
  let titleClass = "text-[var(--theme-text)] opacity-60 font-black tracking-widest";

  if (titleColor === "primary") {
    accent = { bg: "var(--theme-primary)", shadow: "var(--theme-primary-shadow)", text: "var(--theme-primary)" };
    titleClass = "font-black";
  } else if (titleColor === "secondary") {
    accent = { bg: "var(--theme-secondary)", shadow: "var(--theme-secondary-shadow)", text: "var(--theme-secondary)" };
    titleClass = "font-black";
  } else if (titleColor === "accent") {
    accent = { bg: "var(--theme-accent)", shadow: "var(--theme-accent-shadow)", text: "var(--theme-accent)" };
    titleClass = "font-black";
  } else if (titleColor === "gold") {
    accent = { bg: "#F59E0B", shadow: "#B45309", text: "#D97706" };
    titleClass = "font-black";
  }

  const cardBase = isMuted
    ? "bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm"
    : cardStyle === "glass"
    ? "bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm"
    : "bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-[0_4px_0_0_var(--theme-card-shadow)]";

  const heightClass = isMuted ? "h-[96px]" : "h-[112px]";

  return (
    <div style={{ transform: "translateZ(0)" }} className={`relative overflow-hidden theme-card rounded-[var(--theme-radius)] p-3.5 ${heightClass} flex flex-col justify-between ${cardBase} isolate`}>
      
      <div className="flex items-start justify-between gap-2">
        <span
          style={{ color: titleColor ? accent.text : undefined }}
          className={`text-[10.5px] font-display uppercase tracking-[0.12em] leading-none block pt-1 ${titleClass}`}
        >
          {title}
        </span>
        {icon && (
          isImageIcon ? (
            <div className="w-11 h-11 flex items-center justify-center shrink-0 overflow-hidden bg-transparent border-0">
              <span className="w-11 h-11 flex items-center justify-center [&>img]:w-11 [&>img]:h-11 [&>img]:object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.12)]">{icon}</span>
            </div>
          ) : (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md border border-white/15"
            style={{ background: accent.bg, boxShadow: `0 3px 0 0 ${accent.shadow}` }}
          >
            <span className="w-4.5 h-4.5 flex items-center justify-center [&>svg]:w-4.5 [&>svg]:h-4.5">{icon}</span>
          </div>
          )
        )}
      </div>

      <div className="space-y-0.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {isLoading ? (
            <div className="h-6 w-28 bg-[var(--theme-card-border)]/40 rounded-xl animate-pulse" />
          ) : (
            <span className="font-display font-black text-[18px] sm:text-[19px] text-[var(--theme-text)] leading-none tracking-tight select-text">
              {value}
            </span>
          )}
          {subtitle && !isLoading && (
            <span className="text-[11px] text-[var(--theme-text)] opacity-50 font-bold">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
