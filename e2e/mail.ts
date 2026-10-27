import { expect } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324";

export async function clearMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

async function latestMessage(email: string): Promise<{ html: string; subject: string }> {
  let found: { html: string; subject: string } | undefined;
  await expect
    .poll(async () => {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
      if (!list.messages?.length) return false;
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      found = { html: msg.HTML ?? "", subject: msg.Subject };
      return true;
    })
    .toBe(true);
  return found!;
}

/** The newest sign-in email to `email` from our template: its code and its one-tap link. */
export async function latestSignInEmail(email: string): Promise<{ code: string; link: string; subject: string }> {
  const { html, subject } = await latestMessage(email);
  const code = html.match(/letter-spacing: 8px">\s*(\d{6,10})\s*</)?.[1];
  const link = html.match(/href="([^"]*token_hash[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!code || !link) throw new Error("No code in the email. Is supabase/templates/sign-in.html configured?");
  return { code, link, subject };
}

/** The sign-in link in the newest email, whichever template sent it. */
export async function latestSignInLink(email: string): Promise<string> {
  const { html } = await latestMessage(email);
  const link = html.match(/href="([^"]*(?:token_hash|\/auth\/v1\/verify)[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!link) throw new Error("No sign-in link in the email");
  return link;
}
