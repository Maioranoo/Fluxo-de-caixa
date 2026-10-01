import type { FinanceData } from "./finance-ui.ts";

type Result = { response: { status: number; ok: boolean }; payload: FinanceData & { error?: string } };

/** Per-mounted-panel memory only: never persist financial data or share between sessions. */
export function createFinanceClient(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { result: Result; expires: number }>();
  const pending = new Map<string, Promise<Result>>();
  let generation = 0;
  const invalidate = () => { generation++; cache.clear(); pending.clear(); };
  function read(month: string, household: string): Promise<Result> {
    const key = `${household}:${month}`, hit = cache.get(key);
    if (hit && hit.expires > now()) return Promise.resolve(hit.result);
    if (pending.has(key)) return pending.get(key)!;
    const started = generation;
    const promise = fetcher(`/api/finance?month=${encodeURIComponent(month)}`, {
      cache: "no-store", headers: household ? { "x-household-id": household } : {},
    }).then(async response => ({ response: { status: response.status, ok: response.ok }, payload: await response.json() as Result["payload"] }))
      .then(result => {
        if (generation !== started) throw new DOMException("Leitura substituída", "AbortError");
        if (result.response.status === 401 || result.response.status === 403) invalidate();
        else if (result.response.ok && !result.payload.error) {
          cache.delete(key);
          cache.set(key, { result, expires: now() + 30_000 });
          if (cache.size > 6) cache.delete(cache.keys().next().value!);
        }
        return result;
      }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    pending.set(key, promise);
    return promise;
  }
  async function write(url: string, init: RequestInit) {
    invalidate();
    try { return await fetcher(url, init); }
    finally { invalidate(); }
  }
  return { read, write, invalidate };
}

export function adjacentMonths(month: string): string[] {
  const [year, number] = month.split("-").map(Number);
  return [-1, 1].map(offset => new Date(Date.UTC(year, number - 1 + offset, 1)))
    .filter(date => date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2200)
    .map(date => date.toISOString().slice(0, 7));
}
