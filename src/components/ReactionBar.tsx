"use client";

import { useOptimistic, useTransition } from "react";
import { toggleReactionAction } from "@/app/actions";
import { REACTION_EMOJI } from "@/lib/types";

type Groups = Record<string, { count: number; mine: boolean }>;

export function ReactionBar({ recommendationId, groups }: { recommendationId: string; groups: Groups }) {
  const [, startTransition] = useTransition();
  const [state, toggle] = useOptimistic(groups, (cur: Groups, emoji: string) => {
    const g = cur[emoji] ?? { count: 0, mine: false };
    return { ...cur, [emoji]: { count: g.count + (g.mine ? -1 : 1), mine: !g.mine } };
  });

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
      {REACTION_EMOJI.map((emoji) => {
        const g = state[emoji] ?? { count: 0, mine: false };
        return (
          <button
            key={emoji}
            type="button"
            aria-pressed={g.mine}
            onClick={() =>
              startTransition(async () => {
                toggle(emoji);
                await toggleReactionAction(recommendationId, emoji, !g.mine);
              })
            }
            className={`chip px-2 py-0.5 ${g.mine ? "chip-on" : ""} ${g.count ? "" : "opacity-60 hover:opacity-100"}`}
          >
            <span>{emoji}</span>
            {g.count > 0 && <span className="text-xs tabular-nums text-muted">{g.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
