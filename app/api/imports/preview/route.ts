import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { AccessError, requireHousehold } from "../../../../db/tenancy";
import { categories, categoryRules, expenses, importBatches } from "../../../../db/schema";
import { assertSameSite, readJsonObject } from "../../security";
import { createExpenseClassifier, type CategorySuggestion } from "../../../lib/imports/classifier.ts";
import { fingerprintImportRow, normalizeMerchant } from "../../../lib/imports/fingerprint.ts";
import { MAX_IMPORT_BYTES, validatePreviewPayload } from "../../../lib/imports/validation.ts";
import type { ImportRowWarning, PreviewImportRow } from "../../../lib/imports/types.ts";
import { markErrorObserved, measureOperation } from "../../../lib/server/observability/measure.ts";
import { observabilityForRequest } from "../../../lib/server/observability/runtime.ts";

export async function POST(request: Request) {
  const { logger, config } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request);
    const payload = validatePreviewPayload(await readJsonObject(request, MAX_IMPORT_BYTES));
    if (!payload.ok) return Response.json({ error: payload.error }, { status: 400 });
    const db = getDb();
    const [categoryRows, learnedRows, historyRows, fingerprintRows, matchingFiles] = await measureOperation(logger, { operation: "database.import_preview", kind: "database", databaseBaselineLogging: config.databaseBaselineLogging, slowThresholdMs: config.slowDatabaseQueryMs }, () => Promise.all([
      db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))),
      db.select({ pattern: categoryRules.pattern, categoryId: categoryRules.categoryId }).from(categoryRules).where(eq(categoryRules.householdId, context.householdId)).orderBy(desc(categoryRules.updatedAt)).limit(MAX_CLASSIFICATION_RULES),
      db.select({ merchant: expenses.description, categoryId: expenses.categoryId }).from(expenses).where(and(eq(expenses.householdId, context.householdId), isNotNull(expenses.description), isNotNull(expenses.categoryId))).orderBy(desc(expenses.id)).limit(MAX_CLASSIFICATION_HISTORY),
      db.select({ fingerprint: expenses.importFingerprint }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.referenceMonth, payload.value.referenceMonth), isNotNull(expenses.importFingerprint))),
      db.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.householdId, context.householdId), eq(importBatches.fileHash, payload.value.fileHash))).limit(1),
    ]));
    const existingFingerprints = new Set(fingerprintRows.map(row => row.fingerprint).filter((value): value is string => Boolean(value)));
    const classify = createExpenseClassifier({
      categories: categoryRows,
      learned: learnedRows,
      history: historyRows.filter((item): item is { merchant: string; categoryId: number } => Boolean(item.merchant) && Boolean(item.categoryId)),
    });
    const prepared = await measureOperation(logger, { operation: "import.preview.classify", kind: "application", completedEvent: "import_classification_completed", fields: { count: payload.value.rows.length, mode: payload.value.mode } }, () => Promise.all(payload.value.rows.map(async row => prepareRow(row, payload.value.mode, payload.value.referenceMonth, context.householdId, classify))));
    const counts = new Map<string, number>();
    prepared.forEach(row => { if (row.fingerprint) counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1); });
    const rows = prepared.map(row => {
      const duplicate = Boolean(row.fingerprint && (existingFingerprints.has(row.fingerprint) || (counts.get(row.fingerprint) ?? 0) > 1));
      const warnings = duplicate ? uniqueWarnings([...row.warnings, "possible_duplicate"]) : row.warnings;
      return { ...row, warnings, selected: duplicate || warnings.includes("excluded_credit") || warnings.includes("invalid_amount") ? false : row.selected };
    });
    logger.info("import_preview_completed", { operation: "import.preview", outcome: "success", durationMs: performance.now() - started, count: rows.length, mode: payload.value.mode });
    return Response.json({ rows, existingFile: matchingFiles.length > 0, categories: categoryRows });
  } catch (error) {
    return routeError(error, logger, started);
  }
}

async function prepareRow(row: PreviewImportRow, mode: "full" | "minimal", referenceMonth: string, householdId: number, classify: (input: { description: string | null }) => CategorySuggestion): Promise<PreviewImportRow> {
  const amountCents = row.amountCents;
  const description = row.description?.trim() || null;
  const occurredAt = mode === "minimal" ? null : row.occurredAt;
  const suggestion = mode === "full" && !row.categoryReviewed && !row.newCategoryName ? classify({ description }) : { categoryId: null, categoryName: null, source: null, confidence: 0 };
  const warnings: ImportRowWarning[] = [];
  if (!amountCents) warnings.push("invalid_amount");
  if (amountCents && (amountCents < 0 || /\b(?:estorno|credito|pagamento(?: da)? fatura|pagamento recebido)\b/i.test(normalizeMerchant(description)))) warnings.push("excluded_credit");
  if (occurredAt && !occurredAt.startsWith(referenceMonth)) warnings.push("date_mismatch");
  const fingerprint = amountCents ? await fingerprintImportRow({ householdId, referenceMonth, amountCents, description, occurredAt }) : null;
  const suggestedNewCategory = !row.categoryReviewed && !row.categoryId && !row.newCategoryName && suggestion.source === "built-in" && suggestion.categoryId === null ? suggestion.categoryName : null;
  return {
    ...row,
    amountCents,
    description,
    occurredAt,
    categoryId: mode === "full" ? (row.categoryReviewed ? row.categoryId : row.newCategoryName || suggestedNewCategory ? null : row.categoryId ?? suggestion.categoryId) : null,
    categoryReviewed: mode === "full" ? row.categoryReviewed : false,
    newCategoryName: mode === "full" ? row.newCategoryName ?? suggestedNewCategory : null,
    suggestedCategoryName: mode === "full" && !row.newCategoryName ? suggestion.categoryName : null,
    suggestionSource: mode === "full" ? suggestion.source : null,
    paymentMethod: mode === "full" ? row.paymentMethod : null,
    person: mode === "full" ? row.person : null,
    warnings: uniqueWarnings(warnings),
    fingerprint,
  };
}

export const MAX_CLASSIFICATION_HISTORY = 1000;
export const MAX_CLASSIFICATION_RULES = 1000;

function uniqueWarnings(warnings: ImportRowWarning[]) {
  return [...new Set(warnings)];
}

function routeError(error: unknown, logger: ReturnType<typeof observabilityForRequest>["logger"], started: number) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
  if (markErrorObserved(error)) logger.error("unexpected_error", { operation: "import.preview", status: 500, durationMs: performance.now() - started, ...(error instanceof Error ? { errorName: error.name, errorMessage: error.message, errorStack: error.stack } : {}) });
  return Response.json({ error: "Não foi possível preparar a conferência do arquivo." }, { status: 500 });
}
