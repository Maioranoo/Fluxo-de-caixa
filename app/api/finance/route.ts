import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { AccessError, requireHousehold } from "../../../db/tenancy";
import { categories, categoryRules, expenses, householdMembers, households, importBatches, incomes, paymentMethods } from "../../../db/schema";
import { isCategoryKind, isValidDateInput, isValidMonthInput, normalizeCategoryName, normalizeDescription, normalizeImportedDescription, normalizePaymentName, parseInstallments, parseMoneyInput, parsePositiveSafeInteger } from "../../lib/validation";
import { assertSameSite, readJsonObject } from "../security";
import { normalizeMerchant } from "../../lib/imports/fingerprint.ts";
import { expenseDeletionFilter } from "../../lib/server/expense-deletion.ts";
import { InvalidFinanceMonthsError, loadFinanceData } from "../../lib/server/finance-data.ts";
import { measureOperation, markErrorObserved } from "../../lib/server/observability/measure.ts";
import { observabilityForRequest } from "../../lib/server/observability/runtime.ts";

export async function GET(request: Request) {
  const { logger } = observabilityForRequest(request);
  try {
    const started = performance.now();
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const payload = await measureOperation(logger, { operation: "finance.fetch", kind: "application", completedEvent: "finance_fetch_completed" }, () => loadFinanceData(request, month, url.searchParams.get("months")));
    return Response.json(payload, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `total;dur=${(performance.now() - started).toFixed(1)}` } });
  } catch (error) {
    if (error instanceof InvalidFinanceMonthsError) return Response.json({ error: error.message }, { status: 400 });
    return accessResponse(error);
  }
}

export async function POST(request: Request) {
  const { logger } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), body = await readJsonObject(request), db = getDb();
    if (body.type === "income") {
      const [household] = await db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1);
      if (!household?.allowIncome) return Response.json({ error: "Entradas não estão habilitadas para esta família." }, { status: 403 });
      const amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
      const [ownedCategory] = categoryId ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, context.householdId), eq(categories.kind, "income"))).limit(1) : [];
      const allowedPeople = await db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
      if (!amountCents) return invalid("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo dois centavos.");
      if (!description) return invalid("A descrição deve conter letras e ter no máximo 160 caracteres.");
      if (!ownedCategory) return invalid("Selecione uma categoria de entrada válida.");
      if (!isValidDateInput(body.occurredAt)) return invalid("Selecione uma data válida entre 2000 e 2200.");
      if (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person)) return invalid("Selecione um integrante válido.");
      const [income] = await db.insert(incomes).values({ householdId: context.householdId, amountCents, description, categoryId, person: body.person, occurredAt: body.occurredAt as string }).returning({ id: incomes.id, amountCents: incomes.amountCents, description: incomes.description, categoryId: incomes.categoryId, person: incomes.person, occurredAt: incomes.occurredAt });
      logger.info("income_created", { operation: "income.create", outcome: "success", durationMs: performance.now() - started });
      return Response.json({ income: { ...income, category: ownedCategory.name } }, { status: 201 });
    }
    if (body.type === "category") {
      const name = normalizeCategoryName(body.name), kind = body.kind;
      if (!name) return invalid("A categoria deve conter letras e ter no máximo 60 caracteres.");
      if (!isCategoryKind(kind)) return invalid("Selecione onde a categoria será usada.");
      const [household] = await db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1);
      if (kind === "income" && !household?.allowIncome) return Response.json({ error: "Categorias de entrada não estão disponíveis para esta carteira." }, { status: 403 });
      try {
        const [category] = await db.insert(categories).values({ householdId: context.householdId, name, kind }).returning({ id: categories.id, name: categories.name, kind: categories.kind });
        logger.info("category_created", { operation: "category.create", outcome: "success", durationMs: performance.now() - started });
        return Response.json({ category }, { status: 201 });
      } catch { return Response.json({ error: "Essa categoria já existe nesta família." }, { status: 409 }); }
    }
    if (body.type === "payment") {
      const name = normalizePaymentName(body.name);
      if (!name) return invalid("A forma de pagamento deve conter letras e ter no máximo 60 caracteres.");
      if (typeof body.isCard !== "boolean") return invalid("Informe se a forma de pagamento permite parcelamento.");
      const isCard = body.isCard;
      try {
        const [payment] = await db.insert(paymentMethods).values({ householdId: context.householdId, key: `pagamento_${crypto.randomUUID()}`, name, isCard }).returning();
        logger.info("payment_created", { operation: "payment.create", outcome: "success", durationMs: performance.now() - started });
        return Response.json({ payment }, { status: 201 });
      } catch { return Response.json({ error: "Essa forma de pagamento já existe nesta família." }, { status: 409 }); }
    }
    if (body.type !== "expense") return invalid("Tipo de lançamento inválido.");
    const amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
    const [[ownedPayment], [ownedCategory], allowedPeople] = await db.batch([
      db.select().from(paymentMethods).where(and(eq(paymentMethods.key, typeof body.paymentMethod === "string" ? body.paymentMethod : ""), eq(paymentMethods.householdId, context.householdId))).limit(1),
      db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId ?? -1), eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))).limit(1),
      db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)),
    ]);
    const installmentCount = amountCents ? (ownedPayment?.isCard ? parseInstallments(body.installments ?? "1", amountCents) : 1) : null;
    if (!amountCents) return invalid("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo dois centavos.");
    if (!description) return invalid("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!ownedCategory) return invalid("Selecione uma categoria de gasto válida.");
    if (!ownedPayment) return invalid("Selecione uma forma de pagamento válida.");
    if (!installmentCount) return invalid("O número de parcelas deve ser um inteiro entre 1 e 60 e não pode superar o valor em centavos.");
    if (!isValidDateInput(body.occurredAt)) return invalid("Selecione uma data válida entre 2000 e 2200.");
    if (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person)) return invalid("Selecione um integrante válido.");
    if (!isValidDateInput(addMonths(body.occurredAt as string, installmentCount - 1))) return invalid("A última parcela precisa ficar dentro do limite de dezembro de 2200.");
    const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount;
    const installmentGroupId = installmentCount > 1 ? crypto.randomUUID() : null;
    const rows = Array.from({ length: installmentCount }, (_, index) => ({ householdId: context.householdId, installmentGroupId, amountCents: baseAmount + (index < remainder ? 1 : 0), description: installmentCount > 1 ? `${description} (${index + 1}/${installmentCount})` : description, categoryId, paymentMethod: body.paymentMethod as string, person: body.person as string, occurredAt: addMonths(body.occurredAt as string, index) }));
    const created = await db.insert(expenses).values(rows).returning();
    logger.info("expense_created", { operation: "expense.create", outcome: "success", durationMs: performance.now() - started, count: created.length });
    return Response.json({ expenses: created.map(item => ({ ...item, category: ownedCategory.name })), installments: installmentCount }, { status: 201 });
  } catch (error) { return accessResponse(error, logger, started); }
}

