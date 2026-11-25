import { Flame } from 'lucide-react';
import { StreakNumber } from '../../components/fx/StreakNumber';

interface StreakPillProps {
  streak: number;
  onClick?: () => void;
}

/** Header pill showing current streak. Opens the check-in history sheet. */
export function StreakPill({ streak, onClick }: StreakPillProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={`${streak} ${streak === 1 ? "day" : "days"} streak. View check-in history.`}
      className='flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] px-2 text-[var(--theme-text)] transition-transform active:scale-[0.97]'
    >
      <Flame className='h-3 w-3 shrink-0 self-center text-[var(--theme-primary)]' fill='currentColor' />
      <span className='flex items-center gap-0.5 self-center leading-none'>
        <StreakNumber value={streak} className='text-[10px] font-black leading-none tabular-nums' />
        <span className='text-[9px] font-bold leading-none'>{streak === 1 ? "day" : "days"}</span>
      </span>
    </button>
  );
}