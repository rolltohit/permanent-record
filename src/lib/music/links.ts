export type Platform = "spotify" | "apple_music" | "youtube_music";

export const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "spotify", label: "Spotify" },
  { key: "apple_music", label: "Apple Music" },
  { key: "youtube_music", label: "YouTube Music" },
];

export type ParsedLink =
  | { platform: Platform; url: string }
  | { platform: "songlink"; url: string }
  | { platform: "spotify_short"; url: string };

/**
 * Recognizes a pasted streaming link and returns a canonical URL with tracking
 * params (si=, utm_*, feature=...) stripped. Returns null for anything else.
 */
export function parseMusicLink(input: string): ParsedLink | null {
  const raw = input.trim();

  const uri = raw.match(/^spotify:(album|track):([A-Za-z0-9]+)$/);
  if (uri) return { platform: "spotify", url: `https://open.spotify.com/${uri[1]}/${uri[2]}` };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "open.spotify.com") {
    const m = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(album|track)\/([A-Za-z0-9]+)/i);
    return m ? { platform: "spotify", url: `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}` } : null;
  }
  if (host === "spotify.link" || host === "spotify.app.link") {
    return { platform: "spotify_short", url: `https://${host}${url.pathname}` };
  }

  if (host === "music.apple.com" || host === "itunes.apple.com") {
    const m = url.pathname.match(/^\/([a-z]{2})\/(album|song)\/(?:[^/]+\/)?(\d+)/i);
    if (!m) return null;
    const [, country, type, id] = m;
    const trackId = url.searchParams.get("i");
    const clean = new URL(`https://music.apple.com/${country.toLowerCase()}/${type.toLowerCase()}/${id}`);
    if (trackId && /^\d+$/.test(trackId)) clean.searchParams.set("i", trackId);
    return { platform: "apple_music", url: clean.toString() };
  }

  if (host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (url.pathname === "/watch" && v) return { platform: "youtube_music", url: `https://music.youtube.com/watch?v=${v}` };
    const list = url.searchParams.get("list");
    if (url.pathname === "/playlist" && list) {
      return { platform: "youtube_music", url: `https://music.youtube.com/playlist?list=${list}` };
    }
    const browse = url.pathname.match(/^\/browse\/([A-Za-z0-9_-]+)/);
    if (browse) return { platform: "youtube_music", url: `https://music.youtube.com/browse/${browse[1]}` };
    return null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    return url.pathname === "/watch" && v ? { platform: "youtube_music", url: `https://music.youtube.com/watch?v=${v}` } : null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { platform: "youtube_music", url: `https://music.youtube.com/watch?v=${id}` } : null;
  }

  if (host === "song.link" || host === "album.link" || host === "odesli.co") {
    return { platform: "songlink", url: `https://${host}${url.pathname}` };
  }

  return null;
}

/** A search URL on each platform, used when Odesli has no direct link. */
export function searchLink(platform: Platform, query: string): string {
  const q = encodeURIComponent(query);
  switch (platform) {
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "apple_music":
      return `https://music.apple.com/us/search?term=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
  }
}

export function isSearchLink(url: string): boolean {
  return /\/search(\/|\?)/.test(url);
}