export async function PATCH(request: Request) {
  const { logger } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), body = await readJsonObject(request), db = getDb();
    if (body.type === "expense") {
      const id = parsePositiveSafeInteger(body.id), amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
      const [[currentExpense], [ownedCategory], [ownedPayment], allowedPeople] = await db.batch([
        db.select({ amountCents: expenses.amountCents, importBatchId: expenses.importBatchId, referenceMonth: expenses.referenceMonth }).from(expenses).where(and(eq(expenses.id, id ?? -1), eq(expenses.householdId, context.householdId))).limit(1),
        db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId ?? -1), eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))).limit(1),
        db.select({ key: paymentMethods.key }).from(paymentMethods).where(and(eq(paymentMethods.key, typeof body.paymentMethod === "string" ? body.paymentMethod : ""), eq(paymentMethods.householdId, context.householdId))).limit(1),
        db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)),
      ]);
      const imported = Boolean(currentExpense?.importBatchId);
      const importedDescription = imported ? normalizeImportedDescription(body.description) : description;
      if (imported && body.description != null && body.description !== "" && !importedDescription) return invalid("Descrição inválida.");
      if (imported && body.referenceMonth != null && !isValidMonthInput(body.referenceMonth)) return invalid("Mês de referência inválido.");
      if (!id || !currentExpense) return invalid("Gasto inválido.");
      if (imported && body.categoryId != null && body.categoryId !== "" && !ownedCategory) return invalid("Categoria inválida.");
      if (imported && body.paymentMethod != null && body.paymentMethod !== "" && !ownedPayment) return invalid("Pagamento inválido.");
      if (body.occurredAt != null && body.occurredAt !== "" && !isValidDateInput(body.occurredAt)) return invalid("Data inválida.");
      if (body.person != null && body.person !== "" && (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person))) return invalid("Integrante inválido.");
      if (!amountCents) return invalid("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo dois centavos.");
      if (!importedDescription && !imported) return invalid("A descrição deve conter letras e ter no máximo 160 caracteres.");
      if ((!ownedCategory || !ownedPayment) && !imported) return invalid("Selecione categoria e pagamento válidos.");
      if (body.occurredAt && !isValidDateInput(body.occurredAt)) return invalid("Selecione uma data válida entre 2000 e 2200.");
      if (!body.occurredAt && !imported) return invalid("Selecione uma data válida entre 2000 e 2200.");
      if (body.person && (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person))) return invalid("Selecione um integrante válido.");
      if (!body.person && !imported) return invalid("Selecione um integrante válido.");
      const referenceMonth = imported ? (isValidMonthInput(body.referenceMonth) ? body.referenceMonth as string : currentExpense.referenceMonth) : null;
      const [expense] = await db.update(expenses).set({ amountCents, description: importedDescription, categoryId: ownedCategory?.id ?? null, paymentMethod: ownedPayment?.key ?? null, person: typeof body.person === "string" && body.person ? body.person : null, occurredAt: typeof body.occurredAt === "string" && body.occurredAt ? body.occurredAt : null, referenceMonth }).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).returning();
      if (expense && currentExpense.importBatchId && amountCents !== currentExpense.amountCents) await db.update(importBatches).set({ totalCents: sql`${importBatches.totalCents} + ${amountCents - currentExpense.amountCents}` }).where(and(eq(importBatches.id, currentExpense.importBatchId), eq(importBatches.householdId, context.householdId)));
      const pattern = normalizeMerchant(importedDescription);
      if (expense && imported && ownedCategory && pattern) await db.insert(categoryRules).values({ householdId: context.householdId, categoryId: ownedCategory.id, pattern, source: "learned" }).onConflictDoUpdate({ target: [categoryRules.householdId, categoryRules.pattern], set: { categoryId: ownedCategory.id, updatedAt: sql`CURRENT_TIMESTAMP` } });
      if (expense) logger.info("expense_updated", { operation: "expense.update", outcome: "success", durationMs: performance.now() - started });
      return expense ? Response.json({ expense: { ...expense, category: ownedCategory?.name ?? null } }) : Response.json({ error: "Gasto não encontrado." }, { status: 404 });
    }
    if (body.type === "income") {
      const id = parsePositiveSafeInteger(body.id), amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
      const [household] = await db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1);
      const allowedPeople = await db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
      const [ownedCategory] = categoryId ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, context.householdId), eq(categories.kind, "income"))).limit(1) : [];
      if (!household?.allowIncome) return Response.json({ error: "Entradas não estão habilitadas para esta família." }, { status: 403 });
      if (!id) return invalid("Entrada inválida.");
      if (!amountCents) return invalid("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo dois centavos.");
      if (!description) return invalid("A descrição deve conter letras e ter no máximo 160 caracteres.");
      if (!ownedCategory) return invalid("Selecione uma categoria de entrada válida.");
      if (!isValidDateInput(body.occurredAt)) return invalid("Selecione uma data válida entre 2000 e 2200.");
      if (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person)) return invalid("Selecione um integrante válido.");
      const [income] = await db.update(incomes).set({ amountCents, description, categoryId, person: body.person, occurredAt: body.occurredAt as string }).where(and(eq(incomes.id, id), eq(incomes.householdId, context.householdId))).returning({ id: incomes.id, amountCents: incomes.amountCents, description: incomes.description, categoryId: incomes.categoryId, person: incomes.person, occurredAt: incomes.occurredAt });
      return income ? Response.json({ income: { ...income, category: ownedCategory.name } }) : Response.json({ error: "Entrada não encontrada." }, { status: 404 });
    }
    const id = parsePositiveSafeInteger(body.id);
    if ((body.type !== "category" && body.type !== "payment") || !id) return invalid("Solicitação inválida.");
    try {
      if (body.type === "payment") {
        const name = normalizePaymentName(body.name);
        if (!name) return invalid("A forma de pagamento deve conter letras e ter no máximo 60 caracteres.");
        if (typeof body.isCard !== "boolean") return invalid("Informe se a forma de pagamento permite parcelamento.");
        const [payment] = await db.update(paymentMethods).set({ name, isCard: body.isCard }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId))).returning();
        return payment ? Response.json({ payment }) : Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });
      }
      const kind = body.kind, name = normalizeCategoryName(body.name);
      if (!name) return invalid("A categoria deve conter letras e ter no máximo 60 caracteres.");
      if (!isCategoryKind(kind)) return invalid("Selecione onde a categoria será usada.");
      const [household] = await db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1);
      if (kind === "income" && !household?.allowIncome) return Response.json({ error: "Categorias de entrada não estão disponíveis para esta carteira." }, { status: 403 });
      const [currentCategory] = await db.select({ kind: categories.kind }).from(categories).where(and(eq(categories.id, id), eq(categories.householdId, context.householdId))).limit(1);
      if (!currentCategory) return Response.json({ error: "Categoria não encontrada." }, { status: 404 });
      if (currentCategory.kind !== kind) {
        const linked = currentCategory.kind === "income"
          ? await db.select({ id: incomes.id }).from(incomes).where(and(eq(incomes.householdId, context.householdId), eq(incomes.categoryId, id))).limit(1)
          : await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.categoryId, id))).limit(1);
        if (linked.length) return Response.json({ error: "Essa categoria já possui lançamentos e não pode mudar de tipo." }, { status: 409 });
      }
      const [category] = await db.update(categories).set({ name, kind }).where(and(eq(categories.id, id), eq(categories.householdId, context.householdId))).returning({ id: categories.id, name: categories.name, kind: categories.kind });
      return category ? Response.json({ category }) : Response.json({ error: "Categoria não encontrada." }, { status: 404 });
    } catch { return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 }); }
  } catch (error) { return accessResponse(error, logger, started); }
}

