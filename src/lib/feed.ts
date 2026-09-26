import type { FeedEntry, Rating } from "@/lib/types";

export interface ItemStats {
  mine: Rating | null;
  listened: boolean;
  listenerCount: number;
  avgStars: number | null;
  ratingCount: number;
  thumbsUp: number;
  thumbsDown: number;
}

export function itemStats(item: FeedEntry["item"], viewerId: string): ItemStats {
  const stars = item.ratings.map((r) => r.stars).filter((s): s is number => s !== null);
  return {
    mine: item.ratings.find((r) => r.user_id === viewerId) ?? null,
    listened: item.listens.some((l) => l.user_id === viewerId),
    listenerCount: item.listens.length,
    avgStars: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null,
    ratingCount: stars.length,
    thumbsUp: item.ratings.filter((r) => r.thumb === 1).length,
    thumbsDown: item.ratings.filter((r) => r.thumb === -1).length,
  };
}

/** Emoji → count and whether the viewer reacted, in first-seen order. */
export function groupReactions(reactions: FeedEntry["reactions"], viewerId: string) {
  const groups = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { count: 0, mine: false };
    g.count += 1;
    g.mine ||= r.user_id === viewerId;
    groups.set(r.emoji, g);
  }
  return groups;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isPast(iso: string, now = Date.now()): boolean {
  return new Date(iso).getTime() < now;
}
