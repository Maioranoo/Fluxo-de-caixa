import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://painel-financas.maioranoo.chatgpt.site";
const title = "Finanças da Família | Controle financeiro familiar";
const description = "Organize as finanças da família: acompanhe gastos, receitas, parcelas e saldo mensal, importe extratos e consulte relatórios em um painel compartilhado.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: { canonical: `${siteUrl}/` },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Finanças da Família",
    url: `${siteUrl}/`,
    title,
    description,
    images: [`${siteUrl}/og.png`],
  },
  twitter: { card: "summary_large_image", title, description, images: [`${siteUrl}/og.png`] },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
