import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-2xl font-bold">Nothing on this record.</p>
      <Link href="/" className="btn-primary">
        Back to the feed
      </Link>
    </main>
  );
}
