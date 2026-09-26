---
name: refresh
description: Run Rec Room's AI batch refresh. Pulls the room's data locally, writes AI summaries for new albums/songs and personalized picks for each member, then pushes them to Supabase. Use when the user says "refresh", "run the AI batch", "update summaries" or "generate picks".
---

# Rec Room AI refresh

Rec Room never calls an AI API. Instead, this session writes the AI content
from a local snapshot, and a script uploads it. Needs `.env.local` with
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Steps

1. **Pull.** Run `npm run ai:pull`. (Add `-- --resummarize` only if the user
   asks to rewrite existing summaries.) Note the work folder it prints, e.g.
   `.ai-work/2026-09-26T19-20-00-1a2b3c4d/`.

2. **Read the contract.** Read `INSTRUCTIONS.md` in the work folder and follow
   it exactly. It defines both output files, their limits, and the rules on
   accuracy and exclusions.

3. **Write `summaries.json`.** Read `summaries_todo.json` and write one summary
   per item. If the list is empty, write `[]`.

4. **Write `suggestions.json`.** Read `taste_profiles.json`. For each member
   with a non-empty `loved` list, choose picks that follow the instructions
   (real releases, exact official titles, nothing in `exclude`, a specific
   reason tied to what they loved). If no one is eligible, write `[]`.

5. **Dry run.** Run `npm run ai:push -- <work folder> --dry-run`. It validates
   both files and looks up every pick in the Apple Music catalog; this can
   take a few minutes because song.link is rate limited. If it reports
   format errors, fix the file and re-run. If picks were dropped as "not
   found", you may replace them with other real records and dry-run again.

6. **Confirm.** Show the user a short summary: how many summaries, and the
   picks per member with their reasons. Ask before pushing.

7. **Push.** Run `npm run ai:push -- <work folder>`. Pushing twice is safe.
   Report the final counts.

Never commit anything under `.ai-work/`; it's gitignored because it holds the
group's activity.
