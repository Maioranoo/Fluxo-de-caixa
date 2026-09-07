import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { categories, expenses } from "../../../db/schema";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0,7);
  const start = `${month}-01`, end = nextMonth(month);
  const db = getDb();
  const [categoryRows, expenseRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select({ id:expenses.id, amountCents:expenses.amountCents, description:expenses.description, categoryId:expenses.categoryId, category:categories.name, paymentMethod:expenses.paymentMethod, person:expenses.person, occurredAt:expenses.occurredAt })
      .from(expenses).innerJoin(categories, eq(expenses.categoryId,categories.id)).where(and(gte(expenses.occurredAt,start),lt(expenses.occurredAt,end))).orderBy(asc(expenses.occurredAt),asc(expenses.id))
  ]);
  return Response.json({ categories:categoryRows, expenses:expenseRows });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string,string>;
  const db = getDb();
  if (body.type === "category") {
    const name = body.name?.trim(); if (!name) return Response.json({error:"Informe o nome da categoria."},{status:400});
    try { const [category] = await db.insert(categories).values({name}).returning(); return Response.json({category},{status:201}); }
    catch { return Response.json({error:"Essa categoria já existe."},{status:409}); }
  }
  const amountCents = parseMoney(body.amount); const categoryId = Number(body.categoryId);
  if (!amountCents || !body.description?.trim() || !categoryId || !body.occurredAt || !body.paymentMethod || !["João","Dena"].includes(body.person)) return Response.json({error:"Preencha todos os campos corretamente."},{status:400});
  const [expense] = await db.insert(expenses).values({amountCents,description:body.description.trim(),categoryId,paymentMethod:body.paymentMethod,person:body.person,occurredAt:body.occurredAt}).returning();
  return Response.json({expense},{status:201});
}

export async function DELETE(request: Request) {
  const url = new URL(request.url), id = Number(url.searchParams.get("id"));
  if (!id || url.searchParams.get("type") !== "expense") return Response.json({error:"Solicitação inválida."},{status:400});
  await getDb().delete(expenses).where(eq(expenses.id,id)); return Response.json({ok:true});
}

function parseMoney(value="") { const cleaned=value.replace(/R\$\s?/i,"").trim(); const normalized=cleaned.includes(",")?cleaned.replace(/\./g,"").replace(",","."):cleaned; const n=Number(normalized); return Number.isFinite(n)&&n>0?Math.round(n*100):null; }
function nextMonth(month:string) { const [year,m]=month.split("-").map(Number); const d=new Date(year,m,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
