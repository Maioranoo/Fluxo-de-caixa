import type { ImportMode } from "../../lib/imports/types.ts";
import type { FinanceData } from "../../lib/finance-ui";

export type ImportConfig = {
  referenceMonth: string;
  mode: ImportMode;
  defaultPaymentMethod: string;
  defaultPerson: string;
};

export function FileStep({ config, data, busy, onChange, onFile }: { config: ImportConfig; data: FinanceData; busy: boolean; onChange: (config: ImportConfig) => void; onFile: (file: File) => void }) {
  return <div className="import-configure">
    <div className="import-fields">
      <label>Mês de destino<input type="month" min="2000-01" max="2200-12" value={config.referenceMonth} onChange={event => onChange({ ...config, referenceMonth: event.target.value })}/></label>
      <fieldset><legend>Como deseja importar?</legend><label className="choice-card"><input type="radio" name="import-mode" checked={config.mode === "full"} onChange={() => onChange({ ...config, mode: "full" })}/><span><b>Importação completa</b><small>Data, categoria, pagamento e pessoa podem ser conferidos.</small></span></label><label className="choice-card"><input type="radio" name="import-mode" checked={config.mode === "minimal"} onChange={() => onChange({ ...config, mode: "minimal" })}/><span><b>Não trazer detalhes</b><small>Importa somente local e valor para o mês escolhido.</small></span></label></fieldset>
      {config.mode === "full" && <div className="import-defaults"><label>Pagamento padrão<select value={config.defaultPaymentMethod} onChange={event => onChange({ ...config, defaultPaymentMethod: event.target.value })}><option value="">Não informado</option>{data.payments.map(payment => <option key={payment.id} value={payment.key}>{payment.name}</option>)}</select></label><label>Pessoa padrão<select value={config.defaultPerson} onChange={event => onChange({ ...config, defaultPerson: event.target.value })}><option value="">Não informado</option>{data.members.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}</select></label></div>}
    </div>
    <label className={`file-drop${busy ? " busy" : ""}`}><span><b>{busy ? "Lendo arquivo…" : "Escolher arquivo"}</b><small>Excel, CSV ou PDF digital · até 10 MB e 5.000 linhas</small></span><input type="file" accept=".xlsx,.xls,.csv,.pdf" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ""; }}/></label>
  </div>;
}
