/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Operator level mark: hex badge + glyph. Interim mapping runs over the
 * existing vipLevel until the points-based level engine lands (see
 * rentdue/scratch/home-v3/decisions.md). imageUrl accepts future
 * admin-uploaded tier art and wins over the SVG when set.
 */
import React from "react";
import { Sprout, Zap, Cpu, TrendingUp, Bot, Crown } from "lucide-react";

export const OPERATOR_TIERS = [
  { name: "Rookie", glyph: Sprout },
  { name: "Runner", glyph: Zap },
  { name: "Operator", glyph: Cpu },
  { name: "Mover", glyph: TrendingUp },
  { name: "Machine", glyph: Bot },
  { name: "Tycoon", glyph: Crown },
] as const;

/** Interim: fold any vipLevel into the 6-tier ladder. */
export function tierIndexForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(OPERATOR_TIERS.length - 1, Math.floor(level));
}

export function tierNameForLevel(level: number): string {
  return OPERATOR_TIERS[tierIndexForLevel(level)].name;
}

interface LevelBadgeProps {
  level: number;
  imageUrl?: string;
  className?: string;
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({
  level,
  imageUrl,
  className = "w-10 h-10",
}) => {
  const tier = OPERATOR_TIERS[tierIndexForLevel(level)];
  const Glyph = tier.glyph;
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={tier.name} className="w-full h-full object-contain" />
      ) : (
        <>
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full text-[var(--theme-primary)]" aria-hidden>
            <polygon
              points="50,6 88,28 88,72 50,94 12,72 12,28"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinejoin="round"
            />
          </svg>
          <Glyph className="w-[42%] h-[42%] text-[var(--theme-primary)]" aria-hidden />
        </>
      )}
    </span>
  );
};
