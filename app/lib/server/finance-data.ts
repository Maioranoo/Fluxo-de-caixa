import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { requireHousehold } from "../../../db/tenancy";
import { categories, expenses, householdMembers, households, incomes, paymentMethods } from "../../../db/schema";
import { bucketFinanceRows, parseFinanceMonths } from "../finance-months";
import type { FinancePayload } from "../finance-client";
import { measureOperation } from "./observability/measure.ts";
import { observabilityForRequest } from "./observability/runtime.ts";

export class InvalidFinanceMonthsError extends Error {}

export async function loadFinanceData(request: Request, month: string, months: string | null): Promise<FinancePayload> {
  const context = await requireHousehold(request);
  const requestedMonths = parseFinanceMonths(month, months);
  if (!requestedMonths) throw new InvalidFinanceMonthsError("Selecione meses válidos e consecutivos entre 2000 e 2200.");

  const start = `${requestedMonths[0]}-01`;
  const end = nextMonth(requestedMonths.at(-1)!);
  const db = getDb();
  const { logger, config } = observabilityForRequest(request);
  const queries = [
    db.select({ id: categories.id, name: categories.name, kind: categories.kind }).from(categories).where(eq(categories.householdId, context.householdId)).orderBy(asc(categories.name)),
    db.select({ id: expenses.id, amountCents: expenses.amountCents, description: expenses.description, categoryId: expenses.categoryId, category: categories.name, paymentMethod: expenses.paymentMethod, person: expenses.person, occurredAt: expenses.occurredAt, referenceMonth: expenses.referenceMonth, importBatchId: expenses.importBatchId, installmentGroupId: expenses.installmentGroupId })
      .from(expenses).leftJoin(categories, and(eq(expenses.categoryId, categories.id), eq(categories.householdId, context.householdId)))
      .where(and(eq(expenses.householdId, context.householdId), or(inArray(expenses.referenceMonth, requestedMonths), and(isNull(expenses.referenceMonth), gte(expenses.occurredAt, start), lt(expenses.occurredAt, end))))).orderBy(asc(expenses.occurredAt), asc(expenses.id)),
    db.select({ id: incomes.id, amountCents: incomes.amountCents, description: incomes.description, categoryId: incomes.categoryId, category: categories.name, person: incomes.person, occurredAt: incomes.occurredAt })
      .from(incomes).leftJoin(categories, and(eq(incomes.categoryId, categories.id), eq(categories.householdId, context.householdId))).where(and(eq(incomes.householdId, context.householdId), gte(incomes.occurredAt, start), lt(incomes.occurredAt, end))).orderBy(asc(incomes.occurredAt), asc(incomes.id)),
    db.select({ id: householdMembers.id, name: householdMembers.displayName, email: householdMembers.email, role: householdMembers.role }).from(householdMembers).where(eq(householdMembers.householdId, context.householdId)).orderBy(asc(householdMembers.displayName)),
    db.select({ id: paymentMethods.id, key: paymentMethods.key, name: paymentMethods.name, isCard: paymentMethods.isCard }).from(paymentMethods).where(eq(paymentMethods.householdId, context.householdId)).orderBy(asc(paymentMethods.name)),
    db.select({ id: households.id, name: households.name, allowIncome: households.allowIncome }).from(households).where(context.isAdmin ? undefined : sql`0`).orderBy(asc(households.name)),
    db.select({ allowIncome: households.allowIncome }).from(households).where(eq(households.id, context.householdId)).limit(1),
  ] as const;
  const [categoryRows, expenseRows, incomeRows, memberRows, paymentRows, householdRows, currentHouseholdRows] = await measureOperation(logger, {
    operation: "database.finance_batch",
    kind: "database",
    databaseBaselineLogging: config.databaseBaselineLogging,
    slowThresholdMs: config.slowDatabaseQueryMs,
  }, () => db.batch(queries));

  const allowIncome = currentHouseholdRows[0]?.allowIncome === true;
  const visibleMembers = memberRows.map(member => context.isAdmin ? member : { id: member.id, name: member.name, role: member.role });
  const buckets = bucketFinanceRows(expenseRows, allowIncome ? incomeRows : [], requestedMonths);
  const current = buckets[month];
  const prefetchedMonths = Object.fromEntries(requestedMonths.filter(item => item !== month).map(item => [item, buckets[item]]));

  return {
    categories: allowIncome ? categoryRows : categoryRows.filter(category => category.kind === "expense"),
    expenses: current.expenses,
    incomes: current.incomes,
    prefetchedMonths,
    members: visibleMembers,
    payments: paymentRows,
    households: householdRows,
    household: { id: context.householdId, name: context.householdName, allowIncome },
    currentMember: memberRows.some(member => member.name === context.displayName) ? context.displayName : memberRows[0]?.name ?? "",
    isAdmin: context.isAdmin,
  };
}

function nextMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
}
