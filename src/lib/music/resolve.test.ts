import { describe, expect, it, vi } from "vitest";
import itunesSearch from "./__fixtures__/itunes-search.json";
import odesliSpotifyAlbum from "./__fixtures__/odesli-spotify-album.json";
import odesliYoutubeOnly from "./__fixtures__/odesli-youtube-song-no-itunes.json";
import {
  type CatalogResult,
  normalizeItunesResult,
  normalizeOdesli,
  type OdesliResponse,
  resolveFromCatalog,
  resolveFromUrl,
  resolvedItemSchema,
  searchCatalog,
  upscaleArtwork,
} from "./resolve";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("upscaleArtwork", () => {
  it("rewrites iTunes artwork dimensions", () => {
    expect(upscaleArtwork("https://is1-ssl.mzstatic.com/image/thumb/x/source/100x100bb.jpg")).toBe(
      "https://is1-ssl.mzstatic.com/image/thumb/x/source/600x600bb.jpg",
    );
  });
  it("leaves other URLs alone", () => {
    expect(upscaleArtwork("https://i.scdn.co/image/abc")).toBe("https://i.scdn.co/image/abc");
    expect(upscaleArtwork(undefined)).toBeNull();
  });
});

describe("normalizeItunesResult", () => {
  it("maps albums and songs and skips other result types", () => {
    const [album, song, artist] = itunesSearch.results.map(normalizeItunesResult);
    expect(album).toMatchObject({
      kind: "album",
      itunesId: 1109714933,
      title: "In Rainbows",
      artist: "Radiohead",
      album: "In Rainbows",
      release_year: 2007,
      artwork_url: expect.stringContaining("600x600bb.jpg"),
    });
    expect(song).toMatchObject({ kind: "track", itunesId: 1109715066, title: "Weird Fishes / Arpeggi", album: "In Rainbows" });
    expect(artist).toBeNull();
  });
});

describe("normalizeOdesli", () => {
  it("keys on the iTunes entity so the same album pasted from any platform dedupes", () => {
    const item = normalizeOdesli(odesliSpotifyAlbum as OdesliResponse);
    expect(resolvedItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      kind: "album",
      title: "In Rainbows",
      artist: "Radiohead",
      album: "In Rainbows",
      external_key: "itunes:album:1109714933",
      songlink_url: "https://album.link/s/5vkqYmiPBYLaalcmjujWxK",
      artwork_url: expect.stringContaining("600x600bb.jpg"),
    });
    expect(item.links).toEqual({
      spotify: "https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK",
      apple_music: "https://geo.music.apple.com/us/album/_/1109714933?mt=1&app=music",
      youtube_music: "https://music.youtube.com/playlist?list=OLAK5uy_example",
    });
  });

  it("falls back to search links and the source entity key when platforms are missing", () => {
    const item = normalizeOdesli(odesliYoutubeOnly as OdesliResponse);
    expect(item.kind).toBe("track");
    expect(item.external_key).toBe("youtube_video::abc123");
    expect(item.links.youtube_music).toBe("https://music.youtube.com/watch?v=abc123");
    expect(item.links.spotify).toBe("https://open.spotify.com/search/Small%20Band%20Basement%20Demo");
    expect(item.links.apple_music).toContain("music.apple.com/us/search");
  });

  it("prefers catalog metadata when given", () => {
    const catalog = normalizeItunesResult(itunesSearch.results[0]) as CatalogResult;
    const item = normalizeOdesli(odesliSpotifyAlbum as OdesliResponse, catalog);
    expect(item.release_year).toBe(2007);
  });
});

describe("network wrappers", () => {
  it("resolveFromUrl cleans the link, calls song.link, then enriches from iTunes lookup", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://api.song.link/")) {
        expect(new URL(u).searchParams.get("url")).toBe("https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK");
        return json(odesliSpotifyAlbum);
      }
      if (u.startsWith("https://itunes.apple.com/lookup")) return json({ resultCount: 1, results: [itunesSearch.results[0]] });
      throw new Error(`unexpected ${u}`);
    });
    const item = await resolveFromUrl("https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK?si=zzz", fetchImpl as typeof fetch);
    expect(item.release_year).toBe(2007);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolveFromUrl rejects non-music links without calling the network", async () => {
    const fetchImpl = vi.fn();
    await expect(resolveFromUrl("https://example.com", fetchImpl as unknown as typeof fetch)).rejects.toThrow(/doesn't look like/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolveFromUrl surfaces rate limiting", async () => {
    const fetchImpl = vi.fn(async () => json({}, 429));
    await expect(resolveFromUrl("https://open.spotify.com/album/x", fetchImpl as unknown as typeof fetch)).rejects.toThrow(/rate limited/);
  });

  it("resolveFromCatalog degrades to Apple link + searches when song.link fails", async () => {
    const catalog = normalizeItunesResult(itunesSearch.results[1]) as CatalogResult;
    const item = await resolveFromCatalog(catalog, (async () => json({}, 500)) as unknown as typeof fetch);
    expect(item.external_key).toBe("itunes:track:1109715066");
    expect(item.links.apple_music).toBe(catalog.appleUrl);
    expect(item.links.spotify).toContain("/search/");
  });

  it("searchCatalog merges album and song results", async () => {
    const fetchImpl = vi.fn(async () => json(itunesSearch));
    const results = await searchCatalog("in rainbows", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.kind)).toEqual(["album", "track", "album", "track"]);
  });
});
