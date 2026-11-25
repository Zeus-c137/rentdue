import { useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence, type MotionValue } from 'motion/react';
import { Flame } from 'lucide-react';
import { StreakNumber } from './StreakNumber';
import { WeekProgress } from './WeekProgress';
import { EASE } from './motion';
import { registerTarget } from './targets';

interface CheckinIslandProps {
  phase: 'hidden' | 'open';
  kind: 'normal' | 'milestone' | 'restart' | 'welcome';
  streak: number;
  filled: number;
  prize: number;
  prizeLabel: string;
  subtitle: string;
  showPrize: boolean;
  progress: number | MotionValue<number>;
  hold: {
    pause: () => void;
    resume: () => void;
    dismiss: () => void;
  };
}

const OPEN_H = 118;

/**
 * The check-in reward panel. It opens where it belongs — centred under the
 * status bar — and dismisses straight back to the app. The header streak pill
 * is no longer a stop in this sequence: it only opens the history sheet.
 */
export function CheckinIsland(props: CheckinIslandProps) {
  const islandRef = useRef<HTMLDivElement>(null);
  const openWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 24, 384) : 384;
  const openLeft = typeof window !== 'undefined' ? (window.innerWidth - openWidth) / 2 : 12;
  const box = {
    left: openLeft,
    top: 'max(12px, env(safe-area-inset-top))',
    width: openWidth,
    height: OPEN_H,
    borderRadius: 24,
  };

  useLayoutEffect(() => {
    registerTarget('badge', islandRef.current);
    return () => registerTarget('badge', null);
  }, [props.phase]);

  return (
    <AnimatePresence>
      {props.phase !== 'hidden' && (
        <motion.div
          ref={islandRef}
          className='pointer-events-none fixed z-50'
          initial={{ left: box.left, top: -70, width: box.width, height: box.height, opacity: 0, borderRadius: box.borderRadius }}
          animate={{ ...box, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.63, ease: EASE.morph }}
          style={{ position: 'fixed' }}
        >
          <motion.div
            role='status'
            aria-live='polite'
            className='pointer-events-auto relative h-full w-full touch-none overflow-hidden rounded-[24px] border border-white/15 bg-black text-white shadow-lg'
            drag='y'
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.5, bottom: 0 }}
            onPointerDown={props.hold.pause}
            onPointerUp={props.hold.resume}
            onDragEnd={(_, info) => {
              if (info.offset.y < -30 || info.velocity.y < -500) props.hold.dismiss();
            }}
          >
            <div className='absolute inset-0 flex flex-col items-center justify-center px-4 py-2 text-center'>
              {/* One streak row, always full size — the island no longer
                  shrinks onto the header pill. */}
              <div className='flex items-center justify-center gap-1.5 whitespace-nowrap font-black leading-none text-white'>
                {props.kind !== 'welcome' && (
                  <Flame className='h-4 w-4 shrink-0 text-[var(--theme-primary)]' fill='currentColor' />
                )}
                <span className='flex items-center gap-1'>
                  {props.kind === 'welcome' ? (
                    <span className='text-sm font-black leading-none'>Welcome</span>
                  ) : (
                    <>
                      <StreakNumber value={props.streak} className='text-sm font-black leading-none tabular-nums' />
                      <span className='text-sm font-black leading-none'>{props.streak === 1 ? "day" : "days"} streak</span>
                    </>
                  )}
                </span>
                <AnimatePresence>
                  {props.showPrize && (
                    <motion.span
                      className='ml-1 text-xs font-black tabular-nums text-[var(--theme-primary)]'
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.32, ease: EASE.out }}
                    >
                      +{props.prizeLabel}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <div className='flex w-full flex-col items-center'>
                <p className='mt-1.5 text-[11px] leading-none text-white/60'>{props.subtitle}</p>
                {props.kind !== 'welcome' && (
                  <div className='mt-3 w-full max-w-[260px]'>
                    <WeekProgress filled={props.filled} />
                  </div>
                )}
              </div>
            </div>

            <motion.div
              className='absolute bottom-0 left-0 h-0.5 w-full origin-left bg-[var(--theme-primary)]'
              style={{ scaleX: props.progress }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
