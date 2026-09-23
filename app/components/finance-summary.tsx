import { Icon } from "./icons";
import { EmptyState, Panel } from "./ui";
import { formatMoney } from "../lib/finance-ui";

type TotalRow = { name: string; total: number };

export function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{formatMoney(value)}</strong></div>;
}

export function FinancialSummary({ allowIncome, monthLabel, expensesTotal, incomeTotal, balance, expenseCount, incomeCount }: { allowIncome: boolean; monthLabel: string; expensesTotal: number; incomeTotal: number; balance: number; expenseCount: number; incomeCount: number }) {
  if (!allowIncome) return <div className="hero-card" data-tone="negative"><div className="summary-card-icon"><Icon name="arrowUp"/></div><div><small>Gastos em {monthLabel}</small><strong>{formatMoney(expensesTotal)}</strong><span>{expenseCount} lançamento{expenseCount === 1 ? "" : "s"} no período</span></div></div>;
  return <div className="summary-finance-grid">
    <article className={`summary-money balance ${balance < 0 ? "negative" : "positive"}`} data-tone={balance < 0 ? "negative" : "positive"}><span className="summary-card-icon"><Icon name={balance < 0 ? "arrowDown" : "wallet"}/></span><small>Saldo em {monthLabel}</small><strong>{balance < 0 ? "−" : "+"} {formatMoney(Math.abs(balance))}</strong><span>Entradas menos gastos</span></article>
    <article className="summary-money incomes" data-tone="positive"><span className="summary-card-icon"><Icon name="arrowDown"/></span><small>Entradas</small><strong>+ {formatMoney(incomeTotal)}</strong><span>{incomeCount} entrada{incomeCount === 1 ? "" : "s"}</span></article>
    <article className="summary-money expenses" data-tone="negative"><span className="summary-card-icon"><Icon name="arrowUp"/></span><small>Gastos</small><strong>{formatMoney(expensesTotal)}</strong><span>{expenseCount} gasto{expenseCount === 1 ? "" : "s"}</span></article>
  </div>;
}

export function Bars({ rows, emptyText = "Nenhum gasto neste mês." }: { rows: TotalRow[]; emptyText?: string }) {
  const max = Math.max(...rows.map(row => row.total), 1);
  return <div className="bars" role="list">{rows.map(row => <div key={row.name} role="listitem" aria-label={`${row.name}: ${formatMoney(row.total)}`}><span>{row.name}</span><div className="bar-track"><i style={{ width: `${Math.max(4, row.total / max * 100)}%` }}/></div><b>{formatMoney(row.total)}</b></div>)}{!rows.length && <EmptyState icon="report" title={emptyText} description="Escolha outro período ou adicione um lançamento."/>}</div>;
}

export function DistributionPanel({ title, rows, emptyText }: { title: string; rows: TotalRow[]; emptyText?: string }) {
  return <Panel title={title}><Bars rows={rows} emptyText={emptyText}/></Panel>;
}
