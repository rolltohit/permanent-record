import { z } from "zod";
import { type Platform, PLATFORMS, parseMusicLink, searchLink } from "./links";

export type ItemKind = "album" | "track";

/** A fully resolved item, ready for `ensure_music_item`. */
export const resolvedItemSchema = z.object({
  kind: z.enum(["album", "track"]),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullable(),
  artwork_url: z.string().url().nullable(),
  release_year: z.number().int().nullable(),
  links: z.object({
    spotify: z.string().url().optional(),
    apple_music: z.string().url().optional(),
    youtube_music: z.string().url().optional(),
  }),
  songlink_url: z.string().url().nullable(),
  external_key: z.string().min(1),
});
export type ResolvedItem = z.infer<typeof resolvedItemSchema>;

export interface CatalogResult {
  kind: ItemKind;
  itunesId: number;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  release_year: number | null;
  appleUrl: string;
}

type Fetch = typeof fetch;

export class ResolveError extends Error {}

// ---------------------------------------------------------------------------
// External response shapes (only the fields we use)
// ---------------------------------------------------------------------------

const odesliEntity = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().optional(),
  artistName: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  apiProvider: z.string().optional(),
});

const odesliResponse = z.object({
  entityUniqueId: z.string(),
  pageUrl: z.string().optional(),
  entitiesByUniqueId: z.record(z.string(), odesliEntity),
  linksByPlatform: z.record(z.string(), z.object({ url: z.string(), entityUniqueId: z.string().optional() })),
});
export type OdesliResponse = z.infer<typeof odesliResponse>;

const itunesItem = z.object({
  wrapperType: z.string(),
  kind: z.string().optional(),
  collectionType: z.string().optional(),
  collectionId: z.number().optional(),
  trackId: z.number().optional(),
  artistName: z.string(),
  collectionName: z.string().optional(),
  trackName: z.string().optional(),
  collectionViewUrl: z.string().optional(),
  trackViewUrl: z.string().optional(),
  artworkUrl100: z.string().optional(),
  releaseDate: z.string().optional(),
});
const itunesResponse = z.object({ resultCount: z.number(), results: z.array(z.unknown()) });

const oembedResponse = z.object({
  title: z.string(),
  author_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
});
export type OembedResponse = z.infer<typeof oembedResponse>;

const ODESLI_PLATFORM: Record<Platform, string> = {
  spotify: "spotify",
  apple_music: "appleMusic",
  youtube_music: "youtubeMusic",
};

// ---------------------------------------------------------------------------
// Normalizers (pure; unit tested against fixtures)
// ---------------------------------------------------------------------------

/** iTunes serves any artwork size by rewriting the dimensions in the URL. */
export function upscaleArtwork(url: string | undefined | null, size = 600): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, `/${size}x${size}bb.$2`);
}

export function normalizeItunesResult(raw: unknown): CatalogResult | null {
  const parsed = itunesItem.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const year = r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || null : null;

  if (r.wrapperType === "collection" && r.collectionId && r.collectionName && r.collectionViewUrl) {
    return {
      kind: "album",
      itunesId: r.collectionId,
      title: r.collectionName,
      artist: r.artistName,
      album: r.collectionName,
      artwork_url: upscaleArtwork(r.artworkUrl100),
      release_year: year,
      appleUrl: r.collectionViewUrl,
    };
  }
  if (r.wrapperType === "track" && r.kind === "song" && r.trackId && r.trackName && r.trackViewUrl) {
    return {
      kind: "track",
      itunesId: r.trackId,
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? null,
      artwork_url: upscaleArtwork(r.artworkUrl100),
      release_year: year,
      appleUrl: r.trackViewUrl,
    };
  }
  return null;
}

/** The iTunes entity for this Odesli result, which we use as the dedupe key. */
function itunesEntity(res: OdesliResponse) {
  const key = Object.keys(res.entitiesByUniqueId).find((k) => k.startsWith("ITUNES_"));
  return key ? { key, entity: res.entitiesByUniqueId[key] } : null;
}

export function externalKey(kind: ItemKind, source: string, id: string | number): string {
  return `${source}:${kind}:${id}`;
}

/**
 * Turns an Odesli response (plus optional iTunes metadata) into a ResolvedItem.
 * Platforms Odesli couldn't match fall back to a search link.
 */
