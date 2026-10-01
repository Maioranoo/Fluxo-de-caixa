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
  now = 31000;
  await client.read("2026-10", "1");
  await client.read("2026-10", "1");
  assert.equal(calls, 3);
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
