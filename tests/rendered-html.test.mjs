import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("painel financeiro possui os fluxos essenciais", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const transactions = await readFile(new URL("../app/components/transactions.tsx", import.meta.url), "utf8");
  const source = `${page}\n${transactions}`;
  assert.match(page, /Adicionar gasto/);
  assert.match(page, /Adicionar forma de pagamento/);
  assert.match(page, /className="add-inline"/);
  assert.doesNotMatch(page, /\["pagamentos","\$","Pagamentos"\]/);
  assert.match(page, /Imprimir \/ salvar PDF/);
  assert.match(page, /Total de gastos/);
  assert.match(page, /Total de entradas/);
  assert.match(page, /Saldo do mês/);
  assert.match(page, /IncomeTable incomes={data\.incomes} onDelete={removeIncome} readonly/);
  assert.match(page, /Categorias/);
  assert.doesNotMatch(page, /\["dinheiro",/);
  assert.doesNotMatch(page, /\["credito",/);
  assert.doesNotMatch(page, /\["debito",/);
  assert.match(source, /label={`Editar/);
  assert.match(source, /label={`Excluir/);
  assert.doesNotMatch(source, />✎<\/button>|>🗑<\/button>/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /Filtrar por categoria/);
  assert.match(page, /Filtrar por pagamento/);
  assert.match(page, /expensePayment === "all" \|\| item\.paymentMethod === expensePayment/);
  assert.match(page, /Todas as categorias/);
  assert.match(page, /filteredExpenses/);
  assert.match(page, /type: "payment"/);
  assert.match(page, /Permite parcelamento/);
  assert.match(page, /paymentMethod: ""/);
  assert.match(page, /Número de parcelas/);
  assert.match(page, /installments/);
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  assert.match(api, /addMonths\(body\.occurredAt as string, index\)/);
  assert.match(api, /Math\.floor\(amountCents \/ installmentCount\)/);
  assert.match(api, /\$\{index \+ 1\}\/\$\{installmentCount\}/);
  assert.doesNotMatch(page, /onPaymentChange={updateExpensePayment}/);
  assert.doesNotMatch(page, /className="table-payment"/);
  assert.match(source, /paymentName\(expense\.paymentMethod\)/);
  assert.match(api, /eq\(paymentMethods\.householdId, context\.householdId\)/);
  assert.match(api, /eq\(expenses\.householdId, context\.householdId\)/);
  assert.match(api, /eq\(categories\.householdId, context\.householdId\)/);
  assert.match(api, /requireHousehold\(request\)/);
  assert.match(page, /Salvando gasto/);
  assert.doesNotMatch(page, /await load\(\)/);
});

test("banco separa famílias e possui índices para as consultas principais", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const tenancy = await readFile(new URL("../db/tenancy.ts", import.meta.url), "utf8");
  assert.match(schema, /households/);
  assert.match(schema, /householdMembers/);
  assert.match(schema, /paymentMethods/);
  assert.match(schema, /idx_expenses_household_date/);
  assert.match(schema, /idx_expenses_household_category_date/);
  assert.match(schema, /idx_expenses_household_payment_date/);
  assert.match(tenancy, /oai-authenticated-user-id/);
  assert.match(tenancy, /oai-authenticated-user-email/);
  assert.match(tenancy, /if \(!email \|\| !userId/);
  assert.match(tenancy, /userId \? or/);
  assert.doesNotMatch(tenancy, /if \(!email \|\| !userId\)/);
  assert.match(tenancy, /LOCAL_ADMIN_ENABLED === "true"/);
  assert.match(tenancy, /canAccessHousehold\(isAdmin, member\.householdId, requestedId\)/);
  assert.match(tenancy, /if \(!canAccessHousehold/);
});

test("todas as operações financeiras aplicam isolamento por família", async () => {
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  const protectedExpenseQueries = api.match(/eq\(expenses\.householdId, context\.householdId\)/g) ?? [];
  const protectedCategoryQueries = api.match(/eq\(categories\.householdId, context\.householdId\)/g) ?? [];
  const protectedPaymentQueries = api.match(/eq\(paymentMethods\.householdId, context\.householdId\)/g) ?? [];
  assert.ok(protectedExpenseQueries.length >= 5, "consultas e alterações de gastos precisam filtrar a família");
  assert.ok(protectedCategoryQueries.length >= 4, "consultas e alterações de categorias precisam filtrar a família");
  assert.ok(protectedPaymentQueries.length >= 5, "consultas e alterações de pagamentos precisam filtrar a família");
  assert.match(api, /requireHousehold\(request\)/);
  assert.doesNotMatch(api, /body\.householdId/);
});

test("painel administrativo exige autorização no servidor", async () => {
  const admin = await readFile(new URL("../app/api/admin/households/route.ts", import.meta.url), "utf8");
  assert.match(admin, /if \(!context\.isAdmin\)/);
  assert.match(admin, /Somente o administrador pode criar famílias/);
  assert.match(admin, /requireAdmin\(request\)/);
});

test("entradas são opcionais e permanecem isoladas por família", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const summary = await readFile(new URL("../app/components/finance-summary.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/households/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /allowIncome/);
  assert.match(schema, /idx_incomes_household_date/);
  assert.match(page, /Permitir entrada e saída de dinheiro/);
  assert.match(page, /data\.household\?\.allowIncome/);
  assert.match(summary, /Saldo em/);
  assert.match(summary, /Gastos/);
  assert.match(summary, /Entradas/);
  assert.match(summary, /balance < 0 \? "negative" : "positive"/);
  assert.match(api, /Entradas não estão habilitadas para esta família/);
  assert.ok((api.match(/eq\(incomes\.householdId, context\.householdId\)/g) ?? []).length >= 2);
  assert.match(admin, /if \(!context\.isAdmin\)/);
  assert.match(admin, /typeof body\.allowIncome !== "boolean"/);
});

test("edição completa permanece restrita à carteira atual", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  assert.match(page, /Editar gasto/);
  assert.match(page, /Editar entrada/);
  assert.match(page, /type: "expense", \.\.\.expenseEdit/);
  assert.match(page, /type: "income", \.\.\.incomeEdit/);
  assert.match(api, /body\.type === "expense"/);
  assert.match(api, /body\.type === "income"/);
  assert.match(api, /isValidDateInput\(body\.occurredAt\)/);
  assert.match(api, /eq\(expenses\.householdId, context\.householdId\)/);
  assert.match(api, /eq\(incomes\.householdId, context\.householdId\)/);
});

test("integrantes só podem ser gerenciados pelo administrador na carteira selecionada", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/households/route.ts", import.meta.url), "utf8");
  assert.match(page, /Integrantes de/);
  assert.match(page, /type: "member"/);
  assert.match(admin, /body\.type === "member"/);
  assert.match(admin, /eq\(householdMembers\.householdId, context\.householdId\)/);
  assert.match(admin, /O acesso do administrador não pode ser removido/);
  assert.match(admin, /O e-mail do administrador não pode ser alterado aqui/);
  assert.match(admin, /A família precisa ter pelo menos um integrante/);
});

test("privacidade, data local e salvamento protegido estão ativos", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const financeData = await readFile(new URL("../app/lib/server/finance-data.ts", import.meta.url), "utf8");
  const security = await readFile(new URL("../app/lib/server/http-security.ts", import.meta.url), "utf8");
  assert.match(financeData, /context\.isAdmin \? member/);
  assert.match(page, /date\.getFullYear\(\)/);
  assert.doesNotMatch(page, /toISOString\(\)\.slice\(0, 10\)/);
  assert.match(page, /if \(savingExpense\) return/);
  assert.match(page, /if \(savingIncome\) return/);
  assert.match(page, /disabled={savingExpense}/);
  assert.match(page, /disabled={savingIncome}/);
  assert.match(page, /temporaryIds\.has/);
  assert.match(security, /sec-fetch-site/);
  assert.match(security, /cross-site/);
});

test("novo gasto permite criar e selecionar uma categoria sem sair do formulário", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="Adicionar categoria de gasto"/);
  assert.match(page, /Nova categoria de gasto/);
  assert.match(page, /type: "category", name, kind: "expense"/);
  assert.match(page, /categoryId: String\(result\.category!\.id\)/);
  assert.match(page, /setShowExpenseCategoryForm\(false\)/);
});

