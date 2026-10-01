import { and, eq, isNull } from "drizzle-orm";
import { expenses } from "../../../db/schema.ts";

export function expenseDeletionFilter(id: number, householdId: number, installmentGroupId: string | null) {
  return and(
    eq(expenses.householdId, householdId),
    installmentGroupId
      ? and(eq(expenses.installmentGroupId, installmentGroupId), isNull(expenses.importBatchId))
      : eq(expenses.id, id),
  );
}
