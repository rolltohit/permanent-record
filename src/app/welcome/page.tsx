import { signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Invite needed" };

// Signed in, but not a member (no invite redeemed).
export default function WelcomePage() {
  return (
    <AuthShell title="You need an invite">
      <p className="text-sm text-muted">
        Rec Room is invite-only. Ask a member for an invite link and open it while signed in with this email.
      </p>
      <form action={signOutAction}>
        <button className="btn-ghost w-full">Sign out</button>
      </form>
    </AuthShell>
  );
}
