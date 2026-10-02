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

function isLocal(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
