import test from "node:test";
import assert from "node:assert/strict";
import { normalizeName, normalizeDescription, normalizeImportedDescription } from "../app/lib/validation.ts";
import { validateImportPayload } from "../app/lib/imports/validation.ts";

const payload = () => ({ fileName: "gastos.csv", fileHash: "a".repeat(64), sourceType: "csv", mode: "full", referenceMonth: "2026-09", rows: [{ clientId: "1", selected: true, amountCents: 100, description: null, occurredAt: null, categoryId: null, person: null, paymentMethod: null }] });

test("imported descriptions retain numeric merchant references during editing", () => {
  assert.equal(normalizeImportedDescription(" 12345 "), "12345");
  assert.equal(normalizeImportedDescription(null), null);
  assert.equal(normalizeImportedDescription(""), null);
  assert.equal(normalizeImportedDescription("123\u0000"), null);
  assert.equal(normalizeImportedDescription("1".repeat(161)), null);
});

test("rejects hidden control characters while preserving literal user text", () => {
  assert.equal(normalizeName("Ana\u0000Silva"), null);
  assert.equal(normalizeDescription("abc\u202Etxt"), null);
  assert.equal(normalizeName("Jose\u0301"), "José");
  assert.equal(normalizeDescription("Loja D'Ávila"), "Loja D'Ávila");
});

test("invalid optional import fields cannot silently become null", () => {
  for (const [field, value] of [["description", "x".repeat(161)], ["description", {}], ["person", 42], ["occurredAt", "x".repeat(256)], ["newCategoryName", "123"], ["paymentMethod", "abc\u0000"], ["categoryReviewed", "true"], ["learnCategory", []]]) {
    const input = payload();
    input.rows[0][field] = value;
    assert.equal(validateImportPayload(input).ok, false, field);
  }
  for (const [field, value] of [["fileName", "a\u0000.csv"], ["defaultPerson", {}], ["defaultPaymentMethod", "x".repeat(61)]]) {
    assert.equal(validateImportPayload({ ...payload(), [field]: value }).ok, false, field);
  }
  assert.equal(validateImportPayload(payload()).ok, true);
});
