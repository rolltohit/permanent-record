import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { InviteLinkForm, JoinForm } from "@/components/AuthForms";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Almost there" };

// Signed in, but not a member yet.
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) redirect("/");

  const { data: invite } = await supabase.rpc("my_email_invite");
  const signOut = (
    <form action={signOutAction}>
      <button className="w-full text-sm text-muted underline">Use a different email</button>
    </form>
  );

  if (invite) {
    return (
      <AuthShell title={invite.name ? `Welcome, ${invite.name}!` : "You're invited!"}>
        <p className="text-sm text-muted">
          {invite.inviter ?? "A friend"} invited <strong className="break-all text-text">{user.email}</strong>. Pick a name and
          you&apos;re in.
        </p>
        <JoinForm defaultName={invite.name ?? (user.user_metadata?.display_name as string) ?? ""} />
        {signOut}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Almost there">
      <p className="text-sm text-muted">
        You&apos;re signed in as <strong className="break-all text-text">{user.email}</strong>, but Rec Room is invite-only and
        there&apos;s no invite for this address yet.
      </p>
      <InviteLinkForm />
      <p className="text-sm text-muted">
        No link? Ask a member to invite <strong className="break-all text-text">{user.email}</strong>, then reload this page.
      </p>
      {signOut}
    </AuthShell>
  );
}