export function normalizeOdesli(res: OdesliResponse, catalog?: CatalogResult | null): ResolvedItem {
  const primary = res.entitiesByUniqueId[res.entityUniqueId];
  const itunes = itunesEntity(res);
  const meta = itunes?.entity ?? primary;
  if (!meta?.title || !meta.artistName) throw new ResolveError("Couldn't read title/artist for that link");

  const kind: ItemKind = (primary?.type ?? meta.type) === "album" ? "album" : "track";
  const title = catalog?.title ?? meta.title;
  const artist = catalog?.artist ?? meta.artistName;

  const links: ResolvedItem["links"] = {};
  for (const { key } of PLATFORMS) {
    links[key] = res.linksByPlatform[ODESLI_PLATFORM[key]]?.url ?? searchLink(key, `${artist} ${title}`);
  }

  const key = itunes
    ? externalKey(kind, "itunes", itunes.entity.id)
    : res.entityUniqueId.toLowerCase();

  return {
    kind,
    title,
    artist,
    album: catalog?.album ?? (kind === "album" ? title : null),
    artwork_url: catalog?.artwork_url ?? upscaleArtwork(meta.thumbnailUrl) ?? primary?.thumbnailUrl ?? null,
    release_year: catalog?.release_year ?? null,
    links,
    songlink_url: res.pageUrl ?? null,
    external_key: key,
  };
}

/** Used without song.link: the Apple link is real, the others are searches. */
export function itemFromCatalogOnly(c: CatalogResult): ResolvedItem {
  const q = `${c.artist} ${c.title}`;
  return {
    kind: c.kind,
    title: c.title,
    artist: c.artist,
    album: c.album,
    artwork_url: c.artwork_url,
    release_year: c.release_year,
    links: {
      spotify: searchLink("spotify", q),
      apple_music: c.appleUrl,
      youtube_music: searchLink("youtube_music", q),
    },
    songlink_url: null,
    external_key: externalKey(c.kind, "itunes", c.itunesId),
  };
}

