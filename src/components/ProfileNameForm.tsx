"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/app/actions";

export function ProfileNameForm({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="font-display text-xl font-semibold hover:underline">
        {name}
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateProfileAction(value);
          if (res.ok) setEditing(false);
          else setError(res.error);
        });
      }}
    >
      <input className="input py-1.5" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} aria-label="Display name" />
      <button className="btn-primary" disabled={pending}>
        Save
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </form>
  );
}
