import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { parseJoinTarget } from "@/lib/auth-flow";
import { finishSignIn } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The host the browser used (nextUrl.origin can differ behind a proxy or in dev). */
function browserOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/**
 * Finishes an email-link sign-in. If the link itself fails (opened twice, or a
 * mail scanner used it first) but the browser is already signed in, carry on
 * anyway; otherwise go back to the page they started from with a hint.
 */
export async function completeEmailLink(
  request: NextRequest,
  verify: (supabase: Supabase) => Promise<{ error: unknown }>,
): Promise<NextResponse> {
  const origin = browserOrigin(request);
  const target = parseJoinTarget(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();

  const { error } = await verify(supabase);
  if (error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const back = new URL(target.invite ? `/invite/${target.invite}` : "/login", origin);
      back.searchParams.set("error", "link");
      if (!target.invite && target.next !== "/") back.searchParams.set("next", target.next);
      return NextResponse.redirect(back);
    }
  }
  return NextResponse.redirect(new URL(await finishSignIn(supabase, target), origin));
}
