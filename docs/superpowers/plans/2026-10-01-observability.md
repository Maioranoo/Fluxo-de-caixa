# Structured Logging and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, correlated, low-overhead application logs that identify time spent in requests, authorization, D1 operations, business services, and recoverable fallbacks.

**Architecture:** A small Worker-compatible logger emits allowlisted JSON events to stdout/stderr and never throws. The Worker creates correlation IDs, while explicit request contexts and a generic operation timer carry correlation through authorization, services, and route handlers without global mutable state.

**Tech Stack:** TypeScript, Cloudflare Workers, Vinext/Next App Router, Drizzle ORM with Cloudflare D1, Node test runner, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-01-observability-design.md`

## Global Constraints

- Add no runtime logging dependency.
- Logging, sanitization, serialization, clocks, and console calls must be fail-open and must never change application results or errors.
- Production emits info and above; normal authentication success is debug-only or omitted.
- `SLOW_DATABASE_QUERY_MS` is centralized, configurable, and disabled by default while baseline timings are collected.
- `DATABASE_BASELINE_LOGGING` is centralized, configurable, defaults to `true`, and can disable normal D1 completion logs without a code change.
- `memberId` and `householdId` are opt-in event fields and are never added automatically to routine logs.
- Never log e-mail, names, raw ChatGPT IDs, IPs, headers, cookies, tokens, request/response bodies, financial values or descriptions, card data, SQL, SQL parameters, imported file identity, or document contents.
- Add no observability D1 writes or external network calls.
- Preserve ChatGPT login, e-mail allowlist behavior, API responses, financial functions, and client fallbacks.

## Review Focus

- A malicious inbound `x-request-id` must be replaced by a generated ID and must never be reflected unchanged.
- Circular objects, throwing getters, `BigInt`, and a throwing console must not affect the application request.
- An operation that throws must preserve the exact original exception when timing or logging also fails.
- Invalid threshold environment values must produce safe defaults without disabling the application.
- Unknown error messages containing token-like or financial-looking text must not leak through the production serializer.
- Request and response bodies, including streaming SSR responses, must remain unconsumed and byte-identical after Worker instrumentation.
- One exception crossing operation, handler, and Worker boundaries must produce full error details and stack at only one boundary.

---

### Task 1: Fail-open structured logger and configuration

**Files:**
- Create: `app/lib/server/observability/config.ts`
- Create: `app/lib/server/observability/logger.ts`
- Create: `tests/observability-logger.test.mjs`

**Interfaces:**
- Produces: `getObservabilityConfig(environment?: Record<string, string | undefined>): ObservabilityConfig`
- Produces: `createLogger(base?: LogContext, options?: LoggerOptions): Logger`
- Produces: `LogLevel`, `LogContext`, `SafeLogFields`, `Logger`, and `ObservabilityConfig` types.
- `Logger` methods are `debug(event, fields?)`, `info(event, fields?)`, `warn(event, fields?)`, `error(event, fields?)`, and `fatal(event, fields?)`, all returning `void` and never throwing.

- [ ] **Step 1: Write failing configuration tests**

Add tests proving production defaults to `info`, local defaults to `debug`, `SLOW_REQUEST_MS` has the specified default, `SLOW_DATABASE_QUERY_MS` defaults to disabled, and `DATABASE_BASELINE_LOGGING` defaults to true. Assert valid environment values override defaults and invalid threshold or boolean values fall back safely.

- [ ] **Step 2: Run the configuration tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-logger.test.mjs`  
Expected: FAIL because the observability modules do not exist.

- [ ] **Step 3: Implement `config.ts`**

Define `ObservabilityConfig` with `level`, `slowRequestMs`, `slowAuthMs`, and `slowDatabaseQueryMs: number | null`. Parse environment values without throwing and keep the database threshold disabled by default.

- [ ] **Step 4: Write failing logger format and level tests**

Capture the supplied console sink and assert one-line JSON contains timestamp, level, event, and base context. Assert a production info logger omits debug, including routine `auth_success`.

