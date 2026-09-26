import { notFound } from "next/navigation";
import { deleteCommentAction, deleteRecommendationAction } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { CommentForm } from "@/components/CommentForm";
import { RecCard } from "@/components/RecCard";
import { getComments, getMembers, getRecommendation, requireMember } from "@/lib/data";
import { timeAgo } from "@/lib/feed";

export async function generateMetadata(props: PageProps<"/r/[id]">) {
  const { id } = await props.params;
  const entry = await getRecommendation(id);
  return { title: entry ? `${entry.item.title} by ${entry.item.artist}` : "Not found" };
}

export default async function RecommendationPage(props: PageProps<"/r/[id]">) {
  const { id } = await props.params;
  const me = await requireMember();
  const [entry, comments, members] = await Promise.all([getRecommendation(id), getComments(id), getMembers()]);
  if (!entry) notFound();

  const byId = new Map(members.map((m) => [m.id, m]));
  const listenedBy = new Set(entry.item.listens.map((l) => l.user_id));
  const takes = members
    .map((m) => ({ member: m, rating: entry.item.ratings.find((r) => r.user_id === m.id), listened: listenedBy.has(m.id) }))
    .filter((t) => t.rating || t.listened);

  return (
    <div className="flex flex-col gap-4">
      <RecCard entry={entry} viewerId={me.id} linkToDetail={false} />

      <section className="card p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">The group&apos;s take</h2>
        {takes.length === 0 ? (
          <p className="text-sm text-muted">No one has listened yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {takes.map(({ member, rating }) => (
              <li key={member.id} className="flex items-center gap-2 text-sm">
                <Avatar profile={member} size={24} />
                <span className="font-medium">{member.display_name}</span>
                <span className="ml-auto flex items-center gap-2 text-muted">
                  {rating?.stars ? <span className="text-accent">{"★".repeat(rating.stars)}</span> : null}
                  {rating?.thumb === 1 && "👍"}
                  {rating?.thumb === -1 && "👎"}
                  {!rating && "listened"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-display text-lg font-semibold">Comments</h2>
        {comments.length === 0 && <p className="text-sm text-muted">No comments yet. Say something.</p>}
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const author = c.author ?? byId.get(c.user_id);
            return (
              <li key={c.id} className="flex gap-2">
                {author && <Avatar profile={author} size={28} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{author?.display_name ?? "Someone"}</span>{" "}
                    <span className="text-xs text-muted">{timeAgo(c.created_at)}</span>
                  </p>
                  <p className="text-sm break-words">{c.body}</p>
                </div>
                {c.user_id === me.id && (
                  <form action={deleteCommentAction.bind(null, c.id)}>
                    <button className="text-xs text-muted hover:text-bad" aria-label="Delete comment">
                      ✕
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <CommentForm recommendationId={entry.id} />
      </section>

      {entry.from.id === me.id && (
        <form action={deleteRecommendationAction.bind(null, entry.id)} className="self-center">
          <button className="text-sm text-muted hover:text-bad">Delete this recommendation</button>
        </form>
      )}
    </div>
  );
}
