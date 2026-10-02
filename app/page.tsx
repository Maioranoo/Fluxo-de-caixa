"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar, MobileNavigation, PageHeader, type NavigationItem } from "./components/app-shell";
import { Bars, FinancialSummary, Metric } from "./components/finance-summary";
import { Icon } from "./components/icons";
import { BrandMark } from "./components/brand-mark";
import { ExpenseTable, IncomeTable } from "./components/transactions";
import { DialogFrame, Empty, IconButton, LoadingSkeleton, Panel, StatusNotice } from "./components/ui";
import { createFinanceClient } from "./lib/finance-client";
import { adoptLoadedHousehold, chooseHousehold, formatMoney, groupExpenseCategories, groupTotals, type Category, type CategoryFilter, type CategoryKind, type Expense, type FinanceData, type Household, type HouseholdSelection, type Income, type Member, type Payment } from "./lib/finance-ui";
import { MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_EMAIL_LENGTH, MAX_INSTALLMENTS, MAX_MEMBERS, MAX_NAME_LENGTH, isValidDateInput, isValidMonthInput, normalizeCategoryName, normalizeDescription, normalizeImportedDescription, normalizeEmail, normalizeName, normalizePaymentName, parseInstallments, parseMoneyInput, validateMembers } from "./lib/validation";
const ImportWorkspace = lazy(() => import("./components/imports/import-workspace").then(module => ({ default: module.ImportWorkspace })));

type AccessError = { status: number; message: string };

const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const monthNames = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const EXPENSE_PAGE_SIZE = 50;

