import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { EASE } from './motion';

interface CoinFlightProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  count: number;
  onLand?: () => void;
  onDone?: () => void;
}

/**
 * Coins arc from A to B with a landing callback
 * Use for rewards, referral payouts, cashback
 */
export function CoinFlight({ from, to, count, onLand, onDone }: CoinFlightProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const jitter = useMemo(
    () => Array.from({ length: count }, () => (Math.random() - 0.5) * 70),
    [count]
  );

  return createPortal(
    <div className='pointer-events-none fixed inset-0 z-[60]' aria-hidden='true'>
      {jitter.map((jx, i) => (
        <motion.span
          key={i}
          className='absolute size-4 rounded-full bg-lime shadow-[0_0_12px_rgba(200,255,0,0.7)]'
          style={{ left: from.x - 8, top: from.y - 8 }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{
            x: [0, dx * 0.4 + jx, dx],
            y: [0, dy * 0.2 - 30, dy],
            scale: [1, 1.2, 0.4],
            opacity: [1, 1, 0.8],
          }}
          transition={{
            duration: 0.9,
            delay: i * 0.08,
            ease: EASE.fly,
            times: [0, 0.4, 1],
          }}
          onAnimationComplete={() => {
            onLand?.();
            if (i === count - 1) onDone?.();
          }}
        />
      ))}
    </div>,
    document.body
  );
}