/** What a pasted link tells us about itself, before any catalog match. */
export interface SourceMeta {
  platform: Platform;
  id: string;
  url: string;
  kind: ItemKind;
  title: string;
  artist: string;
  artwork_url: string | null;
  release_year: number | null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function metaTag(html: string, name: string): string | null {
  const esc = name.replace(/[.:]/g, "\\$&");
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)="${esc}"[^>]+content="([^"]*)"`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${esc}"`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
}

/**
 * Reads title/artist from a Spotify page's Open Graph tags. The description is
 * "Artist · Album · Song · 1997" for tracks and "Artist · Album · 1997 · 12 songs" for albums.
 */
export function metaFromSpotifyHtml(html: string): { title: string; artist: string; artwork_url: string | null; release_year: number | null } | null {
  const title = metaTag(html, "og:title");
  const parts = (metaTag(html, "og:description") ?? "").split(" · ").map((p) => p.trim());
  const artist = metaTag(html, "music:musician_description") || parts[0];
  if (!title || !artist) return null;
  const year = parts.find((p) => /^\d{4}$/.test(p));
  return { title, artist, artwork_url: metaTag(html, "og:image"), release_year: year ? Number(year) : null };
}

/**
 * Reads title/artist from YouTube's oEmbed. Auto-generated music uploads come from an
 * "Artist - Topic" channel with the bare song title; other uploads are usually
 * titled "Artist - Song (Official Video)".
 */
export function metaFromYoutubeOembed(o: OembedResponse, kind: ItemKind): { title: string; artist: string; artwork_url: string | null } {
  const author = (o.author_name ?? "").trim();
  const topic = /\s-\sTopic$/i.test(author);
  let artist = author.replace(/\s-\sTopic$/i, "").replace(/VEVO$/, "").trim();
  let title = o.title.trim();
  if (kind === "album") title = title.replace(/^Album\s+-\s+/i, "");
  const split = !topic && title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split) [, artist, title] = split;
  title = title.replace(/\s*[([](official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|music video|mv)\b[^)\]]*[)\]]/gi, "").trim();
  return { title: title || o.title, artist: artist || author, artwork_url: o.thumbnail_url ?? null };
}

/** Loose comparison key: case, accents, punctuation and "(Remastered)"-style suffixes ignored. */
function looseKey(s: string): string {
  const base = s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const stripped = base.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+(single|ep)$/, "");
  const key = (stripped.trim() ? stripped : base).replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  return key || base;
}

/** The catalog result that is clearly the same record, if any. */
export function bestCatalogMatch(results: CatalogResult[], want: { kind: ItemKind; title: string; artist: string }): CatalogResult | null {
  const title = looseKey(want.title);
  const artist = looseKey(want.artist);
  return (
    results.find((r) => {
      if (r.kind !== want.kind || looseKey(r.title) !== title) return false;
      const a = looseKey(r.artist);
      return a === artist || a.includes(artist) || artist.includes(a);
    }) ?? null
  );
}

/**
 * Builds an item from the pasted link's own metadata. With a catalog match it keys
 * on the iTunes id (same as the song.link path, so pastes from any platform dedupe)
 * and gains a real Apple Music link. The pasted link is always kept as-is.
 */
export function itemFromSource(src: SourceMeta, catalog: CatalogResult | null): ResolvedItem {
  const item: ResolvedItem = catalog
    ? itemFromCatalogOnly(catalog)
    : {
        kind: src.kind,
        title: src.title,
        artist: src.artist,
        album: src.kind === "album" ? src.title : null,
        artwork_url: src.artwork_url,
        release_year: src.release_year,
        links: Object.fromEntries(PLATFORMS.map(({ key }) => [key, searchLink(key, `${src.artist} ${src.title}`)])),
        songlink_url: null,
        external_key: externalKey(src.kind, src.platform, src.id),
      };
  item.links[src.platform] = src.url;
  if (!item.artwork_url) item.artwork_url = src.artwork_url;
  return item;
}

// ---------------------------------------------------------------------------
// Network calls
// ---------------------------------------------------------------------------

async function get(fetchImpl: Fetch, url: string, accept: string): Promise<Response> {
  const res = await fetchImpl(url, { headers: { accept }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new ResolveError("Link lookup is rate limited; try again in a minute");
  if (!res.ok) throw new ResolveError(`The music lookup service is unavailable right now (${res.status}). Try again shortly.`);
  return res;
}

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  return (await get(fetchImpl, url, "application/json")).json();
}

export async function odesliLookup(url: string, fetchImpl: Fetch = fetch): Promise<OdesliResponse> {
  const q = new URLSearchParams({ url, userCountry: "US" });
  const key = process.env.ODESLI_API_KEY;
  if (key) q.set("key", key);
  const body = await getJson(fetchImpl, `https://api.song.link/v1-alpha.1/links?${q}`);
  const parsed = odesliResponse.safeParse(body);
  if (!parsed.success) throw new ResolveError("Unexpected response from song.link");
  return parsed.data;
}

async function itunesLookup(id: string, fetchImpl: Fetch): Promise<CatalogResult | null> {
  const body = itunesResponse.parse(await getJson(fetchImpl, `https://itunes.apple.com/lookup?id=${id}&country=US`));
  return body.results.map(normalizeItunesResult).find((r) => r !== null) ?? null;
}

async function searchItunes(term: string, entity: "album" | "song", fetchImpl: Fetch, limit: number): Promise<CatalogResult[]> {
  const q = new URLSearchParams({ term, entity, limit: String(limit), country: "US", media: "music" });
  const body = itunesResponse.parse(await getJson(fetchImpl, `https://itunes.apple.com/search?${q}`));
  return body.results.map(normalizeItunesResult).filter((r): r is CatalogResult => r !== null);
}

export async function searchCatalog(query: string, fetchImpl: Fetch = fetch, limit = 6): Promise<CatalogResult[]> {
  const term = query.trim();
  if (!term) return [];
  const [albums, songs] = await Promise.all([searchItunes(term, "album", fetchImpl, limit), searchItunes(term, "song", fetchImpl, limit)]);
  return [...albums, ...songs];
}

// song.link retired its free API on 2026-07-31 (keyless calls now get a 401). With an
// ODESLI_API_KEY we still use it, since it finds exact links on every platform. Without
// one, links resolve from each platform's public metadata plus the iTunes catalog.
const odesliEnabled = () => Boolean(process.env.ODESLI_API_KEY);

