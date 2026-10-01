import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const requestRateLimits = sqliteTable("request_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("idx_request_rate_limits_expires").on(t.expiresAt)]);

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  allowIncome: integer("allow_income", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [uniqueIndex("idx_households_slug").on(t.slug)]);

export const householdMembers = sqliteTable("household_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  userId: text("user_id"),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [
  uniqueIndex("idx_household_members_email").on(t.email),
  uniqueIndex("idx_household_members_user_id").on(t.userId),
  index("idx_household_members_household").on(t.householdId),
]);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").references(() => households.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("expense"),
}, t => [uniqueIndex("idx_categories_household_name").on(t.householdId, t.name)]);

export const paymentMethods = sqliteTable("payment_methods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  isCard: integer("is_card", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [
  uniqueIndex("idx_payment_methods_household_name").on(t.householdId, t.name),
  uniqueIndex("idx_payment_methods_household_key").on(t.householdId, t.key),
]);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  originalFilename: text("original_filename").notNull(),
  fileHash: text("file_hash").notNull(),
  sourceType: text("source_type").notNull(),
  mode: text("mode").notNull(),
  referenceMonth: text("reference_month").notNull(),
  importedByMemberId: integer("imported_by_member_id").references(() => householdMembers.id, { onDelete: "set null" }),
  importedByName: text("imported_by_name").notNull(),
  defaultPaymentMethod: text("default_payment_method"),
  defaultPerson: text("default_person"),
  itemCount: integer("item_count").notNull(),
  totalCents: integer("total_cents").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [
  index("idx_import_batches_household_month").on(t.householdId, t.referenceMonth),
  index("idx_import_batches_household_hash").on(t.householdId, t.fileHash),
]);

export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  pattern: text("pattern").notNull(),
  source: text("source").notNull().default("learned"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [uniqueIndex("idx_category_rules_household_pattern").on(t.householdId, t.pattern)]);

export const importBatchCategories = sqliteTable("import_batch_categories", {
  importBatchId: integer("import_batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id),
}, t => [uniqueIndex("idx_import_batch_categories_pair").on(t.importBatchId, t.categoryId)]);

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  installmentGroupId: text("installment_group_id"),
  householdId: integer("household_id").references(() => households.id),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  categoryId: integer("category_id").references(() => categories.id),
  paymentMethod: text("payment_method"),
  person: text("person"),
  occurredAt: text("occurred_at"),
  importBatchId: integer("import_batch_id").references(() => importBatches.id, { onDelete: "cascade" }),
  referenceMonth: text("reference_month"),
  importFingerprint: text("import_fingerprint"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [
  index("idx_expenses_household_date").on(t.householdId, t.occurredAt),
  index("idx_expenses_household_category_date").on(t.householdId, t.categoryId, t.occurredAt),
  index("idx_expenses_household_payment_date").on(t.householdId, t.paymentMethod, t.occurredAt),
  index("idx_expenses_household_reference_month").on(t.householdId, t.referenceMonth),
  index("idx_expenses_household_fingerprint").on(t.householdId, t.importFingerprint),
  index("idx_expenses_import_batch").on(t.importBatchId),
  index("idx_expenses_household_installments").on(t.householdId, t.installmentGroupId),
]);

export const incomes = sqliteTable("incomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  person: text("person").notNull(),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [
  index("idx_incomes_household_date").on(t.householdId, t.occurredAt),
  index("idx_incomes_household_category_date").on(t.householdId, t.categoryId, t.occurredAt),
]);