- [ ] **Step 5: Write fail-open and redaction tests**

Test circular input, `BigInt`, a throwing property getter, a throwing clock, a throwing serializer, and throwing console methods. Assert every logger call returns normally. Test forbidden keys and representative token, e-mail, authorization, cookie, financial description, and card-like input; assert none appears in output.

- [ ] **Step 6: Implement `logger.ts` minimally**

Use event-specific safe scalar fields, bounded sanitization, bounded strings/depth/arrays, level filtering, JSON lines, and an outer non-recursive `try/catch`. Do not accept `Request`, `Response`, `Headers`, bodies, domain records, or arbitrary errors as fields.

- [ ] **Step 7: Run focused tests**

Run: `node --experimental-strip-types --test tests/observability-logger.test.mjs`  
Expected: PASS with no leaked forbidden values and no thrown logger cases.

- [ ] **Step 8: Run lint and commit**

Run: `npm run lint`  
Expected: exit 0 with no warnings.

Commit:

```bash
git add app/lib/server/observability/config.ts app/lib/server/observability/logger.ts tests/observability-logger.test.mjs
git commit -m "Add fail-open structured logger"
```

### Task 2: Request correlation and Worker lifecycle logging

**Files:**
- Create: `app/lib/server/observability/request-context.ts`
- Modify: `worker/index.ts:31-54`
- Test: `tests/observability-request.test.mjs`

**Interfaces:**
- Consumes: `createLogger()` and `ObservabilityConfig` from Task 1.
- Produces: `RequestLogContext`, `createRequestContext(request, requestId?)`, `requestWithContext(request, context)`, and `responseWithRequestId(response, requestId)`.
- Produces: generated IDs matching `req_<uuid>` and internal `x-request-id` propagation.

- [ ] **Step 1: Write failing request-context tests**

Assert a generated request ID replaces a malicious inbound ID, route excludes query strings, method is retained, `cf-ray` is optional, the internal request carries the generated ID, and the response exposes it.

Add explicit byte-level tests for POST, PATCH, and DELETE requests. After correlation is attached, assert each original body remains unconsumed, the forwarded body is byte-identical, and method plus all existing headers are unchanged except for the trusted request ID.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-request.test.mjs`  
Expected: FAIL because request-context helpers do not exist.

- [ ] **Step 3: Implement `request-context.ts`**

Create immutable context and clone only the request headers needed to add the trusted ID. Normalize route to pathname. Do not add authenticated IDs, IP, member ID, or household ID to base context.

- [ ] **Step 4: Write failing Worker structure tests**

Assert the Worker creates context before rate limiting, forwards the contextual request to rate limiting and Vinext, attaches the response ID, excludes static/image logging, emits `request_completed`, emits `slow_request` from configuration, and contains no direct serialization of request or headers.

Add response-transparency tests asserting status, status text, existing headers, and response bytes remain identical. Use a multi-chunk `ReadableStream` with pull tracking and assert correlation does not read, buffer, or consume the stream before the caller consumes it.

- [ ] **Step 5: Implement Worker lifecycle logging**

Wrap the existing Worker flow without changing rate-limit, image, or Vinext behavior. Log debug-only `request_started`, production `request_completed`, warnings for slow dynamic/API requests, and sanitized `request_failed` on unexpected errors. Ensure logging failures cannot replace responses or errors.

- [ ] **Step 6: Test and commit**

Run: `node --experimental-strip-types --test tests/observability-request.test.mjs tests/rate-limit.test.mjs`  
Expected: PASS.

Commit:

```bash
git add app/lib/server/observability/request-context.ts worker/index.ts tests/observability-request.test.mjs
git commit -m "Add correlated request lifecycle logs"
```

### Task 3: Fail-open semantic operation measurement

**Files:**
- Create: `app/lib/server/observability/measure.ts`
- Create: `tests/observability-measure.test.mjs`

**Interfaces:**
- Consumes: `Logger`, `RequestLogContext`, and `ObservabilityConfig`.
- Produces: `measureOperation<T>(logger: Logger, options: MeasureOptions, operation: () => Promise<T>): Promise<T>`.
- `MeasureOptions` defines semantic operation, completion/failure event names, kind (`application`, `authentication`, `database`, or `external`), optional safe fields, and optional warning threshold.
- Produces: `markErrorObserved(error): boolean` and `isErrorObserved(error): boolean` for fail-open error-detail ownership.

- [ ] **Step 1: Write failing result and error identity tests**

Assert the helper returns the exact resolved value. Assert it rethrows the exact same error object from the operation, including when completion or failure logging throws.

- [ ] **Step 2: Write timing and fail-open tests**

Use a deterministic clock to assert duration. Make the clock and logger throw separately and assert the operation result remains unchanged. Assert a database operation with no configured threshold emits baseline completion but no `slow_database_query`.

Add nested-boundary tests where the same exception crosses two `measureOperation()` calls and a request-level failure reporter. Assert exactly one event contains error name/stack and later events contain correlation/status/duration only. Cover frozen/non-extensible Error instances and primitive thrown values without changing their identity.

- [ ] **Step 3: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-measure.test.mjs`  
Expected: FAIL because `measureOperation` does not exist.

