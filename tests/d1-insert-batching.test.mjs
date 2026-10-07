import test from "node:test";
import assert from "node:assert/strict";
import { chunkD1InsertValues } from "../app/lib/server/d1-insert-batching.ts";

test("chunks 60 installment rows below D1's 100-bound-parameter limit", () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({ index }));
  const chunks = chunkD1InsertValues(rows, 8);

  assert.equal(chunks.length, 5);
  assert.deepEqual(chunks.map(chunk => chunk.length), [12, 12, 12, 12, 12]);
  assert.ok(chunks.every(chunk => chunk.length * 8 <= 100));
  assert.deepEqual(chunks.flat(), rows);
});

test("keeps smaller installment inserts in one statement", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ index }));
  assert.deepEqual(chunkD1InsertValues(rows, 8), [rows]);
});
