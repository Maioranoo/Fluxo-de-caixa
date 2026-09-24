import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { AccessError, requireHousehold } from "../../../../db/tenancy";
import { categories, categoryRules, expenses, importBatches } from "../../../../db/schema";
import { assertSameSite } from "../../security";
import { classifyExpense } from "../../../lib/imports/classifier.ts";
import { fingerprintImportRow, normalizeMerchant } from "../../../lib/imports/fingerprint.ts";
import { validatePreviewPayload } from "../../../lib/imports/validation.ts";
import type { ImportRowWarning, PreviewImportRow } from "../../../lib/imports/types.ts";

export async function POST(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireHousehold(request);
    const payload = validatePreviewPayload(await request.json());
    if (!payload.ok) return Response.json({ error: payload.error }, { status: 400 });
    const db = getDb();
    const [categoryRows, learnedRows, historyRows, fingerprintRows, matchingFiles] = await Promise.all([
      db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))),
      db.select({ pattern: categoryRules.pattern, categoryId: categoryRules.categoryId }).from(categoryRules).where(eq(categoryRules.householdId, context.householdId)),
      db.select({ merchant: expenses.description, categoryId: expenses.categoryId }).from(expenses).where(and(eq(expenses.householdId, context.householdId), isNotNull(expenses.description), isNotNull(expenses.categoryId))),
      db.select({ fingerprint: expenses.importFingerprint }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.referenceMonth, payload.value.referenceMonth), isNotNull(expenses.importFingerprint))),
      db.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.householdId, context.householdId), eq(importBatches.fileHash, payload.value.fileHash))).limit(1),
    ]);
    const existingFingerprints = new Set(fingerprintRows.map(row => row.fingerprint).filter((value): value is string => Boolean(value)));
    const prepared = await Promise.all(payload.value.rows.map(async row => prepareRow(row, payload.value.mode, payload.value.referenceMonth, context.householdId, {
      categories: categoryRows,
      learned: learnedRows,
      history: historyRows.filter((item): item is { merchant: string; categoryId: number } => Boolean(item.merchant) && Boolean(item.categoryId)),
    })));
    const counts = new Map<string, number>();
    prepared.forEach(row => { if (row.fingerprint) counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1); });
    const rows = prepared.map(row => {
      const duplicate = Boolean(row.fingerprint && (existingFingerprints.has(row.fingerprint) || (counts.get(row.fingerprint) ?? 0) > 1));
      const warnings = duplicate ? uniqueWarnings([...row.warnings, "possible_duplicate"]) : row.warnings;
      return { ...row, warnings, selected: duplicate || warnings.includes("excluded_credit") || warnings.includes("invalid_amount") ? false : row.selected };
    });
    return Response.json({ rows, existingFile: matchingFiles.length > 0, categories: categoryRows });
  } catch (error) {
    return routeError(error);
  }
}

async function prepareRow(row: PreviewImportRow, mode: "full" | "minimal", referenceMonth: string, householdId: number, classificationContext: Parameters<typeof classifyExpense>[1]): Promise<PreviewImportRow> {
  const amountCents = row.amountCents;
  const description = row.description?.trim() || null;
  const occurredAt = mode === "minimal" ? null : row.occurredAt;
  const suggestion = mode === "full" && !row.categoryReviewed && !row.newCategoryName ? classifyExpense({ description }, classificationContext) : { categoryId: null, categoryName: null, source: null, confidence: 0 };
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

function uniqueWarnings(warnings: ImportRowWarning[]) {
  return [...new Set(warnings)];
}

function routeError(error: unknown) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Import preview failed", error);
  return Response.json({ error: "Não foi possível preparar a conferência do arquivo." }, { status: 500 });
}
