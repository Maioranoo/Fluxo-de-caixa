"use client";

import { useEffect, useMemo, useState } from "react";

type Category = { id: number; name: string };
type Expense = { id: number; amountCents: number; description: string; categoryId: number; category: string; paymentMethod: string; person: string; occurredAt: string };
type Data = { categories: Category[]; expenses: Expense[] };

const payments = [
  ["cartao_joao", "Cartão João"], ["cartao_dena", "Cartão Dena"], ["pix", "Pix"],
  ["boleto", "Boleto"]
];

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);
const paymentName = (key: string) => payments.find(([value]) => value === key)?.[1] ?? key;

export default function Home() {
  const [tab, setTab] = useState("resumo");
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState<Data>({ categories: [], expenses: [] });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", paymentMethod: "pix", person: "João", occurredAt: today() });
  const [categoryName, setCategoryName] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/finance?month=${month}`);
    const payload = await response.json() as Data & { error?: string };
    if (payload.error) setNotice(payload.error); else setData(payload);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [month]);

  const total = useMemo(() => data.expenses.reduce((sum, item) => sum + item.amountCents, 0), [data]);
  const byCategory = useMemo(() => groupTotals(data.expenses, item => item.category), [data]);
  const byPayment = useMemo(() => groupTotals(data.expenses, item => item.paymentMethod.startsWith("cartao") ? "cartao" : item.paymentMethod), [data]);
  const joao = data.expenses.filter(x => x.paymentMethod === "cartao_joao").reduce((s, x) => s + x.amountCents, 0);
  const dena = data.expenses.filter(x => x.paymentMethod === "cartao_dena").reduce((s, x) => s + x.amountCents, 0);
  const filteredExpenses = useMemo(() => expenseCategory === "all" ? data.expenses : data.expenses.filter(item => String(item.categoryId) === expenseCategory), [data.expenses, expenseCategory]);
  const filteredTotal = useMemo(() => filteredExpenses.reduce((sum, item) => sum + item.amountCents, 0), [filteredExpenses]);

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "expense", ...form }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível salvar.");
    setForm({ ...form, amount: "", description: "", occurredAt: today() });
    setNotice("Gasto salvo com sucesso."); setTab("gastos"); await load();
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category", name: categoryName }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível criar.");
    setCategoryName(""); setNotice("Categoria criada."); await load();
  }

  async function removeExpense(id: number) {
    if (!confirm("Deseja realmente apagar este gasto?")) return;
    await fetch(`/api/finance?type=expense&id=${id}`, { method: "DELETE" });
    setNotice("Gasto apagado."); await load();
  }

  async function editCategory(event: React.FormEvent) {
    event.preventDefault();
    if (editingCategoryId === null) return;
    const response = await fetch("/api/finance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category", id: editingCategoryId, name: editingCategoryName }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível editar a categoria.");
    setEditingCategoryId(null); setEditingCategoryName(""); setNotice("Categoria atualizada."); await load();
  }

  async function removeCategory(id: number, name: string) {
    if (!confirm(`Deseja realmente excluir a categoria “${name}”?`)) return;
    const response = await fetch(`/api/finance?type=category&id=${id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível excluir a categoria.");
    setNotice("Categoria excluída."); await load();
  }

  const monthLabel = new Date(`${month}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return <div className="app-shell">
    <aside>
      <div className="brand"><span>F</span><div><strong>Finanças</strong><small>da família</small></div></div>
      <nav>{[["resumo","⌂","Resumo"],["novo","＋","Novo gasto"],["gastos","≡","Gastos"],["categorias","◇","Categorias"],["relatorio","▤","Relatório"]].map(([id, icon, label]) =>
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><i>{icon}</i>{label}</button>)}</nav>
      <div className="side-note"><b>Carteira compartilhada</b><span>João e Dena</span></div>
    </aside>
    <main>
      <header><div><p>CONTROLE FAMILIAR</p><h1>{tabTitle(tab)}</h1></div><label className="month-picker">Mês<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label></header>
      {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {loading ? <div className="loading">Carregando seus dados…</div> : <>
        {tab === "resumo" && <section>
          <div className="hero-card"><div><small>TOTAL EM {monthLabel.toUpperCase()}</small><strong>{money(total)}</strong><span>{data.expenses.length} lançamento{data.expenses.length === 1 ? "" : "s"}</span></div><div className="hero-mark">↗</div></div>
          <div className="mini-grid"><Metric label="Cartão João" value={joao}/><Metric label="Cartão Dena" value={dena}/><Metric label="Cartões somados" value={joao + dena}/></div>
          <div className="content-grid"><Panel title="Por categoria"><Bars rows={byCategory}/></Panel><Panel title="Por pagamento"><Bars rows={byPayment.map(x => ({...x, name: x.name === "cartao" ? "Cartões" : paymentName(x.name)}))}/></Panel></div>
        </section>}
        {tab === "novo" && <section className="narrow"><Panel title="Registrar novo gasto"><form className="form" onSubmit={addExpense}>
          <label>Valor (R$)<input autoFocus inputMode="decimal" placeholder="0,00" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required /></label>
          <label className="wide">Onde foi gasto?<input placeholder="Ex.: Mercado Central" value={form.description} onChange={e => setForm({...form, description:e.target.value})} required /></label>
          <label>Categoria<select value={form.categoryId} onChange={e => setForm({...form, categoryId:e.target.value})} required><option value="">Selecione</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Pagamento<select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value})}>{payments.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Quem lançou?<select value={form.person} onChange={e => setForm({...form, person:e.target.value})}><option>João</option><option>Dena</option></select></label>
          <label>Data<input type="date" value={form.occurredAt} onChange={e => setForm({...form, occurredAt:e.target.value})} required /></label>
          <button className="primary wide" type="submit">Salvar gasto</button>
        </form></Panel></section>}
        {tab === "gastos" && <section><div className="expense-filter"><label>Filtrar por categoria<select value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option value="all">Todas as categorias</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div><span>{filteredExpenses.length} gasto{filteredExpenses.length === 1 ? "" : "s"} no mês</span><strong>{money(filteredTotal)}</strong></div></div><ExpenseTable expenses={filteredExpenses} onDelete={removeExpense}/></section>}
        {tab === "categorias" && <section className="narrow"><Panel title="Categorias"><form className="category-form" onSubmit={addCategory}><input placeholder="Nova categoria" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><button className="primary">Adicionar</button></form><div className="category-list">{data.categories.map(c=>editingCategoryId === c.id ? <form className="category-edit" key={c.id} onSubmit={editCategory}><input autoFocus value={editingCategoryName} onChange={e=>setEditingCategoryName(e.target.value)} required aria-label={`Novo nome de ${c.name}`}/><button className="primary" type="submit">Salvar</button><button className="secondary" type="button" onClick={()=>setEditingCategoryId(null)}>Cancelar</button></form> : <div className="category-item" key={c.id}><span>{c.name.slice(0,1).toUpperCase()}</span><b>{c.name}</b><div className="category-actions"><button className="icon-button edit-icon" type="button" aria-label={`Editar ${c.name}`} title="Editar" onClick={()=>{setEditingCategoryId(c.id);setEditingCategoryName(c.name)}}>✎</button><button className="icon-button delete-icon" type="button" aria-label={`Excluir ${c.name}`} title="Excluir" onClick={()=>removeCategory(c.id,c.name)}>🗑</button></div></div>)}{!data.categories.length&&<Empty text="Nenhuma categoria criada."/>}</div></Panel></section>}
        {tab === "relatorio" && <section className="print-area"><div className="report-head"><div><p>FATURA MENSAL</p><h2>{monthLabel}</h2></div><button className="primary no-print" onClick={()=>window.print()}>Imprimir / salvar PDF</button></div><ExpenseTable expenses={data.expenses} onDelete={removeExpense} readonly/><div className="report-total"><span>Total da fatura</span><strong>{money(total)}</strong></div></section>}
      </>}
    </main>
  </div>;
}

function Metric({label,value}:{label:string,value:number}) { return <div className="metric"><span>{label}</span><strong>{money(value)}</strong></div>; }
function Panel({title,children}:{title:string,children:React.ReactNode}) { return <div className="panel"><h2>{title}</h2>{children}</div>; }
function Empty({text}:{text:string}) { return <div className="empty">{text}</div>; }
function Bars({rows}:{rows:{name:string,total:number}[]}) { const max=Math.max(...rows.map(x=>x.total),1); return <div className="bars">{rows.map(r=><div key={r.name}><span>{r.name}</span><div><i style={{width:`${Math.max(4,r.total/max*100)}%`}}/></div><b>{money(r.total)}</b></div>)}{!rows.length&&<Empty text="Sem gastos neste mês."/>}</div>; }
function ExpenseTable({expenses,onDelete,readonly=false}:{expenses:Expense[],onDelete:(id:number)=>void,readonly?:boolean}) { return <div className="table-wrap"><table><thead><tr><th>Data</th><th>Origem</th><th>Categoria</th><th>Pagamento</th><th>Pessoa</th><th>Valor</th>{!readonly&&<th/>}</tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td>{e.occurredAt.split("-").reverse().join("/")}</td><td><b>{e.description}</b></td><td><span className="tag">{e.category}</span></td><td>{paymentName(e.paymentMethod)}</td><td>{e.person}</td><td><b>{money(e.amountCents)}</b></td>{!readonly&&<td><button className="delete" onClick={()=>onDelete(e.id)} aria-label={`Excluir ${e.description}`}>×</button></td>}</tr>)}</tbody></table>{!expenses.length&&<Empty text="Nenhum gasto registrado neste mês."/>}</div>; }
function groupTotals(items:Expense[], key:(item:Expense)=>string) { const map=new Map<string,number>(); items.forEach(i=>map.set(key(i),(map.get(key(i))??0)+i.amountCents)); return [...map].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total); }
function tabTitle(tab:string) { return ({resumo:"Visão geral",novo:"Adicionar gasto",gastos:"Histórico de gastos",categorias:"Suas categorias",relatorio:"Relatório mensal"} as Record<string,string>)[tab]; }
