/**
 * npm run invite [-- --admin] [-- email@example.com]
 *
 * Creates an invite with the service key. Use it to bootstrap the first
 * (admin) member; after that, admins can create invites in the app.
 */
import { adminClient, flag, positional } from "../lib/admin-client";

async function main() {
  const db = adminClient();
  const email = positional()[0] ?? null;
  const { data, error } = await db
    .from("invites")
    .insert({ email, grants_admin: flag("admin") })
    .select("code, expires_at")
    .single();
  if (error) throw new Error(error.message);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  console.log(`Invite${flag("admin") ? " (admin)" : ""}: ${site.replace(/\/$/, "")}/invite/${data.code}`);
  console.log(`Expires ${new Date(data.expires_at).toLocaleString()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
