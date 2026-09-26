import { SuggestionCard } from "@/components/SuggestionCard";
import { getSuggestions } from "@/lib/data";

export const metadata = { title: "For you" };

export default async function ForYouPage() {
  const suggestions = await getSuggestions();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">For you</h1>
        <p className="text-sm text-muted">
          Picks based on what you&apos;ve rated highly and thumbed up. They refresh whenever the group&apos;s AI batch runs.
        </p>
      </div>
      {suggestions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No picks right now. Rate a few recommendations and new picks will show up after the next refresh.
        </div>
      ) : (
        suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} />)
      )}
    </div>
  );
}
