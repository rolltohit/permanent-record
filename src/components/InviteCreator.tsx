"use client";

import { useEffect, useState, useTransition } from "react";
import { createInviteAction } from "@/app/actions";
import { inviteMessage } from "@/lib/auth-flow";

/** Share / copy buttons for one invite link. */
export function InviteShare({ code, name, compact = false }: { code: string; name?: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const link = () => `${window.location.origin}/invite/${code}`;
  const copy = async (what: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link() : inviteMessage(link(), name));
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", link());
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Join me on Rec Room", text: inviteMessage(link(), name) });
    } catch (e) {
      if ((e as Error).name !== "AbortError") await copy("message");
    }
  };
  // Only known in the browser, so decide after hydration.
  const [canShare, setCanShare] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after hydration
  useEffect(() => setCanShare("share" in navigator), []);

  if (compact) {
    return (
      <button type="button" className="text-xs text-muted underline" onClick={() => (canShare ? share() : copy("link"))}>
        {copied ? "Copied" : canShare ? "Share" : "Copy link"}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {canShare && (
        <button type="button" className="btn-primary" onClick={share}>
          Share invite…
        </button>
      )}
      <button type="button" className={canShare ? "btn-ghost" : "btn-primary"} onClick={() => copy("message")}>
        {copied === "message" ? "Copied!" : "Copy message"}
      </button>
      <button type="button" className="btn-ghost" onClick={() => copy("link")}>
        {copied === "link" ? "Copied!" : "Copy link only"}
      </button>
    </div>
  );
}

export function InviteCreator() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [created, setCreated] = useState<{ code: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (created) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p className="font-medium">Invite ready{created.name ? ` for ${created.name}` : ""} 🎉</p>
        <p className="text-sm text-muted">
          Send it however you usually talk to them. They open the link, type their email and a code we send them, and they&apos;re
          in.
        </p>
        <input
          className="input font-mono text-xs"
          readOnly
          aria-label="Invite link"
          value={`${typeof window === "undefined" ? "" : window.location.origin}/invite/${created.code}`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <InviteShare code={created.code} name={created.name} />
        <button type="button" className="self-start text-sm text-muted underline" onClick={() => setCreated(null)}>
          Invite someone else
        </button>
      </div>
    );
  }

  return (
    <form
      className="card flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await createInviteAction({ name, email, grantsAdmin: admin });
          if (!res.ok) return setError(res.error);
          setCreated({ code: res.data, name: name.trim() });
          setName("");
          setEmail("");
          setAdmin(false);
        });
      }}
    >
      <p className="font-medium">Invite a friend</p>
      <label className="flex flex-col gap-1 text-sm">
        Their name <span className="text-xs text-muted">Optional. We&apos;ll greet them with it.</span>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Sam" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Their email{" "}
        <span className="text-xs text-muted">Optional. If you add it, they can also join just by signing in with it.</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sam@example.com" />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> Make them an admin too
      </label>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create invite"}
      </button>
      <p className="text-xs text-muted">Each invite works for one person and lasts 30 days. You can renew it if it runs out.</p>
    </form>
  );
}
