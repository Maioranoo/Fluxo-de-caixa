import { and, asc, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { AccessError, requireHousehold } from "../../../db/tenancy";
import { categories, categoryRules, expenses, householdMembers, importBatchCategories, importBatches, incomes, paymentMethods } from "../../../db/schema";
import { assertSameSite, readJsonObject } from "../security";
import { normalizeMerchant } from "../../lib/imports/fingerprint.ts";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, validateImportPayload } from "../../lib/imports/validation.ts";
import { isValidMonthInput, normalizeCategoryName, parsePositiveSafeInteger } from "../../lib/validation.ts";
import { markErrorObserved, measureOperation } from "../../lib/server/observability/measure.ts";
import { observabilityForRequest } from "../../lib/server/observability/runtime.ts";

export async function GET(request: Request) {
  const { logger } = observabilityForRequest(request), started = performance.now();
  try {
    const context = await requireHousehold(request);
    const url = new URL(request.url);
    const batchId = positiveId(url.searchParams.get("batchId"));
    if (url.searchParams.has("batchId") && !batchId) return Response.json({ error: "Importação inválida." }, { status: 400 });
    const requestedPage = url.searchParams.get("page");
    if (requestedPage !== null && (!positiveId(requestedPage) || Number(requestedPage) > 1000000)) return Response.json({ error: "Página inválida." }, { status: 400 });
    if (batchId) {
      const page = Math.max(1, positiveId(url.searchParams.get("page")) ?? 1);
      const pageSize = 50;
      const [owned] = await getDb().select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.householdId, context.householdId))).limit(1);
      if (!owned) return Response.json({ error: "Importação não encontrada." }, { status: 404 });
      const items = await getDb().select({ id: expenses.id, amountCents: expenses.amountCents, description: expenses.description, occurredAt: expenses.occurredAt, categoryId: expenses.categoryId, category: categories.name, paymentMethod: expenses.paymentMethod, person: expenses.person }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id)).where(and(eq(expenses.householdId, context.householdId), eq(expenses.importBatchId, batchId))).orderBy(asc(expenses.id)).limit(pageSize).offset((page - 1) * pageSize);
      logger.info("import_read_completed", { operation: "import.items.read", outcome: "success", durationMs: performance.now() - started, count: items.length });
      return Response.json({ items, page, pageSize });
    }
    const month = url.searchParams.get("month");
    if (month !== null && !isValidMonthInput(month)) return Response.json({ error: "Mês inválido." }, { status: 400 });
    const conditions = month ? and(eq(importBatches.householdId, context.householdId), eq(importBatches.referenceMonth, month)) : eq(importBatches.householdId, context.householdId);
    const batches = await getDb().select().from(importBatches).where(conditions).orderBy(sql`${importBatches.createdAt} desc`, sql`${importBatches.id} desc`);
    logger.info("import_read_completed", { operation: "import.history.read", outcome: "success", durationMs: performance.now() - started, count: batches.length });
    return Response.json({ batches });
  } catch (error) {
    return routeError(error, logger, started, "import.read");
  }
}

