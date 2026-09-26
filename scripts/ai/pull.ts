/**
 * npm run ai:pull [-- --resummarize]
 *
 * Snapshots the room into .ai-work/<stamp>/ for a local Claude session.
 * See .claude/skills/refresh/SKILL.md.
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

  const { summariesTodo, tasteProfiles } = buildBatch(
    { profiles, items, recommendations, ratings, reactions, comments, suggestions },
    { resummarize: flag("resummarize") },
  );

  const { data: batch, error } = await db.from("ai_batches").insert({}).select("id, pulled_at").single();
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

  const withSignal = tasteProfiles.filter((p) => p.loved.length > 0).length;
  console.log(`Pulled batch ${batch.id}`);
  console.log(`  ${summariesTodo.length} item(s) need summaries`);
  console.log(`  ${withSignal} of ${tasteProfiles.length} member(s) have liked something (eligible for picks)`);
  console.log(`\nWork folder: ${dir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
