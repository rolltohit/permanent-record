import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { completeEmailLink } from "@/lib/auth-link";

// Email links land here. Our template (supabase/templates/sign-in.html) links
// with a one-time token hash, which works in any browser, including the one
// inside a mail app. Supabase's default template instead goes through its own
// verify page and comes back with a PKCE `code`, which only works in the
// browser that asked for it. Accept both, so sign-in works whichever template
// the project has.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const type = (params.get("type") ?? "email") as EmailOtpType;
  return completeEmailLink(request, async (supabase) => {
    if (tokenHash) return supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (code) return supabase.auth.exchangeCodeForSession(code);
    return { error: new Error("missing token") };
  });
}
