import { useCallback, useRef, useState } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion/react';
import { Burst } from '../../components/fx/Burst';
import { CoinFlight } from '../../components/fx/CoinFlight';
import { centerOf, targetEl } from '../../components/fx/targets';

type BurstInstance = { id: number; origin: { x: number; y: number }; count: number };
type FlightInstance = { id: number; from: { x: number; y: number }; to: { x: number; y: number }; count: number };

/** Matches the island's own coin cadence so the two flows feel related. */
const COIN_FLIGHT_MS = 750;

/**
 * Reward-claim effects for the Journey screens.
 *
 * Same vocabulary as the check-in island — a Burst at the tap point and coins
 * arcing to the withdrawable balance, which pulses as they land — but applied
 * in place. There is deliberately no overlay and no morph: the cards stay put
 * and the feedback travels to the balance, which is what the user is watching.
 *
 * `play` takes viewport coordinates (a getBoundingClientRect centre), because
 * the effects are portalled to the body.
 */
export function useClaimFx(targetKey: 'vipBalance' = 'vipBalance') {
  const [bursts, setBursts] = useState<BurstInstance[]>([]);
  const [flights, setFlights] = useState<FlightInstance[]>([]);
  const pulseControls = useRef<AnimationPlaybackControls | undefined>(undefined);

  const pulseTarget = useCallback(() => {
    const el = targetEl(targetKey);
    if (!el) return;
    pulseControls.current?.stop();
    pulseControls.current = animate(el, { scale: [1, 1.08, 1] }, { duration: 0.28 });
  }, [targetKey]);

  const play = useCallback((origin: { x: number; y: number }, coins = 8) => {
    const id = Date.now() + Math.random();
    setBursts((previous) => [...previous, { id, origin, count: 18 }]);
    const to = centerOf(targetKey);
    if (to) setFlights((previous) => [...previous, { id, from: origin, to, count: coins }]);
  }, [targetKey]);

  const layer = (
    <>
      {bursts.map((burst) => (
        <Burst
          key={burst.id}
          origin={burst.origin}
          count={burst.count}
          onDone={() => setBursts((previous) => previous.filter((item) => item.id !== burst.id))}
        />
      ))}
      {flights.map((flight) => (
        <CoinFlight
          key={flight.id}
          from={flight.from}
          to={flight.to}
          count={flight.count}
          onLand={pulseTarget}
          onDone={() => setFlights((previous) => previous.filter((item) => item.id !== flight.id))}
        />
      ))}
    </>
  );

  return { play, layer, flightMs: COIN_FLIGHT_MS };
}