- [ ] **Step 4: Implement `measureOperation()`**

Measure with `performance.now()` behind safe helpers. Emit the specified completion event; emit warning events only when a configured threshold exists and is crossed. On application failure, claim error-detail ownership fail-safely, emit full sanitized details only for the owning boundary, and rethrow the original exception. Higher boundaries emit structural failure events without repeating error details.

- [ ] **Step 5: Run tests and commit**

Run: `node --experimental-strip-types --test tests/observability-measure.test.mjs`  
Expected: PASS.

Commit:

```bash
git add app/lib/server/observability/measure.ts tests/observability-measure.test.mjs
git commit -m "Add semantic operation timing"
```

### Task 4: Authorization and rate-limit observability

**Files:**
- Modify: `db/tenancy.ts:26-72`
- Modify: `app/lib/server/rate-limit.ts:33-80`
- Modify: `worker/index.ts:35-41`
- Create: `tests/observability-auth.test.mjs`
- Modify: `tests/rate-limit.test.mjs`

**Interfaces:**
- Consumes: request context, logger, configuration, and `measureOperation()`.
- Produces: `auth_failed`, `slow_authentication`, debug-only `auth_success`, `rate_limit_rejected`, `rate_limit_storage_failed`, and `rate_limit_cleanup_failed` events.
- `requireHousehold(request, observability?)` remains compatible with callers that pass only `Request`.

- [ ] **Step 1: Write failing authorization policy tests**

Assert production normal success does not emit info `auth_success`. Assert 401/403 paths emit `auth_failed` without e-mail, name, raw account ID, member ID, or household ID. Assert a slow lookup emits `slow_authentication`. Assert explicitly diagnostic events may include a persistent ID only when passed in that event's safe fields.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-auth.test.mjs`  
Expected: FAIL because authorization instrumentation is absent.

- [ ] **Step 3: Instrument `requireHousehold()`**

Measure the lookup and requested-household check without changing authorization behavior or query order. Keep normal success debug-only. Log failure categories rather than sensitive values.

- [ ] **Step 4: Extend rate-limit tests**

Assert storage outage and cleanup failure produce safe events while retaining current fail-closed rate-limit behavior. Assert observability failure itself does not change the existing response behavior.

- [ ] **Step 5: Instrument rate limiting and background cleanup**

Measure the D1 rate-limit operation. Replace the silent cleanup catch with a fail-open warning scheduled through the existing `waitUntil`. Do not log identity, IP, or full hash.

- [ ] **Step 6: Run tests and commit**

Run: `node --experimental-strip-types --test tests/observability-auth.test.mjs tests/rate-limit.test.mjs tests/security-validation.test.mjs`  
Expected: PASS with existing access and rate-limit assertions unchanged.

