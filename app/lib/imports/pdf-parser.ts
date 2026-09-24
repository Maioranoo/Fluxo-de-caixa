import { assertFileSize, MAX_IMPORT_ROWS } from "./validation.ts";
import type { ParsedImportRow } from "./types.ts";

export function parseStatementLines(lines: string[]): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const amountAtEnd = /(?:R\$\s*)?(\(?-?\d[\d.]*,\d{2}\)?|-?\d[\d,]*\.\d{2})\s*$/;
  for (const source of lines) {
    const line = source.replace(/\s+/g, " ").trim();
    const amount = amountAtEnd.exec(line);
    if (!amount) continue;
    const beforeAmount = line.slice(0, amount.index).trim();
    const date = /^(\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?)\s+/.exec(beforeAmount);
    const rawDate = date?.[1] ?? null;
    const rawDescription = beforeAmount.slice(date?.[0].length ?? 0).trim() || null;
    rows.push({ clientId: `linha-${rows.length + 1}`, rawDate, rawDescription, rawAmount: amount[1] });
    if (rows.length > MAX_IMPORT_ROWS) throw new Error("O arquivo deve ter no máximo 5.000 linhas.");
  }
  return rows.map(row => ({ ...row, rawDate: row.rawDate ?? null }));
}

export async function parseDigitalPdf(file: File): Promise<ParsedImportRow[]> {
  assertFileSize(file);
  type PromiseTry = <T, U extends unknown[]>(callback: (...args: U) => T | PromiseLike<T>, ...args: U) => Promise<Awaited<T>>;
  const promiseConstructor = Promise as unknown as { try?: PromiseTry };
  promiseConstructor.try ??= (callback, ...args) => Promise.resolve(callback(...args));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const tokens = content.items
      .flatMap(item => "str" in item ? [{ text: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }] : [])
      .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
    let currentY: number | null = null, current: string[] = [];
    for (const token of tokens) {
      if (currentY !== null && Math.abs(currentY - token.y) > 2) { lines.push(current.join(" ")); current = []; }
      currentY = token.y;
      current.push(token.text);
    }
    if (current.length) lines.push(current.join(" "));
  }
  const rows = parseStatementLines(lines);
  if (!rows.length) throw new Error("Não encontramos gastos neste PDF digital. Tente CSV, Excel ou outro PDF com texto selecionável.");
  return rows;
}
