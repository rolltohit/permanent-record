"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  classifySendError,
  classifyVerifyError,
  cleanCode,
  isInviteCode,
  isPlausibleCode,
  joinTarget,
  safeNext,
  SEND_MESSAGES,
  VERIFY_MESSAGES,
} from "@/lib/auth-flow";
import { finishSignIn, inviteDetails, siteOrigin } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

export type FlowResult = { ok: true; email: string; resent?: boolean } | { ok: false; error: string; field?: "email" | "name" | "code" };

const email = z.string().trim().toLowerCase().email();
const name = z.string().trim().max(40, "Names are up to 40 characters.");

/** Step 1: email a sign-in code (and a one-tap link) to this address. */
export async function sendCodeAction(input: {
  email: string;
  name?: string;
  invite?: string | null;
  next?: string;
}): Promise<FlowResult> {
  const parsedEmail = email.safeParse(input.email);
  if (!parsedEmail.success) return { ok: false, field: "email", error: SEND_MESSAGES.bad_email };
  const parsedName = name.safeParse(input.name ?? "");
  if (!parsedName.success) return { ok: false, field: "name", error: parsedName.error.issues[0].message };
  const invite = isInviteCode(input.invite) ? input.invite : null;

  const supabase = await createClient();

  // Only people with an invite may create an account: the invite they came
  // from, or one addressed to this email.
  let allowNew = false;
  if (invite) {
    const details = await inviteDetails(supabase, invite).catch(() => null);
    allowNew = details?.status === "open";
  }
  if (!allowNew) {
    const { data } = await supabase.rpc("invite_open_for_email", { p_email: parsedEmail.data });
    allowNew = Boolean(data);
  }

  const target = joinTarget({ invite, name: parsedName.data, next: input.next });
  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail.data,
    options: {
      shouldCreateUser: allowNew,
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?${new URLSearchParams({ next: target })}`,
      data: parsedName.data ? { display_name: parsedName.data } : undefined,
    },
  });
  if (!error) return { ok: true, email: parsedEmail.data };

  const kind = classifySendError(error);
  // A code went out moments ago: move on to entering it rather than failing.
  if (kind === "recently_sent") return { ok: true, email: parsedEmail.data, resent: false };
  if (kind === "unknown") console.error(error);
  return { ok: false, field: kind === "bad_email" || kind === "not_invited" ? "email" : undefined, error: SEND_MESSAGES[kind] };
}

/** Step 2: check the code, sign in, join if needed, and go to the app. */
export async function verifyCodeAction(input: {
  email: string;
  code: string;
  name?: string;
  invite?: string | null;
  next?: string;
}): Promise<FlowResult> {
  const parsedEmail = email.safeParse(input.email);
  if (!parsedEmail.success) return { ok: false, field: "email", error: SEND_MESSAGES.bad_email };
  const code = cleanCode(input.code);
  if (!isPlausibleCode(code)) return { ok: false, field: "code", error: "Enter the code from the email. It's a 6 to 8 digit number." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsedEmail.data, token: code, type: "email" });
  if (error) {
    const kind = classifyVerifyError(error);
    if (kind === "unknown") console.error(error);
    return { ok: false, field: "code", error: VERIFY_MESSAGES[kind] };
  }

  const invite = isInviteCode(input.invite) ? input.invite : null;
  redirect(await finishSignIn(supabase, { invite, name: input.name?.trim() || null, next: safeNext(input.next) }));
}

/** For someone already signed in but not yet a member (invite page or /welcome). */
export async function joinAction(input: { invite?: string | null; name: string }): Promise<FlowResult> {
  const parsedName = name.safeParse(input.name);
  if (!parsedName.success) return { ok: false, field: "name", error: parsedName.error.issues[0].message };
  const invite = isInviteCode(input.invite) ? input.invite : null;

  const supabase = await createClient();
  const path = await finishSignIn(supabase, { invite, name: parsedName.data || null, next: "/" });
  if (path === "/login") redirect("/login");
  if (path.startsWith("/invite/") || path === "/welcome") {
    return { ok: false, error: "That invite has expired or was already used. Ask whoever invited you for a new link." };
  }
  redirect(path);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
