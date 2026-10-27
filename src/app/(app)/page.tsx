import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { RecCard } from "@/components/RecCard";
import { getFeed, getMembers, requireMember } from "@/lib/data";
import { itemStats } from "@/lib/feed";

export default async function FeedPage(props: PageProps<"/">) {
  const me = await requireMember();
  const params = await props.searchParams;
  const view = params.view === "unlistened" ? "unlistened" : "all";
  const from = typeof params.from === "string" ? params.from : undefined;

  const [entries, members] = await Promise.all([getFeed({ from }), getMembers()]);
  const visible = view === "unlistened" ? entries.filter((e) => !itemStats(e.item, me.id).listened) : entries;

  const href = (next: { view?: string; from?: string }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    const f = "from" in next ? next.from : from;
    if (v !== "all") q.set("view", v);
    if (f) q.set("from", f);
    return q.size ? `/?${q}` : "/";
  };

  const sideLink = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
      active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
    }`;

  // Wide screens (xl): the feed column plus a sticky filter panel. Otherwise filter chips sit above
  // the feed: one scrolling row on phones, wrapping from sm.
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-8 xl:max-w-5xl xl:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {params.joined === "1" && (
          <div role="status" className="card flex flex-col gap-1 p-4">
            <p className="font-medium">Welcome to Rec Room, {me.display_name}! 🎶</p>
            <p className="text-sm text-muted">
              This is what your friends are recommending. Got something you love?{" "}
              <Link href="/add" className="text-accent underline">
                Recommend it
              </Link>
              . You can change your name any time on your profile.
            </p>
          </div>
        )}
        <div className="-mx-4 flex shrink-0 items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 xl:hidden [&>*]:shrink-0">
          <Link href={href({ view: "all" })} className={`chip ${view === "all" ? "chip-on" : ""}`}>
            All
          </Link>
          <Link href={href({ view: "unlistened" })} className={`chip ${view === "unlistened" ? "chip-on" : ""}`}>
            Not listened yet
          </Link>
          <span className="mx-1 h-5 w-px bg-line" />
          <Link href={href({ from: undefined })} className={`chip ${!from ? "chip-on" : ""}`}>
            Everyone
          </Link>
          {members.map((m) => (
            <Link key={m.id} href={href({ from: m.id })} className={`chip ${from === m.id ? "chip-on" : ""}`}>
              {m.id === me.id ? "Me" : m.display_name}
            </Link>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <p className="font-display text-xl font-semibold">
              {view === "unlistened" ? "You're all caught up." : "Nothing here yet."}
            </p>
            <p className="text-sm text-muted">Got something the group should hear?</p>
            <Link href="/add" className="btn-primary">
              Recommend something
            </Link>
          </div>
        ) : (
          visible.map((entry) => <RecCard key={entry.id} entry={entry} viewerId={me.id} />)
        )}
      </div>

      <aside className="hidden xl:block" aria-label="Filters">
        <div className="sticky top-8 flex flex-col gap-6">
          <section className="flex flex-col gap-1">
            <h2 className="px-2.5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Show</h2>
            <Link href={href({ view: "all" })} className={sideLink(view === "all")}>
              All recommendations
            </Link>
            <Link href={href({ view: "unlistened" })} className={sideLink(view === "unlistened")}>
              Not listened yet
            </Link>
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="px-2.5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">From</h2>
            <Link href={href({ from: undefined })} className={sideLink(!from)}>
              <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-xs">★</span>
              Everyone
            </Link>
            {members.map((m) => (
              <Link key={m.id} href={href({ from: m.id })} className={sideLink(from === m.id)}>
                <Avatar profile={m} size={24} />
                <span className="truncate">{m.id === me.id ? "Me" : m.display_name}</span>
              </Link>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}
