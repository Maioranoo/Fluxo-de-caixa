import type { LogLevel } from "./config.ts";

export type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  environment?: string;
  platformRequestId?: string;
};

export type SafeLogFields = {
  status?: number;
  durationMs?: number;
  thresholdMs?: number;
  operation?: string;
  outcome?: string;
  origin?: string;
  severity?: string;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  count?: number;
  deletedCount?: number;
  mode?: string;
};

export type Logger = {
  debug(event: string, fields?: SafeLogFields): void;
  info(event: string, fields?: SafeLogFields): void;
  warn(event: string, fields?: SafeLogFields): void;
  error(event: string, fields?: SafeLogFields): void;
  fatal(event: string, fields?: SafeLogFields): void;
  child(context: LogContext): Logger;
};

type Sink = { log(line: string): void; warn(line: string): void; error(line: string): void };
export type LoggerOptions = { level?: LogLevel; sink?: Sink; now?: () => Date };

const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const safeFieldNames = new Set(["status", "durationMs", "thresholdMs", "operation", "outcome", "origin", "severity", "errorName", "errorMessage", "errorStack", "count", "deletedCount", "mode"]);
const safeContextNames = new Set(["requestId", "route", "method", "environment", "platformRequestId"]);

export function createLogger(base: LogContext = {}, options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const sink = options.sink ?? console;
  const now = options.now ?? (() => new Date());
  const write = (entryLevel: LogLevel, event: string, fields?: SafeLogFields) => {
    try {
      if (priorities[entryLevel] < priorities[level]) return;
      const record: Record<string, unknown> = { timestamp: now().toISOString(), level: entryLevel, event: safeString(event, 80) };
      copyAllowed(record, base, safeContextNames);
      copyAllowed(record, fields, safeFieldNames);
      const line = JSON.stringify(record);
      if (entryLevel === "warn") sink.warn(line);
      else if (entryLevel === "error" || entryLevel === "fatal") sink.error(line);
      else sink.log(line);
    } catch { /* Observability must never affect the request. */ }
  };
  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    fatal: (event, fields) => write("fatal", event, fields),
    child: context => createLogger({ ...base, ...pickContext(context) }, options),
  };
}

function copyAllowed(target: Record<string, unknown>, source: unknown, allowed: Set<string>) {
  if (!source || typeof source !== "object") return;
  for (const key of allowed) {
    let value: unknown;
    try { value = (source as Record<string, unknown>)[key]; } catch { continue; }
    const safe = safeValue(value, key);
    if (safe !== undefined) target[key] = safe;
  }
}

function pickContext(context: LogContext) {
  const result: LogContext = {};
  copyAllowed(result as Record<string, unknown>, context, safeContextNames);
  return result;
}

function safeValue(value: unknown, key: string): string | number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 10) / 10 : undefined;
  if (typeof value !== "string") return undefined;
  return safeString(value, key === "errorStack" ? 4000 : 240);
}

function safeString(value: string, limit: number) {
  const sanitized = value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .replace(/\b(?:Bearer|Basic)\s+[^\s]+/gi, "[REDACTED]")
    .replace(/\b(?:token|password|secret|cookie|authorization|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED]");
  return sanitized.slice(0, limit);
}
