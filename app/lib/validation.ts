export const MAX_MONEY_CENTS = 99_999_999_999;
export const MAX_INSTALLMENTS = 60;
export const MAX_CATEGORY_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 160;
export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_MEMBERS = 20;
export const MIN_INPUT_YEAR = 2000;
export const MAX_INPUT_YEAR = 2200;

const hasLetter = (value: string) => /\p{L}/u.test(value);

export function normalizePlainText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  // Allow normal whitespace; reject invisible controls and bidi overrides.
  // Text remains literal data; SQL safety comes from bound parameters, not stripping quotes.
  if (/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\t\r\n]/g, ""))) return null;
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

function normalizeText(value: unknown, maximumLength: number) {
  const normalized = normalizePlainText(value, maximumLength);
  return normalized && hasLetter(normalized) ? normalized : null;
}

export const normalizeCategoryName = (value: unknown) => normalizeText(value, MAX_CATEGORY_LENGTH);
export const normalizePaymentName = (value: unknown) => normalizeText(value, MAX_CATEGORY_LENGTH);
export const normalizeDescription = (value: unknown) => normalizeText(value, MAX_DESCRIPTION_LENGTH);
export const normalizeImportedDescription = (value: unknown) => normalizePlainText(value, MAX_DESCRIPTION_LENGTH);
export const normalizeName = (value: unknown) => normalizeText(value, MAX_NAME_LENGTH);

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || /\s/.test(email)) return null;
  const match = /^([^@]+)@([^@]+)$/.exec(email);
  if (!match || match[1].length > 64 || match[2].length > 189) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(match[1])) return null;
  if (match[2] !== "localhost" && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(match[2])) return null;
  return email;
}

export function parseMoneyInput(value: unknown) {
  if (typeof value !== "string" || value.length > 40) return null;
  const cleaned = value.replace(/^R\$\s*/i, "").trim();
  if (!cleaned || /[+\-eE]/.test(cleaned)) return null;

  let whole: string;
  let fraction = "";
  if (cleaned.includes(",")) {
    const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/.exec(cleaned);
    if (!match) return null;
    whole = match[1].replace(/\./g, "");
    fraction = match[2];
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    whole = cleaned.replace(/\./g, "");
  } else {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
    if (!match) return null;
    whole = match[1];
    fraction = match[2] ?? "";
  }

  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return cents >= 1n && cents <= BigInt(MAX_MONEY_CENTS) ? Number(cents) : null;
}

export function parsePositiveSafeInteger(value: unknown) {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseInstallments(value: unknown, amountCents: number) {
  const installments = parsePositiveSafeInteger(value);
  return installments && installments <= MAX_INSTALLMENTS && installments <= amountCents ? installments : null;
}

export function isCategoryKind(value: unknown): value is "expense" | "income" {
  return value === "expense" || value === "income";
}

export function isValidDateInput(value: unknown) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < MIN_INPUT_YEAR || year > MAX_INPUT_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidMonthInput(value: unknown) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]);
  return year >= MIN_INPUT_YEAR && year <= MAX_INPUT_YEAR && month >= 1 && month <= 12;
}

type MemberInput = { name?: unknown; email?: unknown };
type ValidMember = { name: string; email: string };
type MemberValidation = { ok: true; members: ValidMember[] } | { ok: false; error: string };

export function validateMembers(value: unknown): MemberValidation {
  if (!Array.isArray(value) || value.length < 1) return { ok: false, error: "Informe pelo menos um integrante." };
  if (value.length > MAX_MEMBERS) return { ok: false, error: `Uma família pode ter no máximo ${MAX_MEMBERS} integrantes.` };
  const members: ValidMember[] = [];
  const emails = new Set<string>();
  for (const candidate of value as MemberInput[]) {
    const name = normalizeName(candidate?.name);
    const email = normalizeEmail(candidate?.email);
    if (!name) return { ok: false, error: `O nome de cada integrante deve ter letras e no máximo ${MAX_NAME_LENGTH} caracteres.` };
    if (!email) return { ok: false, error: "Informe um email válido para cada integrante." };
    if (emails.has(email)) return { ok: false, error: "Não repita o mesmo email na família." };
    emails.add(email);
    members.push({ name, email });
  }
  return { ok: true, members };
}
