import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { JoinForm, SignInFlow } from "@/components/AuthForms";
import { AuthShell } from "@/components/AuthShell";
import { isInviteCode } from "@/lib/auth-flow";
import { type InviteDetails, inviteDetails } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "You're invited" };

export default async function InvitePage(props: PageProps<"/invite/[code]">) {
  const { code } = await props.params;
  const search = await props.searchParams;
  const linkFailed = search.error === "link";
  const nameFromLink = typeof search.name === "string" ? search.name.slice(0, 40) : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (profile) redirect("/");
  }

  const details: InviteDetails = isInviteCode(code) ? await inviteDetails(supabase, code) : { status: "missing" };
  const inviter = details.inviter ?? "A friend";

  if (details.status !== "open") {
    // Signed in, and an invite is waiting for this email: /welcome offers it.
    if (user) {
      const { data: mine } = await supabase.rpc("my_email_invite");
      if (mine) redirect("/welcome");
    }
    const sender = details.inviter ?? "whoever sent it";
    const copy = {
      expired: {
        title: "This invite has expired",
        body: `Invites last 30 days. Ask ${sender} to renew it: it's one tap on their Invites page, and this same link will work again.`,
      },
      used: {
        title: "This invite was already used",
        body: `If you joined with it, just sign in. Otherwise ask ${sender} for a fresh invite.`,
      },
      missing: {
        title: "We can't find that invite",
        body: "Check you copied the whole link, or ask your friend to send it again.",
      },
    }[details.status];
    return (
      <AuthShell title={copy.title}>
        <p className="text-sm text-muted">{copy.body}</p>
        <Link href={user ? "/welcome" : "/login"} className="btn-ghost text-center">
          {user ? "Continue" : "Already a member? Sign in"}
        </Link>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell title="One last step">
        <p className="text-sm text-muted">
          You&apos;re signed in as <strong className="break-all text-text">{user.email}</strong>.
        </p>
        <JoinForm invite={code} defaultName={nameFromLink || details.name || (user.user_metadata?.display_name as string) || ""} />
        <form action={signOutAction}>
          <button className="w-full text-sm text-muted underline">Not you? Use a different email</button>
        </form>
      </AuthShell>
    );
  }

  const greeting = details.name ? `Hi ${details.name}! ${inviter} invited you` : `${inviter} invited you`;
  return (
    <AuthShell title={`${greeting} to Rec Room`}>
      <p className="text-sm text-muted">
        Rec Room is where your friends swap songs and albums they love. Joining takes a minute: add your name and email, and
        we&apos;ll send you a code.
      </p>
      {linkFailed && (
        <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm">
          That email link had already been used or expired. No problem: send yourself a new code below.
        </p>
      )}
      <SignInFlow
        invite={code}
        askName
        defaultName={nameFromLink || details.name || ""}
        defaultEmail={details.email ?? ""}
        sendLabel="Email me a code"
      />
    </AuthShell>
  );
}
