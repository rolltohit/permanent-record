import { AddFlow } from "@/components/AddFlow";

export const metadata = { title: "Recommend" };

export default function AddPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Recommend something</h1>
        <p className="text-sm text-muted">Paste a Spotify, Apple Music or YouTube Music link, or search by name.</p>
      </div>
      <AddFlow />
    </div>
  );
}
