import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { AccessError, requireHousehold } from "../../../db/tenancy";
import { categories, expenses, householdMembers, households, paymentMethods } from "../../../db/schema";

export async function GET(request: Request) {
  try {
    const context = await requireHousehold(request);
    const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Mês inválido." }, { status: 400 });
    const start = `${month}-01`, end = nextMonth(month), db = getDb();
    const [categoryRows, expenseRows, memberRows, paymentRows, householdRows] = await Promise.all([
      db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.householdId, context.householdId)).orderBy(asc(categories.name)),
      db.select({ id: expenses.id, amountCents: expenses.amountCents, description: expenses.description, categoryId: expenses.categoryId, category: categories.name, paymentMethod: expenses.paymentMethod, person: expenses.person, occurredAt: expenses.occurredAt })
        .from(expenses).innerJoin(categories, and(eq(expenses.categoryId, categories.id), eq(categories.householdId, context.householdId)))
        .where(and(eq(expenses.householdId, context.householdId), gte(expenses.occurredAt, start), lt(expenses.occurredAt, end))).orderBy(asc(expenses.occurredAt), asc(expenses.id)),
      db.select({ id: householdMembers.id, name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)).orderBy(asc(householdMembers.displayName)),
      db.select({ id: paymentMethods.id, key: paymentMethods.key, name: paymentMethods.name, isCard: paymentMethods.isCard }).from(paymentMethods).where(eq(paymentMethods.householdId, context.householdId)).orderBy(asc(paymentMethods.name)),
      context.isAdmin ? db.select({ id: households.id, name: households.name }).from(households).orderBy(asc(households.name)) : Promise.resolve([]),
    ]);
    return Response.json({ categories: categoryRows, expenses: expenseRows, members: memberRows, payments: paymentRows, households: householdRows, household: { id: context.householdId, name: context.householdName }, currentMember: memberRows.some(member => member.name === context.displayName) ? context.displayName : memberRows[0]?.name ?? "", isAdmin: context.isAdmin });
  } catch (error) { return accessResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireHousehold(request), body = await request.json() as Record<string, string>, db = getDb();
    if (body.type === "category") {
      const name = body.name?.trim();
      if (!name) return Response.json({ error: "Informe o nome da categoria." }, { status: 400 });
      try {
        const [category] = await db.insert(categories).values({ householdId: context.householdId, name }).returning({ id: categories.id, name: categories.name });
        return Response.json({ category }, { status: 201 });
      } catch { return Response.json({ error: "Essa categoria já existe nesta família." }, { status: 409 }); }
    }
    if (body.type === "payment") {
      const name = body.name?.trim(), isCard = body.isCard === "true";
      if (!name) return Response.json({ error: "Informe o nome da forma de pagamento." }, { status: 400 });
      try {
        const [payment] = await db.insert(paymentMethods).values({ householdId: context.householdId, key: `pagamento_${crypto.randomUUID()}`, name, isCard }).returning();
        return Response.json({ payment }, { status: 201 });
      } catch { return Response.json({ error: "Essa forma de pagamento já existe nesta família." }, { status: 409 }); }
    }
    const amountCents = parseMoney(body.amount), categoryId = Number(body.categoryId);
    const [ownedPayment] = body.paymentMethod ? await db.select().from(paymentMethods).where(and(eq(paymentMethods.key, body.paymentMethod), eq(paymentMethods.householdId, context.householdId))).limit(1) : [];
    const installmentCount = ownedPayment?.isCard ? Number(body.installments ?? "1") : 1;
    const [ownedCategory] = categoryId ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.householdId, context.householdId))).limit(1) : [];
    const allowedPeople = await db.select({ name: householdMembers.displayName }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
    if (!amountCents || !body.description?.trim() || !ownedCategory || !ownedPayment || !body.occurredAt || !allowedPeople.some(person => person.name === body.person) || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60 || installmentCount > amountCents) return Response.json({ error: "Preencha todos os campos corretamente." }, { status: 400 });
    const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount;
    const rows = Array.from({ length: installmentCount }, (_, index) => ({ householdId: context.householdId, amountCents: baseAmount + (index < remainder ? 1 : 0), description: installmentCount > 1 ? `${body.description.trim()} (${index + 1}/${installmentCount})` : body.description.trim(), categoryId, paymentMethod: body.paymentMethod, person: body.person, occurredAt: addMonths(body.occurredAt, index) }));
    const created = await db.insert(expenses).values(rows).returning();
    return Response.json({ expenses: created.map(item => ({ ...item, category: ownedCategory.name })), installments: installmentCount }, { status: 201 });
  } catch (error) { return accessResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireHousehold(request), body = await request.json() as Record<string, string>, db = getDb();
    if (body.type === "expense_payment") {
      const id = Number(body.id);
      const [ownedPayment] = await db.select({ key: paymentMethods.key }).from(paymentMethods).where(and(eq(paymentMethods.key, body.paymentMethod), eq(paymentMethods.householdId, context.householdId))).limit(1);
      if (!id || !ownedPayment) return Response.json({ error: "Forma de pagamento inválida." }, { status: 400 });
      const [expense] = await db.update(expenses).set({ paymentMethod: body.paymentMethod }).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).returning();
      return expense ? Response.json({ expense }) : Response.json({ error: "Gasto não encontrado." }, { status: 404 });
    }
    const id = Number(body.id), name = body.name?.trim();
    if (!["category", "payment"].includes(body.type) || !id || !name) return Response.json({ error: "Informe um nome válido." }, { status: 400 });
    try {
      if (body.type === "payment") {
        const [payment] = await db.update(paymentMethods).set({ name, isCard: body.isCard === "true" }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId))).returning();
        return payment ? Response.json({ payment }) : Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });
      }
      const [category] = await db.update(categories).set({ name }).where(and(eq(categories.id, id), eq(categories.householdId, context.householdId))).returning({ id: categories.id, name: categories.name });
      return category ? Response.json({ category }) : Response.json({ error: "Categoria não encontrada." }, { status: 404 });
    } catch { return Response.json({ error: "Já existe uma categoria com esse nome." }, { status: 409 }); }
  } catch (error) { return accessResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireHousehold(request), url = new URL(request.url), id = Number(url.searchParams.get("id")), type = url.searchParams.get("type"), db = getDb();
    if (!id || !["expense", "category", "payment"].includes(type ?? "")) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
    if (type === "expense") {
      const deleted = await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.householdId, context.householdId))).returning({ id: expenses.id });
      return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Gasto não encontrado." }, { status: 404 });
    }
    if (type === "payment") {
      const [payment] = await db.select({ key: paymentMethods.key }).from(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId))).limit(1);
      if (!payment) return Response.json({ error: "Forma de pagamento não encontrada." }, { status: 404 });
      const linked = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.paymentMethod, payment.key))).limit(1);
      if (linked.length) return Response.json({ error: "Essa forma de pagamento possui gastos e não pode ser excluída." }, { status: 409 });
      await db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.householdId, context.householdId)));
      return Response.json({ ok: true });
    }
    const linked = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.householdId, context.householdId), eq(expenses.categoryId, id))).limit(1);
    if (linked.length) return Response.json({ error: "Essa categoria possui gastos. Exclua esses gastos antes de apagar a categoria." }, { status: 409 });
    const deleted = await db.delete(categories).where(and(eq(categories.id, id), eq(categories.householdId, context.householdId))).returning({ id: categories.id });
    return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "Categoria não encontrada." }, { status: 404 });
  } catch (error) { return accessResponse(error); }
}

function accessResponse(error: unknown) { if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status }); console.error(error); return Response.json({ error: "Não foi possível acessar os dados agora." }, { status: 500 }); }
function parseMoney(value = "") { const cleaned = value.replace(/R\$\s?/i, "").trim(); const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned; const n = Number(normalized); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; }
function nextMonth(month: string) { const [year, m] = month.split("-").map(Number); const d = new Date(year, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function addMonths(date: string, offset: number) { const [year, month, day] = date.split("-").map(Number); const first = new Date(Date.UTC(year, month - 1 + offset, 1)); const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`; }
