import * as XLSX from "xlsx";
import { MAX_MONEY_CENTS } from "../validation.ts";
import { assertFileSize, MAX_IMPORT_ROWS } from "./validation.ts";
import type { ColumnMapping, ParsedImportRow } from "./types.ts";

export type TabularInspection = {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
};

export async function inspectTabularFile(file: File): Promise<TabularInspection> {
  assertFileSize(file);
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: false, cellDates: true, raw: file.name.toLocaleLowerCase("pt-BR").endsWith(".csv") });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha não possui uma aba legível.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false });
  if (matrix.length < 2) throw new Error("A planilha não possui linhas para importar.");
  const rows = matrix.slice(1).filter(row => row.some(cell => String(cell).trim()));
  if (rows.length > MAX_IMPORT_ROWS) throw new Error("O arquivo deve ter no máximo 5.000 linhas.");
  const headers = matrix[0].map((value, index) => String(value).trim() || `Coluna ${index + 1}`);
  return { sheetName, headers, rows };
}

export function mapTabularRows(inspection: TabularInspection, mapping: ColumnMapping): ParsedImportRow[] {
  const amountIndex = inspection.headers.indexOf(mapping.amount);
  if (amountIndex < 0) throw new Error("Relacione a coluna que contém os valores.");
  const descriptionIndex = mapping.description ? inspection.headers.indexOf(mapping.description) : -1;
  const dateIndex = mapping.date ? inspection.headers.indexOf(mapping.date) : -1;
  return inspection.rows.map((row, index) => ({
    clientId: `linha-${index + 1}`,
    rawDate: dateIndex >= 0 ? nullableDateCell(row[dateIndex]) : null,
    rawDescription: descriptionIndex >= 0 ? nullableCell(row[descriptionIndex]) : null,
    rawAmount: row[amountIndex] === "" || row[amountIndex] == null ? null : row[amountIndex] as string | number,
  }));
}

export function parseImportedAmount(input: string | number | null) {
  if (typeof input === "number") {
    const cents = Math.round(input * 100);
    return Number.isSafeInteger(cents) && cents !== 0 && Math.abs(cents) <= MAX_MONEY_CENTS ? cents : null;
  }
  if (typeof input !== "string") return null;
  let value = input.trim().replace(/(?:R\$|US\$|BRL)/gi, "").replace(/\s/g, "");
  if (!value) return null;
  const parentheses = /^\(.+\)$/.test(value);
  value = value.replace(/[()]/g, "");
  const negative = parentheses || value.startsWith("-");
  value = value.replace(/^[+-]/, "");
  if (!/^\d[\d.,]*$/.test(value)) return null;
  const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
  const decimalIndex = comma >= 0 && dot >= 0 ? Math.max(comma, dot) : inferDecimalIndex(value, Math.max(comma, dot));
  const digits = value.replace(/[.,]/g, "");
  const fractionLength = decimalIndex >= 0 ? value.length - decimalIndex - 1 : 0;
  const wholeDigits = fractionLength ? digits.slice(0, -fractionLength) || "0" : digits;
  const fraction = fractionLength ? digits.slice(-fractionLength).padEnd(2, "0").slice(0, 2) : "00";
  const cents = Number(BigInt(wholeDigits) * 100n + BigInt(fraction));
  if (!Number.isSafeInteger(cents) || cents === 0 || cents > MAX_MONEY_CENTS) return null;
  return negative ? -cents : cents;
}

function inferDecimalIndex(value: string, separatorIndex: number) {
  if (separatorIndex < 0) return -1;
  const after = value.length - separatorIndex - 1;
  return after >= 1 && after <= 2 ? separatorIndex : -1;
}

export function parseImportedDate(input: unknown, referenceMonth?: string) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return formatDate(input.getFullYear(), input.getMonth() + 1, input.getDate());
  if (typeof input !== "string" && typeof input !== "number") return null;
  const value = String(input).trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(value);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match && referenceMonth) return validDate(Number(referenceMonth.slice(0, 4)), Number(match[2]), Number(match[1]));
  return null;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? formatDate(year, month, day) : null;
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nullableCell(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function nullableDateCell(value: unknown) {
  if (value instanceof Date || typeof value === "number") return value;
  return nullableCell(value);
}
