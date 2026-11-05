# Special event: a calendar of doors

## Why

Sometimes there is a special occasion worth more than a note: a trip, a holiday, a run of evenings planned for her. This gives such an occasion its own small, playful page on the reader site. The first use is a calendar of dinners: she opens a door, sees the dishes behind it, and picks what she wants. It has to feel like a little present, and it has to tell the cook what to get.

It is built for one event now but must take a new event later without code changes.

## Goals

- A reader page with an illustrated house of doors, designed for her iPhone.
- Each door stays locked until its date. A locked door's contents never leave the server.
- Behind a door: dishes with a photo and a line to choose one from, or a line of text with no choice.
- A separate card where she picks a set number of things (for example two desserts), available from its own date.
- She can change her mind about any pick.
- Admin sees every pick, with a private shopping list beside each picked dish.
- A new event means new text and new photos in admin, no deploy.

## Non-goals

- More than one event at a time.
- A form-based event editor. The event is one block of JSON in admin.
- Themes. The house is the only look for now.
- Combined shopping lists, staples, packing lists or recipes. Those stay in the cook's own document.
- Notifications. Admin checks the page.

## Anti-goals

- She sees shopping lists, or anything else marked private. A test must guard this.
- A door's contents, or the photo behind one, reach her browser before its date.
- Anything that promises more than the event text says.
- Event content in this public repo. Tests use placeholders.
- Pages that call a third-party image host. Photos are served from our own storage, behind her session.

## What she sees

**Way in.** A card on the notes page, near the top, from the event's `from` date until the end of its `until` date. It shows a dot when a door or card is open and waiting for her. Hidden entirely when there is no event or the dates are outside the range.

**The page** at `<base>/event`, needing the reader session but not the after dark door:
- A night sky with light snow, a title and short intro paragraphs from the event.
- A half-timbered house with a snow-capped roof and a two-column grid of arched doors. Any door count works; an odd last door sits alone on its row.
- A locked door is grey with its number, its day label and "Opens <label>". Tapping it wiggles the door and shows the opening date briefly.
- A ready door is green with a soft gold pulse.
- Tapping a ready door swings it open and raises a sheet with its contents. An opened door stays open on later visits and shows her pick, with its photo, in the doorway. An opened door without a pick shows "Pick one", or the door's short `doorway` line if it has no dishes.
- Dishes are large tappable cards: photo, name, one or two lines. The chosen one has an accent border and a "♥ Yours" mark. Tapping another moves the pick.
- The card sits under the house and summarises her picks. Its sheet is a two-column grid. Tapping a chosen item removes it; choosing past the limit drops her oldest choice.
- A closing line from the event, and a small "Photo credits" link at the very bottom that expands the credits.
- A failed save puts the pick back and says "That didn't save. Try again?".
- `prefers-reduced-motion`: no snow, no swing, no pulse.

The approved mockup is the visual reference; the builder should match its layout, colours and type (Cormorant Garamond).

**Without JavaScript** every door and choice still works through ordinary links and forms, as in the reading room.

## What admin sees

`<base>/admin/event`, linked from the admin page:
- A textarea with the event JSON, and Save. Invalid JSON or a failed check keeps the text and names the problem and where it is.
- Photo upload: several files at once, using the existing photo checks. Each is listed with its reference, and unused ones can be removed.
- Her picks per door and on the card, with when she made them, each followed by that dish's private `buy` list. Doors she hasn't opened say so.
- A Preview link with a chosen date, showing the page as of that date. Preview records nothing.
- A "Clear her picks" button with a confirmation, for test runs and for starting a new event.

## The event

Stored in KV key `event`. Picks in KV key `event_picks`.

```json
{
  "id": "short-id",
  "title": "Title",
  "intro": ["Paragraph", "Paragraph"],
  "closing": "Small line under the house",
  "from": "2026-01-01",
  "until": "2026-01-31",
  "doors": [
    {
      "id": "one",
      "label": "Sat 3 Jan",
      "heading": "Saturday 3 January",
      "opens": "2026-01-01",
      "opensLabel": "Thu 1 Jan",
      "doorway": "Short line in the doorway when there is no choice",
      "line": "Text shown when there is no choice",
      "dishes": [
        { "id": "a", "title": "Name", "text": "A line", "photo": "file.jpg", "buy": ["Private item"] }
      ]
    }
  ],
  "card": {
    "title": "Card title",
    "prompt": "Pick two",
    "pick": 2,
    "opens": "2026-01-01",
    "dishes": []
  },
  "credits": ["Dish photo: author, licence, source link"]
}
```

Checks on save: unique door and dish ids; a door has dishes or a line; dates are real dates; every `photo` is an uploaded file; text lengths are bounded; `pick` is at least 1 and no more than the card's dishes. `card` and `credits` are optional.

`event_picks` holds which doors she has opened, the chosen dish per door and the chosen card items, each with a time, and the event `id` they belong to. Picks whose event id or dish id no longer exists are ignored, so editing text never loses a pick and a new event starts clean.

## Rules on the server

- Open means `opens` is on or before today in Copenhagen, using `todayInCopenhagen`, matching the rest of the site.
- A locked door is rendered with only its number and labels. Asking to open or pick it is refused.
- A photo is served only if it belongs to an open door or an open card, or to admin, with the same session rules and `no-store` as other private media. Photo file names must not describe the dish; uploads get the usual random keys.
- `buy` and all other admin data are stripped before rendering the reader page.
- Saves need the reader session and CSRF token, and are sent with XHR with a form fallback.
- Event photos count in `keysInUse` so the orphan purge leaves them alone.
- Her picks are written only by the reader side. Admin edits to the event never rewrite `event_picks`, except the explicit clear.
- The keep-awake script is not needed; there is no audio here.

## Deploying

The deploy backup also covers `event` and `event_picks` once they exist. Event text and photos are put in through admin after the code is live, and the JSON draft lives outside the repo with the other private files.

## Left to the builder

File layout (expected: `worker/event.ts`, `worker/event-views.ts`, tests beside the others), exact limits, the route for saves, and details of the door animation.
