export type ImportMode = "full" | "minimal";
export type ImportSourceType = "xlsx" | "xls" | "csv" | "pdf";
export type ImportRowWarning = "date_mismatch" | "possible_duplicate" | "excluded_credit" | "invalid_amount";

export type ParsedImportRow = {
  clientId: string;
  rawDate: string | number | Date | null;
  rawDescription: string | null;
  rawAmount: string | number | null;
};

export type PreviewImportRow = {
  clientId: string;
  selected: boolean;
  amountCents: number | null;
  description: string | null;
  occurredAt: string | null;
  categoryId: number | null;
  categoryReviewed?: boolean;
  newCategoryName?: string | null;
  suggestedCategoryName?: string | null;
  suggestionSource?: "learned" | "history" | "built-in" | null;
  learnCategory?: boolean;
  paymentMethod: string | null;
  person: string | null;
  warnings: ImportRowWarning[];
  fingerprint: string | null;
};

export type ImportPayload = {
  fileName: string;
  fileHash: string;
  sourceType: ImportSourceType;
  mode: ImportMode;
  referenceMonth: string;
  defaultPaymentMethod?: string | null;
  defaultPerson?: string | null;
  rows: PreviewImportRow[];
};

export type ColumnMapping = { amount: string; description?: string; date?: string };
