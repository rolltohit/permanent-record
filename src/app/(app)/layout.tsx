import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { NavLinks } from "@/components/NavLinks";
import { requireMember } from "@/lib/data";

const Logo = ({ className = "" }: { className?: string }) => (
  <Link href="/" className={`font-display font-bold tracking-tight ${className}`}>
    Rec Room<span className="text-accent">.</span>
  </Link>
);

// Phones: top bar + bottom tab bar. Tablets: top bar with inline nav.
// Desktop (lg): a sticky sidebar beside the content.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const adminLinks = me.is_admin ? [{ href: "/admin/invites", label: "Invites", icon: "✉" }] : [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line px-4 py-6 lg:flex">
        <Logo className="px-3 text-2xl" />
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavLinks variant="side" extra={adminLinks} />
        </nav>
        <Link href="/me" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2/60">
          <Avatar profile={me} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.display_name}</span>
            <span className="block text-xs text-muted">Your profile</span>
          </span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo className="text-xl" />
          <nav aria-label="Main" className="ml-6 hidden gap-1 sm:flex">
            <NavLinks />
          </nav>
          <Link href="/me" className="ml-auto" aria-label="Your profile">
            <Avatar profile={me} size={32} />
          </Link>
        </header>

        <main className="flex-1 px-4 pt-4 pb-28 sm:px-6 sm:pb-10 lg:px-10 lg:pt-8">{children}</main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      >
        <NavLinks variant="bar" />
      </nav>
    </div>
  );
}