async function sourceMeta(platform: Platform, url: string, fetchImpl: Fetch): Promise<SourceMeta | CatalogResult> {
  const u = new URL(url);
  if (platform === "apple_music") {
    const [, , type, id] = u.pathname.split("/");
    const trackId = u.searchParams.get("i");
    const c = await itunesLookup(trackId ?? id, fetchImpl);
    if (!c || (type === "album" && !trackId && c.kind !== "album")) throw new ResolveError("Couldn't find that in Apple Music");
    return c;
  }
  if (platform === "spotify") {
    const [, type, id] = u.pathname.split("/");
    const kind: ItemKind = type === "album" ? "album" : "track";
    const meta = metaFromSpotifyHtml(await (await get(fetchImpl, url, "text/html")).text());
    if (!meta) throw new ResolveError("Couldn't read that Spotify link. Try searching by name instead.");
    return { platform, id, url, kind, ...meta };
  }
  // YouTube Music: songs are watch?v=, albums are playlist?list=. oEmbed wants www.youtube.com URLs.
  const v = u.searchParams.get("v");
  const list = u.searchParams.get("list");
  if (!v && !list) throw new ResolveError("Couldn't read that YouTube Music link. Share a song or album link, or search by name.");
  const kind: ItemKind = v ? "track" : "album";
  const target = v ? `https://www.youtube.com/watch?v=${v}` : `https://www.youtube.com/playlist?list=${list}`;
  const body = oembedResponse.safeParse(await getJson(fetchImpl, `https://www.youtube.com/oembed?${new URLSearchParams({ url: target, format: "json" })}`));
  if (!body.success) throw new ResolveError("Unexpected response from YouTube");
  return { platform, id: (v ?? list)!, url, kind, ...metaFromYoutubeOembed(body.data, kind), release_year: null };
}

async function resolveWithoutOdesli(platform: Platform, url: string, fetchImpl: Fetch): Promise<ResolvedItem> {
  const src = await sourceMeta(platform, url, fetchImpl);
  if (!("platform" in src)) return itemFromSource({ ...src, platform, id: String(src.itunesId), url }, src);
  const results = await searchItunes(`${src.artist} ${src.title}`, src.kind === "album" ? "album" : "song", fetchImpl, 10).catch(() => []);
  return itemFromSource(src, bestCatalogMatch(results, src));
}

/** Resolves a pasted Spotify / Apple Music / YouTube Music / song.link URL. */
export async function resolveFromUrl(input: string, fetchImpl: Fetch = fetch): Promise<ResolvedItem> {
  const parsed = parseMusicLink(input);
  if (!parsed) throw new ResolveError("That doesn't look like a Spotify, Apple Music or YouTube Music link");

  let url = parsed.url;
  if (parsed.platform === "spotify_short") {
    // Short links redirect to open.spotify.com; follow them to get the real URL.
    const res = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const expanded = parseMusicLink(res.url);
    if (!expanded || expanded.platform !== "spotify") throw new ResolveError("Couldn't expand that Spotify link");
    url = expanded.url;
  }

  const platform = parsed.platform === "spotify_short" ? "spotify" : parsed.platform;
  if (odesliEnabled() || platform === "songlink") {
    try {
      const odesli = await odesliLookup(url, fetchImpl);
      const itunes = itunesEntity(odesli);
      let catalog: CatalogResult | null = null;
      if (itunes) {
        // Adds release year and, for tracks, the album name. Not essential.
        catalog = await itunesLookup(itunes.entity.id, fetchImpl).catch(() => null);
      }
      return normalizeOdesli(odesli, catalog);
    } catch (e) {
      if (platform !== "songlink") return resolveWithoutOdesli(platform, url, fetchImpl);
      if (odesliEnabled()) throw e;
      throw new ResolveError("song.link links can't be looked up any more. Paste the Spotify, Apple Music or YouTube Music link instead.");
    }
  }
  return resolveWithoutOdesli(platform, url, fetchImpl);
}

/** Resolves a search result picked from the iTunes catalog. */
export async function resolveFromCatalog(c: CatalogResult, fetchImpl: Fetch = fetch): Promise<ResolvedItem> {
  if (!odesliEnabled()) return itemFromCatalogOnly(c);
  try {
    return normalizeOdesli(await odesliLookup(c.appleUrl, fetchImpl), c);
  } catch {
    return itemFromCatalogOnly(c);
  }
}
