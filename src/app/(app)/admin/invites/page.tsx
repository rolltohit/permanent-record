import { redirect } from "next/navigation";
import { deleteInviteAction, renewInviteAction } from "@/app/actions";
import { InviteCreator, InviteShare } from "@/components/InviteCreator";
import { getInvites, requireMember } from "@/lib/data";
import { isPast, timeAgo } from "@/lib/feed";

export const metadata = { title: "Invites" };

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default async function InvitesPage() {
  const me = await requireMember();
  if (!me.is_admin) redirect("/");
  const invites = await getInvites();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">Invites</h1>
      <InviteCreator />
      <ul className="card divide-y divide-line">
        {invites.length === 0 && <li className="p-4 text-sm text-muted">No invites yet.</li>}
        {invites.map((inv) => {
          const expired = !inv.used_at && isPast(inv.expires_at);
          const who = inv.name ?? inv.email ?? "Anyone with the link";
          const status = inv.used_by_profile
            ? `Joined as ${inv.used_by_profile.display_name}`
            : expired
              ? "Expired"
              : `Waiting · ${daysLeft(inv.expires_at)} days left`;
          return (
            <li key={inv.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {who}
                  {inv.grants_admin && <span className="ml-1 text-xs text-muted">· admin</span>}
                </p>
                <p className={`truncate text-xs ${expired ? "text-bad" : "text-muted"}`}>
                  {status}
                  {inv.name && inv.email ? ` · ${inv.email}` : ""} · created {timeAgo(inv.created_at)}
                </p>
              </div>
              {!inv.used_at && (
                <div className="flex items-center gap-3">
                  {expired ? (
                    <form action={renewInviteAction.bind(null, inv.code)}>
                      <button className="text-xs font-medium text-accent underline">Renew 30 days</button>
                    </form>
                  ) : (
                    <InviteShare code={inv.code} name={inv.name} compact />
                  )}
                  <form action={deleteInviteAction.bind(null, inv.code)}>
                    <button className="text-xs text-muted hover:text-bad">Revoke</button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
