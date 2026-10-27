import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { completeEmailLink } from "@/lib/auth-link";

// Email links land here with a one-time token hash. Unlike the older PKCE
// links (/auth/callback), these work in any browser, including the one inside
// a mail app, so opening the email on another device is fine.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = (request.nextUrl.searchParams.get("type") ?? "email") as EmailOtpType;
  return completeEmailLink(request, async (supabase) =>
    tokenHash ? supabase.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error("missing token") },
  );
}
