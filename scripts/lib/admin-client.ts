import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/** Service-role client for local scripts only. Bypasses RLS. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Reads every row of a table, paging past PostgREST's 1000-row cap. */
export async function fetchAll<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(columns).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < page) return rows;
  }
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function positional(): string[] {
  return process.argv.slice(2).filter((a) => !a.startsWith("--"));
}
