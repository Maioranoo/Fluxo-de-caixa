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
  return createExpenseClassifier(context)(input);
}

export function createExpenseClassifier(context: ClassificationContext) {
  const categoriesById = new Map(context.categories.map(category => [category.id, category]));
  const categoriesByName = new Map(context.categories.map(category => [normalizeMerchant(category.name), category]));
  const learnedByPattern = new Map(context.learned.filter(rule => categoriesById.has(rule.categoryId)).map(rule => [normalizeMerchant(rule.pattern), rule.categoryId]));
  const history = context.history.filter(item => categoriesById.has(item.categoryId)).map(item => ({ ...item, normalizedMerchant: normalizeMerchant(item.merchant) }));

  return (input: { description: string | null }): CategorySuggestion => classifyPrepared(input, { categoriesById, categoriesByName, learnedByPattern, history });
}

function classifyPrepared(input: { description: string | null }, context: { categoriesById: Map<number, { id: number; name: string }>; categoriesByName: Map<string, { id: number; name: string }>; learnedByPattern: Map<string, number>; history: { merchant: string; categoryId: number; normalizedMerchant: string }[] }): CategorySuggestion {
  const merchant = normalizeMerchant(input.description);
  if (!merchant) return emptySuggestion();

  const learnedCategoryId = context.learnedByPattern.get(merchant);
  if (learnedCategoryId) return preparedSuggestion(context.categoriesById, learnedCategoryId, "learned", 1);

  let best: { categoryId: number; confidence: number } | null = null;
  for (const previous of context.history) {
    const confidence = similarity(merchant, previous.normalizedMerchant);
    if (confidence >= 0.9 && (!best || confidence > best.confidence)) best = { categoryId: previous.categoryId, confidence };
  }
  if (best) return preparedSuggestion(context.categoriesById, best.categoryId, "history", best.confidence);

  for (const rule of BUILT_IN_CATEGORY_RULES) {
    if (!rule.terms.some(term => merchant.includes(normalizeMerchant(term)))) continue;
    const category = rule.categoryNames.map(name => context.categoriesByName.get(normalizeMerchant(name))).find(Boolean);
    if (category) return preparedSuggestion(context.categoriesById, category.id, "built-in", 0.95);
    return { categoryId: null, categoryName: rule.categoryNames[0], source: "built-in", confidence: 0.95 };
  }
  return emptySuggestion();
}

function preparedSuggestion(categoriesById: Map<number, { id: number; name: string }>, categoryId: number, source: NonNullable<CategorySuggestion["source"]>, confidence: number): CategorySuggestion {
  return { categoryId, categoryName: categoriesById.get(categoryId)?.name ?? null, source, confidence };
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}

function emptySuggestion(): CategorySuggestion {
  return { categoryId: null, categoryName: null, source: null, confidence: 0 };
}
