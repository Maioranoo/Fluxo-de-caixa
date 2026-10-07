import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrustedIdentity } from "../app/lib/server/trusted-identity.ts";

const headers = { "oai-authenticated-user-id": "user-1", "oai-authenticated-user-email": "person@example.com" };

test("production accepts identity only on the configured Sites hostname", () => {
  assert.deepEqual(resolveTrustedIdentity(new Request("https://painel-financas.maioranoo.chatgpt.site/", { headers }), { NODE_ENV: "production" }), { userId: "user-1", email: "person@example.com", local: false });
  assert.throws(() => resolveTrustedIdentity(new Request("https://direct-worker.example.workers.dev/", { headers }), { NODE_ENV: "production" }), { status: 403 });
  assert.deepEqual(resolveTrustedIdentity(new Request("https://finance.example.com/", { headers }), { NODE_ENV: "production", SITE_HOST: "finance.example.com" }), { userId: "user-1", email: "person@example.com", local: false });
});

test("local administrator fallback is impossible in production", () => {
  assert.throws(() => resolveTrustedIdentity(new Request("http://localhost/"), { NODE_ENV: "production", LOCAL_ADMIN_ENABLED: "true" }), { status: 401 });
  assert.deepEqual(resolveTrustedIdentity(new Request("http://localhost/"), { NODE_ENV: "development", LOCAL_ADMIN_ENABLED: "true" }), { userId: "admin-local", email: "admin-local@localhost", local: true });
});

test("identity requires both valid edge headers", () => {
  assert.throws(() => resolveTrustedIdentity(new Request("https://painel-financas.maioranoo.chatgpt.site/", { headers: { "oai-authenticated-user-email": "person@example.com" } }), { NODE_ENV: "production" }), { status: 401 });
});
