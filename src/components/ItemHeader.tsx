import { Artwork } from "@/components/Artwork";
import type { MusicItem } from "@/lib/types";

// Shared by server and client components.
export function ItemHeader({ item, size = 96 }: { item: MusicItem; size?: number }) {
  const subtitle = [item.kind === "track" && item.album ? item.album : null, item.release_year].filter(Boolean).join(" · ");
  return (
    <div className="flex gap-4">
      <Artwork src={item.artwork_url} alt={`${item.title} artwork`} size={size} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.kind === "album" ? "Album" : "Song"}</p>
        <h3 className="font-display text-lg leading-snug font-semibold text-balance">{item.title}</h3>
        <p className="truncate text-sm">{item.artist}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function AiSummary({ summary }: { summary: string | null }) {
  return summary ? (
    <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm leading-relaxed">
      <span className="mr-1.5 text-xs font-semibold text-accent">AI</span>
      {summary}
    </p>
  ) : (
    <p className="text-xs italic text-muted">AI summary coming in the next refresh.</p>
  );
}
