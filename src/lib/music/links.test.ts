import { describe, expect, it } from "vitest";
import { isSearchLink, parseMusicLink, searchLink } from "./links";

describe("parseMusicLink", () => {
  it.each([
    [
      "https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK?si=abc123",
      { platform: "spotify", url: "https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK" },
    ],
    [
      "https://open.spotify.com/intl-de/track/3n3Ppam7vgaVa1iaRUc9Lp?si=x&utm_source=copy",
      { platform: "spotify", url: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp" },
    ],
    ["spotify:album:5vkqYmiPBYLaalcmjujWxK", { platform: "spotify", url: "https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK" }],
    ["https://spotify.link/AbCdEf?foo=1", { platform: "spotify_short", url: "https://spotify.link/AbCdEf" }],
    [
      "https://music.apple.com/us/album/in-rainbows/1109714933?uo=4",
      { platform: "apple_music", url: "https://music.apple.com/us/album/1109714933" },
    ],
    [
      "https://music.apple.com/gb/album/weird-fishes/1109714933?i=1109715066&ls",
      { platform: "apple_music", url: "https://music.apple.com/gb/album/1109714933?i=1109715066" },
    ],
    [
      "https://music.apple.com/us/song/weird-fishes/1109715066",
      { platform: "apple_music", url: "https://music.apple.com/us/song/1109715066" },
    ],
    [
      "https://music.youtube.com/watch?v=abc123&feature=share",
      { platform: "youtube_music", url: "https://music.youtube.com/watch?v=abc123" },
    ],
    [
      "https://music.youtube.com/playlist?list=OLAK5uy_example&si=zz",
      { platform: "youtube_music", url: "https://music.youtube.com/playlist?list=OLAK5uy_example" },
    ],
    ["https://music.youtube.com/browse/MPREb_abc", { platform: "youtube_music", url: "https://music.youtube.com/browse/MPREb_abc" }],
    ["https://www.youtube.com/watch?v=abc123&t=30", { platform: "youtube_music", url: "https://music.youtube.com/watch?v=abc123" }],
    ["https://youtu.be/abc123?si=q", { platform: "youtube_music", url: "https://music.youtube.com/watch?v=abc123" }],
    ["https://album.link/s/5vkqYmiPBYLaalcmjujWxK", { platform: "songlink", url: "https://album.link/s/5vkqYmiPBYLaalcmjujWxK" }],
    ["  https://open.spotify.com/album/abc  ", { platform: "spotify", url: "https://open.spotify.com/album/abc" }],
  ])("parses %s", (input, expected) => {
    expect(parseMusicLink(input)).toEqual(expected);
  });

  it.each([
    "radiohead in rainbows",
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb",
    "https://music.apple.com/us/artist/radiohead/657515",
    "https://music.youtube.com/channel/UC123",
    "https://example.com/album/1",
    "javascript:alert(1)",
  ])("rejects %s", (input) => {
    expect(parseMusicLink(input)).toBeNull();
  });
});

describe("searchLink", () => {
  it("builds encoded search URLs recognized as searches", () => {
    const url = searchLink("youtube_music", "Radiohead In Rainbows");
    expect(url).toBe("https://music.youtube.com/search?q=Radiohead%20In%20Rainbows");
    expect(isSearchLink(url)).toBe(true);
    expect(isSearchLink(searchLink("spotify", "x"))).toBe(true);
    expect(isSearchLink(searchLink("apple_music", "x"))).toBe(true);
    expect(isSearchLink("https://open.spotify.com/album/abc")).toBe(false);
  });
});