export async function POST(request: Request) {
  const { logger, config } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request);
    const payload = validateImportPayload(await readJsonObject(request, MAX_IMPORT_BYTES));
    if (!payload.ok) return Response.json({ error: payload.error }, { status: 400 });
    if (payload.value.rows.length > MAX_IMPORT_ROWS) return Response.json({ error: "O arquivo deve ter no máximo 5.000 linhas." }, { status: 400 });
    const selected = payload.value.rows.filter(row => row.selected);
    const db = getDb();
    const [ownedCategories, ownedPayments, ownedMembers] = await Promise.all([
      db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))),
      db.select({ key: paymentMethods.key }).from(paymentMethods).where(eq(paymentMethods.householdId, context.householdId)),
      db.select({ id: householdMembers.id, name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)),
    ]);
    const categoryIds = new Set(ownedCategories.map(item => item.id));
    const paymentKeys = new Set(ownedPayments.map(item => item.key));
    const memberNames = new Set(ownedMembers.map(item => item.name));
    if (payload.value.defaultPaymentMethod && !paymentKeys.has(payload.value.defaultPaymentMethod)) return Response.json({ error: "Pagamento padrão inválido." }, { status: 400 });
    if (payload.value.defaultPerson && !memberNames.has(payload.value.defaultPerson)) return Response.json({ error: "Integrante padrão inválido." }, { status: 400 });
    const knownCategoryNames = new Map(ownedCategories.map(item => [item.name.toLocaleLowerCase("pt-BR"), item]));
    const batchId = randomSafeId();
    const newCategories = new Map<string, { id: number; name: string }>();

    for (const row of selected) {
      if (payload.value.mode === "minimal") { row.categoryId = null; row.paymentMethod = null; row.person = null; row.occurredAt = null; continue; }
      if (row.categoryId && !categoryIds.has(row.categoryId)) return Response.json({ error: "Uma categoria mudou durante a conferência. Atualize a prévia." }, { status: 409 });
      if (!row.categoryId && row.newCategoryName) {
        const name = normalizeCategoryName(row.newCategoryName);
        if (!name) return Response.json({ error: "Revise o nome da nova categoria." }, { status: 400 });
        const key = name.toLocaleLowerCase("pt-BR");
        const existing = knownCategoryNames.get(key) ?? newCategories.get(key);
        if (existing) row.categoryId = existing.id;
        else { const created = { id: randomSafeId(), name }; newCategories.set(key, created); row.categoryId = created.id; }
      }
      if (row.paymentMethod && !paymentKeys.has(row.paymentMethod)) return Response.json({ error: "Uma forma de pagamento mudou durante a conferência. Atualize a prévia." }, { status: 409 });
      if (row.person && !memberNames.has(row.person)) return Response.json({ error: "Um integrante mudou durante a conferência. Atualize a prévia." }, { status: 409 });
    }

    const d1 = getD1();
    const totalCents = selected.reduce((sum, row) => sum + row.amountCents!, 0);
    const statements = [d1.prepare(`INSERT INTO import_batches (id, household_id, original_filename, file_hash, source_type, mode, reference_month, imported_by_member_id, imported_by_name, default_payment_method, default_person, item_count, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      batchId, context.householdId, payload.value.fileName, payload.value.fileHash, payload.value.sourceType, payload.value.mode, payload.value.referenceMonth,
      ownedMembers.some(item => item.id === context.memberId) ? context.memberId : null, context.displayName, payload.value.defaultPaymentMethod, payload.value.defaultPerson, selected.length, totalCents,
    )];
    for (const values of chunks([...newCategories.values()], DATABASE_CHUNK_SIZE)) {
      const encoded = JSON.stringify(values);
      statements.push(d1.prepare(`INSERT INTO categories (id, household_id, name, kind) SELECT CAST(json_extract(value, '$.id') AS INTEGER), ?, json_extract(value, '$.name'), 'expense' FROM json_each(?)`).bind(context.householdId, encoded));
      statements.push(d1.prepare(`INSERT INTO import_batch_categories (import_batch_id, category_id) SELECT ?, CAST(json_extract(value, '$.id') AS INTEGER) FROM json_each(?)`).bind(batchId, encoded));
    }
    const expenseValues = selected.map(row => ({ amountCents: row.amountCents, description: row.description, categoryId: row.categoryId, paymentMethod: row.paymentMethod, person: row.person, occurredAt: row.occurredAt, fingerprint: row.fingerprint }));
    for (const values of chunks(expenseValues, DATABASE_CHUNK_SIZE)) {
      statements.push(d1.prepare(`INSERT INTO expenses (household_id, amount_cents, description, category_id, payment_method, person, occurred_at, import_batch_id, reference_month, import_fingerprint) SELECT ?, CAST(json_extract(value, '$.amountCents') AS INTEGER), json_extract(value, '$.description'), CAST(json_extract(value, '$.categoryId') AS INTEGER), json_extract(value, '$.paymentMethod'), json_extract(value, '$.person'), json_extract(value, '$.occurredAt'), ?, ?, json_extract(value, '$.fingerprint') FROM json_each(?)`).bind(context.householdId, batchId, payload.value.referenceMonth, JSON.stringify(values)));
    }
    const learnedRules = new Map<string, number>();
    for (const row of selected) {
      const pattern = normalizeMerchant(row.description);
      if (!pattern || !row.categoryId || !row.learnCategory) continue;
      learnedRules.set(pattern, row.categoryId);
    }
    for (const values of chunks([...learnedRules].map(([pattern, categoryId]) => ({ pattern, categoryId })), DATABASE_CHUNK_SIZE)) {
      statements.push(d1.prepare(`INSERT INTO category_rules (household_id, category_id, pattern, source) SELECT ?, CAST(json_extract(value, '$.categoryId') AS INTEGER), json_extract(value, '$.pattern'), 'learned' FROM json_each(?) WHERE true ON CONFLICT(household_id, pattern) DO UPDATE SET category_id = excluded.category_id, updated_at = CURRENT_TIMESTAMP`).bind(context.householdId, JSON.stringify(values)));
    }
    await measureOperation(logger, { operation: "database.import_commit", kind: "database", databaseBaselineLogging: config.databaseBaselineLogging, slowThresholdMs: config.slowDatabaseQueryMs }, () => d1.batch(statements));
    logger.info("import_completed", { operation: "import.commit", outcome: "success", durationMs: performance.now() - started, count: selected.length, mode: payload.value.mode });
    return Response.json({ batch: { id: batchId, itemCount: selected.length, totalCents } }, { status: 201 });
  } catch (error) {
    return routeError(error, logger, started, "import.commit");
  }
}

export async function DELETE(request: Request) {
  const { logger, config } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request);
    const id = positiveId(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Importação inválida." }, { status: 400 });
    const db = getDb();
    const [batch] = await db.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.householdId, context.householdId))).limit(1);
    if (!batch) return Response.json({ error: "Importação não encontrada." }, { status: 404 });
    const created = await db.select({ categoryId: importBatchCategories.categoryId }).from(importBatchCategories).where(eq(importBatchCategories.importBatchId, id));
    const statements: unknown[] = [
      db.delete(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.importBatchId, id))),
      db.delete(importBatchCategories).where(eq(importBatchCategories.importBatchId, id)),
      db.delete(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.householdId, context.householdId))),
    ];
    for (const item of created) {
      const unused = and(
        notExists(db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.categoryId, item.categoryId), or(isNull(expenses.importBatchId), ne(expenses.importBatchId, id))))),
        notExists(db.select({ id: incomes.id }).from(incomes).where(and(eq(incomes.householdId, context.householdId), eq(incomes.categoryId, item.categoryId)))),
      );
      statements.unshift(db.delete(categoryRules).where(and(eq(categoryRules.householdId, context.householdId), eq(categoryRules.categoryId, item.categoryId), unused)));
      statements.push(db.delete(categories).where(and(eq(categories.id, item.categoryId), eq(categories.householdId, context.householdId), unused)));
    }
    await measureOperation(logger, { operation: "database.import_delete", kind: "database", databaseBaselineLogging: config.databaseBaselineLogging, slowThresholdMs: config.slowDatabaseQueryMs }, () => db.batch(statements as unknown as Parameters<typeof db.batch>[0]));
    logger.info("import_deleted", { operation: "import.delete", outcome: "success", durationMs: performance.now() - started, deletedCount: 1 });
    return Response.json({ deleted: id });
  } catch (error) {
    return routeError(error, logger, started, "import.delete");
  }
}

function randomSafeId() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return ((values[0] & 0x1fffff) * 0x100000000 + values[1]) || 1;
}

const DATABASE_CHUNK_SIZE = 1000;

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function positiveId(value: unknown) {
  return parsePositiveSafeInteger(value);
}

function routeError(error: unknown, logger: ReturnType<typeof observabilityForRequest>["logger"], started: number, operation: string) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
  if (markErrorObserved(error)) logger.error("unexpected_error", { operation, status: 500, durationMs: performance.now() - started, ...(error instanceof Error ? { errorName: error.name, errorMessage: error.message, errorStack: error.stack } : {}) });
  return Response.json({ error: "Não foi possível concluir a operação de importação." }, { status: 500 });
}
