"use client";

import { useMemo, useState } from "react";
import type { FinanceData } from "../../lib/finance-ui";
import { formatMoney } from "../../lib/finance-ui";
import { hashFile } from "../../lib/imports/fingerprint.ts";
import { parseDigitalPdf } from "../../lib/imports/pdf-parser.ts";
import { inspectTabularFile, mapTabularRows, parseImportedAmount, parseImportedDate, type TabularInspection } from "../../lib/imports/tabular-parser.ts";
import type { ColumnMapping, ImportSourceType, ParsedImportRow, PreviewImportRow } from "../../lib/imports/types.ts";
import { DialogFrame, StatusNotice } from "../ui";
import { ColumnMapper } from "./column-mapper";
import { FileStep, type ImportConfig } from "./file-step";
import { ImportHistory } from "./import-history";
import { PreviewCards } from "./preview-cards";
import { PreviewTable } from "./preview-table";

const PAGE_SIZE = 50;
type ImportStep = "configure" | "mapping" | "preview" | "confirming" | "complete";
const WARNING_LABELS = { date_mismatch: "Data divergente", possible_duplicate: "Possível duplicidade", excluded_credit: "Crédito, estorno ou pagamento", invalid_amount: "Valor precisa ser corrigido" } as const;

export function ImportWorkspace({ month, data, householdId, onImported, onClose }: { month: string; data: FinanceData; householdId: string; onImported: () => void; onClose: () => void }) {
  const [step, setStep] = useState<ImportStep>("configure");
  const [config, setConfig] = useState<ImportConfig>({ referenceMonth: month, mode: "full", defaultPaymentMethod: "", defaultPerson: data.currentMember || "" });
  const [file, setFile] = useState<File | null>(null), [fileHash, setFileHash] = useState(""), [sourceType, setSourceType] = useState<ImportSourceType>("xlsx");
  const [inspection, setInspection] = useState<TabularInspection | null>(null), [mapping, setMapping] = useState<ColumnMapping>({ amount: "" });
  const [rows, setRows] = useState<PreviewImportRow[]>([]), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState(""), [existingFile, setExistingFile] = useState(false);
  const [editing, setEditing] = useState<PreviewImportRow | null>(null), [editingAmount, setEditingAmount] = useState(""), [bulkCategory, setBulkCategory] = useState(""), [bulkPayment, setBulkPayment] = useState(""), [bulkPerson, setBulkPerson] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const headers = useMemo(() => ({ "Content-Type": "application/json", ...(householdId ? { "x-household-id": householdId } : {}) }), [householdId]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = rows.filter(row => row.selected);
  const selectedTotal = selected.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const expenseCategories = data.categories.filter(category => category.kind === "expense");

  async function chooseFile(nextFile: File) {
    setError(""); setBusy(true);
    try {
      const extension = nextFile.name.split(".").pop()?.toLowerCase() as ImportSourceType;
      if (!(["xlsx", "xls", "csv", "pdf"] as string[]).includes(extension)) throw new Error("Escolha um arquivo Excel, CSV ou PDF digital.");
      if (!config.referenceMonth) throw new Error("Escolha o mês de destino antes do arquivo.");
      setFile(nextFile); setSourceType(extension); setFileHash(await hashFile(nextFile));
      if (extension === "pdf") {
        const parsed = await parseDigitalPdf(nextFile);
        await requestPreview(parsedToRows(parsed), nextFile, await hashFile(nextFile), extension);
      } else {
        const result = await inspectTabularFile(nextFile);
        setInspection(result); setMapping(autoMapping(result.headers)); setStep("mapping");
      }
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }

  async function continueMapping() {
    if (!inspection || !file || !mapping.amount) return;
    setBusy(true); setError("");
    try { await requestPreview(parsedToRows(mapTabularRows(inspection, mapping)), file, fileHash, sourceType); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }

  function parsedToRows(parsed: ParsedImportRow[]): PreviewImportRow[] {
    return parsed.map(item => {
      const amountCents = parseImportedAmount(item.rawAmount);
      const occurredAt = config.mode === "full" ? parseImportedDate(item.rawDate, config.referenceMonth) : null;
      return { clientId: item.clientId, selected: Boolean(amountCents && amountCents > 0), amountCents, description: item.rawDescription?.trim() || null, occurredAt, categoryId: null, categoryReviewed: false, newCategoryName: null, learnCategory: false, paymentMethod: config.mode === "full" ? config.defaultPaymentMethod || null : null, person: config.mode === "full" ? config.defaultPerson || null : null, warnings: amountCents ? [] : ["invalid_amount"], fingerprint: null };
    });
  }

  async function requestPreview(nextRows: PreviewImportRow[], nextFile = file, nextHash = fileHash, nextType = sourceType) {
    if (!nextFile) throw new Error("Escolha novamente o arquivo.");
    const response = await fetch("/api/imports/preview", { method: "POST", headers, body: JSON.stringify({ fileName: nextFile.name, fileHash: nextHash, sourceType: nextType, mode: config.mode, referenceMonth: config.referenceMonth, defaultPaymentMethod: config.defaultPaymentMethod || null, defaultPerson: config.defaultPerson || null, rows: nextRows }) });
    const result = await response.json() as { rows?: PreviewImportRow[]; existingFile?: boolean; error?: string };
    if (!response.ok || !result.rows) throw new Error(result.error ?? "Não foi possível preparar a conferência.");
    setRows(result.rows); setExistingFile(Boolean(result.existingFile)); setStep("preview"); setPage(1);
  }

  function updateRow(id: string, changes: Partial<PreviewImportRow>) {
    setRows(current => current.map(row => row.clientId === id ? { ...row, ...changes } : row));
  }

  async function saveEditing() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const amountCents = parseImportedAmount(editingAmount);
      const edited = { ...editing, amountCents, selected: Boolean(amountCents && amountCents > 0) };
      const next = rows.map(row => row.clientId === editing.clientId ? edited : row);
      await requestPreview(next);
      setEditing(null);
    } catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }

  function openEditor(row: PreviewImportRow) {
    setEditing(row);
    setEditingAmount(row.amountCents == null ? "" : (row.amountCents / 100).toFixed(2).replace(".", ","));
  }

  function applyBulk() {
    setRows(current => current.map(row => row.selected ? { ...row, ...(bulkCategory ? { categoryId: bulkCategory === "uncategorized" ? null : Number(bulkCategory), categoryReviewed: true, newCategoryName: null, suggestedCategoryName: null, suggestionSource: null, learnCategory: bulkCategory !== "uncategorized" } : {}), ...(bulkPayment ? { paymentMethod: bulkPayment } : {}), ...(bulkPerson ? { person: bulkPerson } : {}) } : row));
  }

  async function confirmImport() {
    if (!file || !selected.length || busy) return;
    setBusy(true); setStep("confirming"); setError("");
    try {
      const response = await fetch("/api/imports", { method: "POST", headers, body: JSON.stringify({ fileName: file.name, fileHash, sourceType, mode: config.mode, referenceMonth: config.referenceMonth, defaultPaymentMethod: config.defaultPaymentMethod || null, defaultPerson: config.defaultPerson || null, rows }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível confirmar a importação.");
      setStep("complete"); setHistoryKey(key => key + 1); onImported();
    } catch (reason) { setError(messageOf(reason)); setStep("preview"); }
    finally { setBusy(false); }
  }

  function reset() {
    setStep("configure"); setFile(null); setInspection(null); setRows([]); setPage(1); setExistingFile(false); setError("");
  }

  const warningLabels = (row: PreviewImportRow) => row.warnings.map(warning => WARNING_LABELS[warning]);
  const categoryName = (row: PreviewImportRow) => row.newCategoryName || expenseCategories.find(category => category.id === row.categoryId)?.name || row.suggestedCategoryName || "Sem categoria";
  const paymentName = (key: string | null) => data.payments.find(payment => payment.key === key)?.name || "Não informado";

  return <section className="import-workspace" aria-labelledby="import-title"><div className="import-workspace-head"><div><h2 id="import-title">Importar gastos</h2><p>Revise tudo antes de adicionar à carteira.</p></div><button className="secondary" type="button" onClick={onClose}>Fechar</button></div>
    {error && <StatusNotice tone="error" message={error} onClose={() => setError("")}/>}
    {step === "configure" && <FileStep config={config} data={data} busy={busy} onChange={setConfig} onFile={file => void chooseFile(file)}/>}
    {step === "mapping" && inspection && <ColumnMapper fileName={file?.name ?? "Planilha"} headers={inspection.headers} mapping={mapping} minimal={config.mode === "minimal"} onChange={setMapping} onBack={reset} onContinue={() => void continueMapping()}/>}
    {(step === "preview" || step === "confirming") && <div className="import-review">{existingFile && <div className="import-alert" role="status"><b>Este arquivo já foi importado antes.</b><span>Confira as possíveis duplicidades antes de continuar.</span></div>}<div className="import-review-summary"><div><span>Selecionados</span><strong>{selected.length} de {rows.length}</strong></div><div><span>Total selecionado</span><strong>{formatMoney(selectedTotal)}</strong></div><label className="select-all"><input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={event => setRows(current => current.map(row => ({ ...row, selected: event.target.checked && Boolean(row.amountCents && row.amountCents > 0) })))} />Selecionar todos os valores válidos</label></div>{config.mode === "full" && <div className="bulk-editor"><label>Categoria<select value={bulkCategory} onChange={event => setBulkCategory(event.target.value)}><option value="">Manter atual</option><option value="uncategorized">Sem categoria</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Pagamento<select value={bulkPayment} onChange={event => setBulkPayment(event.target.value)}><option value="">Manter atual</option>{data.payments.map(payment => <option key={payment.id} value={payment.key}>{payment.name}</option>)}</select></label><label>Pessoa<select value={bulkPerson} onChange={event => setBulkPerson(event.target.value)}><option value="">Manter atual</option>{data.members.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}</select></label><button className="secondary" type="button" onClick={applyBulk}>Aplicar aos selecionados</button></div>}<PreviewTable rows={visibleRows} minimal={config.mode === "minimal"} categoryName={categoryName} paymentName={paymentName} warningLabels={warningLabels} onToggle={(id, value) => updateRow(id, { selected: value })} onEdit={openEditor}/><PreviewCards rows={visibleRows} minimal={config.mode === "minimal"} categoryName={categoryName} warningLabels={warningLabels} onToggle={(id, value) => updateRow(id, { selected: value })} onEdit={openEditor}/>{pageCount > 1 && <nav className="import-pagination" aria-label="Páginas da conferência"><button className="secondary" type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {pageCount}</span><button className="secondary" type="button" disabled={page === pageCount} onClick={() => setPage(value => value + 1)}>Próxima</button></nav>}<div className="import-actions"><button className="secondary" type="button" disabled={busy} onClick={reset}>Trocar arquivo</button><button className="primary" type="button" disabled={busy || !selected.length} onClick={() => void confirmImport()}>{busy ? "Confirmando…" : "Confirmar importação"}</button></div></div>}
    {step === "complete" && <div className="import-complete"><span aria-hidden="true">✓</span><h3>Importação concluída</h3><p>Os gastos já foram somados ao mês de {config.referenceMonth.split("-").reverse().join("/")}.</p><button className="primary" type="button" onClick={reset}>Importar outro arquivo</button></div>}
    <ImportHistory month={config.referenceMonth} headers={headers} refreshKey={historyKey} onDeleted={() => { setHistoryKey(key => key + 1); onImported(); }}/>
    {editing && <DialogFrame titleId="import-row-edit-title" title="Editar gasto importado" description="As mesmas validações dos gastos manuais são aplicadas ao valor." onClose={() => setEditing(null)} footer={<><button className="secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary" type="button" disabled={busy} onClick={() => void saveEditing()}>Salvar alteração</button></>}><div className="import-row-editor"><label>Local ou descrição<input value={editing.description ?? ""} maxLength={160} onChange={event => setEditing({ ...editing, description: event.target.value || null })}/></label><label>Valor<input inputMode="decimal" value={editingAmount} onChange={event => setEditingAmount(event.target.value)}/></label>{config.mode === "full" && <><label>Data<input type="date" min="2000-01-01" max="2200-12-31" value={editing.occurredAt ?? ""} onChange={event => setEditing({ ...editing, occurredAt: event.target.value || null })}/></label><label>Categoria<select value={editing.categoryId ?? ""} onChange={event => setEditing({ ...editing, categoryId: event.target.value ? Number(event.target.value) : null, newCategoryName: null, suggestedCategoryName: null, suggestionSource: null, learnCategory: Boolean(event.target.value), categoryReviewed: true })}><option value="">Sem categoria</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Ou criar categoria<input value={editing.newCategoryName ?? ""} maxLength={60} placeholder="Ex.: Saúde" onChange={event => setEditing({ ...editing, newCategoryName: event.target.value || null, categoryId: null, suggestedCategoryName: null, suggestionSource: null, learnCategory: Boolean(event.target.value), categoryReviewed: true })}/></label><label>Pagamento<select value={editing.paymentMethod ?? ""} onChange={event => setEditing({ ...editing, paymentMethod: event.target.value || null })}><option value="">Não informado</option>{data.payments.map(payment => <option key={payment.id} value={payment.key}>{payment.name}</option>)}</select></label><label>Pessoa<select value={editing.person ?? ""} onChange={event => setEditing({ ...editing, person: event.target.value || null })}><option value="">Não informado</option>{data.members.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}</select></label></>}</div></DialogFrame>}
  </section>;
}

function autoMapping(headers: string[]): ColumnMapping {
  const find = (terms: string[]) => headers.find(header => terms.some(term => header.toLocaleLowerCase("pt-BR").includes(term)));
  return { amount: find(["valor", "total", "amount", "preço", "preco"]) ?? "", description: find(["descr", "local", "estabelecimento", "origem", "nome"]), date: find(["data", "date"]) };
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : "Não foi possível processar o arquivo.";
}
