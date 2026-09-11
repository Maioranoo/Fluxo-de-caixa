import { AccessError } from "../../db/tenancy";

export function assertSameSite(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError("Solicitação externa bloqueada.", 403);
  }
}
