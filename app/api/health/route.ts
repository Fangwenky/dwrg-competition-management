import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", service: "dwrg", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error", service: "dwrg" }, { status: 503 });
  }
}
