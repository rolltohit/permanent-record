import { afterEach, describe, expect, it, vi } from "vitest";
import itunesSearch from "./__fixtures__/itunes-search.json";
import odesliSpotifyAlbum from "./__fixtures__/odesli-spotify-album.json";
import odesliYoutubeOnly from "./__fixtures__/odesli-youtube-song-no-itunes.json";
import {
  bestCatalogMatch,
  type CatalogResult,
  itemFromSource,
  metaFromSpotifyHtml,
  metaFromYoutubeOembed,
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

describe("network wrappers (with an ODESLI_API_KEY)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolveFromUrl cleans the link, calls song.link, then enriches from iTunes lookup", async () => {
    vi.stubEnv("ODESLI_API_KEY", "k");
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
    vi.stubEnv("ODESLI_API_KEY", "k");
    const fetchImpl = vi.fn(async () => json({}, 429));
    await expect(resolveFromUrl("https://open.spotify.com/album/x", fetchImpl as unknown as typeof fetch)).rejects.toThrow(/rate limited/);
  });

  it("resolveFromCatalog degrades to Apple link + searches when song.link fails", async () => {
    vi.stubEnv("ODESLI_API_KEY", "k");
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

const weirdFishes = normalizeItunesResult(itunesSearch.results[1]) as CatalogResult;
const inRainbows = normalizeItunesResult(itunesSearch.results[0]) as CatalogResult;

describe("keyless metadata parsing", () => {
  it("reads a Spotify track page's Open Graph tags", () => {
    const html = `<head><meta property="og:title" content="Weird Fishes / Arpeggi"/>
      <meta property="og:description" content="Radiohead · In Rainbows · Song · 2007"/>
      <meta property="og:image" content="https://i.scdn.co/image/abc"/></head>`;
    expect(metaFromSpotifyHtml(html)).toEqual({
      title: "Weird Fishes / Arpeggi",
      artist: "Radiohead",
      artwork_url: "https://i.scdn.co/image/abc",
      release_year: 2007,
    });
  });

  it("reads a Spotify album page and decodes entities", () => {
    const html = `<meta content="Simon &amp; Garfunkel · Album · 1970 · 11 songs." property="og:description">
      <meta property="og:title" content="Bridge Over Troubled Water">`;
    expect(metaFromSpotifyHtml(html)).toMatchObject({ title: "Bridge Over Troubled Water", artist: "Simon & Garfunkel", release_year: 1970 });
    expect(metaFromSpotifyHtml("<html></html>")).toBeNull();
  });

  it("reads YouTube oEmbed for Topic channels and 'Artist - Song' uploads", () => {
    expect(metaFromYoutubeOembed({ title: "Weird Fishes / Arpeggi", author_name: "Radiohead - Topic" }, "track")).toMatchObject({
      title: "Weird Fishes / Arpeggi",
      artist: "Radiohead",
    });
    expect(
      metaFromYoutubeOembed({ title: "Radiohead - Weird Fishes / Arpeggi (Official Video) [HD]", author_name: "RadioheadVEVO" }, "track"),
    ).toMatchObject({ title: "Weird Fishes / Arpeggi", artist: "Radiohead" });
    expect(metaFromYoutubeOembed({ title: "Album - In Rainbows", author_name: "Radiohead - Topic" }, "album")).toMatchObject({
      title: "In Rainbows",
    });
  });

  it("matches catalog results loosely but only for the same record", () => {
    const results = [inRainbows, weirdFishes];
    expect(bestCatalogMatch(results, { kind: "track", title: "Weird Fishes/Arpeggi", artist: "radiohead" })).toBe(weirdFishes);
    expect(bestCatalogMatch(results, { kind: "album", title: "In Rainbows (Remastered)", artist: "Radiohead" })).toBe(inRainbows);
    expect(bestCatalogMatch(results, { kind: "track", title: "Weird Fishes / Arpeggi", artist: "Someone Else" })).toBeNull();
    expect(bestCatalogMatch(results, { kind: "album", title: "Weird Fishes / Arpeggi", artist: "Radiohead" })).toBeNull();
  });

  it("keeps the pasted link and keys on iTunes when matched", () => {
    const src = {
      platform: "youtube_music" as const,
      id: "vid",
      url: "https://music.youtube.com/watch?v=vid",
      kind: "track" as const,
      title: "Weird Fishes / Arpeggi",
      artist: "Radiohead",
      artwork_url: "https://i.ytimg.com/vi/vid/hqdefault.jpg",
      release_year: null,
    };
    const matched = itemFromSource(src, weirdFishes);
    expect(matched.external_key).toBe("itunes:track:1109715066");
    expect(matched.links).toMatchObject({ youtube_music: src.url, apple_music: weirdFishes.appleUrl });
    expect(matched.links.spotify).toContain("/search/");

    const alone = itemFromSource(src, null);
    expect(resolvedItemSchema.parse(alone)).toEqual(alone);
    expect(alone.external_key).toBe("youtube_music:track:vid");
    expect(alone.artwork_url).toBe(src.artwork_url);
    expect(alone.links.youtube_music).toBe(src.url);
  });
});

describe("resolveFromUrl without song.link", () => {
  const route = (handlers: Record<string, () => Response>) =>
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      const hit = Object.keys(handlers).find((prefix) => u.startsWith(prefix));
      if (!hit) throw new Error(`unexpected ${u}`);
      return handlers[hit]();
    });

  it("resolves a YouTube Music link via oEmbed + iTunes, dropping si=", async () => {
    const fetchImpl = route({
      "https://www.youtube.com/oembed": () => json({ title: "Weird Fishes / Arpeggi", author_name: "Radiohead - Topic" }),
      "https://itunes.apple.com/search": () => json({ resultCount: 1, results: [itunesSearch.results[1]] }),
    });
    const item = await resolveFromUrl("https://music.youtube.com/watch?v=-OZ_Ug9tVPg&si=5IXCp1vJWpMYS0oc", fetchImpl as typeof fetch);
    const oembed = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(oembed.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=-OZ_Ug9tVPg");
    expect(item).toMatchObject({ kind: "track", title: "Weird Fishes / Arpeggi", external_key: "itunes:track:1109715066", release_year: 2007 });
    expect(item.links.youtube_music).toBe("https://music.youtube.com/watch?v=-OZ_Ug9tVPg");
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("song.link"))).toBe(false);
  });

  it("resolves a Spotify link from its page even when iTunes is down", async () => {
    const fetchImpl = route({
      "https://open.spotify.com/album/abc": () =>
        new Response(`<meta property="og:title" content="Basement Demo"><meta property="og:description" content="Small Band · Album · 2024 · 3 songs.">`),
      "https://itunes.apple.com/search": () => json({}, 503),
    });
    const item = await resolveFromUrl("https://open.spotify.com/album/abc?si=x", fetchImpl as typeof fetch);
    expect(item).toMatchObject({ kind: "album", title: "Basement Demo", artist: "Small Band", release_year: 2024, external_key: "spotify:album:abc" });
    expect(item.links.spotify).toBe("https://open.spotify.com/album/abc");
  });

  it("resolves an Apple Music song link with a single iTunes lookup", async () => {
    const fetchImpl = route({
      "https://itunes.apple.com/lookup?id=1109715066": () => json({ resultCount: 1, results: [itunesSearch.results[1]] }),
    });
    const item = await resolveFromUrl("https://music.apple.com/us/album/in-rainbows/1109714933?i=1109715066", fetchImpl as typeof fetch);
    expect(item).toMatchObject({ kind: "track", external_key: "itunes:track:1109715066" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains that song.link links need the original link now", async () => {
    const fetchImpl = route({ "https://api.song.link/": () => json({}, 401) });
    await expect(resolveFromUrl("https://song.link/s/abc", fetchImpl as typeof fetch)).rejects.toThrow(/Paste the Spotify/);
  });

  it("resolveFromCatalog skips song.link entirely", async () => {
    const fetchImpl = vi.fn();
    const item = await resolveFromCatalog(weirdFishes, fetchImpl as unknown as typeof fetch);
    expect(item.links.apple_music).toBe(weirdFishes.appleUrl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
