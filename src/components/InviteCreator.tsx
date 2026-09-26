"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "@/app/actions";

export function InviteCreator() {
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card flex flex-col gap-3 p-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const res = await createInviteAction(email, admin);
            if (res.ok) {
              setLink(`${window.location.origin}/invite/${res.data}`);
              setCopied(false);
              setEmail("");
            } else setError(res.error);
          });
        }}
      >
        <input
          className="input"
          type="email"
          placeholder="Friend's email (optional, just a label)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={pending}>
          Create invite link
        </button>
      </form>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Make them an admin too
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      {link && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
          <button
            type="button"
            className="btn-ghost py-1"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <p className="text-xs text-muted">Links work once and expire after 14 days.</p>
    </div>
  );
}
