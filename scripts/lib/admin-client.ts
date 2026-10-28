import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { DEFAULT_SUPABASE_URL } from "@/lib/env";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Service-role client for scripts only. Bypasses RLS. The URL falls back like
 * the app's (SUPABASE_URL, then the group's project), so a cloud session with
 * just SUPABASE_SERVICE_ROLE_KEY set works; the seed script still refuses
 * anything but a local URL.
 */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY (in .env.local, or the cloud environment's variables). See .env.example.");
    process.exit(1);
  }
  console.error(`Supabase: ${new URL(url).host}`);
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
