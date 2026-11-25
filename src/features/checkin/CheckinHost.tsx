import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, type AnimationPlaybackControls, useMotionValue } from 'motion/react';
import { useCurrency } from '../../currency';
import { CheckinIsland } from '../../components/fx/CheckinIsland';
import { Burst } from '../../components/fx/Burst';
import { CoinFlight } from '../../components/fx/CoinFlight';
import { playCheckin, type Handlers } from './playCheckin';
import { toScenario, toWelcomeScenario, type CheckinResult, type Scenario } from './scenario';
import { centerOf } from '../../components/fx/targets';
import { playCheckinSound } from '../../utils/checkinSound';

interface CheckinHostProps {
  welcomeBonus?: { key: string; amount: number; balance: number } | null;
  onWelcomeConsumed?: () => void;
}

type BurstInstance = {
  id: number;
  origin: { x: number; y: number };
  count: number;
};

type CoinFlightInstance = {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  count: number;
};

export function CheckinHost({ welcomeBonus, onWelcomeConsumed }: CheckinHostProps) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'open'>('hidden');
  const [filled, setFilled] = useState(0);
  const [streakShown, setStreakShown] = useState(0);
  const [showPrize, setShowPrize] = useState(false);
  const [bursts, setBursts] = useState<BurstInstance[]>([]);
  const [coinFlights, setCoinFlights] = useState<CoinFlightInstance[]>([]);

  const progress = useMotionValue(1);
  const holdControls = useRef<AnimationPlaybackControls | undefined>(undefined);
  const holdResolve = useRef<(() => void) | undefined>(undefined);
  const activeRef = useRef(false);
  const queueRef = useRef<Scenario[]>([]);
  const welcomedKeyRef = useRef<string | null>(null);
  const balanceScale = useRef<AnimationPlaybackControls | undefined>(undefined);
  const { formatCurrency } = useCurrency();

  const enqueueScenario = useCallback((next: Scenario) => {
    if (activeRef.current) {
      queueRef.current.push(next);
      return;
    }
    activeRef.current = true;
    setStreakShown(next.streak);
    setScenario(next);
  }, []);

  const makeHold = useCallback(() => ({
    run: (ms: number) => new Promise<void>((resolve) => {
      holdResolve.current = resolve;
      progress.set(1);
      holdControls.current = animate(progress, 0, {
        duration: ms / 1000,
        ease: 'linear',
        onComplete: resolve,
      });
    }),
    pause: () => holdControls.current?.pause(),
    resume: () => holdControls.current?.play(),
    dismiss: () => {
      holdControls.current?.stop();
      holdResolve.current?.();
    },
  }), [progress]);

  const handlers: Handlers = {
    setPhase,
    setFilled,
    setStreakShown,
    showPrize: () => {
      setShowPrize(true);
      window.setTimeout(() => setShowPrize(false), 1000);
    },
    burst: (count) => {
      const origin = centerOf('badge');
      if (origin) setBursts((previous) => [...previous, { id: Date.now() + Math.random(), origin, count }]);
    },
    fly: (coins) => {
      const from = centerOf('badge');
      const to = centerOf('balance');
      if (from && to) setCoinFlights((previous) => [...previous, { id: Date.now() + Math.random(), from, to, count: coins }]);
    },
    countBalance: () => {
      window.dispatchEvent(new CustomEvent('checkin:balance-count', {
        detail: { from: scenario.previousBalance, to: scenario.newBalance },
      }));
    },
    playSound: () => playCheckinSound(),
    hold: makeHold(),
  };

  useEffect(() => {
    const key = welcomeBonus?.key;
    const amount = Number(welcomeBonus?.amount) || 0;
    if (!key || amount <= 0 || welcomedKeyRef.current === key) return;
    welcomedKeyRef.current = key;
    enqueueScenario(toWelcomeScenario(amount, welcomeBonus?.balance || 0));
  }, [welcomeBonus?.key, welcomeBonus?.amount, welcomeBonus?.balance, enqueueScenario]);

  useEffect(() => {
    if (!scenario) return;
    let live = true;
    playCheckin(scenario, handlers, () => live).then(() => {
      if (!live) return;
      window.setTimeout(() => {
        if (!live) return;
        setFilled(0);
        setShowPrize(false);
        if (scenario.kind === 'welcome') onWelcomeConsumed?.();
        const next = queueRef.current.shift();
        if (next) {
          setStreakShown(next.streak);
          setScenario(next);
        } else {
          activeRef.current = false;
          setScenario(null);
          setPhase('hidden');
        }
      }, 400);
    });
    return () => { live = false; };
  }, [scenario]);

  useEffect(() => {
    const handleCheckin = (event: Event) => {
      const result = (event as CustomEvent<CheckinResult>).detail;
      if (!result) return;
      enqueueScenario(toScenario(result));
    };
    window.addEventListener('checkin:trigger', handleCheckin);
    return () => window.removeEventListener('checkin:trigger', handleCheckin);
  }, [enqueueScenario]);

  return (
    <>
      <CheckinIsland
        phase={phase}
        kind={scenario?.kind || 'normal'}
        streak={streakShown}
        filled={filled}
        prize={scenario?.prize || 0}
        prizeLabel={formatCurrency(scenario?.prize || 0)}
        subtitle={scenario?.subtitle || ''}
        showPrize={showPrize}
        progress={progress}
        hold={handlers.hold}
      />

      {bursts.map((burst) => (
        <Burst
          key={burst.id}
          origin={burst.origin}
          count={burst.count}
          onDone={() => setBursts((previous) => previous.filter((item) => item.id !== burst.id))}
        />
      ))}

      {coinFlights.map((flight) => (
        <CoinFlight
          key={flight.id}
          from={flight.from}
          to={flight.to}
          count={flight.count}
          onLand={() => {
            const balance = document.querySelector('[data-checkin-balance]');
            if (balance instanceof HTMLElement) {
              balanceScale.current?.stop();
              balanceScale.current = animate(balance, { scale: [1, 1.06, 1] }, { duration: 0.2 });
            }
          }}
          onDone={() => setCoinFlights((previous) => previous.filter((item) => item.id !== flight.id))}
        />
      ))}
    </>
  );
}

export function triggerCheckin(result: CheckinResult) {
  window.dispatchEvent(new CustomEvent('checkin:trigger', { detail: result }));
}
