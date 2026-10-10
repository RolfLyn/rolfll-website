# Private Notes: Small Game Before a Note — Design Spec

## Background

The private notes page (specs `2026-09-29-private-notes-design.md`, `2026-10-05-notes-media-design.md`) is live and holds real notes with optional photo and sound. This adds an optional small game that plays before a note's text is revealed. The first (and for now only) game is **Close the distance**. The note gains a `game` field so more games can be added later without changing the stored shape.

This repo is public. Nothing personal (names, places, dates, lines) goes into code, tests, or docs. Place names, distance, meet date and lines are entered in the admin page and stored with the note in KV.

## Requirements

- A note may have an optional **game**. When it has none, the note renders exactly as today.
- **Close the distance** settings, stored with the note:
  - `from`: start place label (shown under the reader's light, right side), max 40 chars.
  - `to`: destination label (shown under the writer's star, left side), max 40 chars.
  - `km`: journey distance, whole number 1 to 40,000.
  - `meet` (optional): a `YYYY-MM-DD` date for the countdown line.
  - `lines`: 0 to 8 short lines shown along the way, each max 160 chars. Blank rows are dropped.
- **Reader, today's note with a game**: a dusk sky card (deep plum to rose) takes the place of the text, with a "Begin" button. The note's photo and sound appear only after the reveal. A "Skip to the note" link is always visible.
- **Play**: the scene scrolls on its own (about 60 seconds end to end), so the player cannot get stuck. The player moves her light up and down: hold and drag on touch, mouse position on desktop, arrow keys on keyboard. Soft clouds drift past. Touching one briefly slows the scroll, with no other penalty. Each line has a glowing point at an evenly spaced position along the route. Passing through it, or passing its position without touching it, fades the line in near the top of the card, and it floats away after a few seconds. A distance counter counts from `km` down to 0 with the route progress.
- **Reveal**: when the two lights meet, the sky brightens to a warm sunrise. If `meet` is set, a line appears: `<to>, <day month> · N more sleeps`, with `1 more sleep` for one day, `Today!` on the day, and the line omitted after the date. N is computed from the reader's device date, so it is correct in her time zone. Then the note text, photo and sound fade in as on a normal note.
- **Replay**: after a finished or skipped game, `localStorage` remembers that note's date (wrapped in try/catch). On a later visit the note shows directly, with a small "Play again" button. If storage is unavailable, the game is offered every time.
- **Reduced motion** (`prefers-reduced-motion: reduce`): the note shows directly with a "Play" button, and the game itself uses no screen shake or fast flashes.
- **Without JavaScript**: the note text is in the HTML and visible. The script hides it and shows the game, so the message is never lost.
- **Archive**: earlier game notes render as normal text plus a small "Play again" link that opens the same game in place.
- **Admin**: the note form gains a Game select (None or Close the distance) and, shown when a game is picked, From, To, Distance (km), Meet date and "Lines along the way" (textarea, one per row). The notes list tags game notes with "Game". Validation errors keep everything typed, as today.
- **Backward compatibility**: notes without `game` are valid and unchanged. The stored format only gains an optional field. No migration.

## Storage

Note shape becomes `{ date, text, photo?, audio?, game? }` where

```
game = { kind: 'distance', from: string, to: string, km: number, meet?: string, lines: string[] }
```

`parseNotes` accepts the optional `game` and rejects malformed values (unknown kind, bad lengths, bad date, too many lines), so bad data fails closed as today.

## Rendering

- The sky is a `<canvas>` drawn by one inline script in the reader page, no libraries. It scales to the card width (full width on phones, capped by the existing 46rem column) at a fixed aspect ratio, and uses `devicePixelRatio` for sharpness.
- The game settings reach the script as JSON in a `<script type="application/json">` block, escaped so `<` cannot close the tag. The script reads text only through `textContent`, never `innerHTML`.
- Touch handling uses pointer events with `touch-action: none` on the canvas only, so the page still scrolls elsewhere.
- Lines and the countdown are HTML overlays (selectable, readable by screen readers through an `aria-live="polite"` region), not drawn text.

## Units (changes)

- `worker/notes.ts`: `Game` type, validation in `parseNotes`, a `daysUntil(meet, today)` helper (pure, tested). The browser runs the same arithmetic.
- `worker/game.ts` (new): parsing the admin form's game fields into a `Game` or a validation error, plus the inline game script and its styles as string constants.
- `worker/views.ts`: reader renders the game card for today's note and "Play again" for archive game notes. The admin form gets the game fields with a tiny show/hide script, and a "Game" tag on the list.
- `worker/index.ts`: save reads the game fields through `game.ts`. Editing keeps or changes the game, and a new note never inherits one, as with media.

## Safety During Rollout

1. Back up the live `notes` KV value to `C:\Users\Admin\Documents\rolfll-notes-backup\notes-<date>.json` (outside the repo, never committed).
2. Tests include the existing legacy fixture and assert it still parses, renders, and survives an unrelated save unchanged.
3. After deploy: check the reader page still shows the current note, then preview the game note in admin before its date arrives.
4. Rollback caveat (same as media): older Worker versions drop `game` when saving. After a rollback, do not save or delete notes until this version is redeployed.

## Testing

- Unit: `parseNotes` with and without a game, malformed games rejected; form parsing (blank lines dropped, limits, km range, date format); `daysUntil` across month ends and the day itself.
- View: a game note renders the card, the JSON block, the hidden-but-present text and a skip link; a plain note renders exactly as before; JSON escaping of `</script>` in a line; archive "Play again".
- Route (in-memory stubs): saving a game note stores it; editing without touching the game keeps it; choosing None removes it; a validation error keeps the typed fields.
- Manual (Playwright, local `wrangler dev`, phone and desktop sizes): play through to the reveal with touch and keyboard, skip works, replay state, reduced motion, no horizontal scroll.

## Out of Scope

Other games, sound effects in the game, scores or high scores, a real map.
