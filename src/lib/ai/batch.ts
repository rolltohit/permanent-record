import type { CatalogResult } from "@/lib/music/resolve";
import type {
  ExcludeEntry,
  SummaryOut,
  SummaryTodo,
  SuggestionOut,
  TasteItem,
  TasteProfile,
} from "./batch-schema";

// Pure logic shared by scripts/ai/pull.ts and scripts/ai/push.ts.

export interface RoomSnapshot {
  profiles: { id: string; display_name: string }[];
  items: {
    id: string;
    kind: "album" | "track";
    title: string;
    artist: string;
    album: string | null;
    release_year: number | null;
    external_key: string;
    ai_summary: string | null;
  }[];
  recommendations: { id: string; item_id: string; from_user: string; note: string | null }[];
  ratings: { user_id: string; item_id: string; stars: number | null; thumb: number | null }[];
  reactions: { recommendation_id: string; user_id: string; emoji: string }[];
  comments: { recommendation_id: string; user_id: string; body: string }[];
  suggestions: { user_id: string; item_id: string }[];
}

export const POSITIVE_REACTIONS = new Set(["🔥", "❤️", "🤯", "🕺", "😭"]);
export const NEGATIVE_REACTIONS = new Set(["😴"]);

function isLoved(stars: number | null, thumb: number | null, reactions: string[]) {
  return (stars ?? 0) >= 4 || thumb === 1 || reactions.some((r) => POSITIVE_REACTIONS.has(r));
}
function isDisliked(stars: number | null, thumb: number | null, reactions: string[]) {
  return (stars !== null && stars <= 2) || thumb === -1 || reactions.some((r) => NEGATIVE_REACTIONS.has(r));
}

export function buildBatch(room: RoomSnapshot, opts: { resummarize?: boolean } = {}) {
  const itemById = new Map(room.items.map((i) => [i.id, i]));
  const recById = new Map(room.recommendations.map((r) => [r.id, r]));

  const summariesTodo: SummaryTodo[] = room.items
    .filter((i) => opts.resummarize || !i.ai_summary)
    .map((i) => {
      const recs = room.recommendations.filter((r) => r.item_id === i.id);
      const recIds = new Set(recs.map((r) => r.id));
      return {
        item_id: i.id,
        kind: i.kind,
        title: i.title,
        artist: i.artist,
        album: i.album,
        release_year: i.release_year,
        recommender_notes: recs.map((r) => r.note).filter((n): n is string => !!n),
        comments: room.comments.filter((c) => recIds.has(c.recommendation_id)).map((c) => c.body),
      };
    });

  // Everything already in the room is off limits for suggestions, for everyone.
  const roomExclude: ExcludeEntry[] = room.items.map((i) => ({ external_key: i.external_key, artist: i.artist, title: i.title }));

  const tasteProfiles: TasteProfile[] = room.profiles.map((p) => {
    const itemIds = new Set<string>();
    const ratingByItem = new Map(room.ratings.filter((r) => r.user_id === p.id).map((r) => [r.item_id, r]));
    ratingByItem.forEach((_, id) => itemIds.add(id));

    const reactionsByItem = new Map<string, string[]>();
    for (const r of room.reactions.filter((x) => x.user_id === p.id)) {
      const itemId = recById.get(r.recommendation_id)?.item_id;
      if (!itemId) continue;
      itemIds.add(itemId);
      reactionsByItem.set(itemId, [...(reactionsByItem.get(itemId) ?? []), r.emoji]);
    }

    const commentsByItem = new Map<string, string[]>();
    for (const c of room.comments.filter((x) => x.user_id === p.id)) {
      const itemId = recById.get(c.recommendation_id)?.item_id;
      if (itemId) commentsByItem.set(itemId, [...(commentsByItem.get(itemId) ?? []), c.body]);
    }

    const loved: TasteItem[] = [];
    const disliked: TasteItem[] = [];
    for (const itemId of itemIds) {
      const item = itemById.get(itemId);
      if (!item) continue;
      const rating = ratingByItem.get(itemId);
      const reactions = reactionsByItem.get(itemId) ?? [];
      const entry: TasteItem = {
        kind: item.kind,
        title: item.title,
        artist: item.artist,
        album: item.album,
        stars: rating?.stars ?? null,
        thumb: rating?.thumb ?? null,
        reactions,
        their_comments: commentsByItem.get(itemId) ?? [],
      };
      if (isDisliked(entry.stars, entry.thumb, reactions)) disliked.push(entry);
      else if (isLoved(entry.stars, entry.thumb, reactions)) loved.push(entry);
    }

    const previouslySuggested = room.suggestions
      .filter((s) => s.user_id === p.id)
      .map((s) => itemById.get(s.item_id))
      .filter((i) => i !== undefined)
      .map((i) => ({ external_key: i.external_key, artist: i.artist, title: i.title }));

    return {
      user_id: p.id,
      display_name: p.display_name,
      loved,
      disliked,
      recommended_to_group: room.recommendations
        .filter((r) => r.from_user === p.id)
        .map((r) => ({ title: itemById.get(r.item_id)?.title ?? "", artist: itemById.get(r.item_id)?.artist ?? "", note: r.note }))
        .filter((r) => r.title),
      exclude: dedupeExclude([...roomExclude, ...previouslySuggested]),
    };
  });

  return { summariesTodo, tasteProfiles };
}

function dedupeExclude(entries: ExcludeEntry[]): ExcludeEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = e.external_key ?? `${norm(e.artist)}|${norm(e.title)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

/** Lowercase, drop edition suffixes, punctuation and "the". Used for fuzzy matching. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|expanded|anniversary|bonus)[^)\]]*[)\]]/g, "")
    .replace(/\s+-\s+(single|ep)$/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)));
}

/**
 * Picks the catalog result that really is the suggested album or track.
 * Returns null rather than guessing, which filters out hallucinated titles.
 */
export function matchCatalog(s: Pick<SuggestionOut, "kind" | "title" | "artist">, results: CatalogResult[]): CatalogResult | null {
  const candidates = results.filter((r) => r.kind === s.kind && similar(r.artist, s.artist) && similar(r.title, s.title));
  return candidates.find((r) => norm(r.title) === norm(s.title)) ?? candidates[0] ?? null;
}

export function isExcluded(exclude: ExcludeEntry[], item: { external_key: string; artist: string; title: string }): boolean {
  return exclude.some(
    (e) => e.external_key === item.external_key || (norm(e.artist) === norm(item.artist) && norm(e.title) === norm(item.title)),
  );
}

export interface SummaryPlan {
  updates: SummaryOut[];
  unchanged: number;
  unknown: string[];
}

/** Keeps only summaries for real items that actually change. */
export function planSummaries(summaries: SummaryOut[], current: Map<string, string | null>): SummaryPlan {
  const plan: SummaryPlan = { updates: [], unchanged: 0, unknown: [] };
  for (const s of summaries) {
    if (!current.has(s.item_id)) plan.unknown.push(s.item_id);
    else if (current.get(s.item_id) === s.summary) plan.unchanged++;
    else plan.updates.push(s);
  }
  return plan;
}
