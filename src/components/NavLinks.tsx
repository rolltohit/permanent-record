"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed", icon: "◉" },
  { href: "/add", label: "Recommend", icon: "+" },
  { href: "/for-you", label: "For you", icon: "✦" },
  { href: "/me", label: "Me", icon: "☺" },
];

export function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  return LINKS.map(({ href, label, icon }) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return mobile ? (
      <Link
        key={href}
        href={href}
        className={`flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-xs ${active ? "text-accent" : "text-muted"}`}
      >
        <span className="text-lg leading-none">{icon}</span>
        {label}
      </Link>
    ) : (
      <Link
        key={href}
        href={href}
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
      >
        {label}
      </Link>
    );
  });
}
