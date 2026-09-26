import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { Artwork } from "@/components/Artwork";
import { Avatar } from "@/components/Avatar";
import { ProfileNameForm } from "@/components/ProfileNameForm";
import { getMyActivity, requireMember } from "@/lib/data";
import { timeAgo } from "@/lib/feed";

export const metadata = { title: "Me" };

export default async function MePage() {
  const me = await requireMember();
  const { ratings, listens, shared } = await getMyActivity();
  const ratingByItem = new Map(ratings.map((r) => [r.item.id, r]));

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex items-center gap-4 p-4">
        <Avatar profile={me} size={56} />
        <div className="flex-1">
          <ProfileNameForm name={me.display_name} />
          <p className="mt-1 text-xs text-muted">
            {shared.length} shared · {listens.length} listened · {ratings.length} rated
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">Listening history</h2>
        {listens.length === 0 ? (
          <p className="text-sm text-muted">Nothing marked listened yet.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {listens.map(({ item, listened_at }) => {
              const r = ratingByItem.get(item.id);
              return (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  <Artwork src={item.artwork_url} alt="" size={44} className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted">{item.artist}</p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>
                      {r?.stars ? <span className="text-accent">{"★".repeat(r.stars)}</span> : null}
                      {r?.thumb === 1 && " 👍"}
                      {r?.thumb === -1 && " 👎"}
                    </p>
                    <p>{timeAgo(listened_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">You recommended</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. <Link href="/add" className="text-accent hover:underline">Recommend something</Link>.
          </p>
        ) : (
          <ul className="card divide-y divide-line">
            {shared.map((e) => (
              <li key={e.id}>
                <Link href={`/r/${e.id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                  <Artwork src={e.item.artwork_url} alt="" size={44} className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.item.title}</p>
                    <p className="truncate text-xs text-muted">{e.item.artist}</p>
                  </div>
                  <span className="text-xs text-muted">{e.item.listens.length} listened</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {me.is_admin && (
          <Link href="/admin/invites" className="btn-ghost">
            Manage invites
          </Link>
        )}
        <form action={signOutAction}>
          <button className="btn-ghost">Sign out</button>
        </form>
      </div>
    </div>
  );
}
