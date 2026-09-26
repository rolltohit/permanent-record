/**
 * npm run seed
 *
 * Fills a LOCAL Supabase with three friends and some recommendations so you can
 * try the app and the AI batch without real data. Refuses to run against a
 * non-local URL. Sign in as ana@example.com via Inbucket (http://127.0.0.1:54324).
 */
import { adminClient } from "./lib/admin-client";

const FRIENDS = [
  { email: "ana@example.com", display_name: "Ana", is_admin: true },
  { email: "ben@example.com", display_name: "Ben", is_admin: false },
  { email: "cleo@example.com", display_name: "Cleo", is_admin: false },
];

const s = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
const a = (q: string) => `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`;
const y = (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;
const links = (q: string) => ({ spotify: s(q), apple_music: a(q), youtube_music: y(q) });

const ITEMS = [
  { kind: "album", title: "In Rainbows", artist: "Radiohead", album: "In Rainbows", release_year: 2007, external_key: "seed:album:in-rainbows" },
  { kind: "track", title: "Nights", artist: "Frank Ocean", album: "Blonde", release_year: 2016, external_key: "seed:track:nights" },
  { kind: "album", title: "Promises", artist: "Floating Points, Pharoah Sanders & London Symphony Orchestra", album: "Promises", release_year: 2021, external_key: "seed:album:promises" },
  { kind: "album", title: "Lonerism", artist: "Tame Impala", album: "Lonerism", release_year: 2012, external_key: "seed:album:lonerism" },
] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error(`Refusing to seed ${url || "(unset)"}. Seeding is for local Supabase only.`);
  }
  const db = adminClient();

  const ids: string[] = [];
  for (const f of FRIENDS) {
    const { data: created, error } = await db.auth.admin.createUser({ email: f.email, email_confirm: true });
    let id = created.user?.id;
    if (error) {
      const { data: list } = await db.auth.admin.listUsers();
      id = list.users.find((u) => u.email === f.email)?.id;
      if (!id) throw error;
    }
    await db.from("profiles").upsert({ id, display_name: f.display_name, is_admin: f.is_admin });
    ids.push(id!);
  }
  const [ana, ben, cleo] = ids;

  const itemIds: string[] = [];
  for (const [i, it] of ITEMS.entries()) {
    const { data, error } = await db
      .from("music_items")
      .upsert({ ...it, links: links(`${it.artist} ${it.title}`), created_by: ids[i % ids.length] }, { onConflict: "external_key" })
      .select("id")
      .single();
    if (error) throw error;
    itemIds.push(data.id);
  }

  // Reset activity on the seed items so the seed (and e2e runs) start clean.
  await db.from("recommendations").delete().in("item_id", itemIds);
  await db.from("ratings").delete().in("item_id", itemIds);
  await db.from("listens").delete().in("item_id", itemIds);
  const { data: recs, error: recErr } = await db
    .from("recommendations")
    .insert([
      { item_id: itemIds[0], from_user: ana, note: "Start with Weird Fishes. Headphones on." },
      { item_id: itemIds[1], from_user: ben, note: "The beat switch at 3:30 is my whole personality." },
      { item_id: itemIds[2], from_user: cleo, note: "One 46-minute piece. Late-night listening." },
      { item_id: itemIds[3], from_user: ben, note: null },
    ])
    .select("id");
  if (recErr) throw recErr;

  await db.from("ratings").upsert([
    { user_id: ben, item_id: itemIds[0], stars: 5, thumb: 1 },
    { user_id: cleo, item_id: itemIds[0], stars: 4, thumb: null },
    { user_id: ana, item_id: itemIds[1], stars: null, thumb: 1 },
    { user_id: ana, item_id: itemIds[2], stars: 5, thumb: null },
    { user_id: ben, item_id: itemIds[2], stars: 2, thumb: -1 },
  ]);
  await db.from("listens").upsert([
    { user_id: ben, item_id: itemIds[0] },
    { user_id: cleo, item_id: itemIds[0] },
    { user_id: ana, item_id: itemIds[1] },
    { user_id: ana, item_id: itemIds[2] },
    { user_id: ben, item_id: itemIds[2] },
  ]);
  await db.from("reactions").upsert([
    { recommendation_id: recs[0].id, user_id: ben, emoji: "🔥" },
    { recommendation_id: recs[0].id, user_id: cleo, emoji: "❤️" },
    { recommendation_id: recs[1].id, user_id: ana, emoji: "🕺" },
  ]);
  await db.from("comments").insert([
    { recommendation_id: recs[0].id, user_id: ben, body: "Reckoner live is unreal." },
    { recommendation_id: recs[2].id, user_id: ben, body: "Fell asleep. Respectfully." },
  ]);

  console.log(`Seeded ${FRIENDS.length} friends and ${ITEMS.length} recommendations.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
