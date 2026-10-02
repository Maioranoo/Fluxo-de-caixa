import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  admin: new URL("../app/api/admin/households/route.ts", import.meta.url),
  imports: new URL("../app/api/imports/route.ts", import.meta.url),
  preview: new URL("../app/api/imports/preview/route.ts", import.meta.url),
};

test("admin and import routes use structured observability without generic console logging", async () => {
  const [admin, imports, preview] = await Promise.all(Object.values(files).map(file => readFile(file, "utf8")));
  for (const source of [admin, imports, preview]) {
    assert.match(source, /observabilityForRequest/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  }
  for (const event of ["admin_household_created", "admin_member_created", "admin_member_updated", "admin_member_deleted"]) assert.match(admin, new RegExp(event));
  for (const event of ["import_read_completed", "import_completed", "import_deleted"]) assert.match(imports, new RegExp(event));
  assert.match(preview, /import_preview_completed/);
});

test("route log calls contain only aggregate safe fields", async () => {
  const sources = await Promise.all(Object.values(files).map(file => readFile(file, "utf8")));
  const loggingCalls = sources.flatMap(source => source.split("\n").filter(line => /logger\.(?:debug|info|warn|error)/.test(line)));
  assert.ok(loggingCalls.length >= 8);
  for (const line of loggingCalls) {
    assert.doesNotMatch(line, /(?:email|displayName|fileHash|fileName|description|amount|totalCents|paymentMethod|person|rows|body|householdId|memberId)\s*:/i);
  }
  assert.ok(loggingCalls.some(line => /count/.test(line)));
  assert.ok(loggingCalls.some(line => /mode/.test(line)));
});
