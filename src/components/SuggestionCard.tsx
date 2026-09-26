"use client";

import { useState, useTransition } from "react";
import { dismissSuggestionAction, shareSuggestionAction } from "@/app/actions";
import { PlatformLinks } from "@/components/PlatformLinks";
import { AiSummary, ItemHeader } from "@/components/ItemHeader";
import type { Suggestion } from "@/lib/types";

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { item } = suggestion;

  return (
    <article className="card flex flex-col gap-3 p-4">
      <ItemHeader item={item} />
      <p className="text-sm">
        <span className="mr-1.5 text-xs font-semibold text-accent">WHY</span>
        {suggestion.reason}
      </p>
      <AiSummary summary={item.ai_summary} />
      <PlatformLinks links={item.links} />

      {sharing ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="input min-h-20"
            maxLength={500}
            placeholder="Add a note for the group (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await shareSuggestionAction(suggestion.id, item.id, note);
                  if (!res.ok) setError(res.error);
                })
              }
            >
              Post to Rec Room
            </button>
            <button type="button" className="btn-ghost" onClick={() => setSharing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => setSharing(true)}>
            Share with the group
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() => startTransition(() => dismissSuggestionAction(suggestion.id))}
          >
            Not for me
          </button>
        </div>
      )}
    </article>
  );
}