Commit:

```bash
git add db/tenancy.ts app/lib/server/rate-limit.ts worker/index.ts tests/observability-auth.test.mjs tests/rate-limit.test.mjs
git commit -m "Instrument authorization and rate limiting"
```

### Task 5: Finance read and D1 baseline timings

**Files:**
- Modify: `app/lib/server/finance-data.ts:11-55`
- Modify: `app/api/finance/route.ts:11-208`
- Modify: `app/page.tsx:8-23`
- Create: `tests/observability-finance.test.mjs`
- Modify: `tests/server-bootstrap.test.mjs`

**Interfaces:**
- Consumes: logger, request context, configuration, and `measureOperation()`.
- Produces: `database_operation_completed` for `database.finance_batch`, optional configured `slow_database_query`, `finance_fetch_completed`, business write events, and `initial_finance_load_failed`.
- `loadFinanceData(request, month, months, observability?)` remains compatible with current callers.

- [ ] **Step 1: Write failing finance timing tests**

Assert `database.finance_batch` emits duration during the baseline phase, omits SQL and parameters, and does not warn while the database threshold is disabled. Assert setting the threshold produces `slow_database_query` only when exceeded.

Assert `DATABASE_BASELINE_LOGGING=false` suppresses normal `database_operation_completed` info events while preserving configured slow warnings and database failure events.

- [ ] **Step 2: Write failing privacy tests for finance writes**

For create, update, and delete event schemas, assert amounts, descriptions, people, payment details, dates, request bodies, and automatic member/household IDs cannot appear. Assert a specifically justified delete count is permitted.

- [ ] **Step 3: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-finance.test.mjs`  
Expected: FAIL because finance instrumentation is absent.

- [ ] **Step 4: Instrument `loadFinanceData()`**

Wrap only the semantic D1 batch and optional in-memory bucketing stage. Preserve the single batch and returned payload exactly.

- [ ] **Step 5: Instrument finance handlers**

Emit final operation events for read and important writes. Reuse request lifecycle logging for status and total duration; do not duplicate request bodies or every validation branch.

- [ ] **Step 6: Instrument initial server fallback**

Replace the silent catch with `initial_finance_load_failed`, retaining the existing browser fallback and rendered behavior. The logger must be allowed to fail without preventing fallback.

- [ ] **Step 7: Run finance regressions and commit**

Run: `node --experimental-strip-types --test tests/observability-finance.test.mjs tests/server-bootstrap.test.mjs tests/finance-client.test.mjs tests/installment-deletion.test.mjs tests/rendered-html.test.mjs`  
Expected: PASS.

Commit:

```bash
git add app/lib/server/finance-data.ts app/api/finance/route.ts app/page.tsx tests/observability-finance.test.mjs tests/server-bootstrap.test.mjs
git commit -m "Add finance performance observability"
```

### Task 6: Admin and import observability

**Files:**
- Modify: `app/api/admin/households/route.ts:10-107`
- Modify: `app/api/imports/route.ts:10-153`
- Modify: `app/api/imports/preview/route.ts:11-79`
- Create: `tests/observability-routes.test.mjs`
- Modify: `tests/import-api-structure.test.mjs`

**Interfaces:**
- Consumes: logger, request context, and `measureOperation()`.
- Produces: safe admin and import completion/failure events with semantic database operation names.

- [ ] **Step 1: Write failing admin/import event tests**

Assert route source uses structured helpers instead of generic `console.error`. Assert import events permit row counts and mode but reject names, hashes, descriptions, values, people, payment details, and row contents. Assert admin events reject member e-mail/name and household name.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --experimental-strip-types --test tests/observability-routes.test.mjs tests/import-api-structure.test.mjs`  
Expected: FAIL because generic logging remains.

- [ ] **Step 3: Instrument admin operations**

Measure household/member persistence boundaries and emit final success or sanitized unexpected failure events. Preserve all authorization and response text.

