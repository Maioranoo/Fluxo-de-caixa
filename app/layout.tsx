import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return { title: "Finanças da Família", description: "Controle compartilhado de gastos de João e Dena.", openGraph: { title: "Finanças da Família", description: "Controle simples. Decisões tranquilas.", images: [image] }, twitter: { card: "summary_large_image", images: [image] } };
}
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
