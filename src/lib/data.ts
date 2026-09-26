import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Comment, FeedEntry, Profile, PublicProfile, Suggestion } from "@/lib/types";

const FEED_SELECT = `
  id, note, created_at,
  from:profiles!recommendations_from_user_fkey(id, display_name, avatar_url),
  item:music_items(*, ratings(user_id, stars, thumb), listens(user_id)),
  comments(count),
  reactions(emoji, user_id)
`;

/** The signed-in member, or a redirect to /login or /welcome. Cached per request. */
export const requireMember = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/welcome");
  return profile as Profile;
});

export async function getMembers(): Promise<PublicProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_url").order("display_name");
  if (error) throw error;
  return data;
}

export async function getFeed(opts: { from?: string; limit?: number } = {}): Promise<FeedEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("recommendations")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.from) q = q.eq("from_user", opts.from);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as FeedEntry[];
}

export async function getRecommendation(id: string): Promise<FeedEntry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recommendations").select(FEED_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as FeedEntry | null;
}

export async function getComments(recommendationId: string): Promise<Comment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, author:profiles!comments_user_id_fkey(id, display_name, avatar_url)")
    .eq("recommendation_id", recommendationId)
    .order("created_at");
  if (error) throw error;
  return data as unknown as Comment[];
}

export async function getSuggestions(): Promise<Suggestion[]> {
  const me = await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_suggestions")
    .select("id, reason, status, created_at, item:music_items(*)")
    .eq("user_id", me.id)
    .eq("status", "new")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Suggestion[];
}

export interface MyActivity {
  ratings: { stars: number | null; thumb: number | null; updated_at: string; item: FeedEntry["item"] }[];
  listens: { listened_at: string; item: FeedEntry["item"] }[];
  shared: FeedEntry[];
}

export async function getMyActivity(): Promise<MyActivity> {
  const me = await requireMember();
  const supabase = await createClient();
  const [ratings, listens, shared] = await Promise.all([
    supabase
      .from("ratings")
      .select("stars, thumb, updated_at, item:music_items(*)")
      .eq("user_id", me.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("listens")
      .select("listened_at, item:music_items(*)")
      .eq("user_id", me.id)
      .order("listened_at", { ascending: false }),
    getFeed({ from: me.id }),
  ]);
  if (ratings.error) throw ratings.error;
  if (listens.error) throw listens.error;
  return {
    ratings: ratings.data as unknown as MyActivity["ratings"],
    listens: listens.data as unknown as MyActivity["listens"],
    shared,
  };
}

export interface InviteRow {
  code: string;
  email: string | null;
  grants_admin: boolean;
  used_at: string | null;
  expires_at: string;
  created_at: string;
  used_by_profile: PublicProfile | null;
}

export async function getInvites(): Promise<InviteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .select("code, email, grants_admin, used_at, expires_at, created_at, used_by_profile:profiles!invites_used_by_fkey(id, display_name, avatar_url)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as InviteRow[];
}
