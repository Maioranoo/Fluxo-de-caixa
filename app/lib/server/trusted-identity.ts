import { AccessError } from "./http-security.ts";
import { normalizeEmail } from "../validation.ts";

export type IdentityRuntimeConfig = {
  LOCAL_ADMIN_ENABLED?: string;
  NODE_ENV?: string;
  SITE_HOST?: string;
};

const DEFAULT_SITE_HOST = "painel-financas.maioranoo.chatgpt.site";

export function resolveTrustedIdentity(request: Request, config: IdentityRuntimeConfig) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const development = config.NODE_ENV === "development";
  const local = development && config.LOCAL_ADMIN_ENABLED === "true" && isLocalHost(hostname);
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || (local ? "admin-local@localhost" : undefined);
  const userId = request.headers.get("oai-authenticated-user-id")?.trim() || (local ? "admin-local" : undefined);
  if (!email || !userId || !normalizeEmail(email) || userId.length > 256) throw new AccessError("Faça login para acessar esta carteira.", 401);
  if (!local) {
    const allowedHost = (config.SITE_HOST?.trim().toLowerCase() || DEFAULT_SITE_HOST);
    if (hostname !== allowedHost) throw new AccessError("Origem de autenticação inválida.", 403);
  }
  return { email, userId, local };
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
