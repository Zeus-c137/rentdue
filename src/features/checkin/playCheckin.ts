import type { Scenario } from './scenario';

export interface Handlers {
  setPhase: (phase: 'hidden' | 'open') => void;
  setFilled: (filled: number) => void;
  setStreakShown: (streak: number) => void;
  showPrize: () => void;
  burst: (count: number) => void;
  fly: (coins: number) => void;
  countBalance: () => void;
  playSound: () => void;
  hold: {
    run: (ms: number) => Promise<void>;
    pause: () => void;
    resume: () => void;
    dismiss: () => void;
  };
}

/** Beats every sequence shares; the tile ones only apply to check-ins. No
 *  pill phase: the island opens in place and hands straight back to the app. */
type Beat = {
  leadIn: number;
  openIn: number;
  tileStep: number;
  tileGap: number;
  revealGap: number;
  fly: number;
  settle: number;
  hold: number;
};

const BEAT: Record<Scenario['kind'], Beat> = {
  welcome: { leadIn: 400, openIn: 800, tileStep: 150, tileGap: 450, revealGap: 600, fly: 1200, settle: 450, hold: 2400 },
  restart: { leadIn: 700, openIn: 850, tileStep: 150, tileGap: 450, revealGap: 550, fly: 1200, settle: 450, hold: 3400 },
  milestone: { leadIn: 800, openIn: 900, tileStep: 150, tileGap: 500, revealGap: 650, fly: 1300, settle: 500, hold: 4800 },
  normal: { leadIn: 450, openIn: 800, tileStep: 150, tileGap: 450, revealGap: 550, fly: 1200, settle: 400, hold: 3800 },
};

export async function playCheckin(s: Scenario, h: Handlers, alive: () => boolean) {
  const beat = BEAT[s.kind];
  const step = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return alive();
  };

  // Entrance: the reward panel appears in place, no pill landing.
  if (!(await step(beat.leadIn))) return;
  h.setPhase('open');
  if (!(await step(beat.openIn))) return;

  // Week cells charge up to today.
  if (s.kind !== 'welcome') {
    for (let index = 0; index < s.priorCount; index += 1) {
      h.setFilled(index + 1);
      if (!(await step(beat.tileStep))) return;
    }
    if (!(await step(beat.tileGap))) return;
    h.setFilled(s.priorCount + 1);
  }

  h.setStreakShown(s.streak);
  h.showPrize();
  h.burst(s.burst[0]);
  if (s.burst[1]) setTimeout(() => alive() && h.burst(s.burst[1]), 340);
  if (!(await step(beat.revealGap))) return;

  // Coins leave, the sound lands, and the balance counts up with them — one
  // beat, not three. Starting the count before the flight is what made the
  // reward look like it had already been paid by the time the coins arrived.
  h.playSound();
  h.fly(s.coins);
  h.countBalance();
  if (!(await step(beat.fly))) return;
  if (!(await step(beat.settle))) return;

  await h.hold.run(beat.hold);
  if (!alive()) return;

  // Hand straight back to the app — no collapse onto the header pill.
  h.setPhase('hidden');
}
