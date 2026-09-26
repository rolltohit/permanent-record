"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/data";
import {
  type CatalogResult,
  type ResolvedItem,
  ResolveError,
  resolvedItemSchema,
  resolveFromCatalog,
  resolveFromUrl,
  searchCatalog,
} from "@/lib/music/resolve";
import { createClient } from "@/lib/supabase/server";
import { REACTION_EMOJI } from "@/lib/types";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const refreshAll = () => revalidatePath("/", "layout");

function dbError(error: { message: string } | null): string | null {
  if (!error) return null;
  console.error(error);
  return "Something went wrong saving that. Try again.";
}

// ---------------------------------------------------------------------------
// Music lookup. A small in-memory cache keeps us under song.link's rate limit.
// ---------------------------------------------------------------------------

const lookupCache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 1000 * 60 * 60;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = lookupCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await fn();
  lookupCache.set(key, { at: Date.now(), value });
  if (lookupCache.size > 500) lookupCache.delete(lookupCache.keys().next().value!);
  return value;
}

async function lookup<T>(key: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireMember();
  try {
    return { ok: true, data: await cached(key, fn) };
  } catch (e) {
    if (e instanceof ResolveError) return fail(e.message);
    console.error(e);
    return fail("Couldn't reach the music lookup service. Try again.");
  }
}

export async function resolveLinkAction(url: string): Promise<ActionResult<ResolvedItem>> {
  return lookup(`url:${url.trim()}`, () => resolveFromUrl(url));
}

export async function searchMusicAction(query: string): Promise<ActionResult<CatalogResult[]>> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { ok: true, data: [] };
  return lookup(`search:${q}`, () => searchCatalog(q));
}

export async function resolveCatalogAction(c: CatalogResult): Promise<ActionResult<ResolvedItem>> {
  return lookup(`itunes:${c.kind}:${c.itunesId}`, () => resolveFromCatalog(c));
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

const noteSchema = z.string().trim().max(500).optional();

export async function postRecommendationAction(item: ResolvedItem, note?: string): Promise<ActionResult> {
  await requireMember();
  const parsedItem = resolvedItemSchema.safeParse(item);
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedItem.success) return fail("That item is missing details. Try looking it up again.");
  if (!parsedNote.success) return fail("Keep the note under 500 characters.");

  const supabase = await createClient();
  const { data: itemId, error } = await supabase.rpc("ensure_music_item", { p: parsedItem.data });
  if (error || !itemId) return fail(dbError(error) ?? "Couldn't save that item.");

  const { error: recError } = await supabase
    .from("recommendations")
    .insert({ item_id: itemId, note: parsedNote.data || null });
  if (recError) return fail(dbError(recError)!);

  refreshAll();
  redirect("/");
}

export async function deleteRecommendationAction(id: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("recommendations").delete().eq("id", id);
  refreshAll();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Listening, ratings, reactions, comments
// ---------------------------------------------------------------------------

export async function setListenedAction(itemId: string, listened: boolean): Promise<ActionResult> {
  const me = await requireMember();
  const supabase = await createClient();
  const { error } = listened
    ? await supabase.from("listens").upsert({ user_id: me.id, item_id: itemId })
    : await supabase.from("listens").delete().eq("user_id", me.id).eq("item_id", itemId);
  if (error) return fail(dbError(error)!);
  refreshAll();
  return { ok: true, data: null };
}

const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5).nullable(),
  thumb: z.union([z.literal(1), z.literal(-1)]).nullable(),
});

/** Sets both fields at once; clearing both removes the rating. Rating implies listened. */
export async function setRatingAction(itemId: string, rating: z.infer<typeof ratingSchema>): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = ratingSchema.safeParse(rating);
  if (!parsed.success) return fail("Invalid rating");
  const supabase = await createClient();

  if (parsed.data.stars === null && parsed.data.thumb === null) {
    const { error } = await supabase.from("ratings").delete().eq("user_id", me.id).eq("item_id", itemId);
    if (error) return fail(dbError(error)!);
  } else {
    const { error } = await supabase
      .from("ratings")
      .upsert({ user_id: me.id, item_id: itemId, ...parsed.data, updated_at: new Date().toISOString() });
    if (error) return fail(dbError(error)!);
    await supabase.from("listens").upsert({ user_id: me.id, item_id: itemId }, { ignoreDuplicates: true });
  }
  refreshAll();
  return { ok: true, data: null };
}

export async function toggleReactionAction(recommendationId: string, emoji: string, on: boolean): Promise<ActionResult> {
  const me = await requireMember();
  if (!(REACTION_EMOJI as readonly string[]).includes(emoji)) return fail("Unknown reaction");
  const supabase = await createClient();
  const row = { recommendation_id: recommendationId, user_id: me.id, emoji };
  const { error } = on
    ? await supabase.from("reactions").upsert(row, { ignoreDuplicates: true })
    : await supabase.from("reactions").delete().match(row);
  if (error) return fail(dbError(error)!);
  refreshAll();
  return { ok: true, data: null };
}

export async function addCommentAction(recommendationId: string, body: string): Promise<ActionResult> {
  await requireMember();
  const parsed = z.string().trim().min(1).max(280).safeParse(body);
  if (!parsed.success) return fail("Comments are 1–280 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ recommendation_id: recommendationId, body: parsed.data });
  if (error) return fail(dbError(error)!);
  refreshAll();
  return { ok: true, data: null };
}

export async function deleteCommentAction(id: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("comments").delete().eq("id", id);
  refreshAll();
}

// ---------------------------------------------------------------------------
// AI picks
// ---------------------------------------------------------------------------

export async function dismissSuggestionAction(id: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("ai_suggestions").update({ status: "dismissed" }).eq("id", id);
  refreshAll();
}

export async function shareSuggestionAction(id: string, itemId: string, note: string): Promise<ActionResult> {
  await requireMember();
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedNote.success) return fail("Keep the note under 500 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("recommendations").insert({ item_id: itemId, note: parsedNote.data || null });
  if (error) return fail(dbError(error)!);
  await supabase.from("ai_suggestions").update({ status: "shared" }).eq("id", id);
  refreshAll();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Profile and invites
// ---------------------------------------------------------------------------

export async function updateProfileAction(displayName: string): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = z.string().trim().min(1).max(40).safeParse(displayName);
  if (!parsed.success) return fail("Names are 1–40 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", me.id);
  if (error) return fail(dbError(error)!);
  refreshAll();
  return { ok: true, data: null };
}

export async function createInviteAction(email: string, grantsAdmin: boolean): Promise<ActionResult<string>> {
  const me = await requireMember();
  if (!me.is_admin) return fail("Only admins can create invites.");
  const parsedEmail = z.string().trim().email().or(z.literal("")).safeParse(email);
  if (!parsedEmail.success) return fail("That email doesn't look right.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .insert({ created_by: me.id, email: parsedEmail.data || null, grants_admin: grantsAdmin })
    .select("code")
    .single();
  if (error) return fail(dbError(error)!);
  refreshAll();
  return { ok: true, data: data.code };
}

export async function deleteInviteAction(code: string): Promise<void> {
  const me = await requireMember();
  if (!me.is_admin) return;
  const supabase = await createClient();
  await supabase.from("invites").delete().eq("code", code);
  refreshAll();
}
