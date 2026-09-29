import { BrandMark } from "./brand-mark";

export function BrandLoading() {
  return <main className="brand-loading" aria-busy="true">
    <div className="brand-loading-content" role="status">
      <div className="brand-loading-symbol"><BrandMark size={88}/></div>
      <h1>Finanças <span>da família</span></h1>
      <p>Carregando seu painel<span className="brand-loading-dots" aria-hidden="true">…</span></p>
    </div>
  </main>;
}
