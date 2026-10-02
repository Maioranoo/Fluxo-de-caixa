import test from "node:test";
import assert from "node:assert/strict";
import { createFinanceClient, adjacentMonths } from "../app/lib/finance-client.ts";

test("month requests deduplicate and cache separately by household", async () => {
  let calls = 0;
  const client = createFinanceClient(async () => { calls++; return Response.json({ expenses: [], household: { id: calls } }); });
  await Promise.all([client.read("2026-10", "1"), client.read("2026-10", "1")]);
  await client.read("2026-10", "1");
  assert.equal(calls, 1);
  await client.read("2026-10", "2");
  assert.equal(calls, 2);
  client.invalidate();
  await client.read("2026-10", "1");
  assert.equal(calls, 3);
});

test("expired data and rejected access are never reused", async () => {
  let now = 0, calls = 0;
  const client = createFinanceClient(async () => { calls++; return Response.json({}, { status: calls === 2 ? 403 : 200 }); }, () => now);
  await client.read("2026-10", "1");
  now = 300001;
  await client.read("2026-10", "1");
  await client.read("2026-10", "1");
  assert.equal(calls, 3);
});

test("one request warms the previous and next month caches", async () => {
  const urls = [];
  const client = createFinanceClient(async url => {
    urls.push(String(url));
    return Response.json({
      categories: [], expenses: [{ id: 10 }], incomes: [], members: [], payments: [], households: [], household: { id: 1 }, currentMember: "Ana", isAdmin: false,
      prefetchedMonths: {
        "2026-09": { expenses: [{ id: 9 }], incomes: [] },
        "2026-11": { expenses: [{ id: 11 }], incomes: [] },
      },
    });
  });

  const current = await client.read("2026-10", "1");
  const previous = await client.read("2026-09", "1");
  const next = await client.read("2026-11", "1");

  assert.equal(urls.length, 1);
  assert.match(urls[0], /month=2026-10/);
  assert.match(urls[0], /months=2026-09%2C2026-10%2C2026-11/);
  assert.equal(current.payload.expenses[0].id, 10);
  assert.equal(previous.payload.expenses[0].id, 9);
  assert.equal(next.payload.expenses[0].id, 11);
});

test("server bootstrap primes the current and adjacent month caches", async () => {
  let calls = 0;
  const client = createFinanceClient(async () => { calls++; return Response.json({}); });
  client.prime("2026-10", "", {
    categories: [], expenses: [{ id: 10 }], incomes: [], members: [], payments: [], households: [], household: { id: 1 }, currentMember: "Ana", isAdmin: false,
    prefetchedMonths: {
      "2026-09": { expenses: [{ id: 9 }], incomes: [] },
      "2026-11": { expenses: [{ id: 11 }], incomes: [] },
    },
  });

  const current = await client.read("2026-10", "");
  const previous = await client.read("2026-09", "");
  const next = await client.read("2026-11", "");

  assert.equal(calls, 0);
  assert.equal(current.payload.expenses[0].id, 10);
  assert.equal(previous.payload.expenses[0].id, 9);
  assert.equal(next.payload.expenses[0].id, 11);
});

test("a pending read cannot repopulate cache after a write", async () => {
  let finish, calls = 0;
  const client = createFinanceClient(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = client.read("2026-10", "1");
  client.invalidate();
  finish(Response.json({}));
  await assert.rejects(pending, { name: "AbortError" });
  const fresh = client.read("2026-10", "1");
  finish(Response.json({}));
  await fresh;
  assert.equal(calls, 2);
});

test("prefetch respects year boundaries and supported dates", () => {
  assert.deepEqual(adjacentMonths("2026-01"), ["2025-12", "2026-02"]);
  assert.deepEqual(adjacentMonths("2000-01"), ["2000-02"]);
  assert.deepEqual(adjacentMonths("2200-12"), ["2200-11"]);
});
