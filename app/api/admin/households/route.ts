import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { AccessError, requireHousehold } from "../../../../db/tenancy";
import { householdMembers, households } from "../../../../db/schema";

type NewMember = { name?: string; email?: string };

export async function GET(request: Request) {
  try {
    const context = await requireAdmin(request), db = getDb();
    const rows = await db.select({ id: households.id, name: households.name, createdAt: households.createdAt }).from(households).orderBy(asc(households.name));
    return Response.json({ households: rows, currentHouseholdId: context.householdId });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json() as { name?: string; members?: NewMember[] };
    const name = body.name?.trim(), members = normalizeMembers(body.members);
    if (!name || !members.length) return Response.json({ error: "Informe o nome da família e pelo menos um integrante." }, { status: 400 });
    const db = getDb(), emails = members.map(member => member.email);
    const existing = await db.select({ email: householdMembers.email }).from(householdMembers).where(inArray(householdMembers.email, emails));
    if (existing.length) return Response.json({ error: `Este e-mail já pertence a uma família: ${existing[0].email}` }, { status: 409 });
    const [household] = await db.insert(households).values({ name, slug: `familia-${crypto.randomUUID()}` }).returning();
    try {
      await db.insert(householdMembers).values(members.map((member, index) => ({ householdId: household.id, email: member.email, displayName: member.name, role: index === 0 ? "owner" : "member" })));
    } catch (error) {
      await db.delete(households).where(eq(households.id, household.id));
      throw error;
    }
    return Response.json({ household: { id: household.id, name: household.name }, members }, { status: 201 });
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

function errorResponse(error: unknown) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "Não foi possível criar a família agora." }, { status: 500 });
}
