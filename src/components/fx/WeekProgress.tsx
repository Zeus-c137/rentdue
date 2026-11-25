import { motion } from 'motion/react';
import { EASE } from './motion';

interface WeekProgressProps {
  filled: number;
  total?: number;
}

/**
 * 7 segments filling in order
 * Use for any stepped progress of 7 or fewer
 */
export function WeekProgress({ filled, total = 7 }: WeekProgressProps) {
  return (
    <div className='flex gap-[5px]'>
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          className='h-1.5 flex-1 rounded-[3px]'
          animate={{
            backgroundColor: i < filled ? '#c8ff00' : '#1a1a1a',
          }}
          transition={{ duration: 0.42, ease: EASE.out }}
        />
      ))}
    </div>
  );
}