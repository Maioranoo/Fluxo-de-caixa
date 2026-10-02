import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the first render loads finance data on the server and hands it to the client", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/components/finance-dashboard.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8");
  const loader = await readFile(new URL("../app/lib/server/finance-data.ts", import.meta.url), "utf8");

  assert.match(page, /loadFinanceData/);
  assert.match(page, /initialFinance=/);
  assert.match(dashboard, /client\.prime/);
  assert.match(loader, /requireHousehold\(request\)/);
  assert.match(route, /loadFinanceData\(request/);
});
