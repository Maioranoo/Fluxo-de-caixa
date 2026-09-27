import assert from "node:assert/strict";

// Run only against an isolated local database with LOCAL_ADMIN_ENABLED=true.
const base = process.env.SECURITY_TEST_URL ?? "http://127.0.0.1:8788";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Local tests only");
const send = (path, options = {}) => fetch(`${base}${path}`, options);
const json = (body, headers = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body });

assert.equal((await send("/api/finance?month=2026-09")).status, 200);

const imported = await send("/api/imports", json(JSON.stringify({ fileName: "numeric.csv", fileHash: "b".repeat(64), sourceType: "csv", mode: "minimal", referenceMonth: "2026-09", rows: [{ clientId: "numeric", selected: true, amountCents: 100, description: "12345" }] })));
assert.equal(imported.status, 201);
const importedBatch = (await imported.json()).batch;
const importedItems = await (await send(`/api/imports?batchId=${importedBatch.id}`)).json();
assert.equal((await send("/api/finance", { ...json(JSON.stringify({ type: "expense", id: importedItems.items[0].id, amount: "2,00", description: "12345", referenceMonth: "2026-09" })), method: "PATCH" })).status, 200, "numeric imported descriptions must remain editable");
for (const path of ["/api/finance", "/api/admin/households", "/api/imports", "/api/imports/preview"]) {
  assert.equal((await send(path, json("null"))).status, 400, `${path}: null JSON`);
}
assert.equal((await send("/api/finance", json("{broken"))).status, 400);
assert.equal((await send("/api/finance", json("{}", { "content-type": "text/plain" }))).status, 415);
assert.equal((await send("/api/finance", json(JSON.stringify({ name: "x".repeat(65536) })))).status, 413);
assert.equal((await send("/api/finance", json("{}", { origin: "https://evil.example" }))).status, 403);
assert.equal((await send("/api/imports?month=bad")).status, 400);
assert.equal((await send("/api/imports?batchId=1e2")).status, 400);
assert.equal((await send("/api/imports?page=9007199254740991")).status, 400);

// Data resembling SQL remains a literal bound value, and tables remain usable.
const literal = "Loja D'Ávila'); DROP TABLE expenses; --";
const created = await send("/api/finance", json(JSON.stringify({ type: "category", kind: "expense", name: literal })));
assert.equal(created.status, 201);
assert.equal((await created.json()).category.name, literal);
assert.equal((await send("/api/finance?month=2026-09")).status, 200);

let accountLimited = false;
for (let index = 0; index < 31; index++) {
  const response = await send("/api/finance", json("{}", { "cf-connecting-ip": `192.0.2.${index + 1}` }));
  if (response.status === 429) { assert.ok(Number(response.headers.get("retry-after")) > 0); accountLimited = true; break; }
  assert.equal(response.status, 400);
}
assert.ok(accountLimited, "account quota must survive IP rotation");

// Image optimizer is public and does not invoke requireHousehold.
let publicLimited = false;
for (let index = 0; index < 301; index++) {
  const response = await send("/_vinext/image", { headers: { "cf-connecting-ip": "198.51.100.1" } });
  await response.arrayBuffer();
  if (response.status === 429) { publicLimited = true; assert.ok(Number(response.headers.get("retry-after")) > 0); break; }
}
assert.ok(publicLimited, "public endpoint must enforce an IP quota");
console.log("PASS: HTTP validation on all 4 APIs, SQL literal roundtrip, authenticated quota across IPs, public quota and Retry-After.");
