import { isValidDateInput, isValidMonthInput, MAX_DESCRIPTION_LENGTH, MAX_MONEY_CENTS, normalizeCategoryName, normalizePlainText, parsePositiveSafeInteger } from "../validation.ts";
import type { ImportMode, ImportPayload, ImportRowWarning, ImportSourceType, PreviewImportRow } from "./types.ts";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
const SOURCE_TYPES = new Set<ImportSourceType>(["xlsx", "xls", "csv", "pdf"]);
const MODES = new Set<ImportMode>(["full", "minimal"]);
const WARNINGS = new Set<ImportRowWarning>(["date_mismatch", "possible_duplicate", "excluded_credit", "invalid_amount"]);

type ValidationResult = { ok: true; value: ImportPayload } | { ok: false; error: string };

export function assertFileSize(file: Pick<File, "size">) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("O arquivo deve ter no máximo 10 MB.");
}

export function validatePreviewPayload(value: unknown): ValidationResult {
  return validate(value, false);
}

export function validateImportPayload(value: unknown): ValidationResult {
  return validate(value, true);
}

function validate(value: unknown, confirming: boolean): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Dados de importação inválidos.");
  const input = value as Record<string, unknown>;
  const fileName = normalizePlainText(input.fileName, 255);
  if (!fileName) return invalid("Nome do arquivo inválido.");
  if (!validOptionalText(input.defaultPaymentMethod, 60) || !validOptionalText(input.defaultPerson, 80)) return invalid("Pagamento ou integrante padrão inválido.");
  if (typeof input.fileHash !== "string" || !/^[a-f0-9]{64}$/i.test(input.fileHash)) return invalid("Identificação do arquivo inválida.");
  if (!SOURCE_TYPES.has(input.sourceType as ImportSourceType)) return invalid("Formato de arquivo inválido.");
  if (!MODES.has(input.mode as ImportMode)) return invalid("Modo de importação inválido.");
  if (!isValidMonthInput(input.referenceMonth)) return invalid("Mês de destino inválido.");
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > MAX_IMPORT_ROWS) return invalid(`A importação deve ter entre 1 e ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas.`);

  const rows: PreviewImportRow[] = [];
  const ids = new Set<string>();
  for (const candidate of input.rows) {
    const parsed = validateRow(candidate, confirming);
    if (!parsed.ok) return parsed;
    if (ids.has(parsed.value.clientId)) return invalid("Há linhas repetidas na conferência.");
    ids.add(parsed.value.clientId);
    rows.push(parsed.value);
  }
  if (confirming && !rows.some(row => row.selected)) return invalid("Selecione pelo menos um gasto.");
  return { ok: true, value: { fileName, fileHash: input.fileHash.toLowerCase(), sourceType: input.sourceType as ImportSourceType, mode: input.mode as ImportMode, referenceMonth: input.referenceMonth as string, defaultPaymentMethod: optionalText(input.defaultPaymentMethod, 60), defaultPerson: optionalText(input.defaultPerson, 80), rows } };
}

function validateRow(value: unknown, confirming: boolean): { ok: true; value: PreviewImportRow } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Linha de importação inválida.");
  const row = value as Record<string, unknown>;
  if (typeof row.clientId !== "string" || !normalizePlainText(row.clientId, 80)) return invalid("Identificador de linha inválido.");
  if (typeof row.selected !== "boolean") return invalid("Seleção de linha inválida.");
  for (const [field, max] of [["description", MAX_DESCRIPTION_LENGTH], ["occurredAt", 10], ["newCategoryName", 60], ["paymentMethod", 60], ["person", 80]] as const) {
    if (!validOptionalText(row[field], max)) return invalid(`Campo ${field} inválido na importação.`);
  }
  if (optionalText(row.newCategoryName, 60) && !normalizeCategoryName(row.newCategoryName)) return invalid("Nome da categoria inválido.");
  for (const field of ["categoryReviewed", "learnCategory"]) {
    if (row[field] !== undefined && typeof row[field] !== "boolean") return invalid("Opção de categoria inválida.");
  }
  if (row.warnings !== undefined && (!Array.isArray(row.warnings) || row.warnings.length > WARNINGS.size || !row.warnings.every(item => WARNINGS.has(item as ImportRowWarning)))) return invalid("Avisos de importação inválidos.");
  if (row.fingerprint != null && (typeof row.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(row.fingerprint))) return invalid("Identificação de linha inválida.");
  const amount = typeof row.amountCents === "number" && Number.isSafeInteger(row.amountCents) && row.amountCents !== 0 && Math.abs(row.amountCents) <= MAX_MONEY_CENTS ? row.amountCents : null;
  if (confirming && row.selected && (amount === null || amount < 1)) return invalid("Toda linha selecionada precisa ter um valor positivo válido.");
  const description = optionalText(row.description, MAX_DESCRIPTION_LENGTH);
  const occurredAt = optionalText(row.occurredAt);
  if (occurredAt && !isValidDateInput(occurredAt)) return invalid("Data de gasto inválida.");
  const categoryId = row.categoryId === null || row.categoryId === undefined ? null : parsePositiveSafeInteger(row.categoryId);
  if (row.categoryId != null && !categoryId) return invalid("Categoria inválida.");
  const warnings = Array.isArray(row.warnings) && row.warnings.every(item => WARNINGS.has(item as ImportRowWarning)) ? [...new Set(row.warnings as ImportRowWarning[])] : [];
  const fingerprint = row.fingerprint == null ? null : typeof row.fingerprint === "string" && /^[a-f0-9]{64}$/i.test(row.fingerprint) ? row.fingerprint.toLowerCase() : null;
  return { ok: true, value: { clientId: row.clientId, selected: row.selected, amountCents: amount, description, occurredAt, categoryId, categoryReviewed: row.categoryReviewed === true, newCategoryName: optionalText(row.newCategoryName, 60), learnCategory: row.learnCategory === true, paymentMethod: optionalText(row.paymentMethod, 60), person: optionalText(row.person, 80), warnings, fingerprint } };
}

function optionalText(value: unknown, max = 255) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  return normalizePlainText(value, max);
}

function validOptionalText(value: unknown, max: number) {
  return value == null || (typeof value === "string" && (value.trim() === "" || normalizePlainText(value, max) !== null));
}

function invalid(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
