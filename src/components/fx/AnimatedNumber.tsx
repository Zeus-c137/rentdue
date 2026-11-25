import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { EASE } from './motion';

interface AnimatedNumberProps {
  from: number;
  to: number;
  start?: boolean;
  duration?: number;
  className?: string;
  /** Renders each intermediate value. Defaults to a grouped integer. */
  format?: (value: number) => string;
}

/**
 * Count-up animation between two values
 * Use for balance after any top-up, cashback, points
 */
export function AnimatedNumber({
  from,
  to,
  start = true,
  duration = 1,
  className = '',
  format,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const renderRef = useRef(format);
  renderRef.current = format;

  useEffect(() => {
    if (!start || !ref.current) return;
    const render = (value: number) =>
      renderRef.current
        ? renderRef.current(value)
      : Math.round(value).toLocaleString('en-US');

    const c = animate(from, to, {
      duration: reduce ? 0 : duration,
      ease: EASE.out,
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = render(v);
        }
      },
    });

    return () => c.stop();
  }, [start, from, to, duration, reduce]);

  const initial = format ? format(from) : Math.round(from).toLocaleString('en-US');
  return (
    <span ref={ref} className={'tabular-nums ' + className}>
      {initial}
    </span>
  );
}