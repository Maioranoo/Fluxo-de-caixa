import { AccessError } from "./http-security.ts";

// A structural interface keeps the policy testable against SQLite without a Worker.
export interface RateLimitDatabase {
  prepare(query: string): {
    bind(...values: (string | number)[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
  };
}

export type RatePolicy = { scope: string; limit: number };
export const WINDOW_SECONDS = 60;

export function requestPolicies(request: Request): RatePolicy[] {
  const path = new URL(request.url).pathname;
  const policies = [{ scope: "all", limit: 300 }];
  if (path === "/api" || path.startsWith("/api/")) {
    policies.push({ scope: "api", limit: 120 });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) policies.push({ scope: "write", limit: 30 });
    if ((path === "/api/imports" || path.startsWith("/api/imports/")) && request.method === "POST") policies.push({ scope: "import", limit: 10 });
  }
  return policies;
}

export async function enforceRateLimit(db: RateLimitDatabase, identity: string, policies: RatePolicy[], now = Date.now()) {
  const seconds = Math.floor(now / 1000);
  const expiresAt = (Math.floor(seconds / WINDOW_SECONDS) + 1) * WINDOW_SECONDS;
  // Do not persist clear-text IP addresses, email addresses or authentication headers.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  try {
    const buckets = policies.map(policy => ({ key: `${policy.scope}:${hash}`, limit: policy.limit }));
    const result = await db.prepare(`
      INSERT INTO request_rate_limits (bucket_key, hits, expires_at)
      SELECT json_extract(value, '$.key'), 1, ?
      FROM json_each(?)
      WHERE true
      ON CONFLICT(bucket_key) DO UPDATE SET
        hits = CASE WHEN request_rate_limits.expires_at <= ? THEN 1 ELSE request_rate_limits.hits + 1 END,
        expires_at = CASE WHEN request_rate_limits.expires_at <= ? THEN excluded.expires_at ELSE request_rate_limits.expires_at END
      RETURNING bucket_key, hits, expires_at
    `).bind(expiresAt, JSON.stringify(buckets), seconds, seconds).all<{ bucket_key: string; hits: number; expires_at: number }>();
    if (result.results.length !== policies.length) throw new Error("Rate limit storage unavailable");
    const rows = new Map(result.results.map(row => [row.bucket_key, row]));
    for (const bucket of buckets) {
      const row = rows.get(bucket.key);
      if (!row) throw new Error("Rate limit storage unavailable");
      if (row.hits > bucket.limit) throw new AccessError("Muitas solicitações. Aguarde antes de tentar novamente.", 429, { "Retry-After": String(Math.max(1, row.expires_at - seconds)), "Cache-Control": "no-store" });
    }
  } catch (error) {
    if (error instanceof AccessError) throw error;
    // Fail closed: a missing migration or database outage must not remove protection.
    throw new AccessError("Proteção de acesso temporariamente indisponível.", 503, { "Retry-After": "60", "Cache-Control": "no-store" });
  }
}

export async function cleanupRateLimits(db: RateLimitDatabase, now = Date.now()) {
  await db.prepare("DELETE FROM request_rate_limits WHERE bucket_key IN (SELECT bucket_key FROM request_rate_limits WHERE expires_at <= ? LIMIT 1000)").bind(Math.floor(now / 1000)).run();
}

export function clientIdentity(request: Request) {
  // CF-Connecting-IP must be overwritten by the trusted edge. Never trust X-Forwarded-For.
  return `ip:${request.headers.get("cf-connecting-ip") || "unknown"}`;
}
