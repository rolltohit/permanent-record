"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setListenedAction, setRatingAction } from "@/app/actions";

interface Props {
  itemId: string;
  listened: boolean;
  stars: number | null;
  thumb: -1 | 1 | null;
}

/** Listened toggle, 1–5 stars and thumbs for the viewer's own take on an item. */
export function ItemControls({ itemId, listened, stars, thumb }: Props) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setOptimistic] = useOptimistic({ listened, stars, thumb });

  function save(next: typeof state) {
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const res =
        next.stars !== state.stars || next.thumb !== state.thumb
          ? await setRatingAction(itemId, { stars: next.stars, thumb: next.thumb })
          : await setListenedAction(itemId, next.listened);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={state.listened}
          onClick={() => save({ ...state, listened: !state.listened })}
          className={`chip ${state.listened ? "chip-on" : ""}`}
        >
          {state.listened ? "✓ Listened" : "Mark listened"}
        </button>

        <div className="flex items-center" role="group" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={state.stars === n}
              onClick={() => save({ ...state, listened: true, stars: state.stars === n ? null : n })}
              className={`px-0.5 text-xl leading-none transition hover:scale-110 ${
                state.stars !== null && n <= state.stars ? "text-accent" : "text-line"
              }`}
            >
              ★
            </button>
          ))}
        </div>

        <div className="flex gap-1" role="group" aria-label="Thumbs">
          {([1, -1] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-label={t === 1 ? "Thumbs up" : "Thumbs down"}
              aria-pressed={state.thumb === t}
              onClick={() => save({ ...state, listened: true, thumb: state.thumb === t ? null : t })}
              className={`chip px-2 ${state.thumb === t ? "chip-on" : ""}`}
            >
              {t === 1 ? "👍" : "👎"}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
