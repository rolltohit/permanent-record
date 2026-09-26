"use client";

import { useRef, useState, useTransition } from "react";
import { postRecommendationAction, resolveCatalogAction, resolveLinkAction, searchMusicAction } from "@/app/actions";
import { Artwork } from "@/components/Artwork";
import { PlatformLinks } from "@/components/PlatformLinks";
import { parseMusicLink } from "@/lib/music/links";
import type { CatalogResult, ResolvedItem } from "@/lib/music/resolve";

export function AddFlow() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [item, setItem] = useState<ResolvedItem | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [resolving, startResolve] = useTransition();
  const [posting, startPost] = useTransition();

  const isLink = parseMusicLink(query) !== null;

  const latest = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Links resolve immediately; plain text searches after a short pause.
  function onQueryChange(value: string) {
    setQuery(value);
    setError(null);
    clearTimeout(timer.current);
    const q = value.trim();
    latest.current = q;
    if (!q) {
      setResults([]);
      return;
    }
    if (parseMusicLink(q)) {
      startResolve(async () => {
        const res = await resolveLinkAction(q);
        if (latest.current !== q) return;
        if (res.ok) setItem(res.data);
        else setError(res.error);
      });
      return;
    }
    if (q.length < 2) return;
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchMusicAction(q);
        if (latest.current !== q) return;
        if (res.ok) setResults(res.data);
        else setError(res.error);
      });
    }, 350);
  }

  function pick(c: CatalogResult) {
    setError(null);
    startResolve(async () => {
      const res = await resolveCatalogAction(c);
      if (res.ok) setItem(res.data);
      else setError(res.error);
    });
  }

  function post() {
    if (!item) return;
    setError(null);
    startPost(async () => {
      const res = await postRecommendationAction(item, note);
      // On success the action redirects to the feed.
      if (res && !res.ok) setError(res.error);
    });
  }

  if (item) {
    return (
      <div className="card flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <Artwork src={item.artwork_url} alt="" size={112} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.kind === "album" ? "Album" : "Song"}</p>
            <h2 className="font-display text-xl font-semibold">{item.title}</h2>
            <p className="text-sm">{item.artist}</p>
            <p className="text-xs text-muted">
              {[item.kind === "track" ? item.album : null, item.release_year].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <PlatformLinks links={item.links} />
        <label className="flex flex-col gap-1 text-sm font-medium">
          Why should everyone hear this? <span className="font-normal text-muted">(optional)</span>
          <textarea
            className="input min-h-24"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Track 4 at full volume. Trust me."
          />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={post} disabled={posting}>
            {posting ? "Posting…" : "Post to Rec Room"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setItem(null)} disabled={posting}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        className="input"
        autoFocus
        inputMode="search"
        placeholder="Paste a link or search artist, album or song"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Link or search"
      />
      {(searching || resolving) && <p className="text-sm text-muted">{resolving ? "Looking that up…" : "Searching…"}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
      {!isLink && results.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {results.map((r) => (
            <li key={`${r.kind}-${r.itunesId}`}>
              <button type="button" onClick={() => pick(r)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2">
                <Artwork src={r.artwork_url} alt="" size={48} className="rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {r.artist}
                    {r.kind === "track" && r.album ? ` · ${r.album}` : ""}
                  </span>
                </span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{r.kind === "album" ? "Album" : "Song"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
