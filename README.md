# Rec Room

A private, invite-only place for a group of friends to recommend songs and
albums to each other.

- **Recommend** by pasting a Spotify, Apple Music or YouTube Music link, or by
  searching. Rec Room finds the artwork, metadata and links for all three
  platforms.
- **React:** mark listened, rate 1–5 stars, thumbs up/down, emoji reactions and
  short comments.
- **AI summaries and "For you" picks** based on what each person rated or
  reacted to positively. These are generated in batches by *your own local
  Claude Code session*. The app never calls an AI API.

Built with Next.js 16, Supabase and Tailwind. It's a mobile-first web app you
can install to your home screen.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema. Either run `npx supabase link` then `npx supabase db push`,
   or paste `supabase/migrations/0001_init.sql` into the SQL editor.
3. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your deployed URL.
   - Add `https://your-domain/**` to **Redirect URLs**.
4. Copy `.env.example` to `.env.local` and fill in the URL, the anon key and
   the service-role key.

### 2. Run locally

```bash
npm install
npm run dev
```

### 3. Invite yourself (bootstrap the first admin)

```bash
npm run invite -- --admin
```

Open the printed link, enter your email, click the magic link, and pick a
name. After that, admins create invites in the app (**Me → Manage invites**).

### 4. Deploy

Deploy to Vercel and give it the Supabase URL and anon key. There are two
ways:

- **Easiest:** in Vercel, add the **Supabase** integration from the
  Marketplace and link your existing project. It fills in the variables for
  you.
- **By hand:** under **Settings → Environment Variables**, set
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

Either way, **redeploy afterwards**, because these values are baked in at
build time. Optional variables: `NEXT_PUBLIC_SITE_URL` and `ODESLI_API_KEY`.
**Don't** set the service-role key in Vercel; only the local scripts use it.

## AI refresh (local Claude)

Run this whenever you like, e.g. weekly. In Claude Code in this repo:

```
/refresh
```

The [`refresh` skill](.claude/skills/refresh/SKILL.md) runs three steps:

1. `npm run ai:pull` snapshots the room into `.ai-work/<batch>/`. It writes
   items that need summaries, a taste profile per member (loved, disliked,
   and things to exclude), and `INSTRUCTIONS.md`.
2. Claude writes `summaries.json` and `suggestions.json` following those
   instructions.
3. `npm run ai:push -- --dry-run`, then `npm run ai:push`, validates the files
   and looks up every pick in the Apple Music catalog. Made-up or
   already-seen records are dropped. It then writes summaries and picks to
   Supabase. Pushing twice is safe.

You can also run the steps by hand. `.ai-work/` is gitignored because it
contains your friends' activity.

Without an `ODESLI_API_KEY`, song.link allows about 10 lookups a minute, so
push spaces out its calls. A batch of 25 picks takes a few minutes.

## Development

| command | what |
|---|---|
| `npm test` | unit tests (link parsing, metadata normalization, batch logic) |
| `npm run lint` / `npm run typecheck` | static checks |
| `npx supabase start` | local Supabase (Docker) |
| `npm run test:rls` | row-level security tests against local Supabase |
| `npm run seed` | three fake friends and some recs (local only) |
| `npm run test:e2e` | Playwright smoke test (sign-in via local Mailpit, rate, react, comment) |

Local sign-in emails are delivered to Mailpit at http://127.0.0.1:54324.

## Project layout

```
supabase/migrations/     schema, RLS policies, invite + item functions
supabase/tests/          RLS tests (SQL)
src/app/                 pages (feed, add, r/[id], for-you, me, admin/invites), server actions
src/lib/music/           link parsing, iTunes search, song.link resolution
src/lib/ai/              batch file contract + pull/push logic
scripts/ai/              ai:pull, ai:push
.claude/skills/refresh/  the /refresh skill for Claude Code
```
