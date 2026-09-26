import { describe, expect, it } from "vitest";
import type { CatalogResult } from "@/lib/music/resolve";
import { buildBatch, isExcluded, matchCatalog, norm, planSummaries, type RoomSnapshot } from "./batch";
import { suggestionsFileSchema, summariesFileSchema, tasteProfileSchema } from "./batch-schema";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const I1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const I2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const I3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const room: RoomSnapshot = {
  profiles: [
    { id: U1, display_name: "Ana" },
    { id: U2, display_name: "Ben" },
  ],
  items: [
    { id: I1, kind: "album", title: "In Rainbows", artist: "Radiohead", album: "In Rainbows", release_year: 2007, external_key: "itunes:album:1", ai_summary: null },
    { id: I2, kind: "track", title: "Nights", artist: "Frank Ocean", album: "Blonde", release_year: 2016, external_key: "itunes:track:2", ai_summary: "Already done summary." },
    { id: I3, kind: "album", title: "Loud Record", artist: "Noise Band", album: null, release_year: null, external_key: "itunes:album:3", ai_summary: null },
  ],
  recommendations: [
    { id: "r1", item_id: I1, from_user: U1, note: "Start with Weird Fishes" },
    { id: "r2", item_id: I2, from_user: U2, note: null },
    { id: "r3", item_id: I3, from_user: U2, note: null },
  ],
  ratings: [
    { user_id: U2, item_id: I1, stars: 5, thumb: null },
    { user_id: U2, item_id: I3, stars: 2, thumb: null },
    { user_id: U1, item_id: I3, stars: 3, thumb: null },
  ],
  reactions: [
    { recommendation_id: "r2", user_id: U1, emoji: "🔥" },
    { recommendation_id: "r3", user_id: U1, emoji: "😴" },
  ],
  comments: [{ recommendation_id: "r1", user_id: U2, body: "the drums!!" }],
  suggestions: [{ user_id: U1, item_id: I2 }],
};

describe("buildBatch", () => {
  const { summariesTodo, tasteProfiles } = buildBatch(room);

  it("queues items without a summary, with notes and comments as context", () => {
    expect(summariesTodo.map((s) => s.item_id)).toEqual([I1, I3]);
    expect(summariesTodo[0]).toMatchObject({ recommender_notes: ["Start with Weird Fishes"], comments: ["the drums!!"] });
    expect(buildBatch(room, { resummarize: true }).summariesTodo).toHaveLength(3);
  });

  it("splits each member's signals into loved and disliked", () => {
    const ana = tasteProfiles.find((p) => p.user_id === U1)!;
    const ben = tasteProfiles.find((p) => p.user_id === U2)!;
    expect(ana.loved.map((i) => i.title)).toEqual(["Nights"]); // 🔥 reaction
    expect(ana.disliked.map((i) => i.title)).toEqual(["Loud Record"]); // 😴 outweighs 3 stars
    expect(ben.loved).toEqual([expect.objectContaining({ title: "In Rainbows", stars: 5, their_comments: ["the drums!!"] })]);
    expect(ben.disliked.map((i) => i.title)).toEqual(["Loud Record"]);
    expect(ben.recommended_to_group.map((r) => r.title)).toEqual(["Nights", "Loud Record"]);
    tasteProfiles.forEach((p) => tasteProfileSchema.parse(p));
  });

  it("excludes everything in the room once", () => {
    const ana = tasteProfiles.find((p) => p.user_id === U1)!;
    expect(ana.exclude.map((e) => e.external_key)).toEqual(["itunes:album:1", "itunes:track:2", "itunes:album:3"]);
  });
});

describe("norm / matchCatalog", () => {
  const result = (over: Partial<CatalogResult>): CatalogResult => ({
    kind: "album",
    itunesId: 1,
    title: "X",
    artist: "Y",
    album: null,
    artwork_url: null,
    release_year: null,
    appleUrl: "https://music.apple.com/us/album/1",
    ...over,
  });

  it("normalizes editions, punctuation, accents and leading 'the'", () => {
    expect(norm("OK Computer (Collector's Edition)")).toBe("ok computer");
    expect(norm("The Beatles")).toBe("beatles");
    expect(norm("Beyoncé")).toBe("beyonce");
    expect(norm("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(norm("Song - Single")).toBe("song");
  });

  it("prefers an exact title match of the right kind", () => {
    const results = [
      result({ itunesId: 1, kind: "track", title: "Blonde", artist: "Frank Ocean" }),
      result({ itunesId: 2, title: "Blonde (Deluxe Remastered)", artist: "Frank Ocean" }),
      result({ itunesId: 3, title: "Blonde", artist: "Frank Ocean" }),
    ];
    expect(matchCatalog({ kind: "album", title: "Blonde", artist: "Frank Ocean" }, results)?.itunesId).toBe(2);
    // norm() strips the edition suffix, so both 2 and 3 are exact; first wins.
  });

  it("returns null when artist or title don't match, rather than guessing", () => {
    const results = [result({ title: "Made Up Album", artist: "Someone Else" })];
    expect(matchCatalog({ kind: "album", title: "Made Up Album", artist: "Radiohead" }, results)).toBeNull();
    expect(matchCatalog({ kind: "album", title: "Other", artist: "Someone Else" }, results)).toBeNull();
  });
});

describe("isExcluded", () => {
  const exclude = [{ external_key: "itunes:album:1", artist: "Radiohead", title: "In Rainbows" }];
  it("matches on key or on normalized artist and title", () => {
    expect(isExcluded(exclude, { external_key: "itunes:album:1", artist: "?", title: "?" })).toBe(true);
    expect(isExcluded(exclude, { external_key: "spotify:x", artist: "radiohead", title: "In Rainbows (Deluxe Edition)" })).toBe(true);
    expect(isExcluded(exclude, { external_key: "itunes:album:9", artist: "Radiohead", title: "Kid A" })).toBe(false);
  });
});

describe("planSummaries", () => {
  it("skips unchanged and unknown items so pushing twice is a no-op", () => {
    const current = new Map<string, string | null>([
      [I1, null],
      [I2, "Same text here, long enough."],
    ]);
    const plan = planSummaries(
      [
        { item_id: I1, summary: "New summary text for this one." },
        { item_id: I2, summary: "Same text here, long enough." },
        { item_id: I3, summary: "Item that no longer exists." },
      ],
      current,
    );
    expect(plan.updates.map((u) => u.item_id)).toEqual([I1]);
    expect(plan.unchanged).toBe(1);
    expect(plan.unknown).toEqual([I3]);
  });
});

describe("output schemas", () => {
  it("reject malformed Claude output", () => {
    expect(summariesFileSchema.safeParse([{ item_id: "nope", summary: "short" }]).success).toBe(false);
    expect(suggestionsFileSchema.safeParse([{ user_id: U1, kind: "ep", title: "x", artist: "y", reason: "because it rocks" }]).success).toBe(false);
    expect(suggestionsFileSchema.safeParse([{ user_id: U1, kind: "album", title: "Kid A", artist: "Radiohead", reason: "You loved In Rainbows." }]).success).toBe(true);
  });
});