test("impressão do relatório restaura a tabela de desktop depois das regras mobile", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const lastPrint = css.lastIndexOf("@media print");
  const lastMobile = css.lastIndexOf("@media(max-width:800px)");
  assert.ok(lastPrint > lastMobile, "as regras finais de impressão devem prevalecer sobre o layout mobile");
  const printCss = css.slice(lastPrint);
  assert.match(printCss, /\.table-wrap table\{display:table!important/);
  assert.match(printCss, /\.table-wrap thead\{display:table-row-group!important/);
  assert.doesNotMatch(printCss, /table-header-group/);
  assert.match(printCss, /\.table-wrap tr\{display:table-row!important/);
  assert.match(printCss, /\.table-wrap td\{display:table-cell!important/);
  assert.match(printCss, /\.table-wrap td:before\{display:none!important/);
  assert.match(printCss, /\.app-sidebar,.app-header,.mobile-bottom-nav,.mobile-quick-actions.*\{display:none!important/);
});

test("redesign mantém navegação, foco, redução de movimento e componentes sem emoji", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../app/components/app-shell.tsx", import.meta.url), "utf8");
  const icons = await readFile(new URL("../app/components/icons.tsx", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/components/ui.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /href="#main-content"/);
  assert.match(page, /id="main-content"/);
  assert.match(shell, /aria-current=/);
  assert.match(icons, /export type IconName/);
  assert.match(icons, /aria-hidden/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(`${page}\n${shell}\n${ui}`, /✎|🗑|⚙/);
});

test("importador possui conferência editável equivalente no desktop e mobile", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/imports/import-workspace.tsx", import.meta.url), "utf8");
  const fileStep = await readFile(new URL("../app/components/imports/file-step.tsx", import.meta.url), "utf8");
  const mapper = await readFile(new URL("../app/components/imports/column-mapper.tsx", import.meta.url), "utf8");
  const table = await readFile(new URL("../app/components/imports/preview-table.tsx", import.meta.url), "utf8");
  const cards = await readFile(new URL("../app/components/imports/preview-cards.tsx", import.meta.url), "utf8");
  const history = await readFile(new URL("../app/components/imports/import-history.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /Importar arquivo/);
  assert.match(fileStep, /Não trazer detalhes/);
  assert.match(mapper, /!minimal/);
  assert.match(workspace, /configure/);
  assert.match(workspace, /mapping/);
  assert.match(workspace, /preview/);
  assert.match(table, /import-preview-table/);
  assert.match(cards, /import-preview-cards/);
  assert.match(cards, /Editar/);
  assert.match(css, /\.import-preview-table/);
  assert.match(css, /\.import-preview-cards/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(workspace, /PAGE_SIZE = 50/);
  assert.match(workspace, /Data divergente/);
  assert.match(workspace, /Possível duplicidade/);
  assert.match(workspace, /categoryReviewed/);
  assert.match(workspace, /suggestedCategoryName: null/);
  assert.match(history, /itemsRequestId/);
  assert.match(page, /key={`\$\{selectedHousehold\}-\$\{month\}`}/);
  assert.match(page, /expenseDateKey\(a\)\.localeCompare\(expenseDateKey\(b\)\)/);
});

test("exclusão de gastos usa modal próprio sem confirmação do navegador", async () => {
  const source = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const removalFlow = source.match(/function removeExpense[\s\S]*?async function editCategory/)?.[0] ?? "";
  assert.notEqual(removalFlow, "");
  assert.doesNotMatch(removalFlow, /\bconfirm\s*\(/);
  assert.match(source, /title="Excluir gasto\?"/);
  assert.match(source, /Todas as parcelas desta compra também serão excluídas/);
  assert.match(source, /Excluindo…/);
  assert.match(source, /className="danger-button"/);
});

test("exclusão de categorias usa modal próprio com erro local", async () => {
  const source = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const removalFlow = source.match(/function removeCategory[\s\S]*?async function addPayment/)?.[0] ?? "";
  assert.notEqual(removalFlow, "");
  assert.doesNotMatch(removalFlow, /\bconfirm\s*\(/);
  assert.match(source, /title="Excluir categoria\?"/);
  assert.match(source, /categoryDeleteError&&<p className="delete-confirm-error" role="alert"/);
  assert.match(source, /deletingCategory \? "Excluindo…" : "Excluir categoria"/);
  assert.match(source, /setCategoryToDelete\(null\)/);
});

test("categorias permanecem acessíveis no mobile para todos os tipos de família", async () => {
  const page = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const mobileItems = page.match(/const mobilePrimaryItems:[\s\S]*?const openTab/)?.[0] ?? "";
  assert.notEqual(mobileItems, "");
  assert.equal((mobileItems.match(/id:"categorias"/g) ?? []).length, 2, "Categorias deve existir com e sem allowIncome");
  assert.equal((mobileItems.match(/id:"entradas"/g) ?? []).length, 1, "Entradas deve existir apenas quando allowIncome estiver ativo");
  assert.match(css, /\.mobile-bottom-nav\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(46px,1fr\)\)/);
});
