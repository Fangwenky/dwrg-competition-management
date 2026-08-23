import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 未配置");

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
export const sqlClient = globalForDb.sql ?? postgres(url, { max: 8, idle_timeout: 20, connect_timeout: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sqlClient;
export const db = drizzle(sqlClient, { schema });
