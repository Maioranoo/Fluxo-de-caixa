import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, formatMoney, groupExpenseCategories, groupTotals } from "../app/lib/finance-ui.ts";

test("formata valores, datas e totais para o painel", () => {
  assert.equal(formatDate("2026-09-23"), "23/09/2026");
  assert.match(formatMoney(123456), /1\.234,56/);
  assert.deepEqual(
    groupTotals([{ amountCents: 100, kind: "A" }, { amountCents: 250, kind: "A" }], item => item.kind),
    [{ name: "A", total: 350 }],
  );
});

test("gastos importados aceitam campos vazios na apresentação", () => {
  assert.equal(formatDate(null), "Não informado");
  assert.deepEqual(groupExpenseCategories([{ amountCents: 1000, category: null }, { amountCents: 250, category: "Mercado" }]), [
    { name: "Sem categoria", total: 1000 },
    { name: "Mercado", total: 250 },
  ]);
});
