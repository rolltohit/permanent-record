// Pure helpers for sign-in and joining. Shared by server actions, the email
// link route and client components, so nothing here touches the network.

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(next: unknown): string {
  const value = typeof next === "string" ? next.trim() : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

const INVITE_CODE = /^[A-Za-z0-9_-]{4,64}$/;

export function isInviteCode(code: unknown): code is string {
  return typeof code === "string" && INVITE_CODE.test(code);
}

/**
 * Finds an invite code in whatever someone pastes: a full invite link (with or
 * without https://, with a trailing slash or text around it) or the bare code.
 */
export function inviteCodeFrom(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/\/invite\/([A-Za-z0-9_-]+)/);
  if (fromLink && isInviteCode(fromLink[1])) return fromLink[1];
  return isInviteCode(text) ? text : null;
}

/** Where an email link sends someone: the invite page (with their name) or any other page. */
export function joinTarget(opts: { invite?: string | null; name?: string | null; next?: string | null }): string {
  if (opts.invite && isInviteCode(opts.invite)) {
    const name = opts.name?.trim();
    return `/invite/${opts.invite}${name ? `?${new URLSearchParams({ name })}` : ""}`;
  }
  return safeNext(opts.next);
}

/** The reverse of joinTarget, used when an email link comes back. */
export function parseJoinTarget(next: unknown): { invite: string | null; name: string | null; next: string } {
  const path = safeNext(next);
  const url = new URL(path, "http://x");
  const match = url.pathname.match(/^\/invite\/([^/]+)$/);
  const invite = match && isInviteCode(match[1]) ? match[1] : null;
  const name = url.searchParams.get("name")?.trim() || null;
  return { invite, name: name ? name.slice(0, 40) : null, next: path };
}

/** Email codes are 6–10 digits; people paste them with spaces or dashes. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function isPlausibleCode(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

const has = (e: AuthErrorLike, ...needles: string[]) =>
  needles.some((n) => e?.code === n || (e?.message ?? "").toLowerCase().includes(n.toLowerCase()));

export type SendFailure = "not_invited" | "recently_sent" | "email_limit" | "bad_email" | "unknown";

/** Classifies a Supabase error from signInWithOtp. */
export function classifySendError(e: AuthErrorLike): SendFailure {
  if (has(e, "otp_disabled", "signup_disabled", "signups not allowed")) return "not_invited";
  if (has(e, "over_request_rate_limit", "only request this after", "for security purposes")) return "recently_sent";
  if (has(e, "over_email_send_rate_limit", "email rate limit")) return "email_limit";
  if (e?.status === 429) return "email_limit";
  if (has(e, "email_address_invalid", "validation_failed", "invalid format")) return "bad_email";
  return "unknown";
}

export const SEND_MESSAGES: Record<Exclude<SendFailure, "recently_sent">, string> = {
  not_invited:
    "There's no Rec Room account for that email yet. Rec Room is invite-only: open the invite link a friend sent you, or ask them to invite this address.",
  email_limit:
    "Rec Room has sent too many emails in the last hour, so this one was held back. Please try again in a little while.",
  bad_email: "That email address doesn't look right. Check it and try again.",
  unknown: "Couldn't send the email just now. Check your connection and try again.",
};

export type VerifyFailure = "wrong_or_expired" | "too_many" | "unknown";

/** Classifies a Supabase error from verifyOtp. */
export function classifyVerifyError(e: AuthErrorLike): VerifyFailure {
  if (e?.status === 429 || has(e, "rate limit")) return "too_many";
  if (has(e, "otp_expired", "token has expired", "invalid")) return "wrong_or_expired";
  return "unknown";
}

export const VERIFY_MESSAGES: Record<VerifyFailure, string> = {
  wrong_or_expired: "That code didn't work. Check for a typo, or send yourself a new code. Only the newest code works.",
  too_many: "Too many tries in a row. Wait a minute, then try again.",
  unknown: "Couldn't check the code just now. Check your connection and try again.",
};

/** The message an admin sends a friend along with their invite link. */
export function inviteMessage(link: string, friendName?: string | null): string {
  const hi = friendName?.trim() ? `Hey ${friendName.trim()}! ` : "";
  return `${hi}Join me on Rec Room, where we swap music recommendations. Open this link to join (it takes a minute): ${link}`;
}