- [ ] **Step 4: Instrument import preview and commit operations**

Measure parallel preview queries, classification as a single application stage, import commit, history reads, and batch deletion. Never log per-row events.

- [ ] **Step 5: Replace generic error logging**

Remove the remaining application `console.error("...")` calls in these routes and use the centralized error serializer. Expected `AccessError` and validation outcomes remain non-error request results.

- [ ] **Step 6: Run route regressions and commit**

Run: `node --experimental-strip-types --test tests/observability-routes.test.mjs tests/import-api-structure.test.mjs tests/import-validation.test.mjs tests/rendered-html.test.mjs`  
Expected: PASS.

Commit:

```bash
git add app/api/admin/households/route.ts app/api/imports/route.ts app/api/imports/preview/route.ts tests/observability-routes.test.mjs tests/import-api-structure.test.mjs
git commit -m "Instrument admin and import operations"
```

### Task 7: Full verification and production baseline rollout

**Files:**
- Modify if needed: `tests/observability-*.test.mjs`
- No application changes unless a verification failure requires a focused fix and matching regression test.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified build and a documented production baseline from Sites Worker logs.

- [ ] **Step 1: Scan for unsafe and legacy logging**

Run: `rg -n "console\.(log|info|warn|error)|Authorization|cookie|oai-authenticated|JSON\.stringify\((request|response|body|error)" app worker db`  
Expected: only the centralized logger may call console; authentication header reads remain in authorization code but are absent from log calls.

- [ ] **Step 2: Run the complete verification suite**

Run: `npm test`  
Expected: build succeeds and every test passes.

Run: `npm run lint`  
Expected: exit 0 with no warnings.

- [ ] **Step 3: Verify local JSON events**

Run the development server, load `/`, read `/api/finance`, perform one reversible test write/delete with local fixture data, and inspect terminal output. Confirm correlated IDs, valid one-line JSON, no forbidden fields, and unchanged responses.

- [ ] **Step 4: Review the complete diff for security and access preservation**

Confirm no changes to Sites access mode, authentication headers, household membership rules, schema, migrations, or response payload contracts. Confirm no dependency or lockfile changes.

- [ ] **Step 5: Commit verification adjustments if any**

If Step 2 or 3 required fixes, commit only those focused fixes and their regression tests. Otherwise create no empty commit.

- [ ] **Step 6: Publish through the existing Sites workflow**

Save and deploy the validated source while preserving the current `custom` access policy. Confirm deployment succeeds and the live Site still reports `custom` access.

- [ ] **Step 7: Collect the first production baseline**

Use the Sites Worker logs after representative reads and writes. Record application operation durations alongside platform `wallTimeMs` and `cpuTimeMs`. Keep `SLOW_DATABASE_QUERY_MS` disabled until enough cold and warm samples exist.

- [ ] **Step 8: Choose the database threshold as a separate reviewed change**

Summarize median, p95, cold, and warm timings per semantic D1 operation. Propose a threshold based on observed production distributions. Do not enable it without user review.

After the threshold is approved and configured, set `DATABASE_BASELINE_LOGGING=false` through runtime configuration so normal D1 operations stop emitting info events without another source change.

## Completion Criteria

- All tests and lint pass.
- Logging failure tests cover every fail-open boundary.
- Production normal authentication success generates no info log.
- Critical D1 timings are visible with no database warning threshold fixed in code.
- Baseline D1 info events can be disabled through `DATABASE_BASELINE_LOGGING=false` without changing code.
- Worker instrumentation preserves POST, PATCH, DELETE, ordinary responses, and streamed SSR bodies byte-for-byte and without premature consumption.
- One thrown exception produces full sanitized error details at only one boundary.
- No protected or financial data appears in fixtures or captured logs.
- Request IDs correlate Worker, authorization, service, and database events.
- Existing functions, responses, login, and access allowlist remain unchanged.
- Production deployment retains `custom` access.
