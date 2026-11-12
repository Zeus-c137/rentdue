import { readApiJson } from "./api";

export async function fetchJsonWithSignal<T>(
  url: string,
  signal: AbortSignal,
  init?: RequestInit
): Promise<T> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const res = await fetch(url, { ...init, signal });
  return readApiJson<T>(res);
}

/** Like fetchJsonWithSignal, but resolves with the status instead of throwing on
 * a non-2xx response. Callers that need to branch on 401 (an expired session)
 * cannot do that through a thrown Error, which carries no status. */
export async function fetchJsonSafe<T>(
  url: string,
  signal: AbortSignal
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string }> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const res = await fetch(url, { signal, credentials: "same-origin", cache: "no-store" });
  const body = await res.text();
  let data: unknown = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error =
      (data as { error?: string } | null)?.error || `Request failed (HTTP ${res.status}).`;
    return { ok: false, status: res.status, error };
  }
  return { ok: true, status: res.status, data: data as T };
}

export async function abortableAll<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T>>,
  signal: AbortSignal
): Promise<T[]> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return Promise.all(tasks.map((t) => t(signal)));
}
