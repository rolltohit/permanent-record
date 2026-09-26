import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic links land here with a PKCE code, which we swap for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  // Redirect back to the host the browser used (nextUrl.origin can differ in
  // dev), or the session cookie we just set won't be sent.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
