import test from "node:test";
import assert from "node:assert/strict";
import { getObservabilityConfig } from "../app/lib/server/observability/config.ts";
import { createLogger } from "../app/lib/server/observability/logger.ts";

test("observability configuration is defensive and keeps D1 baseline configurable", () => {
  assert.deepEqual(getObservabilityConfig({ NODE_ENV: "production" }), { level: "info", slowRequestMs: 1000, slowAuthMs: 500, slowDatabaseQueryMs: null, databaseBaselineLogging: true });
  assert.equal(getObservabilityConfig({ NODE_ENV: "development" }).level, "debug");
  assert.deepEqual(getObservabilityConfig({ NODE_ENV: "production", SLOW_REQUEST_MS: "1200", SLOW_AUTH_MS: "250", SLOW_DATABASE_QUERY_MS: "740", DATABASE_BASELINE_LOGGING: "false", LOG_LEVEL: "warn" }), { level: "warn", slowRequestMs: 1200, slowAuthMs: 250, slowDatabaseQueryMs: 740, databaseBaselineLogging: false });
  assert.deepEqual(getObservabilityConfig({ NODE_ENV: "production", SLOW_REQUEST_MS: "0", SLOW_AUTH_MS: "wat", SLOW_DATABASE_QUERY_MS: "-1", DATABASE_BASELINE_LOGGING: "maybe" }), { level: "info", slowRequestMs: 1000, slowAuthMs: 500, slowDatabaseQueryMs: null, databaseBaselineLogging: true });
});

test("logger emits one-line JSON and filters debug in production", () => {
  const lines = [];
  const logger = createLogger({ requestId: "req_1", route: "/api/finance", method: "GET", environment: "production" }, { level: "info", sink: { log: line => lines.push(line), warn: line => lines.push(line), error: line => lines.push(line) }, now: () => new Date("2026-10-01T23:20:00.000Z") });
  logger.debug("auth_success");
  logger.info("request_completed", { status: 200, durationMs: 81 });
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { timestamp: "2026-10-01T23:20:00.000Z", level: "info", event: "request_completed", requestId: "req_1", route: "/api/finance", method: "GET", environment: "production", status: 200, durationMs: 81 });
  assert.equal(lines[0].includes("\n"), false);
});

test("logger drops forbidden and non-allowlisted data", () => {
  const lines = [];
  const logger = createLogger({}, { level: "debug", sink: { log: line => lines.push(line), warn() {}, error() {} } });
  logger.info("expense_created", { operation: "expense.create", outcome: "success", authorization: "Bearer secret", cookie: "session=secret", email: "person@example.com", description: "Farmácia 523,81", amount: 52381, householdId: 2 });
  const output = lines.join("");
  assert.match(output, /expense\.create/);
  for (const secret of ["Bearer", "session=", "person@example.com", "Farmácia", "52381", "householdId"]) assert.equal(output.includes(secret), false, secret);
});

test("every logger boundary is fail-open", () => {
  const throwingSink = { log() { throw new Error("console failed"); }, warn() { throw new Error("console failed"); }, error() { throw new Error("console failed"); } };
  const logger = createLogger({}, { level: "debug", sink: throwingSink, now: () => { throw new Error("clock failed"); } });
  assert.doesNotThrow(() => logger.debug("event", { operation: "x" }));
  assert.doesNotThrow(() => logger.info("event", { operation: "x", value: 1n }));
  assert.doesNotThrow(() => logger.warn("event", Object.defineProperty({}, "operation", { get() { throw new Error("getter failed"); }, enumerable: true })));
  const circular = {}; circular.self = circular;
  assert.doesNotThrow(() => logger.error("event", circular));
  assert.doesNotThrow(() => logger.fatal("event"));
});
