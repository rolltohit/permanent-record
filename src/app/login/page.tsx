import { AuthShell } from "@/components/AuthShell";
import { EmailForm } from "@/components/AuthForms";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  return (
    <AuthShell title="Sign in">
      {error === "link" && <p className="text-sm text-bad">That sign-in link expired or was already used. Request a new one.</p>}
      <EmailForm next="/" cta="Email me a sign-in link" />
      <p className="text-xs text-muted">Rec Room is invite-only. New here? Open the invite link a friend sent you.</p>
    </AuthShell>
  );
}
