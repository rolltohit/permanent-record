---
name: refresh
description: Run Rec Room's AI batch refresh. Pulls the room's data, writes AI summaries for new albums/songs and personalized picks for each member, then pushes them to Supabase. Use when the user says "refresh", "run the AI batch", "update summaries" or "generate picks", and for the scheduled daily run.
---

# Rec Room AI refresh

Rec Room never calls an AI API. Instead, this session writes the AI content
from a snapshot of the room, and a script uploads it. Needs
`SUPABASE_SERVICE_ROLE_KEY` (in `.env.local`, or the cloud environment's
variables), and network access to `*.supabase.co` and `itunes.apple.com`. The
scripts print which Supabase project they use; production is
`psmnhuxmhjhcnqhkhfpu.supabase.co`.

## Modes

- **Interactive** (someone asked in chat): confirm with them before pushing
  (step 6).
- **Unattended** (the scheduled daily run, whose prompt says "unattended"):
  nobody is there to ask. Push automatically once the dry run is clean, and
  finish with the short report in step 8. Never ask questions; if something
  is wrong, stop and report it instead of guessing.

## Steps

1. **Pull.** Run `npm run ai:pull`. (Add `-- --resummarize` only if the user
   asks to rewrite existing summaries; `-- --all-picks` only if they ask for
   fresh picks for everyone.) If it prints `NOTHING_NEW`, stop here: report
   "Nothing new since the last batch" and end. Otherwise note the work folder
   it prints, e.g. `.ai-work/2026-09-26T19-20-00-1a2b3c4d/`.

2. **Read the contract.** Read `INSTRUCTIONS.md` in the work folder and follow
   it exactly. It defines both output files, their limits, and the rules on
   accuracy and exclusions.

3. **Write `summaries.json`.** Read `summaries_todo.json` and write one summary
   per item. If the list is empty, write `[]`. Accuracy over colour: if you
   don't know a record well, stay general rather than invent details.

4. **Write `suggestions.json`.** Read `taste_profiles.json`. For each member
   with `needs_picks: true`, choose picks from both what they shared
   (`recommended_to_group`) and how they rated others' shares (`loved`,
   `disliked`), following the instructions (real releases, exact official
   titles, nothing in `exclude`, a specific reason). If no one needs picks,
   write `[]`.

5. **Dry run.** Run `npm run ai:push -- <work folder> --dry-run`. It validates
   both files and looks up every pick in the Apple Music catalog. Fix format
   errors and re-run. Replace picks dropped as "not found" with other real
   records (at most two rounds), then dry-run again. If every lookup fails
   with "catalog lookup failed", the network is blocking `itunes.apple.com`:
   push the summaries anyway and report it.

6. **Confirm (interactive only).** Show the user a short summary: how many
   summaries, and the picks per member with their reasons. Ask before pushing.

7. **Push.** Run `npm run ai:push -- <work folder>`. Pushing twice is safe.

8. **Report.** In a few lines: the batch id, summaries written, picks per
   member (titles), anything skipped and why.

Never commit anything under `.ai-work/`; it's gitignored because it holds the
group's activity. This skill changes no code, so there is nothing to commit
or push to git.
