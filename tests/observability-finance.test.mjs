import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("finance read measures D1 batch with configurable baseline", async () => {
  const source = await readFile(new URL("../app/lib/server/finance-data.ts", import.meta.url), "utf8");
  assert.match(source, /measureOperation/);
  assert.match(source, /database\.finance_batch/);
  assert.match(source, /databaseBaselineLogging/);
  assert.match(source, /slowDatabaseQueryMs/);
  assert.doesNotMatch(source, /logger.*sql|sql.*logger/);
});

test("finance handlers emit safe semantic events and server fallback is observable", async () => {
  const route = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const event of ["finance_fetch_completed", "expense_created", "expense_updated", "expense_deleted", "income_created", "category_created", "payment_created"]) assert.match(route, new RegExp(event));
  assert.match(page, /initial_finance_load_failed/);
  assert.doesNotMatch(route, /logger\.[a-z]+\([^\n]*(amount|description|person|paymentMethod|body)/);
});
