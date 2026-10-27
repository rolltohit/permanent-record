import type { NextRequest } from "next/server";
import { completeEmailLink } from "@/lib/auth-link";

// Older magic links carry a PKCE code, which only works in the browser that
// asked for it. Kept so links already sent keep working; new emails use
// /auth/confirm.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  return completeEmailLink(request, async (supabase) =>
    code ? supabase.auth.exchangeCodeForSession(code) : { error: new Error("missing code") },
  );
}
