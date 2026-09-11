import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { AccessError, requireHousehold } from "../../../../db/tenancy";
import { householdMembers, households } from "../../../../db/schema";
import { assertSameSite } from "../../security";

type NewMember = { name?: string; email?: string };

export async function GET(request: Request) {
  try {
    const context = await requireAdmin(request), db = getDb();
    const rows = await db.select({ id: households.id, name: households.name, allowIncome: households.allowIncome, createdAt: households.createdAt }).from(households).orderBy(asc(households.name));
    return Response.json({ households: rows, currentHouseholdId: context.householdId });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireAdmin(request);
    const body = await request.json() as { type?: string; name?: string; email?: string; members?: NewMember[]; allowIncome?: boolean };
    if (body.type === "member") {
      const member = normalizeMember(body);
      if (!member) return Response.json({ error: "Informe um nome e um e-mail válidos." }, { status: 400 });
      try {
        const [created] = await getDb().insert(householdMembers).values({ householdId: context.householdId, email: member.email, displayName: member.name, role: "member" }).returning({ id: householdMembers.id, name: householdMembers.displayName, email: householdMembers.email, role: householdMembers.role });
        return Response.json({ member: created }, { status: 201 });
      } catch { return Response.json({ error: "Este e-mail já pertence a uma família." }, { status: 409 }); }
    }
    const name = body.name?.trim(), members = normalizeMembers(body.members);
    if (!name || !members.length) return Response.json({ error: "Informe o nome da família e pelo menos um integrante." }, { status: 400 });
    const db = getDb(), emails = members.map(member => member.email);
    const existing = await db.select({ email: householdMembers.email }).from(householdMembers).where(inArray(householdMembers.email, emails));
    if (existing.length) return Response.json({ error: `Este e-mail já pertence a uma família: ${existing[0].email}` }, { status: 409 });
    const [household] = await db.insert(households).values({ name, slug: `familia-${crypto.randomUUID()}`, allowIncome: body.allowIncome === true }).returning();
    try {
      await db.insert(householdMembers).values(members.map((member, index) => ({ householdId: household.id, email: member.email, displayName: member.name, role: index === 0 ? "owner" : "member" })));
    } catch (error) {
      await db.delete(households).where(eq(households.id, household.id));
      throw error;
    }
    return Response.json({ household: { id: household.id, name: household.name, allowIncome: household.allowIncome }, members }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireAdmin(request);
    const body = await request.json() as { type?: string; id?: number; name?: string; email?: string; householdId?: number; allowIncome?: boolean };
    if (body.type === "member") {
      const id = Number(body.id), member = normalizeMember(body), db = getDb();
      if (!id || !member) return Response.json({ error: "Informe um nome e um e-mail válidos." }, { status: 400 });
      const [existing] = await db.select({ email: householdMembers.email }).from(householdMembers).where(and(eq(householdMembers.id, id), eq(householdMembers.householdId, context.householdId))).limit(1);
      if (!existing) return Response.json({ error: "Integrante não encontrado." }, { status: 404 });
      if (existing.email === context.email && member.email !== context.email) return Response.json({ error: "O e-mail do administrador não pode ser alterado aqui." }, { status: 400 });
      try {
        const [updated] = await db.update(householdMembers).set({ displayName: member.name, email: member.email, userId: existing.email === member.email ? undefined : null }).where(and(eq(householdMembers.id, id), eq(householdMembers.householdId, context.householdId))).returning({ id: householdMembers.id, name: householdMembers.displayName, email: householdMembers.email, role: householdMembers.role });
        return Response.json({ member: updated });
      } catch { return Response.json({ error: "Este e-mail já pertence a uma família." }, { status: 409 }); }
    }
    const householdId = Number(body.householdId);
    if (!householdId || typeof body.allowIncome !== "boolean") return Response.json({ error: "Configuração inválida." }, { status: 400 });
    const db = getDb();
    const [household] = await db.update(households).set({ allowIncome: body.allowIncome }).where(eq(households.id, householdId)).returning({ id: households.id, name: households.name, allowIncome: households.allowIncome });
    return household ? Response.json({ household }) : Response.json({ error: "Família não encontrada." }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameSite(request);
    const context = await requireAdmin(request), url = new URL(request.url), id = Number(url.searchParams.get("id")), db = getDb();
    if (!id || url.searchParams.get("type") !== "member") return Response.json({ error: "Solicitação inválida." }, { status: 400 });
    const rows = await db.select({ id: householdMembers.id, email: householdMembers.email }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId));
    const member = rows.find(item => item.id === id);
    if (!member) return Response.json({ error: "Integrante não encontrado." }, { status: 404 });
    if (member.email === context.email) return Response.json({ error: "O acesso do administrador não pode ser removido." }, { status: 400 });
    if (rows.length <= 1) return Response.json({ error: "A família precisa ter pelo menos um integrante." }, { status: 400 });
    await db.delete(householdMembers).where(and(eq(householdMembers.id, id), eq(householdMembers.householdId, context.householdId)));
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

async function requireAdmin(request: Request) {
  const context = await requireHousehold(request);
  if (!context.isAdmin) throw new AccessError("Somente o administrador pode criar famílias.", 403);
  return context;
}

function normalizeMembers(input?: NewMember[]) {
  const seen = new Set<string>();
  return (input ?? []).map(member => ({ name: member.name?.trim() ?? "", email: member.email?.trim().toLowerCase() ?? "" }))
    .filter(member => member.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email) && !seen.has(member.email) && seen.add(member.email));
}

function normalizeMember(input: NewMember) {
  const name = input.name?.trim() ?? "", email = input.email?.trim().toLowerCase() ?? "";
  return name && name.length <= 80 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { name, email } : null;
}

function errorResponse(error: unknown) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "Não foi possível atualizar o painel administrativo agora." }, { status: 500 });
}
