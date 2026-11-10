# rolfll.com

Personal site for Rolf Lyneborg Lund, built with [Astro](https://astro.build).

## Development

```bash
npm install
npm run dev
```

Open http://localhost:4321.

## Testing

```bash
npm test
```

Runs `astro build` then the Vitest suite against the built output in `dist/`.

## Adding content

- **Projects**: add a Markdown file to `src/content/projects/` with frontmatter matching `projectSchema` in `src/content/schemas.ts` (`title`, optional `dateRange`, `tags`, `description`, `order`).
- **Resume entries**: add a Markdown file to `src/content/resume/` with frontmatter matching `resumeItemSchema` (`type`: one of `education`/`experience`/`competency`/`interest`, `title`, optional `org`/`dateRange`, `description`, `order`).

No CMS — edit files, commit, push.

## Deployment

Deployed via Cloudflare Workers (static assets), configured in `wrangler.jsonc` (`assets.directory` = `./dist`). Connected to GitHub repo `RolfLyn/rolfll-website` — push to `master` triggers a build (`npm run build`) and deploy automatically.

## Before deploying

- [x] Replace `AAU_PROFILE_URL` in `src/data/social.ts` with your real academic profile URL.
- [x] Sign up at [Formspree](https://formspree.io), create a form, and replace `FORMSPREE_ID` in `src/pages/contact.astro` with your real form ID.
- [x] Run `gh auth login` if you haven't yet, then create a GitHub repo and push this project.
- [x] Connect the GitHub repo to Cloudflare (Workers Builds, `npm run build`, assets served from `dist/` via `wrangler.jsonc`).
- [x] Test the site on the Cloudflare preview URL.
- [ ] Repoint rolfll.com's DNS to Cloudflare (nameservers/records only — no registrar transfer needed).
- [ ] Once the new site is confirmed live on the real domain, cancel the old WordPress hosting plan.

## Private notes

A hidden, password-protected page served by the Worker script in `worker/`. Nothing about it (path, passwords, messages) is stored in this repo.

- Messages live in the `NOTES` KV namespace, as one JSON list under the key `notes`.
- Photos and sound live in the `notes-media` R2 bucket (binding `MEDIA`), referenced from each note as `photo`/`audio`. They are only served through the Worker to logged-in viewers, with Range support. Deleting or replacing an attachment deletes its file a day later (a `trash` list in KV). After a `wrangler rollback` to a version without media support, do not save notes: old code drops the media references.
- A note can carry an optional game (`game`, currently only "Close the distance"): start and destination labels, distance, optional meet date, and up to 8 short lines. The reader page shows the game first and reveals the note at the end; the note is always in the HTML, so it still shows without JavaScript. "Preview" in the admin list shows any note as the reader would see it. Older Worker versions drop `game` when saving, so after a rollback do not save notes.
- Meetings (`meetings` in KV: date and place, set in the admin's Meetings section) drive a star sky at the top of the reader page: one star per note since the previous meeting, gathering into a heart on the meeting day and kept afterwards. The note dated on the meeting day is the arrival message.
- The reader can answer each note with a heart and/or a short line (up to 280 characters), stored under `replies` in KV and shown under the note in the admin list. Deleting a note deletes its reply; moving a note moves it. Older Worker versions ignore both keys, so a rollback leaves them untouched. KV reads can be up to a minute stale between locations, so deleting or moving a note within a minute of her replying could lose a reply she has just sent; edits that touch no reply never write `replies`.
- After dark: a second room (`<NOTES_PATH>/after-dark`) behind a doorway, reached from a quiet link at the bottom of the reader page once there is at least one entry. Entering sets a 30-minute door cookie bound to the reader session; "Leave" closes it. Entries (`after_dark` in KV: optional title, text, optional sound) are written at `<NOTES_PATH>/admin/after-dark`; replies go to `after_dark_replies`. Entry sounds are served only while the door is open. Older Worker versions ignore both keys.
- Equation drawings: a line in a note that is exactly `[[heart]]`, `[[filling heart]]`, `[[butterfly]]` or `[[fourier heart]]` (any case and spacing; at most 3 per note) becomes a typeset equation over a dark panel where the curve draws itself once it scrolls into view. The finished curve is also drawn server-side as an SVG, which is what readers without JavaScript or with reduced motion see. Unknown markers are refused on save. Nothing new is stored, and older Worker versions show the marker as text.
- Our list: a shared board of cards at `<NOTES_PATH>/after-dark/list` (behind the door) and `<NOTES_PATH>/admin/after-dark/list`, linked from the top of the room. Both people add, edit, delete and comment on cards and sort them into boxes by long-press drag or "Move to…", each with their own sorting and both choices shown. Each person writes only their own key (`list_reader`, `list_admin`) and pages merge the two, so a stale KV read of one person's key cannot undo the other's work; the other person's changes can take up to a minute to appear. Boxes and display names live in `list_settings`, edited at `<NOTES_PATH>/admin/after-dark/list/settings`. Older Worker versions ignore all three keys.
- The reading room: a bookshelf of recordings at `<NOTES_PATH>/reading-room`, linked under today's note with a dot while a book has never been played. Books (`books` in KV: title, author, an optional line, and a recording in R2) are added at `<NOTES_PATH>/admin/reading-room`. A book's first play is recorded in `books_played`; hearts and replies go to `book_replies` and are sent without a reload so playback continues. Where she stopped is remembered on her phone only. Recordings are served to the reader session and the admin, count as in use for media clean-up, and go to the trash when replaced or deleted. Older Worker versions ignore all three keys, but would trash the recordings after a later note or entry save, so do not save after a rollback.
- The reading room's sideboard: under the shelf, a record player for songs he recorded and a photo album with a line under each photo. Managed in the reading room admin (songs; album pages with up and down). KV `records`, `records_played`, `album`, `album_seen`; files in R2. A new song or photo lights the reading room link until she plays it or opens the album. Deploy backups also cover the four keys.
- A special event: `<NOTES_PATH>/event` shows a house of doors that open on their dates, with dishes to pick behind them and an optional card to pick a few from. Admin at `<NOTES_PATH>/admin/event` holds the event as JSON, its photos, her picks with private shopping lists, a preview by date and a clear. KV `event`, `event_picks`, `event_photos`; photos in R2, served only once their door is open. Deploy backups also cover the three keys.
- A gift: `<NOTES_PATH>/gift` is a box she unwraps, a few screens revealing what is inside, and a day she picks from his list (only days after today, by the 4am Singapore day). Admin at `<NOTES_PATH>/admin/gift` holds the gift as JSON and its photos, shows her pick, marks it booked with a few lines she then sees (tied to the day she picked), undoes that, previews and clears. KV `gift`, `gift_state` (hers), `gift_booking` (his), `gift_photos`; photos in R2, served to her only while the gift shows. Deploy backups also cover the four keys.
- Sounds keep the screen on: reader pages with a recording hold a screen wake lock while it plays, and let go 30 seconds after it stops. Nothing is stored.
- Configuration is Cloudflare secrets: `NOTES_PATH` (e.g. `/for-you`), `READER_PASSWORD`, `ADMIN_PASSWORD`, `COOKIE_SECRET`. Set or change one with `npx wrangler secret put <NAME>`.
- Daily use: open `<NOTES_PATH>/admin`, write a note, pick a date, save. The reader sees the latest note dated today or earlier (Copenhagen time), plus the earlier ones below it.
- Changing `COOKIE_SECRET` logs everyone out. Changing `NOTES_PATH` moves the page.
- Local dev: put test values for the four secrets in `.dev.vars` (gitignored), then `npx astro build && npx wrangler dev`.
