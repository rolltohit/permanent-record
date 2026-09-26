import { describe, expect, it } from "vitest";
import { groupReactions, itemStats, timeAgo } from "./feed";
import type { FeedEntry } from "./types";

const item = {
  ratings: [
    { user_id: "me", stars: 5, thumb: 1 },
    { user_id: "a", stars: 4, thumb: null },
    { user_id: "b", stars: null, thumb: -1 },
  ],
  listens: [{ user_id: "a" }, { user_id: "me" }],
} as unknown as FeedEntry["item"];

describe("itemStats", () => {
  it("summarizes ratings and the viewer's own activity", () => {
    expect(itemStats(item, "me")).toEqual({
      mine: { user_id: "me", stars: 5, thumb: 1 },
      listened: true,
      listenerCount: 2,
      avgStars: 4.5,
      ratingCount: 2,
      thumbsUp: 1,
      thumbsDown: 1,
    });
    expect(itemStats(item, "z")).toMatchObject({ mine: null, listened: false });
  });
});

describe("groupReactions", () => {
  it("counts per emoji and flags the viewer's", () => {
    const g = groupReactions(
      [
        { emoji: "🔥", user_id: "a" },
        { emoji: "❤️", user_id: "me" },
        { emoji: "🔥", user_id: "me" },
      ],
      "me",
    );
    expect([...g.entries()]).toEqual([
      ["🔥", { count: 2, mine: true }],
      ["❤️", { count: 1, mine: true }],
    ]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  it.each([
    ["2026-09-26T11:59:30Z", "just now"],
    ["2026-09-26T11:15:00Z", "45m"],
    ["2026-09-26T07:00:00Z", "5h"],
    ["2026-09-23T12:00:00Z", "3d"],
    ["2026-08-01T12:00:00Z", "Aug 1"],
  ])("%s → %s", (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));
});
