import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequestContext, requestWithContext, responseWithRequestId } from "../app/lib/server/observability/request-context.ts";

for (const method of ["POST", "PATCH", "DELETE"]) test(`${method} correlation preserves request body, method and headers`, async () => {
  const bytes = new TextEncoder().encode(`payload-${method}-á`);
  const original = new Request("https://app.test/api/finance?secret=no", { method, headers: { "content-type": "application/octet-stream", "x-existing": "yes", "x-request-id": "attacker" }, body: bytes });
  const context = createRequestContext(original, "req_trusted");
  const forwarded = requestWithContext(original, context);
  assert.equal(original.bodyUsed, false);
  assert.equal(forwarded.method, method);
  assert.equal(forwarded.headers.get("content-type"), "application/octet-stream");
  assert.equal(forwarded.headers.get("x-existing"), "yes");
  assert.equal(forwarded.headers.get("x-request-id"), "req_trusted");
  assert.deepEqual(new Uint8Array(await forwarded.arrayBuffer()), bytes);
});

test("request context normalizes route and never trusts inbound correlation", () => {
  const request = new Request("https://app.test/api/finance?month=2026-10", { headers: { "x-request-id": "attacker", "cf-ray": "ray_1" } });
  const context = createRequestContext(request, "req_safe");
  assert.deepEqual(context, { requestId: "req_safe", route: "/api/finance", method: "GET", environment: "production", platformRequestId: "ray_1" });
});

test("response correlation preserves status, status text, headers and body", async () => {
  const original = new Response("same body", { status: 207, statusText: "Multi-Status", headers: { "content-type": "text/plain", "x-existing": "yes" } });
  const correlated = responseWithRequestId(original, "req_1");
  assert.equal(original.bodyUsed, false);
  assert.equal(correlated.status, 207);
  assert.equal(correlated.statusText, "Multi-Status");
  assert.equal(correlated.headers.get("content-type"), "text/plain");
  assert.equal(correlated.headers.get("x-existing"), "yes");
  assert.equal(correlated.headers.get("x-request-id"), "req_1");
  assert.equal(await correlated.text(), "same body");
});

test("streaming response is neither read nor buffered by correlation", async () => {
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new TextEncoder().encode(pulls === 1 ? "first" : "-second"));
      if (pulls === 2) controller.close();
    },
  });
  const original = new Response(stream, { status: 200, headers: { "x-stream": "yes" } });
  const correlated = responseWithRequestId(original, "req_stream");
  assert.equal(pulls, 0);
  assert.equal(original.bodyUsed, false);
  assert.equal(correlated.headers.get("x-stream"), "yes");
  assert.equal(await correlated.text(), "first-second");
  assert.equal(pulls, 2);
});

test("Worker uses contextual request and does not inspect bodies", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(source, /createRequestContext/);
  assert.match(source, /requestWithContext/);
  assert.match(source, /responseWithRequestId/);
  assert.match(source, /request_completed/);
  assert.match(source, /slow_request/);
  assert.doesNotMatch(source, /\.text\(\)|\.json\(\)|\.arrayBuffer\(\)/);
});
