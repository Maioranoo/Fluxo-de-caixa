export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type ObservabilityConfig = {
  level: LogLevel;
  slowRequestMs: number;
  slowAuthMs: number;
  slowDatabaseQueryMs: number | null;
  databaseBaselineLogging: boolean;
};

export function getObservabilityConfig(environment: Record<string, string | undefined> = {}): ObservabilityConfig {
  const production = environment.NODE_ENV !== "development";
  return {
    level: parseLevel(environment.LOG_LEVEL, production ? "info" : "debug"),
    slowRequestMs: parsePositive(environment.SLOW_REQUEST_MS, 1000),
    slowAuthMs: parsePositive(environment.SLOW_AUTH_MS, 500),
    slowDatabaseQueryMs: parseOptionalPositive(environment.SLOW_DATABASE_QUERY_MS),
    databaseBaselineLogging: parseBoolean(environment.DATABASE_BASELINE_LOGGING, true),
  };
}

function parseLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error" || value === "fatal" ? value : fallback;
}

function parsePositive(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 3_600_000 ? parsed : fallback;
}

function parseOptionalPositive(value: string | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 3_600_000 ? parsed : null;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
