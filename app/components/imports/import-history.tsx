"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate, formatMoney } from "../../lib/finance-ui";
import { EmptyState } from "../ui";

const HISTORY_PAGE_SIZE = 50;

type ImportBatch = { id: number; originalFilename: string; sourceType: string; mode: string; referenceMonth: string; importedByName: string; itemCount: number; totalCents: number; createdAt: string };
type ImportItem = { id: number; amountCents: number; description: string | null; occurredAt: string | null; category: string | null; paymentMethod: string | null; person: string | null };

export function ImportHistory({ month, headers, refreshKey, onDeleted }: { month: string; headers: Record<string, string>; refreshKey: number; onDeleted: () => void }) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openBatchId, setOpenBatchId] = useState<number | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const itemsRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch(`/api/imports?month=${month}`, { headers })
      .then(async response => ({ response, result: await response.json() as { batches?: ImportBatch[]; error?: string } }))
      .then(({ response, result }) => {
        if (!active) return;
        if (!response.ok) throw new Error(result.error);
        setBatches(result.batches ?? []);
        setError("");
        setLoading(false);
        setOpenBatchId(null);
        setItems([]);
        setItemsPage(1);
        itemsRequestId.current += 1;
      })
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível carregar as importações.");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [headers, month, refreshKey]);

  async function loadItems(batch: ImportBatch, page: number) {
    const requestId = ++itemsRequestId.current;
    setItemsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/imports?batchId=${batch.id}&page=${page}`, { headers });
      const result = await response.json() as { items?: ImportItem[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os itens.");
      if (requestId !== itemsRequestId.current) return;
      setItems(result.items ?? []);
      setItemsPage(page);
    } catch (reason) {
      if (requestId !== itemsRequestId.current) return;
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os itens.");
      setOpenBatchId(null);
    } finally {
      if (requestId === itemsRequestId.current) setItemsLoading(false);
    }
  }

  async function toggleItems(batch: ImportBatch) {
    if (openBatchId === batch.id) {
      itemsRequestId.current += 1;
      setOpenBatchId(null);
      setItems([]);
      setItemsPage(1);
      return;
    }
    setOpenBatchId(batch.id);
    setItems([]);
    setItemsPage(1);
    await loadItems(batch, 1);
  }

  async function remove(batch: ImportBatch) {
    if (!confirm(`Excluir a importação “${batch.originalFilename}” com ${batch.itemCount} item(ns)?`)) return;
    const response = await fetch(`/api/imports?id=${batch.id}`, { method: "DELETE", headers });
    const result = await response.json() as { error?: string };
    if (!response.ok) return setError(result.error ?? "Não foi possível excluir a importação.");
    setBatches(current => current.filter(item => item.id !== batch.id));
    itemsRequestId.current += 1;
    setOpenBatchId(null);
    setItems([]);
    setItemsPage(1);
    onDeleted();
  }

  return <section className="import-history">
    <div className="import-section-heading"><div><h3>Importações deste mês</h3><p>Consulte os itens ou exclua um arquivo inteiro.</p></div></div>
    {loading ? <p className="import-muted">Carregando histórico…</p> : error ? <p className="field-error" role="alert">{error}</p> : batches.length ? <div className="import-batch-list">{batches.map(batch => {
      const pageCount = Math.max(1, Math.ceil(batch.itemCount / HISTORY_PAGE_SIZE));
      return <article key={batch.id} className="import-batch">
        <div className="import-batch-summary">
          <div><b>{batch.originalFilename}</b><span>{batch.itemCount} itens · {batch.importedByName} · {new Date(batch.createdAt).toLocaleDateString("pt-BR")}</span></div>
          <strong>{formatMoney(batch.totalCents)}</strong>
          <div className="import-batch-actions"><button type="button" className="secondary" aria-expanded={openBatchId === batch.id} onClick={() => void toggleItems(batch)}>{openBatchId === batch.id ? "Ocultar itens" : "Ver itens"}</button><button type="button" className="secondary danger-text" onClick={() => void remove(batch)}>Excluir importação</button></div>
        </div>
        {openBatchId === batch.id && <div className="import-batch-items">
          <h4>Itens de {batch.originalFilename}</h4>
          {itemsLoading ? <p className="import-muted">Carregando itens…</p> : items.length ? <>
            <div className="import-batch-items-list">{items.map(item => <div key={item.id}><span>{item.description || "Sem descrição"}</span><small>{item.occurredAt ? formatDate(item.occurredAt) : "Sem data"} · {item.category || "Sem categoria"} · {item.paymentMethod || "Não informado"} · {item.person || "Não informado"}</small><b>{formatMoney(item.amountCents)}</b></div>)}</div>
            {pageCount > 1 && <nav className="import-pagination" aria-label="Páginas dos itens importados"><button className="secondary" type="button" disabled={itemsPage === 1 || itemsLoading} onClick={() => void loadItems(batch, itemsPage - 1)}>Anterior</button><span>Página {itemsPage} de {pageCount}</span><button className="secondary" type="button" disabled={itemsPage === pageCount || itemsLoading} onClick={() => void loadItems(batch, itemsPage + 1)}>Próxima</button></nav>}
          </> : <p className="import-muted">Nenhum item encontrado.</p>}
        </div>}
      </article>;
    })}</div> : <EmptyState icon="report" title="Nenhuma importação neste mês" description="Os arquivos confirmados aparecerão aqui."/>}
  </section>;
}
