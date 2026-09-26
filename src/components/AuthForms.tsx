"use client";

import { useActionState } from "react";
import { type FormState, redeemInviteAction, sendMagicLinkAction } from "@/app/auth/actions";

export function EmailForm({ next, cta }: { next: string; cta: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendMagicLinkAction, null);
  if (state?.sent) {
    return (
      <p className="rounded-xl bg-surface-2 p-4 text-sm">
        Check <strong>{state.sent}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input className="input" name="email" type="email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : cta}
      </button>
    </form>
  );
}

export function RedeemForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(redeemInviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        What should friends call you?
        <input className="input" name="display_name" required maxLength={40} autoComplete="nickname" />
      </label>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Join Rec Room"}
      </button>
    </form>
  );
}
