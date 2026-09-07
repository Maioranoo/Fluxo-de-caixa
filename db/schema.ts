import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", { id: integer("id").primaryKey({ autoIncrement: true }), name: text("name").notNull() }, t => [uniqueIndex("idx_categories_name").on(t.name)]);
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }), amountCents: integer("amount_cents").notNull(), description: text("description").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id), paymentMethod: text("payment_method").notNull(), person: text("person").notNull(),
  occurredAt: text("occurred_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
}, t => [index("idx_expenses_occurred_at").on(t.occurredAt)]);
