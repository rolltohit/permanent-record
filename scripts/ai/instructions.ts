import { SUGGESTIONS_PER_USER } from "@/lib/ai/batch-schema";

export const INSTRUCTIONS = `# Rec Room AI batch

You are generating AI content for Rec Room, a private music recommendation app
shared by a small group of friends. Work only from the files in this folder.

## Inputs
- \`summaries_todo.json\`: albums and songs that need a summary. Each has
  the recommender's notes and the group's comments as extra context.
- \`taste_profiles.json\`: one entry per member with
  - \`recommended_to_group\`: what they chose to share, with their note.
  - \`loved\` / \`disliked\`: their ratings, thumbs and reactions on what
    *other* members shared (and on their earlier AI picks).
  - \`exclude\`: things already in the room or already suggested to them.
  - \`needs_picks\`: whether they get new picks in this batch.

## Output 1: \`summaries.json\`
An array of \`{ "item_id": string, "summary": string }\`, one per todo item.

- 2–3 sentences, 20–600 characters, plain text, no markdown.
- Describe the sound, the era/scene it came from, and what makes it notable.
  For a song, mention the album it's from if known.
- Only state facts you're confident about. If you don't know the record
  well, describe it more generally (genre, artist's style) rather than
  inventing specifics like chart positions, producers or dates.
- Don't quote or paraphrase the friends' comments; they're context only.

## Output 2: \`suggestions.json\`
An array of \`{ "user_id", "kind": "album" | "track", "title", "artist", "reason" }\`.

- Up to ${SUGGESTIONS_PER_USER} per member, only for members with \`needs_picks: true\`.
  Picks for anyone else are dropped on push.
- Base picks on both signals. What a member shared (\`recommended_to_group\`)
  is as strong as a 5-star rating, and their notes say what they love about
  it. Their ratings and reactions on others' shares show how their taste
  reaches beyond their own picks. When they have both, draw on both.
- Suggest real, released music that exists on major streaming services.
  Use the exact official title and primary artist name (no "Deluxe Edition").
  Anything that can't be found in the Apple Music catalog is dropped on push.
- Never suggest anything in that member's \`exclude\` list, and avoid
  artists they disliked.
- Favor variety: at most two picks by the same artist, and mix well-known
  and lesser-known records.
- \`reason\`: one friendly sentence (10–280 chars) tying the pick to specific
  things they shared or loved, e.g. "You gave In Rainbows 5 stars, and this has
  the same warm, looping guitars." or "You shared Blonde with the group; this
  has the same hushed, late-night feel."

When both files are written, run \`npm run ai:push -- --dry-run\` to validate.
`;
