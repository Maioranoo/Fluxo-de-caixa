import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { inspectTabularFile, mapTabularRows, parseImportedAmount, parseImportedDate } from "../app/lib/imports/tabular-parser.ts";
import { parseDigitalPdf, parseStatementLines } from "../app/lib/imports/pdf-parser.ts";

function workbookFile(rows, name = "gastos.xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Gastos");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([bytes], name);
}

test("inspeciona planilha e relaciona colunas escolhidas", async () => {
  const inspection = await inspectTabularFile(workbookFile([["Data", "Local", "Valor"], ["01/09/2026", "Uber", "25,90"]]));
  assert.deepEqual(inspection.headers, ["Data", "Local", "Valor"]);
  assert.deepEqual(mapTabularRows(inspection, { date: "Data", description: "Local", amount: "Valor" })[0], {
    clientId: "linha-1", rawDate: "01/09/2026", rawDescription: "Uber", rawAmount: "25,90",
  });
});

test("preserva valor e data de CSV brasileiro como texto", async () => {
  const file = new File(["Data;Local;Valor\n01/09/2026;Uber;25,90"], "gastos.csv", { type: "text/csv" });
  const inspection = await inspectTabularFile(file);
  const [row] = mapTabularRows(inspection, { date: "Data", description: "Local", amount: "Valor" });
  assert.equal(row.rawDate, "01/09/2026");
  assert.equal(row.rawAmount, "25,90");
  assert.equal(parseImportedDate(row.rawDate), "2026-09-01");
  assert.equal(parseImportedAmount(row.rawAmount), 2590);
});

test("preserva células de data nativas do Excel sem inverter dia e mês", async () => {
  const inspection = await inspectTabularFile(workbookFile([["Data", "Local", "Valor"], [new Date(2026, 8, 23), "Curso", 90]]));
  const [row] = mapTabularRows(inspection, { date: "Data", description: "Local", amount: "Valor" });
  assert.ok(row.rawDate instanceof Date);
  assert.equal(parseImportedDate(row.rawDate), "2026-09-23");
});

test("interpreta valores e datas brasileiras e internacionais", () => {
  assert.equal(parseImportedAmount("R$ 1.234,56"), 123456);
  assert.equal(parseImportedAmount("-25,90"), -2590);
  assert.equal(parseImportedAmount("1,234.56"), 123456);
  assert.equal(parseImportedDate("23/09/2026"), "2026-09-23");
  assert.equal(parseImportedDate("2026-09-23"), "2026-09-23");
});

test("rejeita mais de 5000 linhas", async () => {
  const rows = [["Valor"], ...Array.from({ length: 5001 }, () => ["1,00"])];
  await assert.rejects(() => inspectTabularFile(workbookFile(rows)), /5\.000/);
});

test("extrai linhas reconhecíveis de fatura digital sem esconder créditos", () => {
  const rows = parseStatementLines([
    "01/09 UBER *TRIP 25,90",
    "02/09 COOP 181,99",
    "05/09 ESTORNO IFOOD -12,50",
    "PAGAMENTO RECEBIDO -500,00",
  ], "2026-09");
  assert.equal(rows.length, 4);
  assert.equal(rows[0].rawDescription, "UBER *TRIP");
  assert.equal(rows[2].rawAmount, "-12,50");
  assert.equal(rows[3].rawDate, null);
});

test("lê um PDF digital real no cliente", async () => {
  const bytes = await readFile(new URL("./fixtures/imports/fatura-digital.pdf", import.meta.url));
  const rows = await parseDigitalPdf(new File([bytes], "fatura-digital.pdf", { type: "application/pdf" }));
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rawDescription, "UBER TRIP");
  assert.equal(rows[1].rawAmount, "181,99");
  assert.equal(rows[2].rawAmount, "-12,50");
});

test("configura o worker do PDF.js para execução no navegador", async () => {
  const source = await readFile(new URL("../app/lib/imports/pdf-parser.ts", import.meta.url), "utf8");
  assert.match(source, /GlobalWorkerOptions\.workerSrc/);
  assert.match(source, /pdf\.worker\.mjs\?url/);
});

test("orienta usar outro arquivo quando o PDF não contém gastos legíveis", async () => {
  const bytes = await readFile(new URL("./fixtures/imports/pdf-sem-gastos.pdf", import.meta.url));
  await assert.rejects(() => parseDigitalPdf(new File([bytes], "pdf-sem-gastos.pdf", { type: "application/pdf" })), /PDF digital/);
});
