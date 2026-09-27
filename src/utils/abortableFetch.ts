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

export async function abortableAll<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T>>,
  signal: AbortSignal
): Promise<T[]> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return Promise.all(tasks.map((t) => t(signal)));
}
