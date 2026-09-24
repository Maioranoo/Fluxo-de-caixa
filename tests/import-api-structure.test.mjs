import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("schema registra lotes, regras privadas e campos opcionais", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /export const importBatches/);
  assert.match(schema, /export const categoryRules/);
  assert.match(schema, /export const importBatchCategories/);
  assert.match(schema, /importBatchId/);
  assert.match(schema, /referenceMonth/);
  assert.match(schema, /importFingerprint/);
  assert.match(schema, /importedByName/);
});

test("migração preserva gastos e cria índices de importação", async () => {
  const migration = await readFile(new URL("../drizzle/0005_import_batches.sql", import.meta.url), "utf8");
  assert.match(migration, /INSERT INTO `expenses_new`/);
  assert.match(migration, /CREATE TABLE `import_batches`/);
  assert.match(migration, /CREATE TABLE `category_rules`/);
  assert.match(migration, /CREATE INDEX `idx_expenses_household_reference_month`/);
});

test("prévia é protegida, isolada e não grava dados", async () => {
  const route = await readFile(new URL("../app/api/imports/preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireHousehold\(request\)/);
  assert.match(route, /assertSameSite\(request\)/);
  assert.match(route, /eq\(categoryRules\.householdId, context\.householdId\)/);
  assert.match(route, /eq\(expenses\.householdId, context\.householdId\)/);
  assert.doesNotMatch(route, /db\.insert|db\.update|db\.delete/);
  assert.match(route, /possible_duplicate/);
  assert.match(route, /date_mismatch/);
  assert.match(route, /excluded_credit/);
  assert.match(route, /suggestion\.source === "built-in"/);
});

test("confirmação e exclusão de lote revalidam família e usam batch", async () => {
  const route = await readFile(new URL("../app/api/imports/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireHousehold\(request\)/);
  assert.match(route, /assertSameSite\(request\)/);
  assert.match(route, /eq\(importBatches\.householdId, context\.householdId\)/);
  assert.match(route, /eq\(categories\.householdId, context\.householdId\)/);
  assert.match(route, /eq\(paymentMethods\.householdId, context\.householdId\)/);
  assert.match(route, /eq\(householdMembers\.householdId, context\.householdId\)/);
  assert.match(route, /db\.batch\(/);
  assert.match(route, /validateImportPayload/);
  assert.match(route, /MAX_IMPORT_ROWS/);
  assert.match(route, /json_each/);
  assert.doesNotMatch(route, /expenses\)\.values\(selected\.map/);
});

test("histórico permite consultar os itens de cada lote", async () => {
  const history = await readFile(new URL("../app/components/imports/import-history.tsx", import.meta.url), "utf8");
  assert.match(history, /batchId=/);
  assert.match(history, /Ver itens/);
  assert.match(history, /Itens de/);
  assert.match(history, /Não informado/);
  assert.match(history, /Página/);
});
