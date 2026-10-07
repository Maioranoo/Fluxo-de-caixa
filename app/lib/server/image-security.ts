import { AccessError } from "./http-security.ts";

export function assertSafeImageRequest(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("dpl")) throw new AccessError("Parâmetro de imagem inválido.", 400, { "Cache-Control": "no-store" });
}
