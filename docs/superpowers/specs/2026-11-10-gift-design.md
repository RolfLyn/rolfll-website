# A gift to unwrap, and a day to pick

## Why

He has planned an outing for the two of them on a coming visit: an activity in the afternoon and a dinner out after. He wants it to arrive as a present on her reader site. She unwraps it, sees what is inside one surprise at a time, and picks which of a few days it happens on. He books only after she has picked, because the booking cannot be cancelled. When it is booked, her page says so with the times, which is a second small surprise.

It must be reusable: a later gift is new text and photos in admin, no deploy.

The special event (the house of doors) may still be running when a gift is given, so the two live side by side.

## Goals

- A reader page with a wrapped box she unwraps, then a short run of reveal screens, then a day picker. Designed for her iPhone.
- She confirms one day from his list, and can change it until he marks it booked.
- Admin sees her pick and when she made it, and marks it booked with a few lines of detail (times, place) that she then sees.
- After her first visit, opening the page goes straight to the opened gift with her day (or to the picker if she has not chosen yet).
- A way in on her notes page with a dot when something is waiting for her.
- A new gift is new JSON and photos in admin.

## Non-goals

- More than one gift at a time.
- Picking a time of day. He chooses times when he books.
- A form-based editor. The gift is one block of JSON, like the event.
- Notifications to him. He checks admin.
- Replacing or merging with the special event.

## Anti-goals

- Gift content in this public repo: names of places, dates, text, photos. Tests use placeholders.
- Pages that call a third-party image host. Photos are served from our storage behind her session.
- A pick that is lost or changes without her doing it. His edits to the gift text never rewrite her pick, except the explicit clear.
- Showing "booked" before he has marked it.

## What she sees

**Way in.** A card on the notes page near the top, beside the event card if both show, with a small gift icon and the gift's title. Shown from the gift's `from` date to the end of its `until` date (inclusive, Copenhagen days as for the event). A dot shows while she has not unwrapped it, and again when it is newly booked and she has not seen that yet.

