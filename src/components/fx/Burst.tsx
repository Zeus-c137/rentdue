import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { EASE } from './motion';

interface BurstProps {
  origin: { x: number; y: number };
  count: number;
  onDone?: () => void;
}

const COLORS = ['#c8ff00', '#c8ff00', '#ffffff', '#777777'];

/**
 * Ring plus particles burst from an origin
 * Use for payment sent, goal reached, any success moment
 */
export function Burst({ origin, count, onDone }: BurstProps) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = Math.random() * Math.PI * 2;
        const d = 50 + Math.random() * 100;
        return {
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d + 34,
          rot: Math.random() * 540,
          w: 3 + Math.random() * 4,
          h: 3 + Math.random() * 7,
          dur: 0.85 + Math.random() * 0.5,
          color: COLORS[i % 4],
        };
      }),
    [count]
  );

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return createPortal(
    <div className='pointer-events-none fixed inset-0 z-[60]' aria-hidden='true'>
      <div className='absolute' style={{ left: origin.x, top: origin.y }}>
        <motion.span
          className='absolute -left-5 -top-5 size-10 rounded-full border-2 border-lime'
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 3.4, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        {parts.map((p, i) => (
          <motion.span
            key={i}
            className='absolute rounded-[2px]'
            style={{
              width: p.w,
              height: p.h,
              left: -p.w / 2,
              top: -p.h / 2,
              background: p.color,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: p.dx, y: p.dy, rotate: p.rot, opacity: 0 }}
            transition={{ duration: p.dur, ease: EASE.burst }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}