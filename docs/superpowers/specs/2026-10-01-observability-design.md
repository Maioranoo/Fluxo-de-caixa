# Structured Logging and Observability Design

**Date:** 2026-10-01  
**Status:** Approved architecture with requested refinements  
**Scope:** Application logging, request correlation, performance timings, safe error reporting, and a path toward metrics and traces.

## Purpose

The system must make it possible to determine whether latency or failure occurred in the ChatGPT Sites front door, the application Worker, household authorization, a D1 operation, application processing, or a future external service. The implementation must add no perceptible latency, must never expose financial or authentication data, and must never cause a user request to fail because observability failed.

## Current Architecture

The application uses React 19 and the Next App Router compiled by Vinext into a Cloudflare Worker. `worker/index.ts` is the outer request boundary. It applies D1-backed rate limits, handles image optimization, and delegates to Vinext. Dynamic server rendering and route handlers execute in that Worker.

ChatGPT Sites performs sign-in before or around the application boundary and supplies trusted `oai-authenticated-*` headers. `db/tenancy.ts` applies the application's second authorization layer by finding the authenticated person in `household_members` and selecting the permitted household. Cloudflare D1 is accessed through Drizzle ORM.

The initial page reads financial data during server rendering. Later interactions call `/api/finance`, `/api/admin/households`, `/api/imports`, and `/api/imports/preview`. There is no Next middleware and there are no application-owned external HTTP services. PDF parsing runs in the browser.

Production already emits Cloudflare Worker events containing route, status, wall time, CPU time, platform request ID, ray ID, and trace ID. Sites redacts authentication headers and cookies in those platform events. Application logs must complement those events with internal stage timings rather than duplicate their raw request data.

## Design Principles

1. Production logs are one-line structured JSON written to stdout or stderr.
2. Fields are allowed explicitly. Arbitrary request, response, body, headers, domain records, and error objects are never serialized.
3. Logging is fail-open. Logger, sanitizer, clock, JSON serialization, and console failures are swallowed at the observability boundary. The application result or original application error always wins.
4. Correlation is explicit and request-scoped. No mutable global request context or AsyncLocalStorage is required.
5. Timings describe semantic operations such as `database.finance_batch`; SQL and SQL parameters are never logged.
6. Routine success produces little noise. Normal authentication success is debug-only or omitted in production.
7. Persistent identifiers are opt-in fields for events that need them. `memberId` and `householdId` are not inherited automatically by routine logs.
8. Observability must not add database writes or external network requests.

## Selected Approach

Implement a small in-project logger instead of adding Pino. Pino's Node transports are not useful in the Cloudflare Worker deployment, and the low event volume does not justify another runtime dependency. A small logger allows a stricter event schema and a fail-open implementation tailored to the project's financial privacy requirements.

OpenTelemetry and Sentry are explicitly deferred. The interfaces introduced here must allow future sinks or spans without changing business services.

## Components

### Observability configuration

`app/lib/server/observability/config.ts` owns all levels and thresholds. Configuration is read from Worker environment values and parsed defensively.

- `LOG_LEVEL` defaults to `debug` in local development and `info` in production.
- `SLOW_REQUEST_MS` defaults to `1000`.
- `SLOW_AUTH_MS` is centralized and configurable.
- `SLOW_DATABASE_QUERY_MS` is centralized, optional, and **disabled by default during the baseline phase**.

While the database warning threshold is disabled, critical D1 operations emit `database_operation_completed` at info level with `durationMs`. Production observations will be used to choose a threshold later. Enabling `SLOW_DATABASE_QUERY_MS` adds `slow_database_query` warnings without changing the instrumentation sites.

Invalid, negative, zero, or unreasonably large environment values fall back to safe defaults or disabled state. Configuration parsing never throws.

### Logger

`app/lib/server/observability/logger.ts` exposes `debug`, `info`, `warn`, `error`, and `fatal` through a request-aware logger. Each call accepts an event name and a narrow structured field object.

The logger builds this envelope:

```json
{
  "timestamp": "2026-10-01T23:20:00.000Z",
  "level": "info",
  "event": "request_completed",
  "requestId": "req_0c89d829",
  "route": "/api/finance",
  "method": "GET",
  "status": 200,
  "durationMs": 826,
  "environment": "production"
}
```

All logger entry points are non-throwing. A final outer `try/catch` covers timestamp creation, sanitization, serialization, and console invocation. If any stage fails, the logger returns silently and performs no fallback logging that could recurse.

### Request context

`app/lib/server/observability/request-context.ts` defines a small immutable context containing `requestId`, normalized route, method, optional Cloudflare ray ID, and environment. The Worker always replaces any inbound `x-request-id` with `req_${crypto.randomUUID()}` and forwards the resulting request to Vinext. The response exposes the same ID in `x-request-id`.

Lower layers reconstruct the context from the trusted internal request headers. Member and household IDs are not part of the base context.

### Operation measurement

`app/lib/server/observability/measure.ts` exposes a generic `measureOperation()` helper. It measures asynchronous work with `performance.now()`, emits completion or failure events, and rethrows the original application error unchanged.

Logging failure cannot alter the returned value, replace the original exception, or add a rejection. Operation metadata contains semantic names and safe scalar fields only.

### Worker request lifecycle

`worker/index.ts` is the only automatic request lifecycle boundary. It measures dynamic page and API requests, logs `request_completed`, reports unexpected failures, and emits `slow_request` when the configurable threshold is crossed. Static assets and routine image requests are excluded from application request logs.

`request_started` is debug-only. Production relies on the final event because it contains method, normalized route, status, and duration in one line.

### Authorization

