import { env } from "cloudflare:workers";
import { eq, isNull, or } from "drizzle-orm";
import { getDb } from ".";
import { categories, expenses, householdMembers, households, paymentMethods } from "./schema";
import { parsePositiveSafeInteger } from "../app/lib/validation";

type RuntimeConfig = {
  INITIAL_HOUSEHOLD_NAME?: string;
  INITIAL_HOUSEHOLD_MEMBERS?: string;
  ADMIN_EMAIL?: string;
  LOCAL_ADMIN_ENABLED?: string;
};

export type HouseholdContext = {
  householdId: number;
  householdName: string;
  memberId: number;
  displayName: string;
  email: string;
  isAdmin: boolean;
};

export class AccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function requireHousehold(request: Request): Promise<HouseholdContext> {
  const config = env as unknown as RuntimeConfig;
  const hostname = new URL(request.url).hostname;
  const local = config.LOCAL_ADMIN_ENABLED === "true" && (hostname === "localhost" || hostname === "127.0.0.1");
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || (local ? "admin-local@localhost" : undefined);
  const userId = request.headers.get("oai-authenticated-user-id")?.trim() || (local ? "admin-local" : undefined);
  if (!email) throw new AccessError("Faça login para acessar esta carteira.", 401);

  const db = getDb();
  let [member] = await db.select({
    memberId: householdMembers.id,
    householdId: householdMembers.householdId,
    householdName: households.name,
    displayName: householdMembers.displayName,
  }).from(householdMembers).innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(userId ? or(eq(householdMembers.userId, userId), eq(householdMembers.email, email)) : eq(householdMembers.email, email)).limit(1);

  if (!member) {
    if (local) await bootstrapLocalHousehold(); else await bootstrapInitialHousehold(email);
    [member] = await db.select({
      memberId: householdMembers.id,
      householdId: householdMembers.householdId,
      householdName: households.name,
      displayName: householdMembers.displayName,
    }).from(householdMembers).innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(eq(householdMembers.email, email)).limit(1);
  }
  if (!member) throw new AccessError("Seu e-mail ainda não foi vinculado a uma família.", 403);

  if (userId) await db.update(householdMembers).set({ userId }).where(eq(householdMembers.id, member.memberId));
  const isAdmin = local || email === config.ADMIN_EMAIL?.trim().toLowerCase();
  const requestedId = parsePositiveSafeInteger(request.headers.get("x-household-id"));
  if (requestedId && requestedId !== member.householdId) {
    if (!canAccessHousehold(isAdmin, member.householdId, requestedId)) throw new AccessError("Você não tem acesso a esta família.", 403);
    const [requested] = await db.select({ id: households.id, name: households.name }).from(households).where(eq(households.id, requestedId)).limit(1);
    if (!requested) throw new AccessError("Família não encontrada.", 404);
    return { ...member, householdId: requested.id, householdName: requested.name, email, isAdmin };
  }
  return { ...member, email, isAdmin };
}

export function canAccessHousehold(isAdmin: boolean, memberHouseholdId: number, requestedHouseholdId: number) {
  return requestedHouseholdId === memberHouseholdId || isAdmin;
}

async function bootstrapLocalHousehold() {
  const db = getDb(), slug = "ambiente-local";
  await db.insert(households).values({ name: "Ambiente local", slug }).onConflictDoNothing();
  const [household] = await db.select().from(households).where(eq(households.slug, slug)).limit(1);
  if (!household) return;
  await db.insert(householdMembers).values({ householdId: household.id, userId: "admin-local", email: "admin-local@localhost", displayName: "Administrador", role: "owner" }).onConflictDoNothing();
  await db.update(categories).set({ householdId: household.id }).where(isNull(categories.householdId));
  await db.update(expenses).set({ householdId: household.id }).where(isNull(expenses.householdId));
  const legacyPayments = await db.selectDistinct({ key: expenses.paymentMethod }).from(expenses).where(eq(expenses.householdId, household.id));
  for (const payment of legacyPayments) await db.insert(paymentMethods).values({ householdId: household.id, key: payment.key, name: legacyPaymentName(payment.key), isCard: payment.key.startsWith("cartao_") }).onConflictDoNothing();
}

async function bootstrapInitialHousehold(currentEmail: string) {
  const config = env as unknown as RuntimeConfig;
  const configuredMembers = parseMembers(config.INITIAL_HOUSEHOLD_MEMBERS);
  if (!configuredMembers.some(member => member.email === currentEmail)) return;

  const db = getDb();
  const slug = "familia-inicial";
  await db.insert(households).values({ name: config.INITIAL_HOUSEHOLD_NAME?.trim() || "Minha família", slug }).onConflictDoNothing();
  const [household] = await db.select().from(households).where(eq(households.slug, slug)).limit(1);
  if (!household) throw new AccessError("Não foi possível preparar a carteira da família.", 503);

  for (const configured of configuredMembers) {
    await db.insert(householdMembers).values({ householdId: household.id, email: configured.email, displayName: configured.name, role: configured.email === config.ADMIN_EMAIL?.trim().toLowerCase() ? "owner" : "member" }).onConflictDoNothing();
  }
  await db.update(categories).set({ householdId: household.id }).where(isNull(categories.householdId));
  await db.update(expenses).set({ householdId: household.id }).where(isNull(expenses.householdId));
  const legacyPayments = await db.selectDistinct({ key: expenses.paymentMethod }).from(expenses).where(eq(expenses.householdId, household.id));
  for (const payment of legacyPayments) {
    await db.insert(paymentMethods).values({ householdId: household.id, key: payment.key, name: legacyPaymentName(payment.key), isCard: payment.key.startsWith("cartao_") }).onConflictDoNothing();
  }
}

function parseMembers(value?: string) {
  return (value ?? "").split(",").map(item => {
    const [name, email] = item.split("|").map(part => part.trim());
    return { name, email: email?.toLowerCase() };
  }).filter(member => member.name && member.email);
}

function legacyPaymentName(key: string) {
  if (key.startsWith("cartao_")) return `Cartão ${title(key.slice(7))}`;
  return ({ pix: "Pix", boleto: "Boleto", caju: "Caju" } as Record<string, string>)[key] ?? title(key);
}
function title(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
