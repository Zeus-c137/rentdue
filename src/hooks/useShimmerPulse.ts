import { useState, useEffect, useRef } from "react";
import { useGatedInterval } from "./useGatedInterval";

/**
 * Slow shimmer pulse: fires one sweep per `intervalMs` (default 18s) plus an
 * opening sweep on mount. Page-gated by mount (tab views unmount off-page,
 * killing the interval) + hidden-tab gate (no queued pulses while the
 * browser tab is hidden). Pair with the `.animate-shimmer-slow` CSS class.
 */
export function useShimmerPulse(intervalMs = 18000, sweepMs = 5000): boolean {
  const [pulse, setPulse] = useState(false);
  const timer = useRef<number | null>(null);

  const fire = () => {
    setPulse(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPulse(false), sweepMs);
  };

  useGatedInterval(() => { fire(); }, intervalMs, { enabled: true, visibilityGate: true });

  useEffect(() => {
    fire();
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return pulse;
}