`requireHousehold()` measures the internal household lookup. Production behavior is:

- normal success: no info event; debug-only when debug logging is enabled;
- rejected or missing access: `auth_failed` without e-mail, name, IP, or raw ChatGPT user ID;
- slow lookup: `slow_authentication` warning;
- unexpected storage error: sanitized error event.

Member and household IDs appear only when a specific diagnostic event needs them. They are never merged into every subsequent request log.

### Database operations

Drizzle SQL logging is not enabled. Selected semantic D1 boundaries are wrapped instead:

- `database.auth_lookup`;
- `database.finance_batch`;
- `database.expense_create`, `update`, and `delete`;
- `database.import_preview` and `import_commit`;
- `database.admin_household`;
- `database.rate_limit`.

No SQL, bindings, amounts, descriptions, merchant names, dates, card data, or returned rows are logged. During the baseline phase, completion duration is emitted for critical operations. Later, the configured database threshold can promote slow operations to warnings.

### Business events

Important writes emit one final event such as `expense_created`, `expense_updated`, `expense_deleted`, `category_updated`, or `import_completed`. Events contain outcome, duration, safe counts, and only specifically justified persistent IDs. Routine reads do not produce per-record events.

### Errors

Expected 4xx conditions remain normal response outcomes. They do not include stack traces. Authentication failures receive their dedicated event. Unexpected exceptions produce `unexpected_error` with request ID, route, operation, elapsed duration, error class, and a bounded sanitized stack when safe.

Unknown error messages are not trusted. Production serialization removes forbidden patterns, truncates strings, limits nesting, and never walks arbitrary application objects. Development may retain more diagnostic detail after the same redaction pass.

Silent catches are addressed without changing fallback behavior:

- rate-limit cleanup failure emits a warning through a fail-open logger;
- initial server finance load failure emits a warning, then retains the client fallback;
- unexpected import and admin errors replace generic `console.error` calls with structured events.

## Levels

Development uses debug and above. Production uses info and above.

- `DEBUG`: request start, normal authentication success, and temporary diagnostics.
- `INFO`: completed dynamic requests, measured critical D1 operations during baseline collection, and important successful writes.
- `WARN`: slow request, slow authentication, configured slow database operation, rate-limit rejection, or recovered fallback.
- `ERROR`: unexpected request or operation failure.
- `FATAL`: missing essential runtime facilities that prevent the application from serving requests.

## Privacy and Redaction

Forbidden data includes e-mail, name, raw ChatGPT account ID, IP, cookies, authorization headers, tokens, secrets, API keys, request and response bodies, financial amounts, purchase descriptions, merchant names, payment card data, SQL, SQL parameters, file names, file hashes, PDF or spreadsheet contents, and household names.

The first defense is event-specific allowlisted fields. A recursive sanitizer is a final safety layer for forbidden key names and suspicious secret patterns. Strings, arrays, depth, and stack size are bounded. `Request`, `Response`, `Headers`, Error causes, and domain objects are rejected as log fields.

## Frontend

The first implementation does not add a browser telemetry endpoint and does not log clicks. Backend request failures are already visible at their source. The response request ID can be shown in DevTools or a future support message.

A future frontend phase may add a React error boundary and Sentry. Sentry must use `beforeSend` redaction, disable request bodies, remove URL query strings, avoid session replay for financial screens, and upload source maps securely.

## Production and Infrastructure Boundary

Application logs begin only after the Site dispatches the request to the Worker. They cannot directly measure the ChatGPT Sites sign-in page, front-door routing, or queueing before Worker execution.

Diagnosis compares browser TTFB with Worker `wallTimeMs` and application stage durations. A large browser TTFB with a small Worker duration indicates latency outside project code. A large Worker duration with a slow internal operation identifies the project-controlled layer.

Logs are viewed locally in the development terminal and in production through ChatGPT Sites Worker logs. The exact long-term retention is platform-controlled and is not assumed by this design.

## Expected Overhead

The normal path performs UUID generation at the Worker boundary, a few monotonic clock reads, small object construction, JSON serialization, and one or two console writes. No D1 writes or external calls are added. Expected application overhead is under a few milliseconds per dynamic request. Debug logging is disabled in production and database events are limited to explicitly selected boundaries.

## Testing Requirements

Tests must prove:

1. every public logger method remains non-throwing when the clock, sanitizer, serializer, or console throws;
2. `measureOperation()` returns the original value and rethrows the original application exception even when logging fails;
3. inbound request IDs are replaced, propagated internally, and returned in the response;
4. forbidden values and forbidden keys never appear in serialized output;
5. normal authentication success is absent at production info level;
6. authentication failure and slow authentication are logged safely;
7. database thresholds are configurable and disabled by default;
8. database durations are observable during the baseline phase without SQL or parameters;
9. request and database warning thresholds produce the expected events;
10. existing login, allowlist, finance, import, installment, and admin behavior remains unchanged.

## Rollout

Roll out in five increments: core logger and tests; Worker correlation; authorization and D1 timing; business route instrumentation; production verification. After enough representative production data is collected, select and configure `SLOW_DATABASE_QUERY_MS`. Sentry, metrics, exporters, and OpenTelemetry remain later projects.

## Success Criteria

- A single request ID reconstructs the application-controlled stages of a request.
- Logs distinguish Worker, authorization, D1, application processing, and recoverable fallback time.
- No prohibited data is emitted by tests or production event schemas.
- Logging failure cannot affect status, response body, returned value, or original exception.
- Normal production traffic remains low-noise.
- D1 performance can be observed before choosing a warning threshold.
- Existing functionality and access control remain unchanged.
