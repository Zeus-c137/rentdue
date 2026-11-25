import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * A money value that can count itself up.
 *
 * `display` mirrors `value` on every change, except while a count-up owns it.
 * A parent that writes the final value optimistically (before the celebration
 * finishes) must not land that write underneath an in-flight count, or the
 * number visibly changes twice for one event — so the mirror stands down until
 * the count completes.
 */
export function useCountedMoney(value: number) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const counting = useRef(false);
  const generation = useRef(0);

  useLayoutEffect(() => {
    if (counting.current) return;
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  // Stop the last tick if the owner unmounts mid-count.
  useEffect(() => () => { generation.current += 1; }, []);

  /**
   * Count to `to`. `counting` is claimed immediately so the parent's
   * optimistic write cannot land underneath; `delay` then holds the visual
   * count back until the coins have arrived (the island counts on landing, not
   * on launch).
   */
  const countTo = useCallback((to: number, duration = 900, delay = 0) => {
    const target = Math.max(0, Number(to) || 0);
    const gen = ++generation.current;
    counting.current = true;
    const start = displayRef.current;

    if (reduceMotion) {
      setDisplay(target);
      counting.current = false;
      return;
    }

    let frame = 0;
    let timer = 0;
    const run = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (target - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(run);
      else counting.current = false;
    };
    const startedAt = performance.now();
    if (delay > 0) {
      timer = window.setTimeout(() => {
        if (generation.current !== gen) return;
        frame = requestAnimationFrame(run);
      }, delay);
    } else {
      frame = requestAnimationFrame(run);
    }

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  /**
   * Freeze the displayed value and claim ownership of it. Called the instant a
   * celebration is armed — before the parent's optimistic write reaches the
   * card — so the mirror stands down and the later count-up has somewhere to
   * start from.
   */
  const begin = useCallback((value: number) => {
    counting.current = true;
    setDisplay(value);
  }, []);

  /** Give the number back to the prop mirror (e.g. the claim was rolled back). */
  const release = useCallback(() => {
    generation.current += 1;
    counting.current = false;
  }, []);

  return { display, countTo, begin, release };
}
