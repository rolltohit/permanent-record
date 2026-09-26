import { redirect } from "next/navigation";
import { deleteInviteAction } from "@/app/actions";
import { InviteCreator } from "@/components/InviteCreator";
import { getInvites, requireMember } from "@/lib/data";
import { isPast, timeAgo } from "@/lib/feed";

export const metadata = { title: "Invites" };

export default async function InvitesPage() {
  const me = await requireMember();
  if (!me.is_admin) redirect("/");
  const invites = await getInvites();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Invites</h1>
      <InviteCreator />
      <ul className="card divide-y divide-line">
        {invites.length === 0 && <li className="p-4 text-sm text-muted">No invites yet.</li>}
        {invites.map((inv) => {
          const expired = !inv.used_at && isPast(inv.expires_at);
          return (
            <li key={inv.code} className="flex items-center gap-3 p-3 text-sm">
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{inv.code}</code>
              <span className="min-w-0 flex-1 truncate text-muted">
                {inv.used_by_profile
                  ? `Joined as ${inv.used_by_profile.display_name}`
                  : expired
                    ? "Expired"
                    : `Open${inv.email ? ` · for ${inv.email}` : ""} · created ${timeAgo(inv.created_at)}`}
                {inv.grants_admin && " · admin"}
              </span>
              {!inv.used_at && (
                <form action={deleteInviteAction.bind(null, inv.code)}>
                  <button className="text-xs text-muted hover:text-bad">Revoke</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
