export type CategoryKind = "expense" | "income";
export type CategoryFilter = "all" | CategoryKind;
export type Category = { id: number; name: string; kind: CategoryKind };
export type Member = { id: number; name: string; email: string; role: string };
export type Payment = { id: number; key: string; name: string; isCard: boolean };
export type Expense = { id: number; installmentGroupId?: string | null; amountCents: number; description: string | null; categoryId: number | null; category: string | null; paymentMethod: string | null; person: string | null; occurredAt: string | null; referenceMonth: string | null; importBatchId: number | null };
export type Income = { id: number; amountCents: number; description: string; categoryId: number | null; category: string | null; person: string; occurredAt: string };
export type Household = { id: number; name: string; allowIncome: boolean };
export type FinanceData = { categories: Category[]; expenses: Expense[]; incomes: Income[]; members: Member[]; payments: Payment[]; households: Household[]; household: Household | null; currentMember: string; isAdmin: boolean };
export type HouseholdSelection = { selectedId: string; requestedId: string };

export function adoptLoadedHousehold(current: HouseholdSelection, loadedId: string): HouseholdSelection {
  if (current.selectedId || !loadedId) return current;
  return { ...current, selectedId: loadedId };
}

export function chooseHousehold(current: HouseholdSelection, selectedId: string): HouseholdSelection {
  if (current.selectedId === selectedId && current.requestedId === selectedId) return current;
  return { selectedId, requestedId: selectedId };
}

export const formatMoney = (cents: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(cents / 100);

export const formatDate = (date: string | null) => date ? date.split("-").reverse().join("/") : "Não informado";

export function groupTotals<T extends { amountCents: number }>(items: T[], key: (item: T) => string) {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(key(item), (totals.get(key(item)) ?? 0) + item.amountCents));
  return [...totals].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

export function groupExpenseCategories(items: { amountCents: number; category: string | null }[]) {
  return groupTotals(items, item => item.category ?? "Sem categoria");
}
