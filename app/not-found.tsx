import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página não encontrada | Finanças da Família",
  description: "O endereço solicitado não existe. Volte ao painel Finanças da Família.",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function NotFound() {
  return <main className="not-found-page">
    <section className="not-found-card">
      <span className="not-found-code">404</span>
      <div className="access-mark">F</div>
      <p>FINANÇAS DA FAMÍLIA</p>
      <h1>Esta página não existe</h1>
      <p>O endereço pode estar incorreto ou a página pode ter sido movida.</p>
      <Link className="primary" href="/">Voltar ao painel</Link>
    </section>
  </main>;
}
