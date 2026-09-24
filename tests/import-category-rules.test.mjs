import assert from "node:assert/strict";
import test from "node:test";
import { classifyExpense } from "../app/lib/imports/classifier.ts";

const categories = [
  { id: 1, name: "Transporte" }, { id: 2, name: "Mercado" }, { id: 3, name: "Delivery" },
  { id: 4, name: "Farmacia/Perfumaria" }, { id: 5, name: "Educação" }, { id: 6, name: "Contas Fixas" },
];
const context = (changes = {}) => ({ categories, learned: [], history: [], ...changes });

test("regra aprendida da família vence regra fixa", () => {
  const result = classifyExpense({ description: "Uber *trip" }, context({ learned: [{ pattern: "uber trip", categoryId: 2 }] }));
  assert.equal(result.categoryId, 2);
  assert.equal(result.source, "learned");
});

test("classifica fornecedores evidentes por regras iniciais", () => {
  assert.equal(classifyExpense({ description: "UBER VIAGEM" }, context()).categoryId, 1);
  assert.equal(classifyExpense({ description: "COOP COMPRA DO MES" }, context()).categoryId, 2);
  assert.equal(classifyExpense({ description: "IFOOD" }, context()).categoryId, 3);
  assert.equal(classifyExpense({ description: "Drogaria São Paulo" }, context()).categoryId, 4);
});

test("sugere criar a categoria fixa quando a família ainda não a possui", () => {
  const result = classifyExpense({ description: "Uber corrida" }, context({ categories: [] }));
  assert.equal(result.categoryId, null);
  assert.equal(result.categoryName, "Transporte");
  assert.equal(result.source, "built-in");
});

test("descrição incerta permanece sem categoria", () => {
  assert.deepEqual(classifyExpense({ description: "PGTO 84920" }, context()), { categoryId: null, categoryName: null, source: null, confidence: 0 });
});

test("histórico semelhante só vence com confiança alta", () => {
  const result = classifyExpense({ description: "Mercadinho Central Loja 22" }, context({ history: [{ merchant: "mercadinho central", categoryId: 2 }] }));
  assert.equal(result.categoryId, 2);
  assert.equal(result.source, "history");
});
