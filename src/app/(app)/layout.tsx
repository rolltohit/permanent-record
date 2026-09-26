import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { NavLinks } from "@/components/NavLinks";
import { requireMember } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Rec Room<span className="text-accent">.</span>
        </Link>
        <nav className="ml-6 hidden gap-1 sm:flex">
          <NavLinks />
        </nav>
        <Link href="/me" className="ml-auto" aria-label="Your profile">
          <Avatar profile={me} size={32} />
        </Link>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28 sm:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <NavLinks mobile />
      </nav>
    </div>
  );
}
