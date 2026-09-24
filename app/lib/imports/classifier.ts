import { normalizeMerchant } from "./fingerprint.ts";
import { BUILT_IN_CATEGORY_RULES } from "./category-rules.ts";

export type ClassificationContext = {
  categories: { id: number; name: string }[];
  learned: { pattern: string; categoryId: number }[];
  history: { merchant: string; categoryId: number }[];
};

export type CategorySuggestion = {
  categoryId: number | null;
  categoryName: string | null;
  source: "learned" | "history" | "built-in" | null;
  confidence: number;
};

export function classifyExpense(input: { description: string | null }, context: ClassificationContext): CategorySuggestion {
  const merchant = normalizeMerchant(input.description);
  if (!merchant) return emptySuggestion();

  const learned = context.learned.find(rule => normalizeMerchant(rule.pattern) === merchant && hasCategory(context, rule.categoryId));
  if (learned) return suggestion(context, learned.categoryId, "learned", 1);

  let best: { categoryId: number; confidence: number } | null = null;
  for (const previous of context.history) {
    if (!hasCategory(context, previous.categoryId)) continue;
    const confidence = similarity(merchant, normalizeMerchant(previous.merchant));
    if (confidence >= 0.9 && (!best || confidence > best.confidence)) best = { categoryId: previous.categoryId, confidence };
  }
  if (best) return suggestion(context, best.categoryId, "history", best.confidence);

  for (const rule of BUILT_IN_CATEGORY_RULES) {
    if (!rule.terms.some(term => merchant.includes(normalizeMerchant(term)))) continue;
    const category = context.categories.find(item => rule.categoryNames.some(name => normalizeMerchant(name) === normalizeMerchant(item.name)));
    if (category) return suggestion(context, category.id, "built-in", 0.95);
    return { categoryId: null, categoryName: rule.categoryNames[0], source: "built-in", confidence: 0.95 };
  }
  return emptySuggestion();
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}

function suggestion(context: ClassificationContext, categoryId: number, source: NonNullable<CategorySuggestion["source"]>, confidence: number): CategorySuggestion {
  return { categoryId, categoryName: context.categories.find(item => item.id === categoryId)?.name ?? null, source, confidence };
}

function hasCategory(context: ClassificationContext, categoryId: number) {
  return context.categories.some(item => item.id === categoryId);
}

function emptySuggestion(): CategorySuggestion {
  return { categoryId: null, categoryName: null, source: null, confidence: 0 };
}
