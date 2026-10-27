/**
 * npm run auth:push-emails [-- --dry-run]
 *
 * Copies the sign-in email (supabase/templates/sign-in.html) to the hosted
 * Supabase project and sets 6-digit codes, matching supabase/config.toml.
 * Needs SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { DEFAULT_SUPABASE_URL } from "@/lib/env";
import { flag } from "../lib/admin-client";

config({ path: [".env.local", ".env"], quiet: true });

const SUBJECT = "Your Rec Room code";

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com/dashboard/account/tokens).");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const html = readFileSync("supabase/templates/sign-in.html", "utf8");

  const desired = {
    mailer_otp_length: 6,
    mailer_subjects_magic_link: SUBJECT,
    mailer_subjects_confirmation: SUBJECT,
    mailer_templates_magic_link_content: html,
    mailer_templates_confirmation_content: html,
  };

  const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const current = await fetch(api, { headers });
  if (!current.ok) throw new Error(`Reading auth config failed: ${current.status} ${await current.text()}`);
  const before = (await current.json()) as Record<string, unknown>;
  const changed = Object.entries(desired).filter(([k, v]) => before[k] !== v);
  if (!changed.length) return console.log(`Project ${ref}: sign-in emails are already up to date.`);
  console.log(`Project ${ref}: will update ${changed.map(([k]) => k).join(", ")}`);
  if (flag("dry-run")) return;

  const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(Object.fromEntries(changed)) });
  if (!res.ok) throw new Error(`Updating auth config failed: ${res.status} ${await res.text()}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
