export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="font-display text-3xl font-bold tracking-tight">
          Rec Room<span className="text-accent">.</span>
        </p>
        <p className="text-sm text-muted">Music recommendations from your friends.</p>
      </div>
      <div className="card flex flex-col gap-4 p-5">
        <h1 className="font-display text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
