export interface CheckinHistory {
  days: string[];
  ledger: Record<string, number>;
}

const historyCache = new Map<string, { data: CheckinHistory; expiresAt: number }>();
const HISTORY_TTL_MS = 5 * 60 * 1000;

export function readCachedHistory(phone: string): CheckinHistory | null {
  const cached = historyCache.get(phone);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    historyCache.delete(phone);
    return null;
  }
  return cached.data;
}

export function writeCachedHistory(phone: string, data: CheckinHistory): void {
  historyCache.set(phone, { data, expiresAt: Date.now() + HISTORY_TTL_MS });
}

export function recordCheckinHistory(phone: string, day: string, amount: number): void {
  const previous = readCachedHistory(phone);
  if (!previous) {
    historyCache.delete(phone);
    window.dispatchEvent(new CustomEvent('checkin:history-updated', { detail: { phone, data: null } }));
    return;
  }
  const days = new Set(previous.days);
  days.add(day);
  const ledger = { ...previous.ledger, [day]: Math.max(0, Number(amount) || 0) };
  const data = { days: [...days].sort(), ledger };
  writeCachedHistory(phone, data);
  window.dispatchEvent(new CustomEvent('checkin:history-updated', { detail: { phone, data } }));
}
