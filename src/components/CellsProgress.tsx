/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Battery cells — progress as discrete blocks. Full cells light solid, the
 * boundary cell fills fractionally, and lit cells breathe in a
 * left-to-right chase while charging (pct < 100). Entrance is a deliberate
 * sequential trace: each cell fills in turn, decelerating softly into place
 * (critically-damped feel, no overshoot). Theme vars only, no gradients.
 *
 * Self-contained entrance: each instance traces on its own mount, so even
 * late-arriving data (async milestone fetch) plays the fill instead of
 * flashing its final state.
 */
import { useEffect, useState } from "react";

export default function CellsProgress({
  pct,
  cells = 20,
  cellClass = "h-4",
}: {
  pct: number;
  cells?: number;
  cellClass?: string;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(false);
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  const exact = (clamped / 100) * cells;
  const full = Math.floor(exact);
  const frac = exact - full;
  const charging = clamped < 100;
  return (
    <div className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => {
        const fill = i < full ? 1 : i === full ? frac : 0;
        const lit = fill > 0;
        const chase = entered && lit && charging;
        return (
          <span
            key={i}
            className={`${cellClass} flex-1 rounded-[5px] bg-[var(--theme-text)]/10 overflow-hidden`}
          >
            <span
              className={`block h-full rounded-[5px] bg-[var(--theme-primary)] ${chase ? "cell-charge" : ""}`}
              style={{
                width: entered ? `${fill * 100}%` : "0%",
                transition: "width 550ms cubic-bezier(0.22, 1, 0.36, 1)",
                transitionDelay: entered ? `${i * 70}ms` : undefined,
                animationDelay: chase ? `${i * 120}ms` : undefined,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
