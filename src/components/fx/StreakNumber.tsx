import { motion, AnimatePresence, useAnimate } from 'motion/react';
import { useEffect, useRef } from 'react';
import { EASE } from './motion';

interface StreakNumberProps {
  value: number;
  className?: string;
}

/**
 * Odometer roll animation with overshoot and scale pop.
 * Each digit rolls vertically, and the whole number pops in scale.
 *
 * The digit track is exactly one line tall (h-[1em] + leading-none) and sits on
 * the text middle, so the number shares an optical centre line with an adjacent
 * icon instead of riding above it.
 */
export function StreakNumber({ value, className = '' }: StreakNumberProps) {
  const [scope, animate] = useAnimate();
  const prev = useRef(value);

  useEffect(() => {
    if (value > prev.current) {
      animate(scope.current, { scale: [1, 1.18, 1] }, { duration: 0.55 });
    }
    prev.current = value;
  }, [value, animate]);

  const digits = String(value).split('');

  return (
    <span ref={scope} className={'inline-block align-middle ' + className} aria-hidden='true'>
      {digits.map((d, i) => (
        <Digit key={digits.length - i} d={d} />
      ))}
    </span>
  );
}

function Digit({ d }: { d: string }) {
  return (
    <span className='relative inline-block h-[1em] overflow-hidden align-middle tabular-nums'>
      <AnimatePresence mode='popLayout' initial={false}>
        <motion.span
          key={d}
          className='block leading-none'
          initial={{ y: '100%' }}
          animate={{ y: '0%' }}
          exit={{ y: '-100%' }}
          transition={{ duration: 0.8, ease: EASE.overshoot }}
        >
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
