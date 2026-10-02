/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { AccessError } from "../app/lib/server/http-security.ts";
import { cleanupRateLimits, enforceRateLimits, requestRateLimitChecks } from "../app/lib/server/rate-limit.ts";
import { getObservabilityConfig } from "../app/lib/server/observability/config.ts";
import { createLogger } from "../app/lib/server/observability/logger.ts";
import { createRequestContext, requestWithContext, responseWithRequestId } from "../app/lib/server/observability/request-context.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  NODE_ENV?: string;
  LOG_LEVEL?: string;
  SLOW_REQUEST_MS?: string;
  SLOW_AUTH_MS?: string;
  SLOW_DATABASE_QUERY_MS?: string;
  DATABASE_BASELINE_LOGGING?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const context = createRequestContext(request);
    const contextualRequest = requestWithContext(request, context);
    const url = new URL(contextualRequest.url);
    const config = getObservabilityConfig(env as unknown as Record<string, string | undefined>);
    const logger = createLogger(context, { level: config.level });
    const started = performance.now();
    const report = (response: Response) => {
      const durationMs = performance.now() - started;
      if (shouldLogRequest(url.pathname)) {
        logger.info("request_completed", { status: response.status, durationMs });
        if (durationMs > config.slowRequestMs) logger.warn("slow_request", { status: response.status, durationMs, thresholdMs: config.slowRequestMs });
      }
      return responseWithRequestId(response, context.requestId);
    };
    logger.debug("request_started");

    try {
      await enforceRateLimits(env.DB, requestRateLimitChecks(contextualRequest));
    } catch (error) {
      if (error instanceof AccessError) return report(Response.json({ error: error.message }, { status: error.status, headers: error.headers }));
      return report(Response.json({ error: "Proteção de acesso indisponível." }, { status: 503 }));
    }
    // Indexed, bounded housekeeping; no unbounded in-memory identity map.
    if (Math.random() < 0.01) ctx.waitUntil(cleanupRateLimits(env.DB).catch(() => {}));

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return report(await handleImageOptimization(contextualRequest, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths));
    }

    try {
      return report(await handler.fetch(contextualRequest, env, ctx));
    } catch (error) {
      logger.error("request_failed", { status: 500, durationMs: performance.now() - started, origin: "worker" });
      throw error;
    }
  },
};

function shouldLogRequest(pathname: string) {
  return pathname === "/" || pathname === "/api" || pathname.startsWith("/api/");
}

export default worker;