export async function DELETE(request: Request) {
  const { logger } = observabilityForRequest(request), started = performance.now();
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), url = new URL(request.url), id = parsePositiveSafeInteger(url.searchParams.get("id")), type = url.searchParams.get("type"), db = getDb();
    if (!id || !["expense", "income", "category", "payment"].includes(type ?? "")) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
    if (type === "expense") {
      const [current] = await db.select({ amountCents: expenses.amountCents, importBatchId: expenses.importBatchId, installmentGroupId: expenses.installmentGroupId }).from(expenses).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).limit(1);
      if (!current) return Response.json({ error: "Gasto não encontrado." }, { status: 404 });
      const removeExpense = db.delete(expenses).where(expenseDeletionFilter(id, context.householdId, current.importBatchId ? null : current.installmentGroupId)).returning({ id: expenses.id });
      let deleted: { id: number }[];
      if (current.importBatchId) {
        const updateBatch = db.update(importBatches).set({ itemCount: sql`max(${importBatches.itemCount} - 1, 0)`, totalCents: sql`${importBatches.totalCents} - ${current.amountCents}` }).where(and(eq(importBatches.id, current.importBatchId), eq(importBatches.householdId, context.householdId)));
        [deleted] = await db.batch([removeExpense, updateBatch]);
      } else [deleted] = await db.batch([removeExpense]);
      if (deleted.length) logger.info("expense_deleted", { operation: "expense.delete", outcome: "success", durationMs: performance.now() - started, deletedCount: deleted.length });
      return deleted.length ? Response.json({ ok: true, deletedIds: deleted.map(item => item.id) }) : Response.json({ error: "Gasto não encontrado." }, { status: 404 });
    }
    if (type === "income") {
      const deleted = await db.delete(incomes).where(and(eq(incomes.id, id), eq(incomes.householdId, context.householdId))).returning({ id: incomes.id });
      return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Entrada não encontrada." }, { status: 404 });
    }
    if (type === "payment") {
      const [payment] = await db.select({ key: paymentMethods.key }).from(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId))).limit(1);
      if (!payment) return Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });
      const linked = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.paymentMethod, payment.key))).limit(1);
      if (linked.length) return Response.json({ error: "Essa forma de pagamento possui gastos e não pode ser excluída." }, { status: 409 });
      await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId)));
      return Response.json({ ok: true });
    }
    const [linkedExpenses, linkedIncomes] = await Promise.all([
      db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.categoryId, id))).limit(1),
      db.select({ id: incomes.id }).from(incomes).where(and(eq(incomes.householdId, context.householdId), eq(incomes.categoryId, id))).limit(1),
    ]);
    if (linkedExpenses.length || linkedIncomes.length) return Response.json({ error: "Essa categoria possui lançamentos. Exclua-os antes de apagar a categoria." }, { status: 409 });
    const results = await db.batch([
      db.delete(categoryRules).where(and(eq(categoryRules.householdId, context.householdId), eq(categoryRules.categoryId, id))),
      db.delete(categories).where(and(eq(categories.id, id), eq(categories.householdId, context.householdId))).returning({ id: categories.id }),
    ]);
    const deleted = results[1] as { id: number }[];
    return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Categoria não encontrada." }, { status: 404 });
  } catch (error) { return accessResponse(error, logger, started); }
}

function accessResponse(error: unknown, logger?: ReturnType<typeof observabilityForRequest>["logger"], started = performance.now()) { if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status, headers: error.headers }); if (logger && markErrorObserved(error)) logger.error("unexpected_error", { operation: "finance.request", status: 500, durationMs: performance.now() - started, ...(error instanceof Error ? { errorName: error.name, errorMessage: error.message, errorStack: error.stack } : {}) }); return Response.json({ error: "Não foi possível acessar os dados agora." }, { status: 500 }); }
function invalid(error: string) { return Response.json({ error }, { status: 400 }); }
function addMonths(date: string, offset: number) { const [year, month, day] = date.split("-").map(Number); const first = new Date(Date.UTC(year, month - 1 + offset, 1)); const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`; }
