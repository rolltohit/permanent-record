"use client";

import { useRef, useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions";

export function CommentForm({ recommendationId }: { recommendationId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await addCommentAction(recommendationId, body);
      if (res.ok) {
        setBody("");
        setError(null);
        input.current?.focus();
      } else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          ref={input}
          className="input"
          maxLength={280}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment"
          aria-label="Comment"
        />
        <button className="btn-primary" disabled={pending || !body.trim()}>
          Post
        </button>
      </div>
      <p className={`text-right text-xs ${body.length > 260 ? "text-bad" : "text-muted"}`}>
        {error ?? (body.length ? `${280 - body.length} left` : "")}
      </p>
    </form>
  );
}
