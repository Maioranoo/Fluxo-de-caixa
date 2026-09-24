export type FingerprintInput = {
  householdId: number;
  referenceMonth: string;
  amountCents: number;
  description: string | null;
  occurredAt: string | null;
};

export function normalizeMerchant(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(?:loja|lj|aut|parc)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function fingerprintImportRow(input: FingerprintInput) {
  const raw = [input.householdId, input.referenceMonth, input.amountCents, normalizeMerchant(input.description), input.occurredAt ?? ""].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
