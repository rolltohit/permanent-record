import { redirect } from "next/navigation";
import { InviteLinkForm, SignInFlow } from "@/components/AuthForms";
import { AuthShell } from "@/components/AuthShell";
import { safeNext } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { error, next } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Already signed in (e.g. the email link was opened in another tab): carry on.
  if (user) redirect(safeNext(next));
  return (
    <AuthShell title="Sign in">
      {error === "link" && (
        <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm">
          That email link had already been used or expired. No problem: send yourself a new code below.
        </p>
      )}
      <SignInFlow next={safeNext(next)} sendLabel="Email me a code" />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">New here?</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted">
            Rec Room is invite-only. If a friend invited your email address, just sign in above. If they sent you a link, open
            it or paste it here:
          </p>
          <InviteLinkForm />
        </div>
      </details>
    </AuthShell>
  );
}
