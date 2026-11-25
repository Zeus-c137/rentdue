// Registry for effects to find on-screen elements by key
// Used by Burst, CoinFlight, and other effects to locate targets

type Key = 'badge' | 'balance' | 'pill' | 'vipBalance';

const targets = new Map<Key, HTMLElement>();

export function registerTarget(key: Key, el: HTMLElement | null): void {
  if (el) {
    targets.set(key, el);
  } else {
    targets.delete(key);
  }
}

export function rectOf(key: Key): DOMRect | null {
  const el = targets.get(key);
  return el?.getBoundingClientRect() ?? null;
}

/** The registered element itself, for observers that must track its layout. */
export function targetEl(key: Key): HTMLElement | null {
  return targets.get(key) ?? null;
}

export function centerOf(key: Key): { x: number; y: number } | null {
  const el = targets.get(key);
  if (!el) return null;

  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
  };
}