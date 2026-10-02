import { isValidMonthInput } from "./validation.ts";

type ExpenseMonthRow = { referenceMonth: string | null; occurredAt: string | null };
type IncomeMonthRow = { occurredAt: string };

export function parseFinanceMonths(primaryMonth: string, value: string | null): string[] | null {
  if (!isValidMonthInput(primaryMonth)) return null;
  if (value === null) return [primaryMonth];
  const months = [...new Set(value.split(","))].sort();
  const primaryIndex = monthIndex(primaryMonth);
  if (!months.length || months.length > 3 || !months.includes(primaryMonth)) return null;
  if (months.some(month => !isValidMonthInput(month) || Math.abs(monthIndex(month) - primaryIndex) > 1)) return null;
  return months;
}

export function bucketFinanceRows<Expense extends ExpenseMonthRow, Income extends IncomeMonthRow>(expenses: Expense[], incomes: Income[], months: string[]) {
  const buckets = Object.fromEntries(months.map(month => [month, { expenses: [] as Expense[], incomes: [] as Income[] }]));
  for (const expense of expenses) {
    const month = expense.referenceMonth ?? expense.occurredAt?.slice(0, 7);
    if (month && buckets[month]) buckets[month].expenses.push(expense);
  }
  for (const income of incomes) {
    const month = income.occurredAt.slice(0, 7);
    if (buckets[month]) buckets[month].incomes.push(income);
  }
  return buckets;
}

function monthIndex(month: string) {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}
