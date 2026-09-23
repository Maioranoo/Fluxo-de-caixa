export type CategoryKind = "expense" | "income";
export type CategoryFilter = "all" | CategoryKind;
export type Category = { id: number; name: string; kind: CategoryKind };
export type Member = { id: number; name: string; email: string; role: string };
export type Payment = { id: number; key: string; name: string; isCard: boolean };
export type Expense = { id: number; amountCents: number; description: string; categoryId: number; category: string; paymentMethod: string; person: string; occurredAt: string };
export type Income = { id: number; amountCents: number; description: string; categoryId: number | null; category: string | null; person: string; occurredAt: string };
export type Household = { id: number; name: string; allowIncome: boolean };
export type FinanceData = { categories: Category[]; expenses: Expense[]; incomes: Income[]; members: Member[]; payments: Payment[]; households: Household[]; household: Household | null; currentMember: string; isAdmin: boolean };

export const formatMoney = (cents: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(cents / 100);

export const formatDate = (date: string) => date.split("-").reverse().join("/");

export function groupTotals<T extends { amountCents: number }>(items: T[], key: (item: T) => string) {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(key(item), (totals.get(key(item)) ?? 0) + item.amountCents));
  return [...totals].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}
