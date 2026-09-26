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

/** Used when Odesli is unavailable: Apple link is real, the others are searches. */
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

// ---------------------------------------------------------------------------
// Network calls
// ---------------------------------------------------------------------------

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new ResolveError("Link lookup is rate limited; try again in a minute");
  if (!res.ok) throw new ResolveError(`The music lookup service is unavailable right now (${res.status}). Try again shortly.`);
  return res.json();
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

export async function searchCatalog(query: string, fetchImpl: Fetch = fetch, limit = 6): Promise<CatalogResult[]> {
  const term = query.trim();
  if (!term) return [];
  const run = async (entity: "album" | "song") => {
    const q = new URLSearchParams({ term, entity, limit: String(limit), country: "US", media: "music" });
    const body = itunesResponse.parse(await getJson(fetchImpl, `https://itunes.apple.com/search?${q}`));
    return body.results.map(normalizeItunesResult).filter((r): r is CatalogResult => r !== null);
  };
  const [albums, songs] = await Promise.all([run("album"), run("song")]);
  return [...albums, ...songs];
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

  const odesli = await odesliLookup(url, fetchImpl);
  const itunes = itunesEntity(odesli);
  let catalog: CatalogResult | null = null;
  if (itunes) {
    // Adds release year and, for tracks, the album name. Not essential.
    catalog = await itunesLookup(itunes.entity.id, fetchImpl).catch(() => null);
  }
  return normalizeOdesli(odesli, catalog);
}

/** Resolves a search result picked from the iTunes catalog. */
export async function resolveFromCatalog(c: CatalogResult, fetchImpl: Fetch = fetch): Promise<ResolvedItem> {
  try {
    return normalizeOdesli(await odesliLookup(c.appleUrl, fetchImpl), c);
  } catch {
    return itemFromCatalogOnly(c);
  }
}
