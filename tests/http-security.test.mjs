import test from "node:test";
import assert from "node:assert/strict";
import { readJsonObject, assertSameSite } from "../app/lib/server/http-security.ts";

const request = (body, headers = {}) => new Request("https://app.example/api/finance", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("JSON parsing rejects invalid shapes and MIME types", async () => {
  for (const body of ["null", "[]", "42", '"hello"', "{"]) await assert.rejects(readJsonObject(request(body)), { status: 400 });
  await assert.rejects(readJsonObject(request("{}", { "content-type": "text/plain" })), { status: 415 });
  assert.deepEqual(await readJsonObject(request('{"name":"Ana"}')), { name: "Ana" });
});

test("JSON limits count actual streamed UTF-8 bytes, independent of content-length", async () => {
  await assert.rejects(readJsonObject(request('{"name":"ááá"}', { "content-length": "1" }), 14), { status: 413 });
  await assert.rejects(readJsonObject(request("{}", { "content-length": "9999999" })), { status: 413 });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close(); } });
  await assert.rejects(readJsonObject(new Request("https://app.example", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" }), 10), { status: 413 });
});

test("cross-origin writes are denied even when fetch metadata is omitted or says same-site", () => {
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { origin: "https://sub.app.example", "sec-fetch-site": "same-site" }]) assert.throws(() => assertSameSite(request("{}", headers)), { status: 403 });
  assert.doesNotThrow(() => assertSameSite(request("{}", { origin: "https://app.example" })));
  assert.doesNotThrow(() => assertSameSite(request("{}")));
});
