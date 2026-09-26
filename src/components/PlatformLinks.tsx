import { isSearchLink, PLATFORMS } from "@/lib/music/links";
import type { MusicItem } from "@/lib/types";

const DOT: Record<string, string> = {
  spotify: "#1db954",
  apple_music: "#fa2d48",
  youtube_music: "#ff0000",
};

export function PlatformLinks({ links }: { links: MusicItem["links"] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PLATFORMS.map(({ key, label }) => {
        const url = links[key];
        if (!url) return null;
        const search = isSearchLink(url);
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="chip text-xs font-medium"
            title={search ? `Search ${label}. No exact match was found.` : `Open in ${label}`}
          >
            <span className="size-2 rounded-full" style={{ background: DOT[key] }} />
            {label}
            {search && <span className="text-muted">(search)</span>}
          </a>
        );
      })}
    </div>
  );
}
