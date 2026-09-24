import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { AccessError, requireHousehold } from "../../../db/tenancy";
import { categories, categoryRules, expenses, householdMembers, households, importBatches, incomes, paymentMethods } from "../../../db/schema";
import { isCategoryKind, isValidDateInput, isValidMonthInput, normalizeCategoryName, normalizeDescription, normalizePaymentName, parseInstallments, parseMoneyInput, parsePositiveSafeInteger } from "../../lib/validation";
import { assertSameSite } from "../security";
import { normalizeMerchant } from "../../lib/imports/fingerprint.ts";

export async function GET(request: Request) {
  try {
    const context = await requireHousehold(request);
    const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!isValidMonthInput(month)) return Response.json({ error: "Selecione um mês válido entre 2000 e 2200." }, { status: 400 });
    const start = `${month}-01`, end = nextMonth(month), db = getDb();
    const [categoryRows, expenseRows, incomeRows, memberRows, paymentRows, householdRows, currentHouseholdRows] = await Promise.all([
      db.select({ id: categories.id, name: categories.name, kind: categories.kind }).from(categories).where(eq(categories.householdId, context.householdId)).orderBy(asc(categories.name)),
      db.select({ id: expenses.id, amountCents: expenses.amountCents, description: expenses.description, categoryId: expenses.categoryId, category: categories.name, paymentMethod: expenses.paymentMethod, person: expenses.person, occurredAt: expenses.occurredAt, referenceMonth: expenses.referenceMonth, importBatchId: expenses.importBatchId })
        .from(expenses).leftJoin(categories, and(eq(expenses.categoryId, categories.id), eq(categories.householdId, context.householdId)))
        .where(and(eq(expenses.householdId, context.householdId), or(eq(expenses.referenceMonth, month), and(isNull(expenses.referenceMonth), gte(expenses.occurredAt, start), lt(expenses.occurredAt, end))))).orderBy(asc(expenses.occurredAt), asc(expenses.id)),
      db.select({ id: incomes.id, amountCents: incomes.amountCents, description: incomes.description, categoryId: incomes.categoryId, category: categories.name, person: incomes.person, occurredAt: incomes.occurredAt })
        .from(incomes).leftJoin(categories, and(eq(incomes.categoryId, categories.id), eq(categories.householdId, context.householdId))).where(and(eq(incomes.householdId, context.householdId), gte(incomes.occurredAt, start), lt(incomes.occurredAt, end))).orderBy(asc(incomes.occurredAt), asc(incomes.id)),
      db.select({ id: householdMembers.id, name: householdMembers.displayName, email: householdMembers.email, role: householdMembers.role }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)).orderBy(asc(householdMembers.displayName)),
      db.select({ id: paymentMethods.id, key: paymentMethods.key, name: paymentMethods.name, isCard: paymentMethods.isCard }).from(paymentMethods).where(eq(paymentMethods.householdId, context.householdId)).orderBy(asc(paymentMethods.name)),
      context.isAdmin ? db.select({ id: households.id, name: households.name, allowIncome: households.allowIncome }).from(households).orderBy(asc(households.name)) : Promise.resolve([]),
      db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1),
    ]);
    const allowIncome = currentHouseholdRows[0]?.allowIncome === true;
    const visibleMembers = memberRows.map(member => context.isAdmin ? member : { id: member.id, name: member.name, role: member.role });
    return Response.json({ categories: allowIncome ? categoryRows : categoryRows.filter(category => category.kind === "expense"), expenses: expenseRows, incomes: allowIncome ? incomeRows : [], members: visibleMembers, payments: paymentRows, households: householdRows, household: { id: context.householdId, name: context.householdName, allowIncome }, currentMember: memberRows.some(member => member.name === context.displayName) ? context.displayName : memberRows[0]?.name ?? "", isAdmin: context.isAdmin });
  } catch (error) { return accessResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), body = await request.json() as Record<string, unknown>, db = getDb();
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
        return Response.json({ payment }, { status: 201 });
      } catch { return Response.json({ error: "Essa forma de pagamento já existe nesta família." }, { status: 409 }); }
    }
    if (body.type !== "expense") return invalid("Tipo de lançamento inválido.");
    const amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
    const [ownedPayment] = typeof body.paymentMethod === "string" && body.paymentMethod ? await db.select().from(paymentMethods).where(and(eq(paymentMethods.key, body.paymentMethod), eq(paymentMethods.householdId, context.householdId))).limit(1) : [];
    const installmentCount = amountCents ? (ownedPayment?.isCard ? parseInstallments(body.installments ?? "1", amountCents) : 1) : null;
    const [ownedCategory] = categoryId ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))).limit(1) : [];
    const allowedPeople = await db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
    if (!amountCents) return invalid("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo dois centavos.");
    if (!description) return invalid("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!ownedCategory) return invalid("Selecione uma categoria de gasto válida.");
    if (!ownedPayment) return invalid("Selecione uma forma de pagamento válida.");
    if (!installmentCount) return invalid("O número de parcelas deve ser um inteiro entre 1 e 60 e não pode superar o valor em centavos.");
    if (!isValidDateInput(body.occurredAt)) return invalid("Selecione uma data válida entre 2000 e 2200.");
    if (typeof body.person !== "string" || !allowedPeople.some(person => person.name === body.person)) return invalid("Selecione um integrante válido.");
    if (!isValidDateInput(addMonths(body.occurredAt as string, installmentCount - 1))) return invalid("A última parcela precisa ficar dentro do limite de dezembro de 2200.");
    const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount;
    const rows = Array.from({ length: installmentCount }, (_, index) => ({ householdId: context.householdId, amountCents: baseAmount + (index < remainder ? 1 : 0), description: installmentCount > 1 ? `${description} (${index + 1}/${installmentCount})` : description, categoryId, paymentMethod: body.paymentMethod as string, person: body.person as string, occurredAt: addMonths(body.occurredAt as string, index) }));
    const created = await db.insert(expenses).values(rows).returning();
    return Response.json({ expenses: created.map(item => ({ ...item, category: ownedCategory.name })), installments: installmentCount }, { status: 201 });
  } catch (error) { return accessResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), body = await request.json() as Record<string, unknown>, db = getDb();
    if (body.type === "expense") {
      const id = parsePositiveSafeInteger(body.id), amountCents = parseMoneyInput(body.amount), categoryId = parsePositiveSafeInteger(body.categoryId), description = normalizeDescription(body.description);
      const [currentExpense] = id ? await db.select({ amountCents: expenses.amountCents, importBatchId: expenses.importBatchId, referenceMonth: expenses.referenceMonth }).from(expenses).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).limit(1) : [];
      const imported = Boolean(currentExpense?.importBatchId);
      const importedDescription = imported && (body.description === null || body.description === "") ? null : description;
      const [ownedCategory] = categoryId ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, context.householdId), eq(categories.kind, "expense"))).limit(1) : [];
      const [ownedPayment] = typeof body.paymentMethod === "string" && body.paymentMethod ? await db.select({ key: paymentMethods.key }).from(paymentMethods).where(and(eq(paymentMethods.key, body.paymentMethod), eq(paymentMethods.householdId, context.householdId))).limit(1) : [];
      const allowedPeople = await db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
      if (!id || !currentExpense) return invalid("Gasto inválido.");
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
  } catch (error) { return accessResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireHousehold(request), url = new URL(request.url), id = parsePositiveSafeInteger(url.searchParams.get("id")), type = url.searchParams.get("type"), db = getDb();
    if (!id || !["expense", "income", "category", "payment"].includes(type ?? "")) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
    if (type === "expense") {
      const [current] = await db.select({ amountCents: expenses.amountCents, importBatchId: expenses.importBatchId }).from(expenses).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).limit(1);
      if (!current) return Response.json({ error: "Gasto não encontrado." }, { status: 404 });
      const removeExpense = db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId)));
      if (current.importBatchId) {
        const updateBatch = db.update(importBatches).set({ itemCount: sql`max(${importBatches.itemCount} - 1, 0)`, totalCents: sql`${importBatches.totalCents} - ${current.amountCents}` }).where(and(eq(importBatches.id, current.importBatchId), eq(importBatches.householdId, context.householdId)));
        await db.batch([removeExpense, updateBatch]);
      } else await db.batch([removeExpense]);
      const deleted = [{ id }];
      return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Gasto não encontrado." }, { status: 404 });
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
  } catch (error) { return accessResponse(error); }
}

function accessResponse(error: unknown) { if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status }); console.error(error); return Response.json({ error: "Não foi possível acessar os dados agora." }, { status: 500 }); }
function invalid(error: string) { return Response.json({ error }, { status: 400 }); }
function nextMonth(month: string) { const [year, m] = month.split("-").map(Number); const d = new Date(year, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function addMonths(date: string, offset: number) { const [year, month, day] = date.split("-").map(Number); const first = new Date(Date.UTC(year, month - 1 + offset, 1)); const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`; }
