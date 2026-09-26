import { z } from "zod";

/**
 * File contract for the local AI batch (see .claude/skills/refresh/SKILL.md).
 *
 *   ai:pull  writes  batch.json, summaries_todo.json, taste_profiles.json, INSTRUCTIONS.md
 *   Claude   writes  summaries.json, suggestions.json
 *   ai:push  reads   all of the above
 */

// ---- Written by ai:pull ----------------------------------------------------

export const batchMetaSchema = z.object({
  batch_id: z.string().uuid(),
  pulled_at: z.string(),
});
export type BatchMeta = z.infer<typeof batchMetaSchema>;

export const summaryTodoSchema = z.object({
  item_id: z.string().uuid(),
  kind: z.enum(["album", "track"]),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  release_year: z.number().nullable(),
  recommender_notes: z.array(z.string()),
  comments: z.array(z.string()),
});
export type SummaryTodo = z.infer<typeof summaryTodoSchema>;

const tasteItemSchema = z.object({
  kind: z.enum(["album", "track"]),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  stars: z.number().nullable(),
  thumb: z.number().nullable(),
  reactions: z.array(z.string()),
  their_comments: z.array(z.string()),
});
export type TasteItem = z.infer<typeof tasteItemSchema>;

export const excludeEntrySchema = z.object({
  external_key: z.string().nullable(),
  artist: z.string(),
  title: z.string(),
});
export type ExcludeEntry = z.infer<typeof excludeEntrySchema>;

export const tasteProfileSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string(),
  loved: z.array(tasteItemSchema),
  disliked: z.array(tasteItemSchema),
  recommended_to_group: z.array(z.object({ title: z.string(), artist: z.string(), note: z.string().nullable() })),
  exclude: z.array(excludeEntrySchema),
});
export type TasteProfile = z.infer<typeof tasteProfileSchema>;

// ---- Written by Claude -----------------------------------------------------

export const summaryOutSchema = z.object({
  item_id: z.string().uuid(),
  summary: z.string().trim().min(20).max(600),
});
export const summariesFileSchema = z.array(summaryOutSchema);
export type SummaryOut = z.infer<typeof summaryOutSchema>;

export const suggestionOutSchema = z.object({
  user_id: z.string().uuid(),
  kind: z.enum(["album", "track"]),
  title: z.string().trim().min(1),
  artist: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(280),
});
export const suggestionsFileSchema = z.array(suggestionOutSchema);
export type SuggestionOut = z.infer<typeof suggestionOutSchema>;

export const SUGGESTIONS_PER_USER = 5;
