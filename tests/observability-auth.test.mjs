import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("authorization logs failures and slowness without routine production success", async () => {
  const source = await readFile(new URL("../db/tenancy.ts", import.meta.url), "utf8");
  assert.match(source, /auth_failed/);
  assert.match(source, /slow_authentication/);
  assert.match(source, /logger\.debug\("auth_success"/);
  assert.doesNotMatch(source, /logger\.info\("auth_success"/);
  assert.doesNotMatch(source, /email.*logger|logger.*email/);
});
