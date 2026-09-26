import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { AiSummary, ItemHeader } from "@/components/ItemHeader";
import { ItemControls } from "@/components/ItemControls";
import { PlatformLinks } from "@/components/PlatformLinks";
import { ReactionBar } from "@/components/ReactionBar";
import { groupReactions, itemStats, timeAgo } from "@/lib/feed";
import type { FeedEntry } from "@/lib/types";

export function RecCard({ entry, viewerId, linkToDetail = true }: { entry: FeedEntry; viewerId: string; linkToDetail?: boolean }) {
  const { item } = entry;
  const stats = itemStats(item, viewerId);
  const reactions = Object.fromEntries(groupReactions(entry.reactions, viewerId));
  const commentCount = entry.comments[0]?.count ?? 0;

  return (
    <article className="card flex flex-col gap-3 p-4">
      <header className="flex items-center gap-2 text-sm">
        <Avatar profile={entry.from} size={24} />
        <span className="font-semibold">{entry.from.display_name}</span>
        <span className="text-muted">recommends</span>
        <time className="ml-auto text-xs text-muted" dateTime={entry.created_at}>
          {timeAgo(entry.created_at)}
        </time>
      </header>

      {linkToDetail ? (
        <Link href={`/r/${entry.id}`} className="rounded-xl transition hover:opacity-90">
          <ItemHeader item={item} />
        </Link>
      ) : (
        <ItemHeader item={item} size={128} />
      )}

      {entry.note && <blockquote className="border-l-2 border-accent pl-3 text-sm">{entry.note}</blockquote>}

      <AiSummary summary={item.ai_summary} />
      <PlatformLinks links={item.links} />

      <ItemControls itemId={item.id} listened={stats.listened} stars={stats.mine?.stars ?? null} thumb={stats.mine?.thumb ?? null} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {stats.avgStars !== null && (
          <span>
            ★ {stats.avgStars} avg ({stats.ratingCount})
          </span>
        )}
        {stats.thumbsUp + stats.thumbsDown > 0 && (
          <span>
            👍 {stats.thumbsUp} · 👎 {stats.thumbsDown}
          </span>
        )}
        <span>{stats.listenerCount} listened</span>
        {linkToDetail && (
          <Link href={`/r/${entry.id}`} className="ml-auto font-semibold text-accent hover:underline">
            {commentCount ? `${commentCount} comment${commentCount > 1 ? "s" : ""}` : "Comment"}
          </Link>
        )}
      </div>

      <ReactionBar recommendationId={entry.id} groups={reactions} />
    </article>
  );
}
