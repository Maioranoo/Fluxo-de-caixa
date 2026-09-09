import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("painel financeiro possui os fluxos essenciais", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  assert.match(page, /aria-label={`Editar/);
  assert.match(page, /aria-label={`Excluir/);
  assert.match(page, />✎<\/button>/);
  assert.match(page, />🗑<\/button>/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /Filtrar por categoria/);
  assert.match(page, /Todas as categorias/);
  assert.match(page, /filteredExpenses/);
  assert.match(page, /type: "payment"/);
  assert.match(page, /Permite parcelamento/);
  assert.match(page, /paymentMethod: ""/);
  assert.match(page, /Número de parcelas/);
  assert.match(page, /installments/);
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  assert.match(api, /addMonths\(body\.occurredAt, index\)/);
  assert.match(api, /Math\.floor\(amountCents \/ installmentCount\)/);
  assert.match(api, /\$\{index \+ 1\}\/\$\{installmentCount\}/);
  assert.match(page, /onPaymentChange={updateExpensePayment}/);
  assert.match(page, /className="table-payment"/);
  assert.match(api, /body\.type === "expense_payment"/);
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
  assert.match(tenancy, /if \(!email\)/);
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/households/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /allowIncome/);
  assert.match(schema, /idx_incomes_household_date/);
  assert.match(page, /Permitir entrada e saída de dinheiro/);
  assert.match(page, /data\.household\?\.allowIncome/);
  assert.match(page, /SALDO EM/);
  assert.match(page, /TOTAL DE GASTOS EM/);
  assert.match(page, /TOTAL DE ENTRADAS EM/);
  assert.match(page, /balance < 0 \? "negative" : "positive"/);
  assert.match(api, /Entradas não estão habilitadas para esta família/);
  assert.ok((api.match(/eq\(incomes\.householdId, context\.householdId\)/g) ?? []).length >= 2);
  assert.match(admin, /if \(!context\.isAdmin\)/);
  assert.match(admin, /typeof body\.allowIncome !== "boolean"/);
});
