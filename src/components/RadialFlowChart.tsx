import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { History } from "lucide-react";
import { useCountedMoney } from "./fx/useCountedMoney";
import type { RadialSlice } from "../utils/radialFlow";

interface RadialFlowChartProps {
  slices: RadialSlice[];
  formatCurrency: (amount: number) => string;
  /** Present on Home: the centre readout becomes the history entry point. */
  onOpenHistory?: () => void;
  /** History tabs highlight their share of the full chart instead of replacing it. */
  selectedKeys?: string[];
  selectedLabel?: string;
  className?: string;
}

const CX = 160;
const CY = 150;
const RADIUS = 124;
const THICKNESS = 26;
const START = 180;
const SWEEP = 180;

function polar(radius: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/** A clockwise SVG arc across the top half — 9 o'clock to 3 o'clock. */
function arcPath(radius: number, from: number, to: number) {
  const a = polar(radius, from);
  const b = polar(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Dark ink on the light arcs, white on the dark ones. */
function inkFor(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#101010" : "#ffffff";
}

/**
 * Counts from the last displayed value, not from zero, so switching flows rolls
 * both ways. useCountedMoney owns the frame loop, so a parent re-render mid-count
 * cannot restart it at the target.
 */
function FlowAmount({ value, format }: { value: number; format: (amount: number) => string }) {
  const reduce = useReducedMotion();
  const { display, countTo } = useCountedMoney(0);
  useEffect(() => { countTo(value, reduce ? 0 : 650); }, [value, countTo, reduce]);
  return <span className="tabular-nums">{format(display)}</span>;
}

/**
 * A half-circle of money flow. Arcs charge in sequence on mount; hovering an
 * arc isolates its share and rolls the centre amount to that flow. The centre
 * is the only control: on Home it opens transaction history.
 */
export default function RadialFlowChart({
  slices,
  formatCurrency,
  onOpenHistory,
  selectedKeys,
  selectedLabel,
  className = "",
}: RadialFlowChartProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const gradientId = `cone-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const resetOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setSelected(null);
        setHovered(null);
      }
    };
    document.addEventListener("pointerdown", resetOutside);
    return () => document.removeEventListener("pointerdown", resetOutside);
  }, []);

  // Every group is present (zero-valued ones included by the data helper), but
  // only non-zero groups occupy arc space — otherwise zero slices eat the gaps.
  const drawn = slices.filter((slice) => slice.value > 0);
  const total = drawn.reduce((sum, slice) => sum + slice.value, 0);

  const gap = drawn.length > 1 ? 1.6 : 0;
  const usable = SWEEP - gap * Math.max(0, drawn.length - 1);
  let cursor = START;
  const layout = drawn.map((slice) => {
    const span = (slice.value / total) * usable;
    const entry = {
      ...slice,
      from: cursor,
      to: cursor + span,
      mid: cursor + span / 2,
      span,
      share: slice.value / total,
    };
    cursor += span + gap;
    return entry;
  });

  // Hover is a preview; a tap is a persistent selection. Keeping them apart
  // means the synthetic mouseleave after a touch cannot clear a tapped slice.
  const focusKey = hovered ?? selected;
  const focused = layout.find((slice) => slice.key === focusKey);
  const selection = focused
    ? [focused]
    : slices.filter((slice) => selectedKeys?.includes(slice.key));
  const displayValue = selection.length ? selection.reduce((sum, slice) => sum + slice.value, 0) : total;
  const displayLabel = focused ? focused.label : selectedLabel || "Total volume";
  const isDimmed = (key: string) =>
    focused ? focused.key !== key : selection.length > 0 && !selectedKeys?.includes(key);
  const conePath = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY} Z`;

  const readout = (
    <>
      <span className="flex items-center gap-1.5">
        {onOpenHistory ? <History className="h-3.5 w-3.5 text-[var(--theme-primary)]" aria-hidden="true" /> : null}
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text)] opacity-50">
          {displayLabel}
        </span>
      </span>
      <FlowAmount value={displayValue} format={formatCurrency} />
      {onOpenHistory ? (
        <motion.button
          type="button"
          onClick={onOpenHistory}
          whileTap={{ scale: 0.96 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 35 }}
          className="pointer-events-auto mt-0.5 cursor-pointer text-[10px] font-bold text-[var(--theme-primary)] underline underline-offset-2 active:opacity-60"
          style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
        >
          See all
        </motion.button>
      ) : null}
    </>
  );

  if (slices.length === 0 || total <= 0) {
    return (
      <section ref={rootRef} className={`relative rounded-[24px] border border-white/[0.06] bg-white/[0.02] px-3 pb-2 pt-4 ${className}`}>
        <div className="relative mx-auto w-full max-w-[360px]">
          <svg viewBox="0 0 320 180" className="w-full">
            <path d={`M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY} Z`} fill="white" fillOpacity="0.02" />
            <path d={arcPath(RADIUS, START, START + SWEEP)} fill="none" stroke="white" strokeOpacity="0.06" strokeWidth={THICKNESS} strokeLinecap="round" />
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text)] opacity-35">
            No flow for this filter
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={rootRef} className={`relative rounded-[24px] border border-white/[0.06] bg-white/[0.02] px-3 pb-2 pt-4 ${className}`}>
      <div className="relative mx-auto w-full max-w-[360px]">
        <svg viewBox="0 0 320 180" className="w-full overflow-visible" role="group"
          aria-label={`Money flow breakdown, total ${formatCurrency(total)}`}>
          <defs>
            <radialGradient id={gradientId} cx="50%" cy="100%" r="90%">
              <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity="0.13" />
              <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The cone body and its two contour rings. */}
          <motion.path d={conePath} fill={`url(#${gradientId})`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 1.1 }} />
          <path d={arcPath(RADIUS - 34, START, START + SWEEP)} fill="none" stroke="white" strokeOpacity="0.035" strokeWidth="1" />
          <path d={arcPath(RADIUS + 20, START, START + SWEEP)} fill="none" stroke="white" strokeOpacity="0.03" strokeWidth="1" />
          <path d={arcPath(RADIUS, START, START + SWEEP)} fill="none" stroke="white" strokeOpacity="0.06" strokeWidth={THICKNESS} strokeLinecap="round" />

          {layout.map((slice, index) => {
            const dimmed = isDimmed(slice.key);
            const highlighted = !dimmed && selection.length > 0;
            const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 600, damping: 40 };
            return (
              <motion.path
                key={slice.key}
                d={arcPath(RADIUS, slice.from, slice.to)}
                fill="none"
                stroke={slice.color}
                strokeLinecap="round"
                role="button"
                tabIndex={0}
                aria-label={`${slice.label}: ${formatCurrency(slice.value)}, ${Math.round(slice.share * 100)} percent of total volume`}
                aria-pressed={selected === slice.key}
                style={{ cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent" }}
                initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
                animate={{
                  pathLength: 1,
                  opacity: dimmed ? 0.2 : 1,
                  strokeWidth: pressed === slice.key
                    ? THICKNESS + 6
                    : highlighted ? THICKNESS + 4 : selection.length ? THICKNESS - 10 : THICKNESS,
                }}
                transition={{
                  pathLength: { duration: reduce ? 0 : 1, delay: reduce ? 0 : index * 0.1, ease: [0.22, 1, 0.36, 1] },
                  opacity: spring,
                  strokeWidth: spring,
                }}
                onPointerDown={() => setPressed(slice.key)}
                onPointerUp={() => setPressed(null)}
                onPointerCancel={() => setPressed(null)}
                onPointerLeave={() => setPressed(null)}
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(slice.key)}
                onBlur={() => setHovered(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected((current) => (current === slice.key ? null : slice.key));
                  }
                  if (event.key === "Escape") {
                    setSelected(null);
                    setHovered(null);
                  }
                }}
                onClick={(event) => {
                  // A mouse previews on hover, so its click commits that preview;
                  // a touch tap toggles the persistent selection.
                  const pointerType = (event.nativeEvent as PointerEvent).pointerType;
                  setSelected((current) => (pointerType === "mouse" || current !== slice.key ? slice.key : null));
                }}
              />
            );
          })}

          {/* Percentages live on the arcs, not in a legend or the centre. */}
          {layout.filter((slice) => slice.span >= 7).map((slice) => {
            const point = polar(RADIUS, slice.mid);
            return (
              <motion.text
                key={`${slice.key}-pct`}
                x={point.x.toFixed(2)}
                y={point.y.toFixed(2)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fontWeight="800"
                fill={inkFor(slice.color)}
                initial={false}
                animate={{ opacity: isDimmed(slice.key) ? 0.35 : 1 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 40 }}
                className="pointer-events-none tabular-nums"
              >
                {Math.round(slice.share * 100)}%
              </motion.text>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute bottom-[12%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 whitespace-nowrap px-2 py-1">
          {readout}
        </div>
      </div>
    </section>
  );
}

/** Same box and arc geometry as the chart — holds the layout while data loads. */
export function RadialFlowChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <section className={`relative rounded-[24px] border border-white/[0.06] bg-white/[0.02] px-3 pb-2 pt-4 ${className}`} aria-hidden="true">
      <div className="relative mx-auto w-full max-w-[360px]">
        <svg viewBox="0 0 320 180" className="w-full animate-pulse">
          <path d={`M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY} Z`} fill="white" fillOpacity="0.02" />
          <path d={arcPath(RADIUS, START, START + SWEEP)} fill="none" stroke="white" strokeOpacity="0.07" strokeWidth={THICKNESS} strokeLinecap="round" />
        </svg>
        <div className="absolute bottom-[12%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <span className="h-2 w-20 rounded bg-white/10" />
          <span className="h-5 w-32 rounded bg-white/10" />
        </div>
      </div>
    </section>
  );
}
