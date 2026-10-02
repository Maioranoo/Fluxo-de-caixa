import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import * as rateLimit from "../app/lib/server/rate-limit.ts";

const { enforceRateLimit, requestPolicies, clientIdentity, cleanupRateLimits } = rateLimit;

function store() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0006_request_rate_limits.sql", import.meta.url), "utf8"));
  let prepareCalls = 0;
  const db = {
    prepare(sql) {
      prepareCalls += 1;
      const stmt = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            async first() { return stmt.get(...values) ?? null; },
            async all() { return { results: stmt.all(...values) }; },
            async run() { return stmt.run(...values); },
          };
        },
      };
    },
  };
  return { sqlite, db, getPrepareCalls: () => prepareCalls };
}

test("atomic shared counters resist concurrent requests, isolate identities and reset after expiry", async () => {
  const { sqlite, db } = store();
  try {
    const policy = [{ scope: "all", limit: 5 }];
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => enforceRateLimit(db, "ip:192.0.2.1", policy, 61000)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 5);
    for (const result of results.filter(result => result.status === "rejected")) { assert.equal(result.reason.status, 429); assert.equal(result.reason.headers["Retry-After"], "59"); }
    await enforceRateLimit(db, "ip:192.0.2.2", policy, 61000);
    await enforceRateLimit(db, "ip:192.0.2.1", policy, 120000);
    const records = sqlite.prepare("SELECT * FROM request_rate_limits").all();
    assert.equal(records.length, 2);
    assert.ok(records.every(row => !row.bucket_key.includes("192.0.2")));
    await cleanupRateLimits(db, 180000);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM request_rate_limits").get().n, 0);
  } finally { sqlite.close(); }
});

test("storage outage fails closed", async () => {
  await assert.rejects(enforceRateLimit({ prepare() { throw new Error("private database detail"); } }, "ip:unknown", [{ scope: "all", limit: 5 }]), error => error.status === 503 && !error.message.includes("private"));
});

test("todas as políticas da identidade usam uma única operação no banco", async () => {
  const { sqlite, db, getPrepareCalls } = store();
  try {
    await enforceRateLimit(db, "ip:192.0.2.10", [
      { scope: "all", limit: 300 },
      { scope: "api", limit: 120 },
      { scope: "write", limit: 30 },
      { scope: "import", limit: 10 },
    ], 61000);
    assert.equal(getPrepareCalls(), 1);
    assert.deepEqual(
      sqlite.prepare("SELECT substr(bucket_key, 1, instr(bucket_key, ':') - 1) AS scope, hits FROM request_rate_limits ORDER BY scope").all().map(row => ({ ...row })),
      [
        { scope: "all", hits: 1 },
        { scope: "api", hits: 1 },
        { scope: "import", hits: 1 },
        { scope: "write", hits: 1 },
      ],
    );
  } finally { sqlite.close(); }
});

test("limites de IP e usuário autenticado são aplicados em uma única operação", async () => {
  assert.equal(typeof rateLimit.enforceRateLimits, "function");
  const { sqlite, db, getPrepareCalls } = store();
  try {
    await rateLimit.enforceRateLimits(db, [
      { identity: "ip:192.0.2.10", policies: [{ scope: "all", limit: 300 }] },
      { identity: "user:user-123", policies: [{ scope: "api", limit: 120 }, { scope: "write", limit: 30 }] },
    ], 61000);
    assert.equal(getPrepareCalls(), 1);
    assert.deepEqual(
      sqlite.prepare("SELECT substr(bucket_key, 1, instr(bucket_key, ':') - 1) AS scope, hits FROM request_rate_limits ORDER BY scope").all().map(row => ({ ...row })),
      [{ scope: "all", hits: 1 }, { scope: "api", hits: 1 }, { scope: "write", hits: 1 }],
    );
  } finally { sqlite.close(); }
});

test("HTML não consulta o banco e APIs agrupam limites de IP e usuário", () => {
  assert.equal(typeof rateLimit.requestRateLimitChecks, "function");
  assert.deepEqual(rateLimit.requestRateLimitChecks(new Request("https://app.example/")), []);
  const checks = rateLimit.requestRateLimitChecks(new Request("https://app.example/api/finance", {
    headers: { "cf-connecting-ip": "192.0.2.10", "oai-authenticated-user-id": "user-123" },
  }));
  assert.equal(checks.length, 2);
  assert.equal(checks[0].identity, "ip:192.0.2.10");
  assert.equal(checks[1].identity, "user:user-123");
  assert.deepEqual(checks[0].policies.map(policy => policy.scope), ["all", "api"]);
  assert.deepEqual(checks[1].policies.map(policy => policy.scope), ["all", "api"]);
});

test("public, authenticated and unknown paths all have a shared cap; imports have a stricter cap", () => {
  for (const path of ["/", "/signin-with-chatgpt", "/_vinext/image", "/missing", "/api/finance", "/api/admin/households", "/api/imports", "/api/imports/preview", "/api/future"]) {
    assert.equal(requestPolicies(new Request(`https://app.example${path}`))[0].limit, 300);
  }
  assert.equal(requestPolicies(new Request("https://app.example/api/imports/preview", { method: "POST" })).at(-1).limit, 10);
  assert.equal(clientIdentity(new Request("https://app.example", { headers: { "x-forwarded-for": "attacker" } })), "ip:unknown");
});
