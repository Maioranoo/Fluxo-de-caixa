import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_MEMBERS,
  isCategoryKind,
  isValidDateInput,
  isValidMonthInput,
  normalizeCategoryName,
  normalizeDescription,
  normalizeEmail,
  normalizeName,
  normalizePaymentName,
  parseInstallments,
  parseMoneyInput,
  parsePositiveSafeInteger,
  validateMembers,
} from "../app/lib/validation.ts";

test("converte valores monetários válidos em centavos", () => {
  assert.equal(parseMoneyInput("0,01"), 1);
  assert.equal(parseMoneyInput("1.234,56"), 123456);
  assert.equal(parseMoneyInput("1234.56"), 123456);
  assert.equal(parseMoneyInput("999.999.999,99"), 99_999_999_999);
});

test("rejeita valores monetários fora do formato ou limite", () => {
  for (const value of ["1,999", "1.9999", "1e6", "-1", "0", "1.23.4", "1000000000,00", "1000000000000000000000000000"]) {
    assert.equal(parseMoneyInput(value), null, value);
  }
});

test("valida textos com letra e limites de tamanho", () => {
  assert.equal(normalizeCategoryName(" Mercado 2 "), "Mercado 2");
  assert.equal(normalizeCategoryName("12345"), null);
  assert.equal(normalizeCategoryName("A".repeat(61)), null);
  assert.equal(normalizePaymentName("Cartão João"), "Cartão João");
  assert.equal(normalizePaymentName("999"), null);
  assert.equal(normalizeDescription("Salário setembro"), "Salário setembro");
  assert.equal(normalizeDescription("999"), null);
  assert.equal(normalizeDescription("A".repeat(161)), null);
  assert.equal(normalizeName(" José da Silva "), "José da Silva");
  assert.equal(normalizeName("123"), null);
  assert.equal(normalizeName("A".repeat(81)), null);
});

test("limita parcelas a inteiros entre 1 e 60 e ao total em centavos", () => {
  assert.equal(parseInstallments("1", 100), 1);
  assert.equal(parseInstallments("60", 6000), 60);
  for (const value of ["0", "61", "10000", "1.5", "1e2", "-2"]) {
    assert.equal(parseInstallments(value, 10_000), null, value);
  }
  assert.equal(parseInstallments("2", 1), null);
});

test("valida e normaliza emails", () => {
  assert.equal(normalizeEmail(" Pessoa@Example.COM "), "pessoa@example.com");
  assert.equal(normalizeEmail("admin-local@localhost"), "admin-local@localhost");
  assert.equal(normalizeEmail("email-invalido"), null);
  assert.equal(normalizeEmail(`${"a".repeat(245)}@example.com`), null);
});

test("valida datas e meses reais entre 2000 e 2200", () => {
  assert.equal(isValidDateInput("2024-02-29"), true);
  assert.equal(isValidDateInput("2026-02-29"), false);
  assert.equal(isValidDateInput("1999-12-31"), false);
  assert.equal(isValidDateInput("2201-01-01"), false);
  assert.equal(isValidMonthInput("2026-09"), true);
  assert.equal(isValidMonthInput("2026-13"), false);
  assert.equal(isValidMonthInput("1999-12"), false);
});

test("aceita apenas IDs inteiros positivos e seguros", () => {
  assert.equal(parsePositiveSafeInteger("42"), 42);
  for (const value of ["0", "-1", "1.5", "1e2", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(parsePositiveSafeInteger(value), null, value);
  }
});

test("valida tipos de categoria e listas completas de integrantes", () => {
  assert.equal(isCategoryKind("expense"), true);
  assert.equal(isCategoryKind("income"), true);
  assert.equal(isCategoryKind("all"), false);
  assert.deepEqual(validateMembers([{ name: " Ana ", email: "ANA@example.com" }]), {
    ok: true,
    members: [{ name: "Ana", email: "ana@example.com" }],
  });
  assert.equal(validateMembers([{ name: "123", email: "ana@example.com" }]).ok, false);
  assert.equal(validateMembers([{ name: "Ana", email: "invalido" }]).ok, false);
  assert.equal(validateMembers(Array.from({ length: MAX_MEMBERS + 1 }, (_, index) => ({ name: `Pessoa ${index}`, email: `p${index}@example.com` }))).ok, false);
  assert.equal(validateMembers([{ name: "Ana", email: "ana@example.com" }, { name: "Outra Ana", email: "ANA@example.com" }]).ok, false);
});
