import { expect } from "@playwright/test";

const MAILPIT = "http://127.0.0.1:54324";

export async function clearMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

/** The newest sign-in email to `email`: its code and its one-tap link. */
export async function latestSignInEmail(email: string): Promise<{ code: string; link: string; subject: string }> {
  let found: { code: string; link: string; subject: string } | undefined;
  await expect
    .poll(async () => {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
      if (!list.messages?.length) return false;
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      const html: string = msg.HTML ?? "";
      const code = html.match(/letter-spacing: 8px">\s*(\d{6,10})\s*</)?.[1];
      const link = html.match(/href="([^"]*token_hash[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
      if (code && link) found = { code, link, subject: msg.Subject };
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}
