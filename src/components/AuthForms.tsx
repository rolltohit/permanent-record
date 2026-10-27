"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { type FlowResult, joinAction, sendCodeAction, verifyCodeAction } from "@/app/auth/actions";
import { inviteCodeFrom } from "@/lib/auth-flow";

const RESEND_AFTER_S = 60;
const REMEMBER_FOR_MS = 60 * 60 * 1000; // codes last an hour

type Pending = { email: string; name: string; sentAt: number; key: string };

// The code step survives a reload or the tab being closed while someone checks
// their email (common on phones), so they never have to start over.
const storageKey = "recroom:pending-sign-in";
function loadPending(key: string): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Pending | null;
    return p && p.key === key && Date.now() - p.sentAt < REMEMBER_FOR_MS ? p : null;
  } catch {
    return null;
  }
}
function savePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(storageKey, JSON.stringify(p));
    else localStorage.removeItem(storageKey);
  } catch {
    // Private mode: the flow still works, it just won't survive a reload.
  }
}

function useSecondsUntil(at: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? (
    <p id={id} role="alert" className="text-sm text-bad">
      {children}
    </p>
  ) : null;
}

/**
 * Email → code → signed in (and joined, when there's an invite). The email also
 * has a one-tap link, which works on any device; the code is the fallback that
 * always works where you started.
 */
export function SignInFlow({
  invite,
  next = "/",
  askName = false,
  defaultName = "",
  defaultEmail = "",
  sendLabel,
}: {
  invite?: string;
  next?: string;
  askName?: boolean;
  defaultName?: string;
  defaultEmail?: string;
  sendLabel: string;
}) {
  const key = invite ? `invite:${invite}` : "login";
  const ids = { email: useId(), name: useId(), code: useId(), error: useId() };
  const [emailValue, setEmail] = useState(defaultEmail);
  const [nameValue, setName] = useState(defaultName);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<Pending | null>(null);
  const [result, setResult] = useState<Extract<FlowResult, { ok: false }> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resendIn = useSecondsUntil(sentTo ? sentTo.sentAt + RESEND_AFTER_S * 1000 : null);

  useEffect(() => {
    const saved = loadPending(key);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring after hydration
      setSentTo(saved);
      setEmail(saved.email);
      setName(saved.name);
    }
  }, [key]);

  const send = (isResend: boolean) =>
    startTransition(async () => {
      setResult(null);
      setNotice(null);
      const res = await sendCodeAction({ email: emailValue, name: nameValue, invite, next });
      if (!res.ok) return setResult(res);
      const p = { email: res.email, name: nameValue.trim(), sentAt: Date.now(), key };
      savePending(p);
      setSentTo(p);
      setCode("");
      if (isResend) setNotice(res.resent === false ? "A code was sent a moment ago. Use that one, or try again in a minute." : "New code sent. Only the newest code works.");
    });

  const verify = () =>
    startTransition(async () => {
      if (!sentTo) return;
      setResult(null);
      setNotice(null);
      const res = await verifyCodeAction({ email: sentTo.email, code, name: sentTo.name, invite, next });
      // On success the action redirects, so we only get here on failure.
      if (res && !res.ok) setResult(res);
      else savePending(null);
    });

  if (sentTo) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <p className="text-sm">
          We emailed a code to <strong className="break-all">{sentTo.email}</strong>. Enter it here, or tap the button in that
          email.
        </p>
        <label htmlFor={ids.code} className="text-sm font-medium">
          Code from the email
        </label>
        <input
          id={ids.code}
          className="input text-center font-mono text-2xl tracking-[0.3em]"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={14}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
          aria-invalid={result?.field === "code" || undefined}
          aria-describedby={result ? ids.error : undefined}
        />
        <FieldError id={ids.error}>{result?.error}</FieldError>
        {notice && <p className="text-sm text-muted">{notice}</p>}
        <button className="btn-primary" disabled={pending}>
          {pending ? "Checking…" : invite ? "Join Rec Room" : "Sign in"}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="text-muted underline disabled:no-underline disabled:opacity-60" disabled={pending || resendIn > 0} onClick={() => send(true)}>
            {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
          </button>
          <button
            type="button"
            className="text-muted underline"
            onClick={() => {
              savePending(null);
              setSentTo(null);
              setResult(null);
              setNotice(null);
            }}
          >
            Use a different email
          </button>
        </div>
        <p className="text-xs text-muted">Nothing yet? It can take a minute. Check your spam or promotions folder too.</p>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        send(false);
      }}
    >
      {askName && (
        <>
          <label htmlFor={ids.name} className="text-sm font-medium">
            Your name
          </label>
          <input
            id={ids.name}
            className="input"
            name="name"
            autoComplete="given-name"
            maxLength={40}
            placeholder="What friends call you"
            value={nameValue}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={result?.field === "name" || undefined}
          />
        </>
      )}
      <label htmlFor={ids.email} className="text-sm font-medium">
        Your email
      </label>
      <input
        id={ids.email}
        className="input"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={emailValue}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={result?.field === "email" || undefined}
        aria-describedby={result ? ids.error : undefined}
      />
      <FieldError id={ids.error}>{result?.error}</FieldError>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : sendLabel}
      </button>
      <p className="text-xs text-muted">No password needed. We&apos;ll email you a code to confirm it&apos;s you.</p>
    </form>
  );
}

/** For someone already signed in who just needs to pick a name and join. */
export function JoinForm({ invite, defaultName = "" }: { invite?: string; defaultName?: string }) {
  const id = useId();
  const [nameValue, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = await joinAction({ invite, name: nameValue });
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        What should friends call you?
      </label>
      <input
        id={id}
        className="input"
        name="name"
        autoComplete="given-name"
        maxLength={40}
        autoFocus
        value={nameValue}
        onChange={(e) => setName(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Join Rec Room"}
      </button>
    </form>
  );
}

/** Paste an invite link (or code) and go to it. */
export function InviteLinkForm() {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const code = inviteCodeFrom(value);
        if (!code) return setError("That doesn't look like a Rec Room invite link. Copy the whole link and paste it again.");
        router.push(`/invite/${code}`);
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Got an invite link? Paste it here
      </label>
      <input
        id={id}
        className="input"
        placeholder="https://…/invite/…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <button className="btn-ghost">Use this invite</button>
    </form>
  );
}
