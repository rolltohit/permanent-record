function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next can inline them.
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
};
