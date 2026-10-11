# Notes sky, arrival day and replies: design

Three additions to the private notes page, built together:

1. **The sky.** A slim night sky at the top of the reader page gains one star per note until the next meeting.
2. **Arrival day.** On the meeting date the stars drift together into a heart; afterwards the heart stays as a keepsake.
3. **Replies.** Under each note the reader can send a heart and an optional short line back; the admin sees it.

The repo is public. Real place names, dates, notes and replies live only in KV. Examples here use placeholders.

## Data

Two new KV keys in the existing `NOTES` namespace, next to `notes`.

### `meetings`

A JSON list of `{ date, place }`, kept sorted oldest first.

- `date`: a valid `YYYY-MM-DD`; unique across the list.
- `place`: trimmed text, 1 to 40 characters.
- A missing key means no meetings (no sky). A stored value that fails validation is an error, like `notes`.

### `replies`

A JSON list of `{ date, heart, text, at }`, one per note date at most.

- `date`: the note's date.
- `heart`: boolean.
- `text`: trimmed text, 0 to 280 characters, CRLF normalized to LF.
- `at`: ISO timestamp of the last change (server clock).
- A reply with `heart: false` and empty `text` is not stored; saving one removes the entry.
- Deleting a note removes its reply. Moving a note to another date (editing its date) moves the reply with it.

## The sky

### Which sky is shown

Given today (Copenhagen time) and the sorted meetings:

- **Target meeting:** the earliest meeting with `date >= today`. If there is none, the latest meeting (a keepsake). No meetings: no sky.
- **Window:** notes with `date > previous meeting date` (the meeting just before the target; no lower bound if there is none) and `date <= target date` and `date <= today`.
- **State:**
  - `growing` when today < target date,
  - `arrived` when today = target date,
  - `kept` when today > target date.
- Zero stars in a `growing` window still shows the sky with its caption.

A pure function `skyFor(notes, meetings, today)` returns `{ state, place, date, stars: string[] /* note dates, oldest first */, sleeps }` or `null`, where `sleeps` is the whole days from today to the target date (0 when arrived or kept).

### Drawing

- Server-rendered inline SVG in a band above today's note (about 120px tall, full content width), with `role="img"` and an `aria-label` that matches the caption.
- **Scatter positions** come from a deterministic hash of each note's date, kept inside the band with a margin. A given star never moves between visits.
- **Heart positions** for N stars are N points sampled evenly along a parametric heart curve, centred in the band.
- **Growing:** stars sit at their scatter positions. The newest one twinkles (CSS). Caption: `A star for every note · <place> in N sleeps` ("1 sleep" singular; "tomorrow" is not special-cased).
- **Arrived:** each star animates from scatter to heart position (CSS transform via per-star custom properties, staggered), then faint lines between consecutive heart points fade in. Caption: `0 km · You're here ♥`.
- **Kept:** stars and lines are drawn at heart positions with no animation. Caption: `<place> · <formatted date>`.
- `prefers-reduced-motion`: no drift or twinkle; arrived shows the finished heart.
- No JavaScript is needed. The sky is static markup plus CSS.
- Colours follow the reader page's existing palette.
- The sky renders whether or not there is a note today, and in Preview (computed for the previewed date).

### Arrival note

The note dated on the meeting day is the arrival message. It renders like any note (photo, sound and game included). The game's own meet date is unchanged by this work.

## Replies

### Reader

- Every visible note (today's and the archive) gets an id anchor `note-<date>` and a reply area under it:
  - A `♥` toggle (a checkbox styled as a heart), and a "Write something back" disclosure (`<details>`) holding a textarea (maxlength 280) and a Send button.
  - When a reply exists, it is shown under the note ("You sent ♥" and/or her text in quotes), and the form is prefilled so she can change or clear it.
- Submits as a normal form `POST <base>/reply` with fields `date`, `heart` (`on` or absent), `text` and `csrf`, then redirects (303) to `<base>/#note-<date>`. A small optional script may submit the heart toggle immediately on change; the form works without it.
- A reply that is too long redirects back with `?unsent=<date>#note-<date>`, which shows a gentle line under that note: "That didn't send. Try again?" A bad CSRF token gets the same 403 page as admin ("That form expired…"), and an unknown or future date gets the 404 page; neither can happen from the real form.
- In Preview the reply area is rendered with its controls disabled and no form action.

### Server

- `POST /reply` requires a valid reader session cookie and a CSRF token derived from that session (the same mechanism as admin, `csrfToken(session)`).
- `date` must belong to an existing note with `date <= today`. Otherwise 404.
- The text is validated as above, then the reply is upserted or removed and `replies` is written.
- The reader page passes the CSRF token and the replies to the view.

### Admin

- In the notes list, each note with a reply shows a line under it: `♥` (if set), her text (escaped), and `at` formatted in Copenhagen time.
- Admin cannot edit replies.

## Admin: meetings

- A "Meetings" fieldset above the note form lists the meetings (date and place), each with a Remove button (`POST <base>/admin/meeting/delete`, field `date`).
- An add form (`POST <base>/admin/meeting/save`): `date` (date input) and `place` (text). Adding an existing date replaces its place.
- Validation errors re-render admin with the message "A meeting needs a real date and a place of up to 40 characters." and keep the typed values.
- Both use the admin session and CSRF, like save/delete.

## Errors and safety

- All reader-supplied text reaches HTML only through `escapeHtml`. Nothing is put into scripts.
- Replies are capped by size (280 characters × at most one per note), so KV growth is bounded by the number of notes.
- Corrupt `meetings` or `replies` in KV: the reader page still renders the notes. The sky or reply area is left out and the error is logged. Admin shows an error line rather than overwriting the key.
- Concurrent writes are not a concern (one reader, one admin).

## Operations

- The deploy backup routine also backs up `meetings` and `replies` (count-only output; contents never printed). After deploy it compares all three keys with `cmp`.
- Rollback caveat: older Worker versions ignore `meetings` and `replies` and never write them, so a rollback is safe for these keys. They reappear on roll-forward.

## Testing

- Unit tests:
  - `parseMeetings` and `parseReplies` (valid, missing, invalid);
  - `skyFor`: no meetings; growing with and without a previous meeting; arrived; kept; window bounds are exclusive of the previous meeting and inclusive of the target; future notes are excluded;
  - scatter positions are deterministic and in bounds;
  - heart points: count matches, in bounds;
  - reply form parsing (trim, CRLF, 280 limit, heart flag, clearing).
- View tests:
  - the sky markup for each state, including captions and singular/plural sleeps;
  - no sky without meetings;
  - reply area for current and archive notes, the prefilled existing reply, and disabled in preview;
  - the admin reply line and meetings fieldset;
  - reader text is escaped.
- Route tests:
  - reply without session or with bad CSRF is rejected;
  - reply to future or unknown date is rejected;
  - save, update and clear;
  - deleting a note removes its reply, and moving a note moves it;
  - meetings save, replace and delete, and validation errors;
  - corrupt `replies` doesn't break the reader page.
- Browser check at phone and desktop sizes: growing sky, arrival animation, kept heart, reduced motion, reply round trip with and without JavaScript.
