"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed", icon: "◉" },
  { href: "/add", label: "Recommend", icon: "+" },
  { href: "/for-you", label: "For you", icon: "✦" },
  { href: "/me", label: "Me", icon: "☺" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** `bar`: the bottom tab bar on phones; `top`: inline in the header; `side`: the desktop sidebar. */
export function NavLinks({ variant = "top", extra = [] }: { variant?: "bar" | "top" | "side"; extra?: typeof LINKS }) {
  const path = usePathname();
  return [...LINKS, ...extra].map(({ href, label, icon }) => {
    const active = isActive(path, href);
    if (variant === "bar") {
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-xs ${active ? "text-accent" : "text-muted"}`}
        >
          <span className="text-lg leading-none">{icon}</span>
          {label}
        </Link>
      );
    }
    if (variant === "side") {
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition ${
            active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
          }`}
        >
          <span className={`w-5 text-center text-lg leading-none ${active ? "text-accent" : ""}`}>{icon}</span>
          {label}
        </Link>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
      >
        {label}
      </Link>
    );
  });
}
