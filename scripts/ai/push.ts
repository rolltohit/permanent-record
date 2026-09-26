/**
 * npm run ai:push [-- <work-dir>] [--dry-run]
 *
 * Validates Claude's summaries.json / suggestions.json, resolves each
 * suggestion to a real catalog item, and writes everything to Supabase.
 * Defaults to the newest folder in .ai-work/. Safe to run more than once.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { isExcluded, matchCatalog, planSummaries } from "@/lib/ai/batch";
import {
  batchMetaSchema,
  SUGGESTIONS_PER_USER,
  type SuggestionOut,
  suggestionsFileSchema,
  summariesFileSchema,
  tasteProfileSchema,
} from "@/lib/ai/batch-schema";
import { type ResolvedItem, resolveFromCatalog, searchCatalog } from "@/lib/music/resolve";
import { adminClient, flag, positional } from "../lib/admin-client";

const dryRun = flag("dry-run");

function workDir(): string {
  const explicit = positional()[0];
  if (explicit) return explicit;
  const root = ".ai-work";
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => existsSync(path.join(root, d, "batch.json"))).sort() : [];
  if (!dirs.length) fail("No batch found in .ai-work/. Run `npm run ai:pull` first.");
  return path.join(root, dirs.at(-1)!);
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readJson<S extends z.ZodTypeAny>(dir: string, name: string, schema: S, optional = false): z.infer<S> | null {
  const file = path.join(dir, name);
  if (!existsSync(file)) {
    if (optional) return null;
    fail(`Missing ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${name} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => `  [${i.path.join(".")}] ${i.message}`);
    fail(`${name} doesn't match the expected format:\n${issues.join("\n")}`);
  }
  return parsed.data;
}

// song.link is rate limited (and only used when ODESLI_API_KEY is set). Space calls out and
// retry once after a 429 so a batch of picks doesn't silently degrade.
function politeFetch(): typeof fetch {
  const gapMs = process.env.ODESLI_API_KEY ? 250 : 6500;
  let last = 0;
  const wrapped = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.song.link/")) return fetch(input, init);
    const wait = last + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(input, init);
    if (res.status !== 429) return res;
    console.log("  song.link rate limit hit; waiting 60s…");
    await new Promise((r) => setTimeout(r, 60_000));
    last = Date.now();
    return fetch(input, init);
  };
  return wrapped as typeof fetch;
}

type ResolveCache = Record<string, ResolvedItem | null>;
const cacheKey = (s: SuggestionOut) => `${s.kind}|${s.artist}|${s.title}`.toLowerCase();

async function main() {
  const dir = workDir();
  const meta = readJson(dir, "batch.json", batchMetaSchema)!;
  const profiles = readJson(dir, "taste_profiles.json", tasteProfileSchema.array())!;
  const summaries = readJson(dir, "summaries.json", summariesFileSchema, true);
  const suggestions = readJson(dir, "suggestions.json", suggestionsFileSchema, true);
  if (!summaries && !suggestions) fail(`Neither summaries.json nor suggestions.json exists in ${dir}.`);

  console.log(`${dryRun ? "Dry run for" : "Pushing"} batch ${meta.batch_id} from ${dir}\n`);
  const db = adminClient();
  const stats = { summaries_written: 0, summaries_unchanged: 0, suggestions_written: 0, suggestions_skipped: 0 };

  // ---- Summaries ----------------------------------------------------------
  if (summaries) {
    const ids = [...new Set(summaries.map((s) => s.item_id))];
    const { data, error } = await db.from("music_items").select("id, ai_summary").in("id", ids);
    if (error) fail(error.message);
    const plan = planSummaries(summaries, new Map(data.map((r) => [r.id as string, r.ai_summary as string | null])));
    console.log(`Summaries: ${plan.updates.length} to write, ${plan.unchanged} unchanged, ${plan.unknown.length} unknown item(s)`);
    plan.unknown.forEach((id) => console.log(`  ! no item ${id}; skipped`));

    if (!dryRun) {
      const now = new Date().toISOString();
      for (const s of plan.updates) {
        const { error: upErr } = await db.from("music_items").update({ ai_summary: s.summary, ai_summary_at: now }).eq("id", s.item_id);
        if (upErr) fail(`Updating ${s.item_id}: ${upErr.message}`);
      }
    }
    stats.summaries_written = plan.updates.length;
    stats.summaries_unchanged = plan.unchanged;
  }

  // ---- Suggestions --------------------------------------------------------
  if (suggestions) {
    const profileById = new Map(profiles.map((p) => [p.user_id, p]));
    const cacheFile = path.join(dir, "resolved.json");
    const cache: ResolveCache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
    const fetchImpl = politeFetch();
    const perUser = new Map<string, number>();
    const accepted: { s: SuggestionOut; item: ResolvedItem }[] = [];
    const skip = (s: SuggestionOut, why: string) => {
      stats.suggestions_skipped++;
      console.log(`  - ${s.artist} – ${s.title} (${profileById.get(s.user_id)?.display_name ?? s.user_id}): ${why}`);
    };

    console.log(`\nSuggestions: resolving ${suggestions.length} pick(s)…`);
    for (const s of suggestions) {
      const profile = profileById.get(s.user_id);
      if (!profile) {
        skip(s, "unknown user_id");
        continue;
      }
      if ((perUser.get(s.user_id) ?? 0) >= SUGGESTIONS_PER_USER) {
        skip(s, `over the ${SUGGESTIONS_PER_USER}-per-member limit`);
        continue;
      }

      const key = cacheKey(s);
      if (!(key in cache)) {
        let results;
        try {
          results = await searchCatalog(`${s.artist} ${s.title}`, fetchImpl, 10);
        } catch (e) {
          // Not cached, so the next run retries it.
          skip(s, `catalog lookup failed (${e instanceof Error ? e.message : e})`);
          continue;
        }
        const match = matchCatalog(s, results);
        cache[key] = match ? await resolveFromCatalog(match, fetchImpl) : null;
        writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
      }
      const item = cache[key];
      if (!item) {
        skip(s, "not found in the Apple Music catalog");
        continue;
      }
      if (isExcluded(profile.exclude, item) || accepted.some((a) => a.s.user_id === s.user_id && a.item.external_key === item.external_key)) {
        skip(s, "already in the room or already suggested");
        continue;
      }
      perUser.set(s.user_id, (perUser.get(s.user_id) ?? 0) + 1);
      accepted.push({ s, item });
      console.log(`  + ${item.artist} – ${item.title} → ${profile.display_name}`);
    }

    if (!dryRun) {
      for (const { s, item } of accepted) {
        const { error: insErr } = await db.from("music_items").upsert(item, { onConflict: "external_key", ignoreDuplicates: true });
        if (insErr) fail(`Saving ${item.title}: ${insErr.message}`);
        const { data: row, error: selErr } = await db.from("music_items").select("id").eq("external_key", item.external_key).single();
        if (selErr) fail(`Looking up ${item.title}: ${selErr.message}`);
        const { data: inserted, error: sugErr } = await db
          .from("ai_suggestions")
          .upsert(
            { user_id: s.user_id, item_id: row.id, reason: s.reason, batch_id: meta.batch_id },
            { onConflict: "user_id,item_id", ignoreDuplicates: true },
          )
          .select("id");
        if (sugErr) fail(`Saving suggestion: ${sugErr.message}`);
        if (inserted?.length) stats.suggestions_written++;
      }
    } else {
      stats.suggestions_written = accepted.length;
    }
  }

  if (!dryRun) {
    const { error } = await db.from("ai_batches").update({ pushed_at: new Date().toISOString(), stats }).eq("id", meta.batch_id);
    if (error) fail(error.message);
  }

  console.log(`\n${dryRun ? "Would write" : "Wrote"}: ${stats.summaries_written} summaries, ${stats.suggestions_written} suggestions.`);
  if (stats.suggestions_skipped) console.log(`Skipped ${stats.suggestions_skipped} suggestion(s); see the list above.`);
  if (dryRun) console.log("Nothing was written. Re-run without --dry-run to push.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
