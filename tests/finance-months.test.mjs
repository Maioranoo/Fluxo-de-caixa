import test from "node:test";
import assert from "node:assert/strict";

test("finance endpoint accepts only the requested month and at most two valid neighbors", async () => {
  const financeMonths = await import("../app/lib/finance-months.ts").catch(() => ({}));
  assert.equal(typeof financeMonths.parseFinanceMonths, "function");
  assert.deepEqual(financeMonths.parseFinanceMonths("2026-10", "2026-09,2026-10,2026-11"), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(financeMonths.parseFinanceMonths("2026-10", null), ["2026-10"]);
  assert.equal(financeMonths.parseFinanceMonths("2026-10", "2026-09,2026-11"), null);
  assert.equal(financeMonths.parseFinanceMonths("2026-10", "2026-08,2026-10"), null);
  assert.equal(financeMonths.parseFinanceMonths("2026-10", "2026-08,2026-09,2026-10,2026-11"), null);
  assert.equal(financeMonths.parseFinanceMonths("2026-10", "2026-09,invalid,2026-10"), null);
});

test("month buckets keep imported and dated transactions in their effective month", async () => {
  const financeMonths = await import("../app/lib/finance-months.ts").catch(() => ({}));
  assert.equal(typeof financeMonths.bucketFinanceRows, "function");
  const buckets = financeMonths.bucketFinanceRows(
    [
      { id: 1, referenceMonth: "2026-09", occurredAt: null },
      { id: 2, referenceMonth: null, occurredAt: "2026-10-15" },
    ],
    [{ id: 3, occurredAt: "2026-11-02" }],
    ["2026-09", "2026-10", "2026-11"],
  );
  assert.deepEqual(buckets["2026-09"].expenses.map(row => row.id), [1]);
  assert.deepEqual(buckets["2026-10"].expenses.map(row => row.id), [2]);
  assert.deepEqual(buckets["2026-11"].incomes.map(row => row.id), [3]);
});
