import { headers } from "next/headers";
import { FinanceDashboard } from "./components/finance-dashboard";
import { adjacentMonths } from "./lib/finance-client";
import { loadFinanceData } from "./lib/server/finance-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const month = saoPauloMonth();
  const requestHeaders = await headers();
  const request = new Request(initialRequestUrl(requestHeaders), { headers: requestHeaders });
  let initialFinance = null;

  try {
    initialFinance = {
      month,
      payload: await loadFinanceData(request, month, [month, ...adjacentMonths(month)].sort().join(",")),
    };
  } catch {
    // The browser API remains the fallback for transient database/runtime errors.
  }

  return <FinanceDashboard initialFinance={initialFinance}/>;
}

function saoPauloMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")!.value;
  const month = parts.find(part => part.type === "month")!.value;
  return `${year}-${month}`;
}

function initialRequestUrl(requestHeaders: Headers) {
  const host = requestHeaders.get("host") ?? "painel-financas.maioranoo.chatgpt.site";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}/`;
}
