import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { EmailForm, RedeemForm } from "@/components/AuthForms";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "You're invited" };

export default async function InvitePage(props: PageProps<"/invite/[code]">) {
  const { code } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (profile) redirect("/");
  }

  const { data: valid } = await supabase.rpc("check_invite", { p_code: code });
  if (!valid) {
    return (
      <AuthShell title="This invite doesn't work">
        <p className="text-sm text-muted">It may have expired or already been used. Ask whoever sent it for a new link.</p>
      </AuthShell>
    );
  }

  return user ? (
    <AuthShell title="Almost in">
      <p className="text-sm text-muted">Signed in as {user.email}.</p>
      <RedeemForm code={code} />
    </AuthShell>
  ) : (
    <AuthShell title="You're invited">
      <p className="text-sm text-muted">Enter your email and we&apos;ll send a link to finish joining.</p>
      <EmailForm next={`/invite/${code}`} cta="Send my link" />
    </AuthShell>
  );
}
