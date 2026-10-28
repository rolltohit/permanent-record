/**
 * npm run ai:pull [-- --resummarize] [--all-picks] [--force]
 *
 * Snapshots the room into .ai-work/<stamp>/ for a Claude session.
 * See .claude/skills/refresh/SKILL.md.
 *
 * Members only get new picks when their taste signals changed since the last
 * pushed batch (--all-picks overrides). With nothing to summarise and no new
 * picks to make, it creates no batch and prints NOTHING_NEW (--force overrides).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildBatch, type RoomSnapshot } from "@/lib/ai/batch";
import type { BatchMeta } from "@/lib/ai/batch-schema";
import { adminClient, fetchAll, flag } from "../lib/admin-client";
import { INSTRUCTIONS } from "./instructions";

async function main() {
  const db = adminClient();

  const [profiles, items, recommendations, ratings, reactions, comments, suggestions] = await Promise.all([
    fetchAll<RoomSnapshot["profiles"][number]>(db, "profiles", "id, display_name"),
    fetchAll<RoomSnapshot["items"][number]>(db, "music_items", "id, kind, title, artist, album, release_year, external_key, ai_summary"),
    fetchAll<RoomSnapshot["recommendations"][number]>(db, "recommendations", "id, item_id, from_user, note"),
    fetchAll<RoomSnapshot["ratings"][number]>(db, "ratings", "user_id, item_id, stars, thumb"),
    fetchAll<RoomSnapshot["reactions"][number]>(db, "reactions", "recommendation_id, user_id, emoji"),
    fetchAll<RoomSnapshot["comments"][number]>(db, "comments", "recommendation_id, user_id, body"),
    fetchAll<RoomSnapshot["suggestions"][number]>(db, "ai_suggestions", "user_id, item_id"),
  ]);

  const { data: last, error: lastErr } = await db
    .from("ai_batches")
    .select("stats")
    .not("pushed_at", "is", null)
    .order("pushed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw new Error(`ai_batches: ${lastErr.message}`);
  const previousTasteKeys = (last?.stats as { taste_keys?: Record<string, string> } | null)?.taste_keys ?? null;

  const { summariesTodo, tasteProfiles, tasteKeys } = buildBatch(
    { profiles, items, recommendations, ratings, reactions, comments, suggestions },
    { resummarize: flag("resummarize"), previousTasteKeys, allPicks: flag("all-picks") },
  );
  const needPicks = tasteProfiles.filter((p) => p.needs_picks);

  if (!summariesTodo.length && !needPicks.length && !flag("force")) {
    console.log("NOTHING_NEW: no items need summaries and no member's taste changed since the last batch.");
    console.log("No batch was created. Use --force to pull anyway.");
    return;
  }

  // taste_keys become the baseline for the next run once this batch is pushed.
  const { data: batch, error } = await db.from("ai_batches").insert({ stats: { taste_keys: tasteKeys } }).select("id, pulled_at").single();
  if (error) throw new Error(`ai_batches: ${error.message}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(".ai-work", `${stamp}-${batch.id.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });

  const meta: BatchMeta = { batch_id: batch.id, pulled_at: batch.pulled_at };
  const write = (name: string, value: unknown) =>
    writeFileSync(path.join(dir, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  write("batch.json", meta);
  write("summaries_todo.json", summariesTodo);
  write("taste_profiles.json", tasteProfiles);
  write("INSTRUCTIONS.md", INSTRUCTIONS);

  console.log(`Pulled batch ${batch.id}`);
  console.log(`  ${summariesTodo.length} item(s) need summaries`);
  console.log(`  ${needPicks.length} of ${tasteProfiles.length} member(s) need picks${needPicks.length ? `: ${needPicks.map((p) => p.display_name).join(", ")}` : ""}`);
  console.log(`\nWork folder: ${dir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
