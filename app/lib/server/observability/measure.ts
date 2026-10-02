import type { Logger, SafeLogFields } from "./logger.ts";

export type MeasureOptions = {
  operation: string;
  kind: "application" | "authentication" | "database" | "external";
  completedEvent?: string;
  failedEvent?: string;
  fields?: SafeLogFields;
  slowThresholdMs?: number | null;
  databaseBaselineLogging?: boolean;
  now?: () => number;
};

const observedErrors = new WeakSet<object>();

export function markErrorObserved(error: unknown) {
  try {
    if ((typeof error !== "object" && typeof error !== "function") || error === null) return false;
    if (observedErrors.has(error)) return false;
    observedErrors.add(error);
    return true;
  } catch { return false; }
}

export function isErrorObserved(error: unknown) {
  try { return ((typeof error === "object" || typeof error === "function") && error !== null) ? observedErrors.has(error) : false; }
  catch { return false; }
}

export async function measureOperation<T>(logger: Logger, options: MeasureOptions, operation: () => Promise<T>): Promise<T> {
  const clock = options.now ?? (() => performance.now());
  const started = safeNow(clock);
  try {
    const result = await operation();
    const durationMs = duration(started, safeNow(clock));
    const fields = { ...options.fields, operation: options.operation, outcome: "success", ...(durationMs === undefined ? {} : { durationMs }) };
    if (options.kind === "database") {
      if (options.databaseBaselineLogging !== false) safeCall(() => logger.info(options.completedEvent ?? "database_operation_completed", fields));
      if (durationMs !== undefined && options.slowThresholdMs != null && durationMs > options.slowThresholdMs) safeCall(() => logger.warn("slow_database_query", { ...fields, thresholdMs: options.slowThresholdMs }));
    } else safeCall(() => logger.info(options.completedEvent ?? "operation_completed", fields));
    return result;
  } catch (error) {
    const durationMs = duration(started, safeNow(clock));
    const base = { ...options.fields, operation: options.operation, outcome: "failure", ...(durationMs === undefined ? {} : { durationMs }) };
    const ownsDetails = markErrorObserved(error);
    const details = ownsDetails && error instanceof Error ? { errorName: error.name, errorMessage: error.message, errorStack: error.stack } : {};
    safeCall(() => logger.error(options.failedEvent ?? "operation_failed", { ...base, ...details }));
    throw error;
  }
}

function safeNow(clock: () => number) {
  try { const value = clock(); return Number.isFinite(value) ? value : undefined; }
  catch { return undefined; }
}

function duration(started: number | undefined, ended: number | undefined) {
  return started === undefined || ended === undefined ? undefined : Math.max(0, ended - started);
}

function safeCall(call: () => void) {
  try { call(); } catch { /* Logging cannot affect application flow. */ }
}
