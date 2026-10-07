import type { LogContext } from "./logger.ts";

export type RequestLogContext = Required<Pick<LogContext, "requestId" | "route" | "method" | "environment">> & Pick<LogContext, "platformRequestId">;

export function createRequestContext(request: Request, requestId = `req_${crypto.randomUUID()}`): RequestLogContext {
  const url = new URL(request.url);
  return {
    requestId,
    route: url.pathname,
    method: request.method,
    environment: isLocal(url.hostname) ? "development" : "production",
    ...(request.headers.get("cf-ray") ? { platformRequestId: request.headers.get("cf-ray")! } : {}),
  };
}

export function requestWithContext(request: Request, context: RequestLogContext) {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", context.requestId);
  return new Request(request.clone(), { headers });
}

export function responseWithRequestId(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function responseWithSecurityHeaders(response: Response, requestId: string, options: { privateResponse?: boolean; protectFromFraming?: boolean } = {}) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  if (options.privateResponse) {
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("pragma", "no-cache");
  }
  if (options.protectFromFraming) {
    headers.set("content-security-policy", mergeFrameAncestors(headers.get("content-security-policy")));
    headers.set("x-frame-options", "DENY");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function mergeFrameAncestors(existing: string | null) {
  if (!existing) return "frame-ancestors 'none'";
  const directives = existing.split(";").map(value => value.trim()).filter(Boolean).filter(value => !/^frame-ancestors\b/i.test(value));
  return [...directives, "frame-ancestors 'none'"].join("; ");
}

function isLocal(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
