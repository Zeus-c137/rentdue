import { useEffect, useState } from "react";

/** Shared ledger read for screens that need a transaction-derived summary. */
export function useTransactions(phone?: string) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => Boolean(phone));

  useEffect(() => {
    if (!phone) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/profile/transactions/${encodeURIComponent(phone)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!controller.signal.aborted) setTransactions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTransactions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [phone]);

  return { transactions, loading };
}
