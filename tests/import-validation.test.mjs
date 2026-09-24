import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintImportRow, normalizeMerchant } from "../app/lib/imports/fingerprint.ts";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, assertFileSize, validateImportPayload, validatePreviewPayload } from "../app/lib/imports/validation.ts";

const row = (changes = {}) => ({ clientId: "linha-1", selected: true, amountCents: 1590, description: null, occurredAt: null, categoryId: null, paymentMethod: null, person: null, warnings: [], fingerprint: null, ...changes });
const payload = (changes = {}) => ({ fileName: "gastos.xlsx", fileHash: "a".repeat(64), sourceType: "xlsx", mode: "full", referenceMonth: "2026-09", rows: [row()], ...changes });

test("aceita valor obrigatório com os demais campos vazios", () => {
  const result = validateImportPayload(payload());
  assert.equal(result.ok, true);
});

test("rejeita linha selecionada sem valor e mais de 5000 linhas", () => {
  assert.equal(validateImportPayload(payload({ rows: [row({ amountCents: null })] })).ok, false);
  assert.equal(validateImportPayload(payload({ rows: Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => row({ clientId: `linha-${index}` })) })).ok, false);
});

test("prévia preserva crédito negativo, mas confirmação exige valor positivo selecionado", () => {
  const preview = validatePreviewPayload(payload({ rows: [row({ amountCents: -1250 })] }));
  assert.equal(preview.ok, true);
  assert.equal(preview.ok ? preview.value.rows[0].amountCents : null, -1250);
  assert.equal(validateImportPayload(payload({ rows: [row({ amountCents: -1250 })] })).ok, false);
  assert.equal(validateImportPayload(payload({ rows: [row({ amountCents: -1250, selected: false }), row({ clientId: "linha-2" })] })).ok, true);
});

test("rejeita mês, modo, tipo e hash inválidos", () => {
  assert.equal(validatePreviewPayload(payload({ referenceMonth: "2026-13" })).ok, false);
  assert.equal(validatePreviewPayload(payload({ mode: "automatic" })).ok, false);
  assert.equal(validatePreviewPayload(payload({ sourceType: "png" })).ok, false);
  assert.equal(validatePreviewPayload(payload({ fileHash: "curto" })).ok, false);
});

test("rejeita arquivo acima de 10 MB antes da leitura", () => {
  assert.doesNotThrow(() => assertFileSize({ size: MAX_IMPORT_BYTES }));
  assert.throws(() => assertFileSize({ size: MAX_IMPORT_BYTES + 1 }), /10 MB/);
});

test("normaliza fornecedor e gera impressão digital estável", async () => {
  assert.equal(normalizeMerchant("  UBER *TRIP Loja 002  "), "uber trip");
  const input = { householdId: 7, referenceMonth: "2026-09", amountCents: 2590, description: "Uber loja 002", occurredAt: "2026-09-01" };
  assert.equal(await fingerprintImportRow(input), await fingerprintImportRow({ ...input }));
  assert.notEqual(await fingerprintImportRow(input), await fingerprintImportRow({ ...input, amountCents: 2591 }));
});
