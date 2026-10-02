import { env } from "cloudflare:workers";
import { getObservabilityConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createRequestContext } from "./request-context.ts";

export function observabilityForRequest(request: Request) {
  const config = getObservabilityConfig(env as unknown as Record<string, string | undefined>);
  const context = createRequestContext(request, request.headers.get("x-request-id") || undefined);
  return { context, config, logger: createLogger(context, { level: config.level }) };
}