**The page** at `<base>/gift`, needing the reader session but not the after dark door. Night sky as on the event page, Cormorant Garamond, Caveat for his handwriting. The approved mockup is the visual reference; it holds private content, so it stays outside the repo (in the builder's scratchpad as `gift-flow.html`). In words: a dark blue night sky with faint stars; centred column; small gold uppercase kickers; large light serif headings; gold pill buttons for the main action and outlined gold pills for "go on"; photos with thick white borders, slightly tilted, the second overlapping the first; day tiles as rounded outlined squares with a large number, the chosen one filled gold; cream paper cards with dark ink for the summary and booking; a rose-red rotated "BOOKED" stamp.

1. **The box.** A kicker, a heading, a wrapped red box with a gold ribbon and bow and a handwritten tag (`tag`), and a button "Untie the ribbon". Tapping lifts the lid and moves on. This records that she unwrapped it.
2. **Reveal screens**, one per entry in `reveals`, in order: kicker, heading, one or two photos (white-bordered, slightly tilted), a paragraph, and a button with that screen's `next` text.
3. **Pick the day.** A kicker, a heading, and one tile per entry in `days` (big day number, short weekday and month), two per row. Days before tomorrow (her note day, see Rules) show greyed and cannot be picked. Tapping a tile selects it; the button below names it ("Wednesday it is", built from the day's `name`) and confirms. Nothing is saved before she confirms.
4. **Chosen.** A small opened box, the chosen day's full `heading`, his line `chosenLine` in handwriting, a paper card listing `summary` lines, and a muted line `pendingLine`. A "Change the day" button goes back to the picker with her day selected.
5. **Booked.** Once he marks it booked: the same heading and a paper card titled "It's booked" with his booking lines and a "BOOKED" stamp, then `bookedLine` in handwriting. No change button.

On later visits the page opens on screen 4 or 5 if she has picked, otherwise on screen 1 if not unwrapped, otherwise on the picker. A small "See it again" link on screens 4 and 5 replays from the box without changing anything.

Small "Photo credits" link at the bottom, as on the event page.

A failed save leaves her on the picker with her tile still selected and says "That didn't save. Try again?".

`prefers-reduced-motion`: no lid lift, no screen transitions.

**Without JavaScript** all screens render in one page in order, the box button is a form that records the unwrap, and each day tile is a form button that confirms that day.

## What admin sees

`<base>/admin/gift`, linked from the admin page next to "Special event":
- A textarea with the gift JSON and Save. Invalid JSON or a failed check keeps the text and names the problem.
- Photo upload, several at once, with the existing photo checks; each listed with its reference; unused ones can be removed.
- Her status: not opened / unwrapped at <time> / picked <day heading> at <time>, with a history of earlier picks if she changed her mind.
- When she has picked: a "Mark as booked" form with a textarea of booking lines (one per line, up to 4 lines), and a Save. Once booked: the lines, when it was marked, an Edit of the lines, and "Undo booked" (confirmation) which returns her page to screen 4 and lets her change the day again.
- A Preview link showing the page as she would see it now, recording nothing.
- "Clear her pick" with a confirmation, for test runs and for a new gift.

## The gift

KV `gift` holds the gift, KV `gift_state` holds her side and the booking, KV `gift_photos` lists the uploaded photos (as `event_photos` does).

```json
{
  "id": "short-id",
  "title": "Title on the way-in card",
  "from": "2026-01-01",
  "until": "2026-01-31",
  "box": { "kicker": "A gift", "heading": "Heading", "tag": "For you" },
  "reveals": [
    { "kicker": "The first part", "heading": "Heading", "text": "Paragraph", "photos": ["file.jpg"], "next": "And then?" }
  ],
  "pick": { "kicker": "Your choice", "heading": "Pick our day", "text": "Short line under the tiles" },
  "days": [
    { "id": "2026-01-06", "name": "Wednesday", "heading": "Wednesday 6 January" }
  ],
  "chosenLine": "I'll book it now.",
  "summary": ["Line", "Line"],
  "pendingLine": "Times coming once it's booked.",
  "bookedLine": "Can't wait.",
  "credits": ["Photo: author, licence, source"]
}
```

A day's `id` is its date; tiles show its day number and short weekday and month derived from it.

Checks on save: real dates; unique day ids; 1 to 8 days; 1 to 6 reveals; 0 to 2 photos per reveal; every photo is an uploaded file; bounded text lengths; `credits` optional.

`gift_state`: `{ giftId, unwrapped?: time, pick?: { day, at }, history: [{ day, at }], booked?: { day, lines, at }, bookedSeen?: time }`. State whose `giftId` differs from the gift's `id` is treated as empty, so a new gift starts clean. A pick whose day no longer exists in `days` is shown to admin but treated as no pick on her page.

## Rules on the server

- Saves need the reader session and CSRF token, sent with XHR with a form fallback, like the event.
- Today means the same day her daily notes use (`noteDay`, which turns at 4am Singapore time). `from`/`until` showing uses it too.
- Her saves: unwrap (once, keeps the first time), pick a day (only a day in `days` that is after today, refused once booked), seen-booked.
- Gift save checks also require `until` to be on or after the last day in `days`, so the booked page is still there on the day itself.
- While she has a pick or a booking, a gift save that changes `id` or removes her picked day is refused with a message saying to clear her pick first.
- `booked` records the day it was booked for: `{ day, lines, at }`. The Mark as booked form carries the day shown to him and is refused if her pick has changed since, so a stale admin page can never book the wrong day. Her page shows booked only when `booked.day` equals her pick.
- "Clear her pick" resets all of `gift_state` (unwrap, pick, history, booking, seen), with a confirmation, at any time.
- The dot for booked lights when he marks it booked (`booked.at` later than `bookedSeen`); editing the lines afterwards does not light it again.
- Preview takes an optional date, like the event preview, to see it before `from` or as of a chosen day.
- Admin saves: booking lines (only when she has a pick), undo booked, clear.
- Photos are served only to her session while the gift is showing, or to admin, `no-store`, and count in `keysInUse` so the purge leaves them alone.
- Deploy backups cover `gift`, `gift_state` and `gift_photos`.

## The first gift (not in the repo)

An afternoon activity and a dinner after, as two reveal screens, and four days to choose from. Photos: the activity host's own photos and a freely licensed photo for the dinner, credited. The gift JSON draft lives outside the repo with the other private files and is loaded through admin after the code is live. `from` is the day it goes live, so it shows at once.

## Left to the builder

File layout (expected `worker/gift.ts`, `worker/gift-views.ts`, tests beside the others), exact limits, route names for saves, the drawing of the box and the screen transitions.
