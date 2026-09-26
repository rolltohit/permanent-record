import Link from "next/link";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
  );
}