export default function Home() {
  const [tab, setTab] = useState("resumo");
  const [month, setMonth] = useState(monthKey());
  const [monthDraft, setMonthDraft] = useState(monthKey());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [data, setData] = useState<FinanceData>({ categories: [], expenses: [], incomes: [], members: [], payments: [], households: [], household: null, currentMember: "", isAdmin: false });
  const [householdSelection, setHouseholdSelection] = useState<HouseholdSelection>({ selectedId: "", requestedId: "" });
  const selectedHousehold = householdSelection.selectedId;
  const requestedHousehold = householdSelection.requestedId;
  const [financeClient] = useState(() => createFinanceClient());
  const [loadedQuery, setLoadedQuery] = useState("");
  const [queryError, setQueryError] = useState("");

  const [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState<AccessError | null>(null);
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", paymentMethod: "", installments: "1", person: "", occurredAt: today() });
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<CategoryKind>("expense");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [expensePayment, setExpensePayment] = useState("all");
  const [expensePage, setExpensePage] = useState(1);
  const [incomeCategory, setIncomeCategory] = useState("all");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryKind, setEditingCategoryKind] = useState<CategoryKind>("expense");
  const [paymentForm, setPaymentForm] = useState({ name: "", isCard: false });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ amount: "", description: "", categoryId: "", person: "", occurredAt: today() });
  const [adminForm, setAdminForm] = useState({ name: "", allowIncome: false, members: [{ name: "", email: "" }] });
  const [expenseEdit, setExpenseEdit] = useState({ id: 0, amount: "", description: "", categoryId: "", paymentMethod: "", person: "", occurredAt: "", referenceMonth: "", imported: false });
  const [incomeEdit, setIncomeEdit] = useState({ id: 0, amount: "", description: "", categoryId: "", person: "", occurredAt: "" });
  const [memberForm, setMemberForm] = useState({ name: "", email: "" });
  const [memberEdit, setMemberEdit] = useState({ id: 0, name: "", email: "" });
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const queryKey = `${requestedHousehold}:${month}:${refreshKey}`;
  const closeMonthPicker = useCallback(() => setShowMonthPicker(false), []);
  const nextTemporaryId = useRef(-1);
  const payments = useMemo(() => data.payments.map(payment => [payment.key, payment.name]), [data.payments]);
  const isCardPayment = (key: string) => data.payments.some(payment => payment.key === key && payment.isCard);
  const paymentName = (key: string | null) => key ? data.payments.find(payment => payment.key === key)?.name ?? key : "Não informado";
  const expenseCategories = useMemo(() => data.categories.filter(category => category.kind === "expense"), [data.categories]);
  const incomeCategories = useMemo(() => data.categories.filter(category => category.kind === "income"), [data.categories]);
  const visibleCategories = useMemo(() => {
    if (!data.household?.allowIncome) return expenseCategories;
    return categoryFilter === "all" ? data.categories : data.categories.filter(category => category.kind === categoryFilter);
  }, [categoryFilter, data.categories, data.household?.allowIncome, expenseCategories]);

  useEffect(() => {
    let active = true;
    void financeClient.read(month, requestedHousehold).then(({ response, payload }) => {
      if (!active) return;
      setQueryError(response.ok ? "" : payload.error ?? "Não foi possível acessar os dados agora.");
      if (response.status === 401 || response.status === 403) setAccessError({ status: response.status, message: payload.error ?? "Esta conta ainda não tem acesso a uma carteira." });
      else if (payload.error) setNotice(payload.error); else { setAccessError(null); setData(payload); if (payload.household) setHouseholdSelection(current => adoptLoadedHousehold(current, String(payload.household!.id))); const person = payload.currentMember || payload.members[0]?.name || ""; setForm(current => ({ ...current, person: person || current.person, categoryId: "", paymentMethod: "" })); setIncomeForm(current => ({ ...current, person: person || current.person, categoryId: "" })); setExpenseCategory("all"); setExpensePayment("all"); setIncomeCategory("all"); setCategoryFilter(payload.household?.allowIncome ? "all" : "expense"); if (!payload.household?.allowIncome) { setCategoryKind("expense"); setEditingCategoryId(null); setTab(current => current === "entradas" ? "resumo" : current); } }
      setLoadedQuery(queryKey);
    }).catch(error => {
      if (!active) return;
      if (error instanceof DOMException && error.name === "AbortError") { setRefreshKey(value => value + 1); return; }
      setQueryError("Não foi possível acessar os dados agora."); setLoadedQuery(queryKey);
    });
    return () => { active = false; };
  }, [month, requestedHousehold, refreshKey, queryKey, financeClient]);
  useEffect(() => {
    if (!expenseEdit.id && !incomeEdit.id && !memberEdit.id) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setExpenseEdit(current => ({ ...current, id: 0 })); setIncomeEdit(current => ({ ...current, id: 0 })); setMemberEdit(current => ({ ...current, id: 0 })); } };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [expenseEdit.id, incomeEdit.id, memberEdit.id]);
  const writeHeaders = { "Content-Type": "application/json", ...(selectedHousehold ? { "x-household-id": selectedHousehold } : {}) };

  const total = useMemo(() => data.expenses.reduce((sum, item) => sum + item.amountCents, 0), [data]);
  const byCategory = useMemo(() => groupExpenseCategories(data.expenses), [data]);
  const byPayment = useMemo(() => groupTotals(data.expenses, item => item.paymentMethod?.startsWith("cartao") ? "cartao" : item.paymentMethod ?? "Não informado"), [data]);
  const cardTotals = data.payments.filter(payment => payment.isCard).map(payment => ({ name: payment.name, total: data.expenses.filter(item => item.paymentMethod === payment.key).reduce((sum, item) => sum + item.amountCents, 0) }));
  const cardsTotal = cardTotals.reduce((sum, item) => sum + item.total, 0);
  const filteredExpenses = useMemo(() => data.expenses.filter(item => (expenseCategory === "all" || String(item.categoryId) === expenseCategory) && (expensePayment === "all" || item.paymentMethod === expensePayment)), [data.expenses, expenseCategory, expensePayment]);
  const filteredTotal = useMemo(() => filteredExpenses.reduce((sum, item) => sum + item.amountCents, 0), [filteredExpenses]);
  const expensePageCount = Math.max(1, Math.ceil(filteredExpenses.length / EXPENSE_PAGE_SIZE));
  const safeExpensePage = Math.min(expensePage, expensePageCount);
  const visibleFilteredExpenses = useMemo(() => filteredExpenses.slice((safeExpensePage - 1) * EXPENSE_PAGE_SIZE, safeExpensePage * EXPENSE_PAGE_SIZE), [filteredExpenses, safeExpensePage]);
  const filteredIncomes = useMemo(() => incomeCategory === "all" ? data.incomes : data.incomes.filter(item => incomeCategory === "uncategorized" ? item.categoryId === null : String(item.categoryId) === incomeCategory), [data.incomes, incomeCategory]);
  const filteredIncomeTotal = useMemo(() => filteredIncomes.reduce((sum, item) => sum + item.amountCents, 0), [filteredIncomes]);
  const incomeByCategory = useMemo(() => groupTotals(data.incomes, item => item.category ?? "Sem categoria"), [data.incomes]);
  const incomeTotal = useMemo(() => data.incomes.reduce((sum, item) => sum + item.amountCents, 0), [data.incomes]);
  const balance = incomeTotal - total;

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    if (savingExpense) return;
    const category = expenseCategories.find(item => String(item.id) === form.categoryId), payment = data.payments.find(item => item.key === form.paymentMethod), amountCents = parseMoneyInput(form.amount), description = normalizeDescription(form.description);
    if (!amountCents) return setNotice("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo duas casas decimais.");
    if (!description) return setNotice("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!category) return setNotice("Selecione uma categoria de gasto válida.");
    if (!payment) return setNotice("Selecione uma forma de pagamento válida.");
    if (!data.members.some(member => member.name === form.person)) return setNotice("Selecione um integrante válido.");
    if (!isValidDateInput(form.occurredAt)) return setNotice("Selecione uma data válida entre 2000 e 2200.");
    const installmentCount = payment.isCard ? parseInstallments(form.installments, amountCents) : 1;
    if (!installmentCount) return setNotice("O número de parcelas deve ser um inteiro entre 1 e 60 e não pode superar o valor em centavos.");
    if (!isValidDateInput(addMonths(form.occurredAt, installmentCount - 1))) return setNotice("A última parcela precisa ficar dentro do limite de dezembro de 2200.");
    const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount, tempBase = nextTemporaryId.current;
    nextTemporaryId.current -= installmentCount;
    const optimistic = Array.from({ length: installmentCount }, (_, index) => ({ id: tempBase - index, amountCents: baseAmount + (index < remainder ? 1 : 0), description: installmentCount > 1 ? `${description} (${index + 1}/${installmentCount})` : description, categoryId: category.id, category: category.name, paymentMethod: form.paymentMethod, person: form.person, occurredAt: addMonths(form.occurredAt, index), referenceMonth: null, importBatchId: null }));
    const temporaryIds = new Set(optimistic.map(item => item.id));
    setSavingExpense(true);
    setData(current => ({ ...current, expenses: [...current.expenses, ...optimistic.filter(item => item.occurredAt.startsWith(month))] }));
    setTab("gastos"); setNotice("Salvando gasto…");
    try {
      const response = await financeClient.write("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "expense", ...form }) });
      const result = await response.json() as { error?: string; installments?: number; expenses?: Expense[] };
      if (!response.ok) { setData(current => ({ ...current, expenses: current.expenses.filter(item => !temporaryIds.has(item.id)) })); return setNotice(result.error ?? "Não foi possível salvar."); }
      setData(current => ({ ...current, expenses: [...current.expenses.filter(item => !temporaryIds.has(item.id)), ...(result.expenses ?? []).filter(item => expenseInMonth(item, month))].sort((a,b) => expenseDateKey(a).localeCompare(expenseDateKey(b)) || a.id - b.id) }));
      setForm({ ...form, amount: "", description: "", installments: "1", occurredAt: today() });
      setNotice(result.installments && result.installments > 1 ? `${result.installments} parcelas lançadas nos próximos meses.` : "Gasto salvo com sucesso.");
    } catch { setData(current => ({ ...current, expenses: current.expenses.filter(item => !temporaryIds.has(item.id)) })); setNotice("Falha de conexão. Seus dados continuam preenchidos para tentar novamente."); }
    finally { setSavingExpense(false); }
  }

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    const name = normalizeCategoryName(categoryName);
    if (!name) return setNotice("A categoria deve conter letras e ter no máximo 60 caracteres.");
    const response = await financeClient.write("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "category", name, kind: categoryKind }) });
    const result = await response.json() as { error?: string; category?: Category };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível criar.");
    if (result.category) setData(current => ({ ...current, categories: [...current.categories, result.category!].sort((a,b) => a.name.localeCompare(b.name)) }));
    setCategoryName(""); setNotice(`Categoria de ${categoryKind === "income" ? "entrada" : "gasto"} criada.`);
  }

  async function removeExpense(id: number) {
    const expense = data.expenses.find(item => item.id === id);
    if (!expense || id < 1) return;
    const message = expense.installmentGroupId
      ? "Apagar esta compra e TODAS as suas parcelas, inclusive as dos outros meses?"
      : "Deseja realmente apagar este gasto?";
    if (!confirm(message)) return;
    try {
      const response = await financeClient.write(`/api/finance?type=expense&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
      const result = await response.json() as { error?: string; deletedIds?: number[] };
      if (!response.ok) return setNotice(result.error ?? "Não foi possível apagar o gasto.");
      const deletedIds = new Set(result.deletedIds ?? [id]);
      setData(current => ({ ...current, expenses: current.expenses.filter(item => !deletedIds.has(item.id)) }));
      setNotice(deletedIds.size > 1 ? `Compra apagada com todas as ${deletedIds.size} parcelas restantes.` : "Gasto apagado.");
    } catch { setNotice("Não foi possível apagar o gasto. Tente novamente."); }
  }

  async function editCategory(event: React.FormEvent) {
    event.preventDefault();
    if (editingCategoryId === null) return;
    const name = normalizeCategoryName(editingCategoryName);
    if (!name) return setNotice("A categoria deve conter letras e ter no máximo 60 caracteres.");
    const response = await financeClient.write("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "category", id: editingCategoryId, name, kind: editingCategoryKind }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível editar a categoria.");
    setData(current => ({ ...current, categories: current.categories.map(item => item.id === editingCategoryId ? { ...item, name, kind: editingCategoryKind } : item), expenses: current.expenses.map(item => item.categoryId === editingCategoryId ? { ...item, category: name } : item), incomes: current.incomes.map(item => item.categoryId === editingCategoryId ? { ...item, category: name } : item) }));
    setEditingCategoryId(null); setEditingCategoryName(""); setNotice("Categoria atualizada.");
  }

  async function removeCategory(id: number, name: string) {
    if (!confirm(`Deseja realmente excluir a categoria “${name}”?`)) return;
    const response = await financeClient.write(`/api/finance?type=category&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível excluir a categoria.");
    setData(current => ({ ...current, categories: current.categories.filter(item => item.id !== id) })); setNotice("Categoria excluída.");
  }

  async function addPayment(event: React.SyntheticEvent) {
    event.preventDefault();
    const name = normalizePaymentName(paymentForm.name);
    if (!name) return setNotice("A forma de pagamento deve conter letras e ter no máximo 60 caracteres.");
    const response = await financeClient.write("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "payment", name, isCard: paymentForm.isCard }) });
    const result = await response.json() as { error?: string; payment?: Payment };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível criar a forma de pagamento.");
    if (result.payment) { setData(current => ({ ...current, payments: [...current.payments, result.payment!].sort((a,b) => a.name.localeCompare(b.name)) })); setForm(current => ({ ...current, paymentMethod: result.payment!.key })); }
    setPaymentForm({ name: "", isCard: false }); setShowPaymentForm(false); setNotice("Forma de pagamento criada e selecionada.");
  }

  async function createHousehold(event: React.FormEvent) {
    event.preventDefault();
    const name = normalizeName(adminForm.name), memberValidation = validateMembers(adminForm.members);
    if (!name) return setNotice("O nome da família deve conter letras e ter no máximo 80 caracteres.");
    if (!memberValidation.ok) return setNotice(memberValidation.error);
    const response = await financeClient.write("/api/admin/households", { method: "POST", headers: writeHeaders, body: JSON.stringify({ name, members: memberValidation.members, allowIncome: adminForm.allowIncome }) });
    const result = await response.json() as { error?: string; household?: Household };
    if (!response.ok || !result.household) return setNotice(result.error ?? "Não foi possível criar a família.");
    setData(current => ({ ...current, households: [...current.households, result.household!].sort((a,b)=>a.name.localeCompare(b.name)) }));
    setAdminForm({ name: "", allowIncome: false, members: [{ name: "", email: "" }] });
    setNotice(`Carteira “${result.household.name}” criada com sucesso.`); setHouseholdSelection(current => chooseHousehold(current, String(result.household!.id))); setTab("resumo");
  }

  async function addIncome(event: React.FormEvent) {
    event.preventDefault();
    if (savingIncome) return;
    const amountCents = parseMoneyInput(incomeForm.amount), description = normalizeDescription(incomeForm.description), category = incomeCategories.find(item => String(item.id) === incomeForm.categoryId);
    if (!amountCents) return setNotice("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo duas casas decimais.");
    if (!description) return setNotice("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!category) return setNotice("Selecione uma categoria de entrada válida.");
    if (!data.members.some(member => member.name === incomeForm.person)) return setNotice("Selecione um integrante válido.");
    if (!isValidDateInput(incomeForm.occurredAt)) return setNotice("Selecione uma data válida entre 2000 e 2200.");
    const temporary: Income = { id: nextTemporaryId.current--, amountCents, description, categoryId: category.id, category: category.name, person: incomeForm.person, occurredAt: incomeForm.occurredAt };
    setSavingIncome(true);
    if (temporary.occurredAt.startsWith(month)) setData(current => ({ ...current, incomes: [...current.incomes, temporary] }));
    setNotice("Salvando entrada…");
    try {
      const response = await financeClient.write("/api/finance", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "income", ...incomeForm }) });
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
    const response = await financeClient.write(`/api/finance?type=income&id=${id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    if (!response.ok) { if (removed) setData(current => ({ ...current, incomes: [...current.incomes, removed] })); return setNotice("Não foi possível apagar a entrada."); }
    setNotice("Entrada apagada.");
  }

  async function setHouseholdIncome(householdId: number, allowIncome: boolean) {
    const response = await financeClient.write("/api/admin/households", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ householdId, allowIncome }) });
    const result = await response.json() as { error?: string; household?: Household };
    if (!response.ok || !result.household) return setNotice(result.error ?? "Não foi possível alterar a configuração.");
    setData(current => ({ ...current, households: current.households.map(item => item.id === householdId ? { ...item, allowIncome } : item), household: current.household?.id === householdId ? { ...current.household, allowIncome } : current.household }));
    if (!allowIncome && data.household?.id === householdId && tab === "entradas") setTab("resumo");
    setNotice(allowIncome ? "Entradas e saídas habilitadas para esta família." : "A família voltou ao controle somente de gastos.");
  }

  function startExpenseEdit(expense: Expense) {
    setExpenseEdit({ id: expense.id, amount: (expense.amountCents / 100).toFixed(2).replace(".", ","), description: expense.description ?? "", categoryId: expense.categoryId ? String(expense.categoryId) : "", paymentMethod: expense.paymentMethod ?? "", person: expense.person ?? "", occurredAt: expense.occurredAt ?? "", referenceMonth: expense.referenceMonth ?? month, imported: Boolean(expense.importBatchId) });
  }

  async function updateExpense(event: React.FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(expenseEdit.amount), description = expenseEdit.imported ? normalizeImportedDescription(expenseEdit.description) : normalizeDescription(expenseEdit.description);
    if (expenseEdit.imported && expenseEdit.description.trim() && !description) return setNotice("A descrição deve ter no máximo 160 caracteres e não conter caracteres de controle.");
    if (!amountCents) return setNotice("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo duas casas decimais.");
    if (!expenseEdit.imported && !description) return setNotice("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!expenseEdit.imported && !expenseCategories.some(category => String(category.id) === expenseEdit.categoryId)) return setNotice("Selecione uma categoria de gasto válida.");
    if (!expenseEdit.imported && !data.payments.some(payment => payment.key === expenseEdit.paymentMethod)) return setNotice("Selecione uma forma de pagamento válida.");
    if (!expenseEdit.imported && !data.members.some(member => member.name === expenseEdit.person)) return setNotice("Selecione um integrante válido.");
    if (expenseEdit.occurredAt && !isValidDateInput(expenseEdit.occurredAt)) return setNotice("Selecione uma data válida entre 2000 e 2200.");
    if (!expenseEdit.imported && !expenseEdit.occurredAt) return setNotice("Selecione uma data válida entre 2000 e 2200.");
    if (expenseEdit.imported && !isValidMonthInput(expenseEdit.referenceMonth)) return setNotice("Selecione um mês de destino válido.");
    const response = await financeClient.write("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "expense", ...expenseEdit, description: description ?? "" }) });
    const result = await response.json() as { error?: string; expense?: Expense };
    if (!response.ok || !result.expense) return setNotice(result.error ?? "Não foi possível editar o gasto.");
    setData(current => ({ ...current, expenses: current.expenses.map(item => item.id === result.expense!.id ? result.expense! : item).filter(item => expenseInMonth(item, month)).sort((a,b)=>expenseDateKey(a).localeCompare(expenseDateKey(b))||a.id-b.id) }));
    setExpenseEdit(current => ({ ...current, id: 0 })); setNotice("Gasto atualizado em todo o sistema.");
  }

  function startIncomeEdit(income: Income) {
    setIncomeEdit({ id: income.id, amount: (income.amountCents / 100).toFixed(2).replace(".", ","), description: income.description, categoryId: income.categoryId ? String(income.categoryId) : "", person: income.person, occurredAt: income.occurredAt });
  }

  async function updateIncome(event: React.FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(incomeEdit.amount), description = normalizeDescription(incomeEdit.description);
    if (!amountCents) return setNotice("Informe um valor entre R$ 0,01 e R$ 999.999.999,99, com no máximo duas casas decimais.");
    if (!description) return setNotice("A descrição deve conter letras e ter no máximo 160 caracteres.");
    if (!incomeCategories.some(category => String(category.id) === incomeEdit.categoryId)) return setNotice("Selecione uma categoria de entrada válida.");
    if (!data.members.some(member => member.name === incomeEdit.person)) return setNotice("Selecione um integrante válido.");
    if (!isValidDateInput(incomeEdit.occurredAt)) return setNotice("Selecione uma data válida entre 2000 e 2200.");
    const response = await financeClient.write("/api/finance", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "income", ...incomeEdit }) });
    const result = await response.json() as { error?: string; income?: Income };
    if (!response.ok || !result.income) return setNotice(result.error ?? "Não foi possível editar a entrada.");
    setData(current => ({ ...current, incomes: current.incomes.map(item => item.id === result.income!.id ? result.income! : item).filter(item => item.occurredAt.startsWith(month)).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id-b.id) }));
    setIncomeEdit(current => ({ ...current, id: 0 })); setNotice("Entrada atualizada em todo o sistema.");
  }

  async function saveMember(event: React.FormEvent) {
    event.preventDefault();
    const name = normalizeName(memberForm.name), email = normalizeEmail(memberForm.email);
    if (!name) return setNotice("O nome do integrante deve conter letras e ter no máximo 80 caracteres.");
    if (!email) return setNotice("Informe um email válido com no máximo 254 caracteres.");
    if (data.members.length >= MAX_MEMBERS) return setNotice(`Uma família pode ter no máximo ${MAX_MEMBERS} integrantes.`);
    const response = await financeClient.write("/api/admin/households", { method: "POST", headers: writeHeaders, body: JSON.stringify({ type: "member", name, email }) });
    const result = await response.json() as { error?: string; member?: Member };
    if (!response.ok || !result.member) return setNotice(result.error ?? "Não foi possível salvar o integrante.");
    setData(current => ({ ...current, members: [...current.members, result.member!].sort((a,b)=>a.name.localeCompare(b.name)) }));
    setMemberForm({ name: "", email: "" }); setNotice("Integrante adicionado à carteira.");
  }

  async function updateMember(event: React.FormEvent) {
    event.preventDefault();
    const name = normalizeName(memberEdit.name), email = normalizeEmail(memberEdit.email);
    if (!name) return setNotice("O nome do integrante deve conter letras e ter no máximo 80 caracteres.");
    if (!email) return setNotice("Informe um email válido com no máximo 254 caracteres.");
    const response = await financeClient.write("/api/admin/households", { method: "PATCH", headers: writeHeaders, body: JSON.stringify({ type: "member", ...memberEdit, name, email }) });
    const result = await response.json() as { error?: string; member?: Member };
    if (!response.ok || !result.member) return setNotice(result.error ?? "Não foi possível atualizar o integrante.");
    setData(current => ({ ...current, members: current.members.map(item => item.id === result.member!.id ? result.member! : item).sort((a,b)=>a.name.localeCompare(b.name)) }));
    setMemberEdit({ id: 0, name: "", email: "" }); setNotice("Integrante atualizado.");
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remover ${member.name} desta carteira? O histórico de lançamentos será mantido.`)) return;
    const response = await financeClient.write(`/api/admin/households?type=member&id=${member.id}`, { method: "DELETE", headers: selectedHousehold ? { "x-household-id": selectedHousehold } : {} });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setNotice(result.error ?? "Não foi possível remover o integrante.");
    setData(current => ({ ...current, members: current.members.filter(item => item.id !== member.id) }));
    if (memberEdit.id === member.id) setMemberEdit({ id: 0, name: "", email: "" });
    setNotice("Integrante removido da carteira.");
  }

  function updateAdminMember(index:number, field:"name"|"email", value:string) {
    setAdminForm(current => ({ ...current, members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member) }));
  }

  function applyMonth() {
    if (!isValidMonthInput(monthDraft)) return setNotice("Selecione um mês válido entre 2000 e 2200.");
    setMonth(monthDraft); setShowMonthPicker(false);
  }

  if (accessError) return <main className="access-page"><section className="access-card"><span className="access-code">{accessError.status}</span><div className="access-mark"><BrandMark size={48}/></div><p>FINANÇAS DA FAMÍLIA</p><h1>{accessError.status === 401 ? "Login necessário" : "Acesso não autorizado"}</h1><p>{accessError.message}</p><small>Peça ao administrador para cadastrar nesta carteira o e-mail da conta usada para entrar.</small><button className="primary" type="button" onClick={()=>window.location.reload()}>Tentar novamente</button></section></main>;

  const monthLabelRaw = new Date(`${month}-02T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const navigationItems: NavigationItem[] = [{id:"resumo",icon:"home",label:"Resumo"},{id:"novo",icon:"plus",label:"Novo gasto"},{id:"gastos",icon:"expenses",label:"Gastos"},...(data.household?.allowIncome ? [{id:"entradas",icon:"income" as const,label:"Entradas"}] : []),{id:"categorias",icon:"categories",label:"Categorias"},{id:"relatorio",icon:"report",label:"Relatório"}];
  const mobilePrimaryItems: NavigationItem[] = data.household?.allowIncome ? [{id:"resumo",icon:"home",label:"Resumo"},{id:"gastos",icon:"expenses",label:"Gastos"},{id:"novo",icon:"plus",label:"Novo"},{id:"entradas",icon:"income",label:"Entradas"},{id:"relatorio",icon:"report",label:"Relatório"}] : [{id:"resumo",icon:"home",label:"Resumo"},{id:"gastos",icon:"expenses",label:"Gastos"},{id:"novo",icon:"plus",label:"Novo"},{id:"categorias",icon:"categories",label:"Categorias"},{id:"relatorio",icon:"report",label:"Relatório"}];
  const openTab = (id:string) => { setTab(id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo principal</a>
    <AppSidebar items={navigationItems} tab={tab} onNavigate={openTab} isAdmin={data.isAdmin} households={data.households} selectedHousehold={selectedHousehold} householdName={data.household?.name ?? "Sua família"} onHouseholdChange={householdId => setHouseholdSelection(current => chooseHousehold(current, householdId))}/>
    <main id="main-content">
      <PageHeader eyebrow="Controle familiar" title={tabTitle(tab)} monthLabel={monthLabel} onOpenMonth={()=>{setMonthDraft(month);setShowMonthPicker(true)}}/>
      {notice && <StatusNotice message={notice} tone={notice.startsWith("Não") || notice.includes("inválid") ? "error" : "success"} onClose={() => setNotice("")}/>}
      {loadedQuery !== queryKey ? <LoadingSkeleton/> : queryError ? <div role="alert"><p>{queryError}</p><button className="primary" onClick={()=>{financeClient.invalidate();setRefreshKey(value=>value+1);}}>Tentar novamente</button></div> : <>
        {tab === "resumo" && <section>
          <FinancialSummary allowIncome={Boolean(data.household?.allowIncome)} monthLabel={monthLabel} expensesTotal={total} incomeTotal={incomeTotal} balance={balance} expenseCount={data.expenses.length} incomeCount={data.incomes.length}/>
          <div className="mini-grid">{cardTotals.map(item => <Metric key={item.name} label={item.name} value={item.total}/>)}{cardTotals.length > 1 && <Metric label="Cartões somados" value={cardsTotal}/>}</div>
          <div className="content-grid"><Panel title="Por categoria"><Bars rows={byCategory}/></Panel><Panel title="Por pagamento"><Bars rows={byPayment.map(x => ({...x, name: x.name === "cartao" ? "Cartões" : paymentName(x.name)}))}/></Panel></div>
        </section>}
        {tab === "novo" && <section className="narrow"><Panel title="Registrar novo gasto" eyebrow="Novo lançamento"><form className="form" onSubmit={addExpense} aria-busy={savingExpense}>
          <label>Valor (R$)<input autoFocus inputMode="decimal" maxLength={16} placeholder="0,00" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} required /></label>
          <label className="wide">Onde foi gasto?<input maxLength={MAX_DESCRIPTION_LENGTH} placeholder="Ex.: Mercado Central" value={form.description} onChange={e => setForm({...form, description:e.target.value})} required /></label>
          <label>Categoria<select value={form.categoryId} onChange={e => setForm({...form, categoryId:e.target.value})} required><option value="">Selecione uma categoria</option>{expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Pagamento<div className="select-with-add"><select value={form.paymentMethod} onChange={e => setForm({...form, paymentMethod:e.target.value, installments:isCardPayment(e.target.value)?form.installments:"1"})} required><option value="">Selecione um pagamento</option>{payments.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><button className="add-inline" type="button" aria-label="Adicionar forma de pagamento" title="Adicionar forma de pagamento" onClick={()=>setShowPaymentForm(value=>!value)}>+</button></div></label>
          {showPaymentForm && <div className="payment-popover wide"><b>Nova forma de pagamento</b><div><input autoFocus maxLength={MAX_CATEGORY_LENGTH} placeholder="Ex.: Pix ou Cartão João" value={paymentForm.name} onChange={e=>setPaymentForm({...paymentForm,name:e.target.value})} required/><label className="check-label"><input type="checkbox" checked={paymentForm.isCard} onChange={e=>setPaymentForm({...paymentForm,isCard:e.target.checked})}/> Permite parcelamento</label><button className="primary" type="button" onClick={event=>void addPayment(event)}>Adicionar</button><button className="secondary" type="button" onClick={()=>setShowPaymentForm(false)}>Cancelar</button></div></div>}
          {isCardPayment(form.paymentMethod) && <label>Número de parcelas<input type="number" inputMode="numeric" min={1} max={MAX_INSTALLMENTS} step={1} value={form.installments} onChange={e=>setForm({...form,installments:e.target.value})} required/><small className="field-help">O valor total será dividido entre os meses.</small></label>}
          <label>Quem lançou?<select value={form.person} onChange={e => setForm({...form, person:e.target.value})}>{data.members.map(member => <option key={member.id}>{member.name}</option>)}</select></label>
          <label>Data<input type="date" min="2000-01-01" max="2200-12-31" value={form.occurredAt} onChange={e => setForm({...form, occurredAt:e.target.value})} required /></label>
          <button className="primary wide" type="submit" disabled={savingExpense}>{savingExpense ? "Salvando…" : "Salvar gasto"}</button>
        </form></Panel></section>}
        {tab === "gastos" && <section>{showImport ? <Suspense fallback={<LoadingSkeleton/>}><ImportWorkspace key={`${selectedHousehold}-${month}`} month={month} data={data} householdId={selectedHousehold} onImported={()=>{financeClient.invalidate();setRefreshKey(value=>value+1);}} onClose={()=>setShowImport(false)}/></Suspense> : <div className="expense-page-actions"><div><b>Migrou de uma planilha ou recebeu a fatura?</b><span>Importe e confira os gastos antes de salvar.</span></div><button className="primary" type="button" onClick={()=>setShowImport(true)}>Importar arquivo</button></div>}<div className="expense-filter"><div className="expense-filter-fields"><label>Filtrar por categoria<select value={expenseCategory} onChange={e=>{setExpenseCategory(e.target.value);setExpensePage(1)}}><option value="all">Todas as categorias</option>{expenseCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Filtrar por pagamento<select value={expensePayment} onChange={e=>{setExpensePayment(e.target.value);setExpensePage(1)}}><option value="all">Todos os pagamentos</option>{payments.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><div className="expense-filter-summary"><span>{filteredExpenses.length} gasto{filteredExpenses.length === 1 ? "" : "s"} no mês</span><strong>{formatMoney(filteredTotal)}</strong></div></div><ExpenseTable expenses={visibleFilteredExpenses} paymentOptions={payments} paymentName={paymentName} onDelete={removeExpense} onEdit={startExpenseEdit}/>{expensePageCount > 1 && <nav className="import-pagination" aria-label="Páginas dos gastos"><button className="secondary" type="button" disabled={safeExpensePage === 1} onClick={()=>setExpensePage(safeExpensePage - 1)}>Anterior</button><span>Página {safeExpensePage} de {expensePageCount}</span><button className="secondary" type="button" disabled={safeExpensePage === expensePageCount} onClick={()=>setExpensePage(safeExpensePage + 1)}>Próxima</button></nav>}</section>}
        {tab === "entradas" && data.household?.allowIncome && <section><div className="income-month-head"><div><span>Entradas do mês</span><strong>{formatMoney(incomeTotal)}</strong></div><small>{data.incomes.length} entrada{data.incomes.length === 1 ? "" : "s"} em {monthLabel}</small></div><div className="income-layout"><Panel title="Adicionar entrada" eyebrow="Receita"><form className="income-form" onSubmit={addIncome} aria-busy={savingIncome}><label>Valor (R$)<input autoFocus inputMode="decimal" maxLength={16} placeholder="0,00" value={incomeForm.amount} onChange={event=>setIncomeForm({...incomeForm,amount:event.target.value})} required/></label><label>Descrição<input maxLength={MAX_DESCRIPTION_LENGTH} placeholder="Ex.: Salário" value={incomeForm.description} onChange={event=>setIncomeForm({...incomeForm,description:event.target.value})} required/></label><label>Categoria<select value={incomeForm.categoryId} onChange={event=>setIncomeForm({...incomeForm,categoryId:event.target.value})} required><option value="">Selecione uma categoria</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Quem lançou?<select value={incomeForm.person || data.currentMember} onChange={event=>setIncomeForm({...incomeForm,person:event.target.value})} required><option value="">Selecione</option>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" min="2000-01-01" max="2200-12-31" value={incomeForm.occurredAt} onChange={event=>setIncomeForm({...incomeForm,occurredAt:event.target.value})} required/></label><button className="primary" type="submit" disabled={savingIncome}>{savingIncome ? "Salvando…" : "Salvar entrada"}</button></form></Panel><Panel title="Entradas por categoria"><Bars rows={incomeByCategory} emptyText="Sem entradas neste mês."/></Panel></div><div className="income-history"><div className="expense-filter"><label>Filtrar entradas por categoria<select value={incomeCategory} onChange={event=>setIncomeCategory(event.target.value)}><option value="all">Todas as categorias</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}{data.incomes.some(item=>item.categoryId===null)&&<option value="uncategorized">Sem categoria</option>}</select></label><div className="expense-filter-summary"><span>{filteredIncomes.length} entrada{filteredIncomes.length === 1 ? "" : "s"} no mês</span><strong>{formatMoney(filteredIncomeTotal)}</strong></div></div><Panel title={`Entradas de ${monthLabel}`}><IncomeTable incomes={filteredIncomes} onDelete={removeIncome} onEdit={startIncomeEdit}/></Panel></div></section>}
        {tab === "categorias" && <section className="narrow"><Panel title="Categorias" eyebrow="Organização"><form className={`category-form${data.household?.allowIncome ? "" : " expense-only"}`} onSubmit={addCategory}><label className="sr-only" htmlFor="category-name">Nome da categoria</label><input id="category-name" maxLength={MAX_CATEGORY_LENGTH} placeholder="Nova categoria" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/>{data.household?.allowIncome && <select aria-label="Usar categoria em" value={categoryKind} onChange={event=>setCategoryKind(event.target.value as CategoryKind)}><option value="expense">Saídas</option><option value="income">Entradas</option></select>}<button className="primary">Adicionar</button></form>{data.household?.allowIncome && <div className="category-filter"><span>Mostrar categorias</span><div role="group" aria-label="Filtrar categorias"><button type="button" className={categoryFilter === "income" ? "active" : ""} onClick={()=>setCategoryFilter("income")}>Entradas</button><button type="button" className={categoryFilter === "expense" ? "active" : ""} onClick={()=>setCategoryFilter("expense")}>Saídas</button><button type="button" className={categoryFilter === "all" ? "active" : ""} onClick={()=>setCategoryFilter("all")}>Todas</button></div></div>}<div className="category-list">{visibleCategories.map(c=>editingCategoryId === c.id ? <form className="category-edit" key={c.id} onSubmit={editCategory}><input autoFocus maxLength={MAX_CATEGORY_LENGTH} value={editingCategoryName} onChange={e=>setEditingCategoryName(e.target.value)} required aria-label={`Novo nome de ${c.name}`}/>{data.household?.allowIncome && <select aria-label={`Uso de ${c.name}`} value={editingCategoryKind} onChange={event=>setEditingCategoryKind(event.target.value as CategoryKind)}><option value="expense">Saídas</option><option value="income">Entradas</option></select>}<button className="primary" type="submit">Salvar</button><button className="secondary" type="button" onClick={()=>setEditingCategoryId(null)}>Cancelar</button></form> : <div className="category-item" key={c.id}><span>{c.name.slice(0,1).toUpperCase()}</span><div className="category-copy"><b>{c.name}</b>{data.household?.allowIncome && <small>{c.kind === "income" ? "Entrada" : "Saída"}</small>}</div><div className="category-actions"><IconButton icon="edit" label={`Editar ${c.name}`} onClick={()=>{setEditingCategoryId(c.id);setEditingCategoryName(c.name);setEditingCategoryKind(c.kind)}}/><IconButton icon="trash" tone="danger" label={`Excluir ${c.name}`} onClick={()=>removeCategory(c.id,c.name)}/></div></div>)}{!visibleCategories.length&&<Empty text="Nenhuma categoria neste filtro."/>}</div></Panel></section>}
        {tab === "admin" && data.isAdmin && <section className="admin-grid"><Panel title="Cadastrar nova família" eyebrow="Nova carteira"><form className="admin-form" onSubmit={createHousehold}><label>Nome da família<input autoFocus maxLength={MAX_NAME_LENGTH} placeholder="Ex.: Família Taty e Rildo" value={adminForm.name} onChange={event=>setAdminForm({...adminForm,name:event.target.value})} required/></label><label className="feature-toggle"><input type="checkbox" checked={adminForm.allowIncome} onChange={event=>setAdminForm({...adminForm,allowIncome:event.target.checked})}/><span><b>Permitir entrada e saída de dinheiro</b><small>Adiciona a aba Entradas e o saldo mensal desta família.</small></span></label><div className="admin-members"><div className="admin-members-head"><b>Integrantes iniciais</b><button type="button" className="secondary" disabled={adminForm.members.length >= MAX_MEMBERS} onClick={()=>setAdminForm(current=>({...current,members:[...current.members,{name:"",email:""}]}))}><Icon name="plus"/> Integrante</button></div>{adminForm.members.map((member,index)=><div className="admin-member" key={index}><input maxLength={MAX_NAME_LENGTH} placeholder="Nome" aria-label={`Nome do integrante ${index+1}`} value={member.name} onChange={event=>updateAdminMember(index,"name",event.target.value)}/><input type="email" maxLength={MAX_EMAIL_LENGTH} placeholder="E-mail de acesso" aria-label={`E-mail do integrante ${index+1}`} value={member.email} onChange={event=>updateAdminMember(index,"email",event.target.value)}/>{adminForm.members.length>1&&<IconButton icon="trash" tone="danger" label={`Remover integrante ${index+1}`} onClick={()=>setAdminForm(current=>({...current,members:current.members.filter((_,memberIndex)=>memberIndex!==index)}))}/>}</div>)}</div><button className="primary" type="submit">Criar carteira da família</button></form></Panel><Panel title="Funcionalidades por família" eyebrow="Permissões"><div className="household-settings">{data.households.map(household=><label className="feature-toggle" key={household.id}><input type="checkbox" checked={household.allowIncome} onChange={event=>void setHouseholdIncome(household.id,event.target.checked)}/><span><b>{household.name}</b><small>{household.allowIncome ? "Entradas e saídas habilitadas" : "Somente controle de gastos"}</small></span></label>)}</div></Panel><div className="admin-members-panel"><Panel title={`Integrantes de ${data.household?.name ?? "carteira"}`} eyebrow="Acessos"><form className="member-manager-form" onSubmit={saveMember}><input maxLength={MAX_NAME_LENGTH} placeholder="Nome" aria-label="Nome do integrante" value={memberForm.name} onChange={event=>setMemberForm({...memberForm,name:event.target.value})} required/><input type="email" maxLength={MAX_EMAIL_LENGTH} placeholder="E-mail de acesso" aria-label="E-mail do integrante" value={memberForm.email} onChange={event=>setMemberForm({...memberForm,email:event.target.value})} required/><button className="primary" type="submit">Adicionar integrante</button></form><div className="managed-members">{data.members.map(member=><div key={member.id}><div><b>{member.name}</b><small>{member.email}</small></div><div className="category-actions"><IconButton icon="edit" label={`Editar ${member.name}`} onClick={()=>setMemberEdit({id:member.id,name:member.name,email:member.email})}/><IconButton icon="trash" tone="danger" label={`Remover ${member.name}`} onClick={()=>void removeMember(member)}/></div></div>)}</div><small className="admin-help">Este painel controla quem pertence à carteira selecionada. Pessoas que não estiverem nesta lista recebem a mensagem de acesso inválido.</small></Panel></div></section>}
        {tab === "relatorio" && <section className="print-area"><div className="report-head"><div><p>RELATÓRIO MENSAL</p><h2>{monthLabel}</h2></div><button className="primary no-print" onClick={()=>window.print()}>Imprimir / salvar PDF</button></div><div className="report-section"><h3>Gastos</h3><ExpenseTable expenses={data.expenses} paymentOptions={payments} paymentName={paymentName} onDelete={removeExpense} readonly/><div className="report-total"><span>Total de gastos</span><strong>{formatMoney(total)}</strong></div></div>{data.household?.allowIncome && <><div className="report-section"><h3>Entradas</h3><IncomeTable incomes={data.incomes} onDelete={removeIncome} readonly/><div className="report-total income-total"><span>Total de entradas</span><strong>{formatMoney(incomeTotal)}</strong></div></div><div className={`report-balance ${balance < 0 ? "negative" : "positive"}`}><div><span>Saldo do mês</span><small>Total de entradas menos total de gastos</small></div><strong>{balance < 0 ? "−" : "+"}{formatMoney(Math.abs(balance))}</strong></div></>}</section>}
      </>}
    </main>
    <MobileNavigation items={mobilePrimaryItems} tab={tab} onNavigate={openTab}/>
    {showMonthPicker&&<DialogFrame titleId="month-modal-title" title="Selecionar mês" description="Escolha o período que deseja consultar." onClose={closeMonthPicker} className="month-modal"><div className="month-modal-fields"><label>Mês<select value={monthDraft.split("-")[1]} onChange={event=>setMonthDraft(`${monthDraft.split("-")[0]}-${event.target.value}`)}>{monthNames.map((name,index)=><option key={name} value={String(index+1).padStart(2,"0")}>{name}</option>)}</select></label><label>Ano<select value={monthDraft.split("-")[0]} onChange={event=>setMonthDraft(`${event.target.value}-${monthDraft.split("-")[1]}`)}>{Array.from({length:201},(_,index)=>2200-index).map(year=><option key={year} value={year}>{year}</option>)}</select></label></div><div className="month-modal-actions"><button type="button" className="month-reset" onClick={()=>setMonthDraft(monthKey())}>Hoje</button><button type="button" className="month-confirm" aria-label="Confirmar mês selecionado" onClick={applyMonth}><Icon name="check"/></button></div></DialogFrame>}
    {expenseEdit.id > 0 && <div className="modal-backdrop"><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="expense-edit-title"><h2 id="expense-edit-title">Editar gasto</h2><form className="form" onSubmit={updateExpense}><label>Valor (R$)<input autoFocus inputMode="decimal" maxLength={16} value={expenseEdit.amount} onChange={event=>setExpenseEdit({...expenseEdit,amount:event.target.value})} required/></label><label className="wide">Onde foi gasto?<input maxLength={MAX_DESCRIPTION_LENGTH} value={expenseEdit.description} onChange={event=>setExpenseEdit({...expenseEdit,description:event.target.value})} required={!expenseEdit.imported}/></label><label>Categoria<select value={expenseEdit.categoryId} onChange={event=>setExpenseEdit({...expenseEdit,categoryId:event.target.value})} required={!expenseEdit.imported}><option value="">Sem categoria</option>{expenseCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Pagamento<select value={expenseEdit.paymentMethod} onChange={event=>setExpenseEdit({...expenseEdit,paymentMethod:event.target.value})} required={!expenseEdit.imported}><option value="">Não informado</option>{payments.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Quem lançou?<select value={expenseEdit.person} onChange={event=>setExpenseEdit({...expenseEdit,person:event.target.value})} required={!expenseEdit.imported}><option value="">Não informado</option>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" min="2000-01-01" max="2200-12-31" value={expenseEdit.occurredAt} onChange={event=>setExpenseEdit({...expenseEdit,occurredAt:event.target.value})} required={!expenseEdit.imported}/></label>{expenseEdit.imported&&<label>Mês de destino<input type="month" min="2000-01" max="2200-12" value={expenseEdit.referenceMonth} onChange={event=>setExpenseEdit({...expenseEdit,referenceMonth:event.target.value})} required/></label>}<div className="modal-actions wide"><button className="secondary" type="button" onClick={()=>setExpenseEdit(current=>({...current,id:0}))}>Cancelar</button><button className="primary" type="submit">Salvar gasto</button></div></form></section></div>}
    {incomeEdit.id > 0 && <div className="modal-backdrop"><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="income-edit-title"><h2 id="income-edit-title">Editar entrada</h2><form className="income-form" onSubmit={updateIncome}><label>Valor (R$)<input autoFocus inputMode="decimal" maxLength={16} value={incomeEdit.amount} onChange={event=>setIncomeEdit({...incomeEdit,amount:event.target.value})} required/></label><label>Descrição<input maxLength={MAX_DESCRIPTION_LENGTH} value={incomeEdit.description} onChange={event=>setIncomeEdit({...incomeEdit,description:event.target.value})} required/></label><label>Categoria<select value={incomeEdit.categoryId} onChange={event=>setIncomeEdit({...incomeEdit,categoryId:event.target.value})} required><option value="">Selecione uma categoria</option>{incomeCategories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Quem lançou?<select value={incomeEdit.person} onChange={event=>setIncomeEdit({...incomeEdit,person:event.target.value})} required>{data.members.map(member=><option key={member.id} value={member.name}>{member.name}</option>)}</select></label><label>Data<input type="date" min="2000-01-01" max="2200-12-31" value={incomeEdit.occurredAt} onChange={event=>setIncomeEdit({...incomeEdit,occurredAt:event.target.value})} required/></label><div className="modal-actions"><button className="secondary" type="button" onClick={()=>setIncomeEdit(current=>({...current,id:0}))}>Cancelar</button><button className="primary" type="submit">Salvar entrada</button></div></form></section></div>}
    {memberEdit.id > 0 && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setMemberEdit({id:0,name:"",email:""})}}><section className="edit-modal member-edit-modal" role="dialog" aria-modal="true" aria-labelledby="member-edit-title"><h2 id="member-edit-title">Editar integrante</h2><form className="income-form" onSubmit={updateMember}><label>Nome<input autoFocus maxLength={MAX_NAME_LENGTH} value={memberEdit.name} onChange={event=>setMemberEdit({...memberEdit,name:event.target.value})} required/></label><label>E-mail de acesso<input type="email" maxLength={MAX_EMAIL_LENGTH} value={memberEdit.email} onChange={event=>setMemberEdit({...memberEdit,email:event.target.value})} required/></label><p className="member-edit-help">Ao trocar o e-mail, o acesso anterior é removido e a nova conta precisa entrar usando exatamente este endereço.</p><div className="modal-actions"><button className="secondary" type="button" onClick={()=>setMemberEdit({id:0,name:"",email:""})}>Cancelar</button><button className="primary" type="submit">Salvar integrante</button></div></form></section></div>}
  </div>;
}

function tabTitle(tab:string) { return ({resumo:"Visão geral",novo:"Adicionar gasto",gastos:"Histórico de gastos",entradas:"Entradas e saldo",categorias:"Suas categorias",relatorio:"Relatório mensal",admin:"Painel administrativo"} as Record<string,string>)[tab]; }
function addMonths(date:string,offset:number) { const [year,month,day]=date.split("-").map(Number); const first=new Date(Date.UTC(year,month-1+offset,1)); const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`; }
function expenseInMonth(expense: Expense, month: string) { return expense.referenceMonth ? expense.referenceMonth === month : Boolean(expense.occurredAt?.startsWith(month)); }
function expenseDateKey(expense: Expense) { return expense.occurredAt ?? `${expense.referenceMonth ?? "9999-12"}-31`; }
