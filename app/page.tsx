"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CategoryKind = "expense" | "income";
type Category = { id: number; name: string; kind: CategoryKind };
type Member = { id: number; name: string; email: string; role: string };
type Payment = { id: number; key: string; name: string; isCard: boolean };
type Expense = { id: number; amountCents: number; description: string; categoryId: number; category: string; paymentMethod: string; person: string; occurredAt: string };
type Income = { id: number; amountCents: number; description: string; categoryId: number | null; category: string | null; person: string; occurredAt: string };
type Household = { id: number; name: string; allowIncome: boolean };
type Data = { categories: Category[]; expenses: Expense[]; incomes: Income[]; members: Member[]; payments: Payment[]; households: Household[]; household: Household | null; currentMember: string; isAdmin: boolean };

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const monthNames = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

export default function Home() {
  const [tab, setTab] = useState("resumo");
  const [month, setMonth] = useState(monthKey());
  const [monthDraft, setMonthDraft] = useState(monthKey());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [data, setData] = useState<Data>({ categories: [], expenses: [], incomes: [], members: [], payments: [], households: [], household: null, currentMember: "", isAdmin: false });
  const [selectedHousehold, setSelectedHousehold] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", paymentMethod: "", installments: "1", person: "", occurredAt: today() });
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("expense");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [incomeCategory, setIncomeCategory] = useState("all");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryKind, setEditingCategoryKind] = useState<CategoryKind>("expense");
  const [paymentForm, setPaymentForm] = useState({ name: "", isCard: false });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ amount: "", description: "", categoryId: "", person: "", occurredAt: today() });
  const [adminForm, setAdminForm] = useState({ name: "", allowIncome: false, members: [{ name: "", email: "" }, { name: "", email: "" }] });
  const [expenseEdit, setExpenseEdit] = useState({ id: 0, amount: "", description: "", categoryId: "", paymentMethod: "", person: "", occurredAt: "" });
  const [incomeEdit, setIncomeEdit] = useState({ id: 0, amount: "", description: "", categoryId: "", person: "", occurredAt: "" });
  const [memberForm, setMemberForm] = useState({ name: "", email: "" });
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const nextTemporaryId = useRef(-1);
  const payments = useMemo(() => data.payments.map(payment => [payment.key, payment.name]), [data.payments]);
  const isCardPayment = (key: string) => data.payments.some(payment => payment.key === key && payment.isCard);
  const paymentName = (key: string) => data.payments.find(payment => payment.key === key)?.name ?? key;
  const expenseCategories = useMemo(() => data.categories.filter(category => category.kind === "expense"), [data.categories]);
  const incomeCategories = useMemo(() => data.categories.filter(category => category.kind === "income"), [data.categories]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/finance?month=${month}`, { headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} }).then(response => response.json()).then((payload: Data & { error?: string }) => {
      if (!active) return;
      if (payload.error) setNotice(payload.error); else { setData(payload); if (!selectedHousehold && payload.household) setSelectedHousehold(String(payload.household.id)); const person = payload.currentMember || payload.members[0]?.name || ""; setForm(current => ({ ...current, person: person || current.person, categoryId: "", paymentMethod: "" })); setIncomeForm(current => ({ ...current, person: person || current.person, categoryId: "" })); setExpenseCategory("all"); setIncomeCategory("all"); if (!payload.household?.allowIncome) setTab(current => current === "entradas" ? "resumo" : current); }
      setLoading(false);
    }).catch(() => { if (active) { setNotice("Não foi possível acessar os dados agora."); setLoading(false); } });
    return () => { active = false; };
  }, [month, selectedHousehold]);
  useEffect(() => {
    if (!expenseEdit.id && !incomeEdit.id) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setExpenseEdit(current => ({ ...current, id: 0 })); setIncomeEdit(current => ({ ...current, id: 0 })); } };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [expenseEdit.id, incomeEdit.id]);
  const writeHeaders = { "Content-Type": "application/json", ...(selectedHousehold ? { "x-household-id": selectedHousehold } : {}) };

  const total = useMemo(() => data.expenses.reduce((sum, item) => sum + item.amountCents, 0), [data]);
  const byCategory = useMemo(() => groupTotals(data.expenses, item => item.category), [data]);
  const byPayment = useMemo(() => groupTotals(data.expenses, item => item.paymentMethod.startsWith("cartao") ? "cartao" : item.paymentMethod), [data]);
  const cardTotals = data.payments.filter(payment => payment.isCard).map(payment => ({ name: payment.name, total: data.expenses.filter(item => item.paymentMethod === payment.key).reduce((sum, item) => sum + item.amountCents, 0) }));
  const cardsTotal = cardTotals.reduce((sum, item) => sum + item.total, 0);
  const filteredExpenses = useMemo(() => expenseCategory === "all" ? data.expenses : data.expenses.filter(item => String(item.categoryId) === expenseCategory), [data.expenses, expenseCategory]);
  const filteredTotal = useMemo(() => filteredExpenses.reduce((sum, item) => sum + item.amountCents, 0), [filteredExpenses]);
  const filteredIncomes = useMemo(() => incomeCategory === "all" ? data.incomes : data.incomes.filter(item => incomeCategory === "uncategorized" ? item.categoryId === null : String(item.categoryId) === incomeCategory), [data.incomes, incomeCategory]);
  const filteredIncomeTotal = useMemo(() => filteredIncomes.reduce((sum, item) => sum + item.amountCents, 0), [filteredIncomes]);
  const incomeByCategory = useMemo(() => groupTotals(data.incomes, item => item.category ?? "Sem categoria"), [data.incomes]);
  const incomeTotal = useMemo(() => data.incomes.reduce((sum, item) => sum + item.amountCents, 0), [data.incomes]);
  const balance = incomeTotal - total;

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    if (savingExpense) return;
    const category = data.categories.find(item => String(item.id) === form.categoryId), amountCents = parseMoney(form.amount), installmentCount = isCardPayment(form.paymentMethod) ? Number(form.installments) : 1;
    if (!category || !amountCents || !Number.isInteger(installmentCount) || installmentCount < 1) return setNotice("Preencha todos os campos corretamente.");
    const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount, tempBase = nextTemporaryId.current;
    nextTemporaryId.current -= installmentCount;
    const optimistic = Array.from({ length: installmentCount }, (_, index) => ({ id: tempBase - index, amountCents: baseAmount + (index < remainder ? 1 : 0), description: installmentCount > 1 ? `${form.description.trim()} (${index + 1}/${installmentCount})` : form.description.trim(), categoryId: category.id, category: category.name, paymentMethod: form.paymentMethod, person: form.person, occurredAt: addMonths(form.occurredAt, index) }));
    const temporaryIds = new Set(optimistic.map(item => item.id));
    setSavingExpense(true);
    setData(current => ({ ...current, expenses: [...current.expenses, ...optimistic.filter(item => item.occurredAt.startsWith(month))] }));
    setTab("gastos"); setNotice("Salvando gasto…");
    try {
      const response = await fetch("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "expense", ...form }) });
      const result = await response.json() as { error?: string; installments?: number; expenses?: Expense[] };
      if (!response.ok) { setData(current => ({ ...current, expenses: current.expenses.filter(item => !temporaryIds.has(item.id)) })); return setNotice(result.error ?? "Não foi possível salvar."); }
      setData(current => ({ ...current, expenses: [...current.expenses.filter(item => !temporaryIds.has(item.id)), ...(result.expenses ?? []).filter(item => item.occurredAt.startsWith(month))].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id) }));
      setForm({ ...form, amount: "", description: "", installments: "1", occurredAt: today() });
      setNotice(result.installments && result.installments > 1 ? `${result.installments} parcelas lançadas nos próximos meses.` : "Gasto salvo com sucesso.");
    } catch { setData(current => ({ ...current, expenses: current.expenses.filter(item => !temporaryIds.has(item.id)) })); setNotice("Falha de conexão. Seus dados continuam preenchidos para tentar novamente."); }
    finally { setSavingExpense(false); }
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "category", name: categoryName, kind: categoryKind }) });
    const result = await response.json() as { error?: string; category?: Category };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível criar.");
    if (result.category) setData(current => ({ ...current, categories: [...current.categories, result.category!].sort((a,b) => a.name.localeCompare(b.name)) }));
    setCategoryName(""); setNotice(`Categoria de ${categoryKind === "income" ? "entrada" : "gasto"} criada.`);
  }

  async function removeExpense(id: number) {
    if (!confirm("Deseja realmente apagar este gasto?")) return;
    const removed = data.expenses.find(item => item.id === id); setData(current => ({ ...current, expenses: current.expenses.filter(item => item.id !== id) }));
    const response = await fetch(`/api/finance?type=expense&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    if (!response.ok) { if (removed) setData(current => ({ ...current, expenses: [...current.expenses, removed] })); return setNotice("Não foi possível apagar o gasto."); }
    setNotice("Gasto apagado.");
  }

  async function editCategory(event: React.FormEvent) {
    event.preventDefault();
    if (editingCategoryId === null) return;
    const response = await fetch("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "category", id: editingCategoryId, name: editingCategoryName, kind: editingCategoryKind }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível editar a categoria.");
    setData(current => ({ ...current, categories: current.categories.map(item => item.id === editingCategoryId ? { ...item, name: editingCategoryName.trim(), kind: editingCategoryKind } : item), expenses: current.expenses.map(item => item.categoryId === editingCategoryId ? { ...item, category: editingCategoryName.trim() } : item), incomes: current.incomes.map(item => item.categoryId === editingCategoryId ? { ...item, category: editingCategoryName.trim() } : item) }));
    setEditingCategoryId(null); setEditingCategoryName(""); setNotice("Categoria atualizada.");
  }

  async function removeCategory(id: number, name: string) {
    if (!confirm(`Deseja realmente excluir a categoria “${name}”?`)) return;
    const response = await fetch(`/api/finance?type=category&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível excluir a categoria.");
    setData(current => ({ ...current, categories: current.categories.filter(item => item.id !== id) })); setNotice("Categoria excluída.");
  }

  async function addPayment(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!paymentForm.name.trim()) return setNotice("Informe o nome da forma de pagamento.");
    const response = await fetch("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "payment", name: paymentForm.name, isCard: String(paymentForm.isCard) }) });
    const result = await response.json() as { error?: string; payment?: Payment };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível criar a forma de pagamento.");
    if (result.payment) { setData(current => ({ ...current, payments: [...current.payments, result.payment!].sort((a,b) => a.name.localeCompare(b.name)) })); setForm(current => ({ ...current, paymentMethod: result.payment!.key })); }
    setPaymentForm({ name: "", isCard: false }); setShowPaymentForm(false); setNotice("Forma de pagamento criada e selecionada.");
  }

  async function createHousehold(event: React.FormEvent) {
    event.preventDefault();
    const members = adminForm.members.filter(member => member.name.trim() && member.email.trim());
    if (!adminForm.name.trim() || !members.length) return setNotice("Informe o nome da família e pelo menos um integrante.");
    const response = await fetch("/api/admin/households", { method: "POST", headers: writeHeaders, body: JSON.stringify({ name: adminForm.name, members, allowIncome: adminForm.allowIncome }) });
    const result = await response.json() as { error?: string; household?: Household };
    if (!response.ok || !result.household) return setNotice(result.error ?? "Não foi possível criar a família.");
    setData(current => ({ ...current, households: [...current.households, result.household!].sort((a,b)=>a.name.localeCompare(b.name)) }));
    setAdminForm({ name: "", allowIncome: false, members: [{ name: "", email: "" }, { name: "", email: "" }] });
    setNotice(`Carteira “${result.household.name}” criada com sucesso.`); setSelectedHousehold(String(result.household.id)); setTab("resumo");
  }

  async function addIncome(event: React.FormEvent) {
    event.preventDefault();
    if (savingIncome) return;
    const amountCents = parseMoney(incomeForm.amount), category = incomeCategories.find(item => String(item.id) === incomeForm.categoryId);
    if (!amountCents || !incomeForm.description.trim() || !category || !incomeForm.person || !incomeForm.occurredAt) return setNotice("Preencha todos os campos da entrada.");
    const temporary: Income = { id: nextTemporaryId.current--, amountCents, description: incomeForm.description.trim(), categoryId: category.id, category: category.name, person: incomeForm.person, occurredAt: incomeForm.occurredAt };
    setSavingIncome(true);
    if (temporary.occurredAt.startsWith(month)) setData(current => ({ ...current, incomes: [...current.incomes, temporary] }));
    setNotice("Salvando entrada…");
    try {
      const response = await fetch("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "income", ...incomeForm }) });
      const result = await response.json() as { error?: string; income?: Income };
      if (!response.ok || !result.income) { setData(current => ({ ...current, incomes: current.incomes.filter(item => item.id !== temporary.id) })); return setNotice(result.error ?? "Não foi possível salvar a entrada."); }
      setData(current => ({ ...current, incomes: [...current.incomes.filter(item => item.id !== temporary.id), ...(result.income!.occurredAt.startsWith(month) ? [result.income!] : [])] }));
      setIncomeForm(current => ({ ...current, amount: "", description: "", occurredAt: today() }));
      setNotice("Entrada salva com sucesso.");
    } catch { setData(current => ({ ...current, incomes: current.incomes.filter(item => item.id !== temporary.id) })); setNotice("Falha de conexão. Seus dados continuam preenchidos para tentar novamente."); }
    finally { setSavingIncome(false); }
  }

  async function removeIncome(id: number) {
    if (!confirm("Deseja realmente apagar esta entrada?")) return;
    const removed = data.incomes.find(item => item.id === id);
    setData(current => ({ ...current, incomes: current.incomes.filter(item => item.id !== id) }));
    const response = await fetch(`/api/finance?type=income&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    if (!response.ok) { if (removed) setData(current => ({ ...current, incomes: [...current.incomes, removed] })); return setNotice("Não foi possível apagar a entrada."); }
    setNotice("Entrada apagada.");
  }

  async function setHouseholdIncome(householdId: number, allowIncome: boolean) {
    const response = await fetch("/api/admin/households", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ householdId, allowIncome }) });
    const result = await response.json() as { error?: string; household?: Household };
    if (!response.ok || !result.household) return setNotice(result.error ?? "Não foi possível alterar a configuração.");
    setData(current => ({ ...current, households: current.households.map(item => item.id === householdId ? { ...item, allowIncome } : item), household: current.household?.id === householdId ? { ...current.household, allowIncome } : current.household }));
    if (!allowIncome && data.household?.id === householdId && tab === "entradas") setTab("resumo");
    setNotice(allowIncome ? "Entradas e saídas habilitadas para esta família." : "A família voltou ao controle somente de gastos.");
  }

  function startExpenseEdit(expense: Expense) {
    setExpenseEdit({ id: expense.id, amount: (expense.amountCents / 100).toFixed(2).replace(".", ","), description: expense.description, categoryId: String(expense.categoryId), paymentMethod: expense.paymentMethod, person: expense.person, occurredAt: expense.occurredAt });
  }

  async function updateExpense(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "expense", ...expenseEdit }) });
    const result = await response.json() as { error?: string; expense?: Expense };
    if (!response.ok || !result.expense) return setNotice(result.error ?? "Não foi possível editar o gasto.");
    setData(current => ({ ...current, expenses: current.expenses.map(item => item.id === result.expense!.id ? result.expense! : item).filter(item => item.occurredAt.startsWith(month)).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id-b.id) }));
    setExpenseEdit(current => ({ ...current, id: 0 })); setNotice("Gasto atualizado em todo o sistema.");
  }

  function startIncomeEdit(income: Income) {
    setIncomeEdit({ id: income.id, amount: (income.amountCents / 100).toFixed(2).replace(".", ","), description: income.description, categoryId: income.categoryId ? String(income.categoryId) : "", person: income.person, occurredAt: income.occurredAt });
  }

  async function updateIncome(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "income", ...incomeEdit }) });
    const result = await response.json() as { error?: string; income?: Income };
    if (!response.ok || !result.income) return setNotice(result.error ?? "Não foi possível editar a entrada.");
    setData(current => ({ ...current, incomes: current.incomes.map(item => item.id === result.income!.id ? result.income! : item).filter(item => item.occurredAt.startsWith(month)).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id-b.id) }));
    setIncomeEdit(current => ({ ...current, id: 0 })); setNotice("Entrada atualizada em todo o sistema.");
  }

  async function saveMember(event: React.FormEvent) {
    event.preventDefault();
    const method = editingMemberId ? "PATCH" : "POST";
    const response = await fetch("/api/admin/households", { method, headers: writeHeaders, body: JSON.stringify({ type: "member", id: editingMemberId, ...memberForm }) });
    const result = await response.json() as { error?: string; member?: Member };
    if (!response.ok || !result.member) return setNotice(result.error ?? "Não foi possível salvar o integrante.");
    setData(current => ({ ...current, members: editingMemberId ? current.members.map(item => item.id === result.member!.id ? result.member! : item) : [...current.members, result.member!].sort((a,b)=>a.name.localeCompare(b.name)) }));
    setMemberForm({ name: "", email: "" }); setEditingMemberId(null); setNotice(editingMemberId ? "Integrante atualizado." : "Integrante adicionado à carteira.");
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remover ${member.name} desta carteira? O histórico de lançamentos será mantido.`)) return;
    const response = await fetch(`/api/admin/households?type=member&id=${member.id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível remover o integrante.");
    setData(current => ({ ...current, members: current.members.filter(item => item.id !== member.id) }));
    if (editingMemberId === member.id) { setEditingMemberId(null); setMemberForm({ name: "", email: "" }); }
    setNotice("Integrante removido da carteira.");
  }

  function updateAdminMember(index:number, field:"name"|"email", value:string) {
    setAdminForm(current => ({ ...current, members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member) }));
  }

  function applyMonth() {
    if (!/^\d{4}-\d{2}$/.test(monthDraft) || monthDraft > "2200-12") return setNotice("Selecione um mês até dezembro de 2200.");
    setMonth(monthDraft); setShowMonthPicker(false);
  }

  const monthLabel = new Date(`${month}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const navigationItems = [["resumo","⌂","Resumo"],["novo","＋","Novo gasto"],["gastos","≡","Gastos"],...(data.household?.allowIncome ? [["entradas","↙","Entradas"]] : []),["categorias","◇","Categorias"],["relatorio","▤","Relatório"]];
  const mobilePrimaryItems = data.household?.allowIncome ? [["resumo","⌂","Resumo"],["gastos","≡","Gastos"],["novo","＋","Novo"],["entradas","↙","Entradas"],["relatorio","▤","Relatório"]] : [["resumo","⌂","Resumo"],["gastos","≡","Gastos"],["novo","＋","Novo"],["categorias","◇","Categorias"],["relatorio","▤","Relatório"]];
  const openTab = (id:string) => { setTab(id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return <div className="app-shell">
    <aside>
      <div className="brand"><span>F</span><div><strong>Finanças</strong><small>da família</small></div></div>
      <nav>{navigationItems.map(([id, icon, label]) =>
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><i>{icon}</i>{label}</button>)}</nav>
      <div className="side-note"><b>{data.isAdmin ? "Acesso de administrador" : "Carteira compartilhada"}</b>{data.isAdmin && data.households.length ? <select aria-label="Selecionar carteira" value={selectedHousehold} onChange={event=>setSelectedHousehold(event.target.value)}>{data.households.map(household=><option key={household.id} value={household.id}>{household.name}</option>)}</select> : <span>{data.household?.name ?? "Sua família"}</span>}{data.isAdmin && <button className={tab === "admin" ? "admin-link active" : "admin-link"} onClick={()=>setTab("admin")}>⚙ Painel adm</button>}</div>
    </aside>
    <main>
      <header><div><p>CONTROLE FAMILIAR</p><h1>{tabTitle(tab)}</h1></div><div className="month-picker"><span>Mês</span><button className="month-trigger" type="button" onClick={()=>{setMonthDraft(month);setShowMonthPicker(true)}} aria-haspopup="dialog"><b>{monthNames[Number(month.split("-")[1])-1]} de {month.split("-")[0]}</b></button></div></header>
      {notice && <button className="notice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {loading ? <div className="loading">Carregando seus dados…</div> : <>
        {tab === "resumo" && <section>
          {data.household?.allowIncome ? <div className="summary-finance-grid"><div className="summary-money expenses"><small>TOTAL DE GASTOS EM {monthLabel.toUpperCase()}</small><strong>{money(total)}</strong><span>{data.expenses.length} gasto{data.expenses.length === 1 ? "" : "s"}</span></div><div className="summary-money incomes"><small>TOTAL DE ENTRADAS EM {monthLabel.toUpperCase()}</small><strong>{money(incomeTotal)}</strong><span>{data.incomes.length} entrada{data.incomes.length === 1 ? "" : "s"}</span></div><div className={`summary-money balance ${balance < 0 ? "negative" : "positive"}`}><small>SALDO EM {monthLabel.toUpperCase()}</small><strong>{balance < 0 ? "−" : "+"}{money(Math.abs(balance))}</strong><span>Entradas menos gastos</span></div></div> : <div className="hero-card"><div><small>TOTAL DE GASTOS EM {monthLabel.toUpperCase()}</small><strong>{money(total)}</strong><span>{data.expenses.length} lançamento{data.expenses.length === 1 ? "" : "s"}</span></div></div>}
          <div className="mini-grid">{cardTotals.map(item => <Metric key={item.name} label={item.name} value={item.total}/>)}{cardTotals.length > 1 && <Metric label="Cartões somados" value={cardsTotal}/>}</div>
          <div className="content-grid"><Panel title="Por categoria"><Bars rows={byCategory}/></Panel><Panel title="Por pagamento"><Bars rows={byPayment.map(x => ({...x, name: x.name === "cartao" ? "Cartões" : paymentName(x.name)}))}/></Panel></div>
        </section>}
        {tab === "novo" && <section className="narrow"><Panel title="Registrar novo gasto"><form className="form" onSubmit={addExpense}>
          <label>Valor (R$)<input autoFocus inputMode="decimal" placeholder="0,00" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required /></label>
          <label className="wide">Onde foi gasto?<input placeholder="Ex.: Mercado Central" value={form.description} onChange={e => setForm({...form, description:e.target.value})} required /></label>
          <label>Categoria<select value={form.categoryId} onChange={e => setForm({...form, categoryId:e.target.value})} required><option value="">Selecione uma categoria</option>{expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Pagamento<div className="select-with-add"><select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value, installments:isCardPayment(e.target.value)?form.installments:"1"})} required><option value="">Selecione um pagamento</option>{payments.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><button className="add-inline" type="button" aria-label="Adicionar forma de pagamento" title="Adicionar forma de pagamento" onClick={()=>setShowPaymentForm(value=>!value)}>+</button></div></label>
          {showPaymentForm && <div className="payment-popover wide"><b>Nova forma de pagamento</b><div><input autoFocus placeholder="Ex.: Pix ou Cartão João" value={paymentForm.name} onChange={e=>setPaymentForm({...paymentForm,name:e.target.value})} required/><label className="check-label"><input type="checkbox" checked={paymentForm.isCard} onChange={e=>setPaymentForm({...paymentForm,isCard:e.target.checked})}/> Permite parcelamento</label><button className="primary" type="button" onClick={event=>void addPayment(event)}>Adicionar</button><button className="secondary" type="button" onClick={()=>setShowPaymentForm(false)}>Cancelar</button></div></div>}
          {isCardPayment(form.paymentMethod) && <label>Número de parcelas<input type="number" inputMode="numeric" min="1" max="60" value={form.installments} onChange={e=>setForm({...form,installments:e.target.value})} required/><small className="field-help">O valor total será dividido entre os meses.</small></label>}
          <label>Quem lançou?<select value={form.person} onChange={e => setForm({...form, person:e.target.value})}>{data.members.map(member => <option key={member.id}>{member.name}</option>)}</select></label>
          <label>Data<input type="date" value={form.occurredAt} onChange={e => setForm({...form, occurredAt:e.target.value})} required /></label>
          <button className="primary wide" type="submit" disabled={savingExpense}>{savingExpense ? "Salvando…" : "Salvar gasto"}</button>
        </form></Panel></section>}
        {tab === "gastos" && <section><div className="expense-filter"><label>Filtrar por categoria<select value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option value="all">Todas as categorias</option>{expenseCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div><span>{filteredExpenses.length} gasto{filteredExpenses.length === 1 ? "" : "s"} no mês</span><strong>{money(filteredTotal)}</strong></div></div><ExpenseTable expenses={filteredExpenses} paymentOptions={payments} paymentName={paymentName} onDelete={removeExpense} onEdit={startExpenseEdit}/></section>}
        {tab === "entradas" && data.household?.allowIncome && <section><div className="income-month-head"><div><span>Entradas do mês</span><strong>{money(incomeTotal)}</strong></div><small>{data.incomes.length} entrada{data.incomes.length === 1 ? "" : "s"} em {monthLabel}</small></div><div className="income-layout"><Panel title="Adicionar entrada"><form className="income-form" onSubmit={addIncome}><label>Valor (R$)<input autoFocus inputMode="decimal" placeholder="0,00" value={incomeForm.amount} onChange={event=>setIncomeForm({...incomeForm,amount:event.target.value})} required/></label><label>Descrição<input placeholder="Ex.: Salário" value={incomeForm.description} onChange={event=>setIncomeForm({...incomeForm,description:event.target.value})} required/></label><label>Categoria<select value={incomeForm.categoryId} onChange={event=>setIncomeForm({...incomeForm,categoryId:event.target.value})} required><option value="">Selecione uma categoria</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Quem lançou?<select value={incomeForm.person || data.currentMember} onChange={event=>setIncomeForm({...incomeForm,person:event.target.value})} required><option value="">Selecione</option>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" value={incomeForm.occurredAt} onChange={event=>setIncomeForm({...incomeForm,occurredAt:event.target.value})} required/></label><button className="primary" type="submit" disabled={savingIncome}>{savingIncome ? "Salvando…" : "Salvar entrada"}</button></form></Panel><Panel title="Entradas por categoria"><Bars rows={incomeByCategory} emptyText="Sem entradas neste mês."/></Panel></div><div className="income-history"><div className="expense-filter"><label>Filtrar entradas por categoria<select value={incomeCategory} onChange={event=>setIncomeCategory(event.target.value)}><option value="all">Todas as categorias</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}{data.incomes.some(item=>item.categoryId===null)&&<option value="uncategorized">Sem categoria</option>}</select></label><div><span>{filteredIncomes.length} entrada{filteredIncomes.length === 1 ? "" : "s"} no mês</span><strong>{money(filteredIncomeTotal)}</strong></div></div><Panel title={`Entradas de ${monthLabel}`}><IncomeTable incomes={filteredIncomes} onDelete={removeIncome} onEdit={startIncomeEdit}/></Panel></div></section>}
        {tab === "categorias" && <section className="narrow"><Panel title="Categorias"><form className="category-form" onSubmit={addCategory}><input placeholder="Nova categoria" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><select aria-label="Usar categoria em" value={categoryKind} onChange={event=>setCategoryKind(event.target.value as CategoryKind)}><option value="expense">Gastos</option><option value="income">Entradas</option></select><button className="primary">Adicionar</button></form><div className="category-list">{data.categories.map(c=>editingCategoryId === c.id ? <form className="category-edit" key={c.id} onSubmit={editCategory}><input autoFocus value={editingCategoryName} onChange={e=>setEditingCategoryName(e.target.value)} required aria-label={`Novo nome de ${c.name}`}/><select aria-label={`Uso de ${c.name}`} value={editingCategoryKind} onChange={event=>setEditingCategoryKind(event.target.value as CategoryKind)}><option value="expense">Gastos</option><option value="income">Entradas</option></select><button className="primary" type="submit">Salvar</button><button className="secondary" type="button" onClick={()=>setEditingCategoryId(null)}>Cancelar</button></form> : <div className="category-item" key={c.id}><span>{c.name.slice(0,1).toUpperCase()}</span><div className="category-copy"><b>{c.name}</b><small>{c.kind === "income" ? "Entrada" : "Gasto"}</small></div><div className="category-actions"><button className="icon-button edit-icon" type="button" aria-label={`Editar ${c.name}`} title="Editar" onClick={()=>{setEditingCategoryId(c.id);setEditingCategoryName(c.name);setEditingCategoryKind(c.kind)}}>✎</button><button className="icon-button delete-icon" type="button" aria-label={`Excluir ${c.name}`} title="Excluir" onClick={()=>removeCategory(c.id,c.name)}>🗑</button></div></div>)}{!data.categories.length&&<Empty text="Nenhuma categoria criada."/>}</div></Panel></section>}
        {tab === "admin" && data.isAdmin && <section className="admin-grid"><Panel title="Cadastrar nova família"><form className="admin-form" onSubmit={createHousehold}><label>Nome da família<input autoFocus placeholder="Ex.: Família Taty e Rildo" value={adminForm.name} onChange={event=>setAdminForm({...adminForm,name:event.target.value})} required/></label><label className="feature-toggle"><input type="checkbox" checked={adminForm.allowIncome} onChange={event=>setAdminForm({...adminForm,allowIncome:event.target.checked})}/><span><b>Permitir entrada e saída de dinheiro</b><small>Adiciona a aba Entradas e o saldo mensal desta família.</small></span></label><div className="admin-members"><div className="admin-members-head"><b>Integrantes iniciais</b><button type="button" className="secondary" onClick={()=>setAdminForm(current=>({...current,members:[...current.members,{name:"",email:""}]}))}>+ Integrante</button></div>{adminForm.members.map((member,index)=><div className="admin-member" key={index}><input placeholder="Nome" aria-label={`Nome do integrante ${index+1}`} value={member.name} onChange={event=>updateAdminMember(index,"name",event.target.value)}/><input type="email" placeholder="E-mail de acesso" aria-label={`E-mail do integrante ${index+1}`} value={member.email} onChange={event=>updateAdminMember(index,"email",event.target.value)}/>{adminForm.members.length>1&&<button type="button" className="delete" aria-label={`Remover integrante ${index+1}`} onClick={()=>setAdminForm(current=>({...current,members:current.members.filter((_,memberIndex)=>memberIndex!==index)}))}>×</button>}</div>)}</div><button className="primary" type="submit">Criar carteira da família</button></form></Panel><Panel title="Funcionalidades por família"><div className="household-settings">{data.households.map(household=><label className="feature-toggle" key={household.id}><input type="checkbox" checked={household.allowIncome} onChange={event=>void setHouseholdIncome(household.id,event.target.checked)}/><span><b>{household.name}</b><small>{household.allowIncome ? "Entradas e saídas habilitadas" : "Somente controle de gastos"}</small></span></label>)}</div></Panel><div className="admin-members-panel"><Panel title={`Integrantes de ${data.household?.name ?? "carteira"}`}><form className="member-manager-form" onSubmit={saveMember}><input placeholder="Nome" aria-label="Nome do integrante" value={memberForm.name} onChange={event=>setMemberForm({...memberForm,name:event.target.value})} required/><input type="email" placeholder="E-mail de acesso" aria-label="E-mail do integrante" value={memberForm.email} onChange={event=>setMemberForm({...memberForm,email:event.target.value})} required/><button className="primary" type="submit">{editingMemberId ? "Salvar alterações" : "Adicionar integrante"}</button>{editingMemberId&&<button className="secondary" type="button" onClick={()=>{setEditingMemberId(null);setMemberForm({name:"",email:""})}}>Cancelar</button>}</form><div className="managed-members">{data.members.map(member=><div key={member.id}><div><b>{member.name}</b><small>{member.email}</small></div><div className="category-actions"><button className="icon-button edit-icon" type="button" title="Editar" aria-label={`Editar ${member.name}`} onClick={()=>{setEditingMemberId(member.id);setMemberForm({name:member.name,email:member.email})}}>✎</button><button className="icon-button delete-icon" type="button" title="Remover" aria-label={`Remover ${member.name}`} onClick={()=>void removeMember(member)}>🗑</button></div></div>)}</div><small className="admin-help">Este painel controla quem pertence à carteira selecionada. Para uma pessoa nova abrir o site, libere também o e-mail dela em Compartilhamento do Sites.</small></Panel></div></section>}
        {tab === "relatorio" && <section className="print-area"><div className="report-head"><div><p>RELATÓRIO MENSAL</p><h2>{monthLabel}</h2></div><button className="primary no-print" onClick={()=>window.print()}>Imprimir / salvar PDF</button></div><div className="report-section"><h3>Gastos</h3><ExpenseTable expenses={data.expenses} paymentOptions={payments} paymentName={paymentName} onDelete={removeExpense} readonly/><div className="report-total"><span>Total de gastos</span><strong>{money(total)}</strong></div></div>{data.household?.allowIncome && <><div className="report-section"><h3>Entradas</h3><IncomeTable incomes={data.incomes} onDelete={removeIncome} readonly/><div className="report-total income-total"><span>Total de entradas</span><strong>{money(incomeTotal)}</strong></div></div><div className={`report-balance ${balance < 0 ? "negative" : "positive"}`}><div><span>Saldo do mês</span><small>Total de entradas menos total de gastos</small></div><strong>{balance < 0 ? "−" : "+"}{money(Math.abs(balance))}</strong></div></>}</section>}
      </>}
    </main>
    <nav className="mobile-bottom-nav" aria-label="Navegação principal">{mobilePrimaryItems.map(([id,icon,label])=><button key={id} type="button" className={`${tab===id?"active":""} ${id==="novo"?"main-action":""}`} aria-current={tab===id?"page":undefined} onClick={()=>openTab(id)}><i>{icon}</i><span>{label}</span></button>)}</nav>
    {showMonthPicker&&<div className="month-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowMonthPicker(false)}}><section className="month-modal" role="dialog" aria-modal="true" aria-labelledby="month-modal-title"><div className="month-modal-head"><div><small>PERÍODO</small><h2 id="month-modal-title">Selecionar mês</h2></div><button type="button" aria-label="Fechar seletor" onClick={()=>setShowMonthPicker(false)}>×</button></div><div className="month-modal-fields"><label>Mês<select value={monthDraft.split("-")[1]} onChange={event=>setMonthDraft(`${monthDraft.split("-")[0]}-${event.target.value}`)}>{monthNames.map((name,index)=><option key={name} value={String(index+1).padStart(2,"0")}>{name}</option>)}</select></label><label>Ano<select value={monthDraft.split("-")[0]} onChange={event=>setMonthDraft(`${event.target.value}-${monthDraft.split("-")[1]}`)}>{Array.from({length:201},(_,index)=>2200-index).map(year=><option key={year} value={year}>{year}</option>)}</select></label></div><div className="month-modal-actions"><button type="button" className="month-reset" onClick={()=>setMonthDraft(monthKey())}>Hoje</button><button type="button" className="month-confirm" aria-label="Confirmar mês selecionado" onClick={applyMonth}>✓</button></div></section></div>}
    {expenseEdit.id > 0 && <div className="modal-backdrop"><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="expense-edit-title"><h2 id="expense-edit-title">Editar gasto</h2><form className="form" onSubmit={updateExpense}><label>Valor (R$)<input autoFocus inputMode="decimal" value={expenseEdit.amount} onChange={event=>setExpenseEdit({...expenseEdit,amount:event.target.value})} required/></label><label className="wide">Onde foi gasto?<input value={expenseEdit.description} onChange={event=>setExpenseEdit({...expenseEdit,description:event.target.value})} required/></label><label>Categoria<select value={expenseEdit.categoryId} onChange={event=>setExpenseEdit({...expenseEdit,categoryId:event.target.value})} required>{expenseCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Pagamento<select value={expenseEdit.paymentMethod} onChange={event=>setExpenseEdit({...expenseEdit,paymentMethod:event.target.value})} required>{payments.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Quem lançou?<select value={expenseEdit.person} onChange={event=>setExpenseEdit({...expenseEdit,person:event.target.value})} required>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" value={expenseEdit.occurredAt} onChange={event=>setExpenseEdit({...expenseEdit,occurredAt:event.target.value})} required/></label><div className="modal-actions wide"><button className="secondary" type="button" onClick={()=>setExpenseEdit(current=>({...current,id:0}))}>Cancelar</button><button className="primary" type="submit">Salvar gasto</button></div></form></section></div>}
    {incomeEdit.id > 0 && <div className="modal-backdrop"><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="income-edit-title"><h2 id="income-edit-title">Editar entrada</h2><form className="income-form" onSubmit={updateIncome}><label>Valor (R$)<input autoFocus inputMode="decimal" value={incomeEdit.amount} onChange={event=>setIncomeEdit({...incomeEdit,amount:event.target.value})} required/></label><label>Descrição<input value={incomeEdit.description} onChange={event=>setIncomeEdit({...incomeEdit,description:event.target.value})} required/></label><label>Categoria<select value={incomeEdit.categoryId} onChange={event=>setIncomeEdit({...incomeEdit,categoryId:event.target.value})} required><option value="">Selecione uma categoria</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Quem lançou?<select value={incomeEdit.person} onChange={event=>setIncomeEdit({...incomeEdit,person:event.target.value})} required>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" value={incomeEdit.occurredAt} onChange={event=>setIncomeEdit({...incomeEdit,occurredAt:event.target.value})} required/></label><div className="modal-actions"><button className="secondary" type="button" onClick={()=>setIncomeEdit(current=>({...current,id:0}))}>Cancelar</button><button className="primary" type="submit">Salvar entrada</button></div></form></section></div>}
  </div>;
}

function Metric({label,value}:{label:string,value:number}) { return <div className="metric"><span>{label}</span><strong>{money(value)}</strong></div>; }
function Panel({title,children}:{title:string,children:React.ReactNode}) { return <div className="panel"><h2>{title}</h2>{children}</div>; }
function Empty({text}:{text:string}) { return <div className="empty">{text}</div>; }
function Bars({rows,emptyText="Sem gastos neste mês."}:{rows:{name:string,total:number}[],emptyText?:string}) { const max=Math.max(...rows.map(x=>x.total),1); return <div className="bars">{rows.map(r=><div key={r.name}><span>{r.name}</span><div><i style={{width:`${Math.max(4,r.total/max*100)}%`}}/></div><b>{money(r.total)}</b></div>)}{!rows.length&&<Empty text={emptyText}/>}</div>; }
function ExpenseTable({expenses,onDelete,onEdit,paymentName,readonly=false}:{expenses:Expense[],onDelete:(id:number)=>void,onEdit?:(expense:Expense)=>void,paymentOptions:string[][],paymentName:(key:string)=>string,readonly?:boolean}) { return <div className="table-wrap"><table><thead><tr><th>Data</th><th>Origem</th><th>Categoria</th><th>Pagamento</th><th>Pessoa</th><th>Valor</th>{!readonly&&<th/>}</tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td data-label="Data">{e.occurredAt.split("-").reverse().join("/")}</td><td data-label="Origem"><b>{e.description}</b></td><td data-label="Categoria"><span className="tag">{e.category}</span></td><td data-label="Pagamento">{paymentName(e.paymentMethod)}</td><td data-label="Pessoa">{e.person}</td><td data-label="Valor"><b>{money(e.amountCents)}</b></td>{!readonly&&<td className="row-actions"><div className="table-actions"><button className="icon-button edit-icon" type="button" onClick={()=>onEdit?.(e)} aria-label={`Editar ${e.description}`}>✎</button><button className="icon-button delete-icon" type="button" onClick={()=>onDelete(e.id)} aria-label={`Excluir ${e.description}`}>🗑</button></div></td>}</tr>)}</tbody></table>{!expenses.length&&<Empty text="Nenhum gasto registrado neste mês."/>}</div>; }
function IncomeTable({incomes,onDelete,onEdit,readonly=false}:{incomes:Income[],onDelete:(id:number)=>void,onEdit?:(income:Income)=>void,readonly?:boolean}) { return <div className={`income-list${readonly ? " report-income-list" : ""}`}>{incomes.map(item=><div key={item.id}>{!readonly&&<span className="income-arrow">↙</span>}<div><b>{item.description}</b><small>{item.category ?? "Sem categoria"} · {item.occurredAt.split("-").reverse().join("/")} · {item.person}</small></div><strong>{money(item.amountCents)}</strong>{!readonly&&<div className="table-actions"><button className="icon-button edit-icon" type="button" onClick={()=>onEdit?.(item)} aria-label={`Editar entrada ${item.description}`}>✎</button><button className="icon-button delete-icon" type="button" onClick={()=>onDelete(item.id)} aria-label={`Excluir entrada ${item.description}`}>🗑</button></div>}</div>)}{!incomes.length&&<Empty text="Nenhuma entrada registrada neste mês."/>}</div>; }
function groupTotals<T extends { amountCents:number }>(items:T[], key:(item:T)=>string) { const map=new Map<string,number>(); items.forEach(i=>map.set(key(i),(map.get(key(i))??0)+i.amountCents)); return [...map].map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total); }
function tabTitle(tab:string) { return ({resumo:"Visão geral",novo:"Adicionar gasto",gastos:"Histórico de gastos",entradas:"Entradas e saldo",categorias:"Suas categorias",relatorio:"Relatório mensal",admin:"Painel administrativo"} as Record<string,string>)[tab]; }
function parseMoney(value:string) { const cleaned=value.replace(/R\$\s?/i,"").trim(); const normalized=cleaned.includes(",")?cleaned.replace(/\./g,"").replace(",","."):cleaned; const number=Number(normalized); return Number.isFinite(number)&&number>0?Math.round(number*100):null; }
function addMonths(date:string,offset:number) { const [year,month,day]=date.split("-").map(Number); const first=new Date(Date.UTC(year,month-1+offset,1)); const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`; }
