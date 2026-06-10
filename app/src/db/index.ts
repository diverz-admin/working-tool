import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false, // Supabase 트랜잭션 풀러(pgBouncer)와 호환
});

export const db = drizzle(client, { schema });
