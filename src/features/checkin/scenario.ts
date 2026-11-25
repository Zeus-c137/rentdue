export type Scenario = {
  kind: 'normal' | 'milestone' | 'restart' | 'welcome';
  streak: number;
  previousStreak: number;
  priorCount: number;
  prize: number;
  subtitle: string;
  burst: number[];
  coins: number;
  previousBalance: number;
  newBalance: number;
};

export type CheckinResult = {
  streak: number;
  previousStreak: number;
  wasBroken: boolean;
  prize: number;
  previousBalance: number;
  newBalance: number;
};

export function toWelcomeScenario(amount: number, balance: number): Scenario {
  const prize = Math.max(0, Number(amount) || 0);
  const newBalance = Math.max(0, Number(balance) || 0);
  return {
    kind: 'welcome',
    streak: 0,
    previousStreak: 0,
    priorCount: 0,
    prize,
    subtitle: 'Your registration bonus is ready',
    burst: [16],
    coins: 8,
    previousBalance: Math.max(0, newBalance - prize),
    newBalance,
  };
}

export function toScenario(r: CheckinResult): Scenario {
  const base = {
    streak: r.streak,
    previousStreak: r.previousStreak,
    prize: r.prize,
    priorCount: (r.streak - 1) % 7,
    previousBalance: r.previousBalance,
    newBalance: r.newBalance,
  };

  if (r.streak === 1) {
    return {
      ...base,
      kind: 'restart',
      subtitle: r.wasBroken ? 'Fresh start, welcome back' : 'Welcome aboard',
      burst: [8],
      coins: 5,
    };
  }

  if (r.streak % 7 === 0) {
    return {
      ...base,
      kind: 'milestone',
      subtitle: 'Week complete, bonus added',
      burst: [40, 24],
      coins: 10,
    };
  }

  return {
    ...base,
    kind: 'normal',
    subtitle: 'Keep it going tomorrow',
    burst: [20],
    coins: 5,
  };
}
