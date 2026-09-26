function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

// The group's Supabase project. The URL is public (it ships to the browser anyway),
// so it's the fallback when no URL variable is set. An explicit env var always wins.
export const DEFAULT_SUPABASE_URL = "https://psmnhuxmhjhcnqhkhfpu.supabase.co";

// NEXT_PUBLIC_* must be referenced literally so Next can inline them.
// SUPABASE_URL is set by the Vercel Supabase integration (server-side only).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
// Newer Supabase projects (and the Vercel integration) may only provide the publishable key.
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)", supabaseAnonKey),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
};

/** Names of the Supabase settings the app can't run without, if any are missing. */
export function missingSupabaseEnv(): string[] {
  return [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((n): n is string => Boolean(n));
}
