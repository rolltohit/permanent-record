import "server-only";
import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export type InviteStatus = "open" | "used" | "expired" | "missing";
export interface InviteDetails {
  status: InviteStatus;
  name?: string | null;
  email?: string | null;
  inviter?: string | null;
  used_by_me?: boolean;
}

export async function inviteDetails(supabase: Supabase, code: string): Promise<InviteDetails> {
  const { data, error } = await supabase.rpc("invite_details", { p_code: code });
  if (error) throw error;
  return data as InviteDetails;
}

/**
 * Runs after someone proves they own their email (code or link). Makes them a
 * member if they aren't yet: first with the invite they came from, then with
 * any invite addressed to their email. Returns where to send them.
 */
export async function finishSignIn(
  supabase: Supabase,
  opts: { invite: string | null; name: string | null; next: string },
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) return opts.invite ? "/" : opts.next;

  const typed = opts.name?.trim() || (user.user_metadata?.display_name as string | undefined)?.trim() || null;
  if (opts.invite) {
    const { error } = await supabase.rpc("redeem_invite", { p_code: opts.invite, p_display_name: typed });
    if (!error) return "/?joined=1";
    if (!error.message.includes("invalid or expired")) console.error(error);
  }
  const { data: claimed, error } = await supabase.rpc("claim_email_invite", { p_display_name: typed });
  if (error) console.error(error);
  if (claimed) return "/?joined=1";
  return opts.invite ? `/invite/${opts.invite}` : "/welcome";
}
