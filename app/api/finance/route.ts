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
  const amountCents = parseMoney(body.amount), categoryId = Number(body.categoryId);
  const paymentMethods = ["cartao_joao","cartao_dena","pix","boleto","caju"], isCard = body.paymentMethod === "cartao_joao" || body.paymentMethod === "cartao_dena";
  const installmentCount = isCard ? Number(body.installments ?? "1") : 1;
  if (!amountCents || !body.description?.trim() || !categoryId || !body.occurredAt || !paymentMethods.includes(body.paymentMethod) || !["João","Dena"].includes(body.person) || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60 || installmentCount > amountCents) return Response.json({error:"Preencha todos os campos corretamente."},{status:400});
  const baseAmount = Math.floor(amountCents / installmentCount), remainder = amountCents % installmentCount;
  const rows = Array.from({length:installmentCount},(_,index)=>({
    amountCents:baseAmount + (index < remainder ? 1 : 0),
    description:installmentCount > 1 ? `${body.description.trim()} (${index + 1}/${installmentCount})` : body.description.trim(),
    categoryId,paymentMethod:body.paymentMethod,person:body.person,occurredAt:addMonths(body.occurredAt,index)
  }));
  const createdExpenses = await db.insert(expenses).values(rows).returning();
  return Response.json({expenses:createdExpenses,installments:installmentCount},{status:201});
}

export async function PATCH(request: Request) {
  const body = await request.json() as Record<string,string>;
  const id = Number(body.id), name = body.name?.trim();
  if (body.type !== "category" || !id || !name) return Response.json({error:"Informe um nome válido."},{status:400});
  try {
    const [category] = await getDb().update(categories).set({name}).where(eq(categories.id,id)).returning();
    if (!category) return Response.json({error:"Categoria não encontrada."},{status:404});
    return Response.json({category});
  } catch { return Response.json({error:"Já existe uma categoria com esse nome."},{status:409}); }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url), id = Number(url.searchParams.get("id")), type = url.searchParams.get("type");
  if (!id || !["expense","category"].includes(type ?? "")) return Response.json({error:"Solicitação inválida."},{status:400});
  const db = getDb();
  if (type === "expense") { await db.delete(expenses).where(eq(expenses.id,id)); return Response.json({ok:true}); }
  const linked = await db.select({id:expenses.id}).from(expenses).where(eq(expenses.categoryId,id)).limit(1);
  if (linked.length) return Response.json({error:"Essa categoria possui gastos. Exclua esses gastos antes de apagar a categoria."},{status:409});
  await db.delete(categories).where(eq(categories.id,id)); return Response.json({ok:true});
}

function parseMoney(value="") { const cleaned=value.replace(/R\$\s?/i,"").trim(); const normalized=cleaned.includes(",")?cleaned.replace(/\./g,"").replace(",","."):cleaned; const n=Number(normalized); return Number.isFinite(n)&&n>0?Math.round(n*100):null; }
function nextMonth(month:string) { const [year,m]=month.split("-").map(Number); const d=new Date(year,m,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function addMonths(date:string,offset:number) { const [year,month,day]=date.split("-").map(Number); const first=new Date(Date.UTC(year,month-1+offset,1)); const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(); return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`; }
