import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }), householdId: integer("household_id").references(() => households.id), amountCents: integer("amount_cents").notNull(), description: text("description").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id), paymentMethod: text("payment_method").notNull(), person: text("person").notNull(),
  occurredAt: text("occurred_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, t => [
  index("idx_expenses_household_date").on(t.householdId, t.occurredAt),
  index("idx_expenses_household_category_date").on(t.householdId, t.categoryId, t.occurredAt),
  index("idx_expenses_household_payment_date").on(t.householdId, t.paymentMethod, t.occurredAt),
]);

export const incomes = sqliteTable("incomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(),
  person: text("person").notNull(),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [index("idx_incomes_household_date").on(t.householdId, t.occurredAt)]);
