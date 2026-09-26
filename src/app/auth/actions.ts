"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; sent?: string } | null;

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** Only allow same-site relative paths as post-login destinations. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function sendMagicLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const next = safeNext(form.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      // Only invite links may create new accounts; /login is for existing members.
      shouldCreateUser: next.startsWith("/invite/"),
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    console.error(error);
    return {
      error: next.startsWith("/invite/")
        ? "Couldn't send the link. Try again in a minute."
        : "Couldn't send a link to that address. If you're new, use the invite link a friend sent you.",
    };
  }
  return { sent: email.data };
}

export async function redeemInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = z.string().trim().min(1).max(40).safeParse(form.get("display_name"));
  if (!name.success) return { error: "Pick a name between 1 and 40 characters." };
  const code = String(form.get("code") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_invite", { p_code: code, p_display_name: name.data });
  if (error) {
    return { error: error.message.includes("invalid or expired") ? "This invite has expired or was already used." : "Couldn't join. Try again." };
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
