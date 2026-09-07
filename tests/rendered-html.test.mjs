import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("painel financeiro possui os fluxos essenciais", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Adicionar gasto/);
  assert.match(page, /Cartão João/);
  assert.match(page, /Cartão Dena/);
  assert.match(page, /Imprimir \/ salvar PDF/);
  assert.match(page, /Categorias/);
  assert.doesNotMatch(page, /\["dinheiro",/);
  assert.doesNotMatch(page, /\["credito",/);
  assert.doesNotMatch(page, /\["debito",/);
});
