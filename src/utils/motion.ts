// TODO: flagged untested — add minimal src/utils/referral.test.ts and src/hooks/useClipboard.test.ts once vitest configured
import type { CardStyle } from "@/src/types";

export const CARD_VARIANTS: Record<CardStyle, string> = {
  glass:
    "bg-[var(--theme-card-bg)]/60 backdrop-blur-[20px] backdrop-saturate-[180%] border border-white/10 shadow-sm",
  solid:
    "bg-[var(--theme-card-bg)] border border-[var(--theme-card-border)] shadow-[0_4px_0_0_var(--theme-card-shadow)]",
};

export const POLL_INTERVAL_MS = 300000;
export const CLIPBOARD_TIMEOUT_MS = 2000;

export const APPLE_SPRING = {
  type: "spring" as const,
  damping: 26,
  stiffness: 300,
};

export const APPLE_SPRING_MOMENTUM = {
  type: "spring" as const,
  damping: 20,
  stiffness: 300,
};

export function getSpring(reduced: boolean) {
  if (reduced) return { duration: 0 };
  return APPLE_SPRING;
}

export function getDrag(reduced: boolean): false | "y" {
  if (reduced) return false;
  return "y";
}

export function getInitial(reduced: boolean) {
  if (reduced) return { opacity: 1 };
  return { opacity: 0, y: 6 };
}

export function getExit(reduced: boolean) {
  if (reduced) return { opacity: 1 };
  return { opacity: 0, y: -6 };
}

export function getViewMotion(reduced: boolean) {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: APPLE_SPRING,
  };
}
