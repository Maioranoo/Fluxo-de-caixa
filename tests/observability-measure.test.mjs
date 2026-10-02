import test from "node:test";
import assert from "node:assert/strict";
import { isErrorObserved, markErrorObserved, measureOperation } from "../app/lib/server/observability/measure.ts";

function recordingLogger({ throwOnLog = false } = {}) {
  const events = [];
  const record = level => (event, fields = {}) => { if (throwOnLog) throw new Error("logger failed"); events.push({ level, event, ...fields }); };
  return { events, logger: { debug: record("debug"), info: record("info"), warn: record("warn"), error: record("error"), fatal: record("fatal"), child() { return this; } } };
}

test("measureOperation returns the exact value and duration", async () => {
  const { events, logger } = recordingLogger();
  const value = { ok: true };
  const result = await measureOperation(logger, { operation: "finance.load", kind: "application", completedEvent: "finance_fetch_completed", now: (() => { const values = [10, 42]; return () => values.shift(); })() }, async () => value);
  assert.equal(result, value);
  assert.deepEqual(events, [{ level: "info", event: "finance_fetch_completed", operation: "finance.load", outcome: "success", durationMs: 32 }]);
});

test("database baseline and slow warning are independently configurable", async () => {
  const first = recordingLogger();
  await measureOperation(first.logger, { operation: "database.finance_batch", kind: "database", databaseBaselineLogging: true, slowThresholdMs: null, now: clock(0, 700) }, async () => 1);
  assert.deepEqual(first.events.map(item => item.event), ["database_operation_completed"]);
  const second = recordingLogger();
  await measureOperation(second.logger, { operation: "database.finance_batch", kind: "database", databaseBaselineLogging: false, slowThresholdMs: 500, now: clock(0, 700) }, async () => 1);
  assert.deepEqual(second.events.map(item => item.event), ["slow_database_query"]);
});

test("logger and clock failures never change operation results or errors", async () => {
  const { logger } = recordingLogger({ throwOnLog: true });
  assert.equal(await measureOperation(logger, { operation: "x", kind: "application", now: () => { throw new Error("clock"); } }, async () => 9), 9);
  const original = new Error("original");
  await assert.rejects(measureOperation(logger, { operation: "x", kind: "application" }, async () => { throw original; }), error => error === original);
});

test("one exception owns full details across nested boundaries", async () => {
  const { events, logger } = recordingLogger();
  const original = new Error("boom");
  await assert.rejects(measureOperation(logger, { operation: "outer", kind: "application" }, () => measureOperation(logger, { operation: "inner", kind: "database" }, async () => { throw original; })), error => error === original);
  assert.equal(events.filter(item => item.errorStack).length, 1);
  assert.equal(events.filter(item => item.errorName).length, 1);
  assert.equal(events.length, 2);
  assert.equal(isErrorObserved(original), true);
});

test("frozen errors and primitive throws preserve identity without duplicate details", async () => {
  const frozen = Object.freeze(new Error("frozen"));
  assert.equal(markErrorObserved(frozen), true);
  assert.equal(markErrorObserved(frozen), false);
  const { events, logger } = recordingLogger();
  await assert.rejects(measureOperation(logger, { operation: "outer", kind: "application" }, () => measureOperation(logger, { operation: "inner", kind: "database" }, async () => { throw "primitive"; })), error => error === "primitive");
  assert.equal(events.filter(item => item.errorStack || item.errorName).length, 0);
});

function clock(start, end) { const values = [start, end]; return () => values.shift(); }
