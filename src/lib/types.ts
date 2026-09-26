import type { Platform } from "@/lib/music/links";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export type PublicProfile = Pick<Profile, "id" | "display_name" | "avatar_url">;

export interface MusicItem {
  id: string;
  kind: "album" | "track";
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  release_year: number | null;
  links: Partial<Record<Platform, string>>;
  songlink_url: string | null;
  ai_summary: string | null;
}

export interface Rating {
  user_id: string;
  stars: number | null;
  thumb: -1 | 1 | null;
}

export interface Reaction {
  emoji: string;
  user_id: string;
}

export interface Comment {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: PublicProfile | null;
}

/** A recommendation with everything a feed card needs. */
export interface FeedEntry {
  id: string;
  note: string | null;
  created_at: string;
  from: PublicProfile;
  item: MusicItem & { ratings: Rating[]; listens: { user_id: string }[] };
  comments: { count: number }[];
  reactions: Reaction[];
}

export interface Suggestion {
  id: string;
  reason: string;
  status: "new" | "dismissed" | "shared";
  created_at: string;
  item: MusicItem;
}

export const REACTION_EMOJI = ["🔥", "❤️", "🤯", "🕺", "😭", "😴"] as const;
