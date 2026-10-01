import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { expenses } from "../db/schema.ts";
import { expenseDeletionFilter } from "../app/lib/server/expense-deletion.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE expenses (id INTEGER PRIMARY KEY, household_id INTEGER, description TEXT,
    amount_cents INTEGER, payment_method TEXT, person TEXT, occurred_at TEXT,
    created_at TEXT DEFAULT '2026-10-01 10:00:00', import_batch_id INTEGER);`);
  return db;
}
const migration = () => readFileSync(new URL("../drizzle/0007_expense_installments.sql", import.meta.url), "utf8");
function remove(db, id, householdId) {
  const current = db.prepare("SELECT installment_group_id AS installmentGroupId FROM expenses WHERE id=? AND household_id=?").get(id, householdId);
  if (!current) return [];
  const query = new SQLiteSyncDialect().sqlToQuery(sql`DELETE FROM ${expenses} WHERE ${expenseDeletionFilter(id, householdId, current.installmentGroupId)} RETURNING id`);
  return db.prepare(query.sql).all(...query.params).map(row => row.id);
}

test("deleting any installment removes every month but preserves other purchases and families", () => {
  const db = database(); db.exec(migration());
  const insert = db.prepare("INSERT INTO expenses(id,household_id,description,installment_group_id) VALUES(?,?,?,?)");
  insert.run(1, 1, "Compra (1/3)", "purchase-a");
  insert.run(2, 1, "Descrição editada", "purchase-a");
  insert.run(3, 1, "Compra (3/3)", "purchase-a");
  insert.run(4, 1, "Compra (1/3)", "purchase-b");
  insert.run(5, 2, "Compra (1/3)", "purchase-a");
  insert.run(6, 1, "Compra avulsa", null);
  assert.deepEqual(remove(db, 2, 1), [1, 2, 3]);
  assert.deepEqual(remove(db, 5, 1), []);
  assert.deepEqual(remove(db, 6, 1), [6]);
  assert.deepEqual(db.prepare("SELECT id FROM expenses ORDER BY id").all().map(r => r.id), [4, 5]);
  db.close();
});

test("legacy migration links remaining installments without merging identical purchases or imports", () => {
  const db = database();
  const insert = db.prepare("INSERT INTO expenses(id,household_id,description,amount_cents,payment_method,person,occurred_at,import_batch_id) VALUES(?,1,?,1000,'card','Pessoa',?,?)");
  insert.run(2, "Compra (especial) (2/3)", "2026-11-01", null);
  insert.run(3, "Compra (especial) (3/3)", "2026-12-01", null);
  insert.run(4, "Compra (especial) (1/3)", "2026-10-01", null);
  insert.run(5, "Compra (especial) (2/3)", "2026-11-01", null);
  insert.run(6, "Compra (especial) (3/3)", "2026-12-01", null);
  insert.run(7, "Compra (especial) (1/3)", "2026-10-01", 99);
  insert.run(8, "Compra (especial) (2/3)", "2026-11-01", 99);
  db.exec(migration());
  assert.deepEqual(remove(db, 2, 1), [2, 3]);
  assert.deepEqual(remove(db, 5, 1), [4, 5, 6]);
  assert.deepEqual(remove(db, 7, 1), [7]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM expenses").get().n, 1);
  db.close();
});
