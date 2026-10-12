# After dark: design

A second, more private room inside the private notes page. A quiet link at the bottom of the reader page leads, through a short doorway, to a darker page of entries the admin writes whenever he likes. Each entry can carry a sound and can be answered with a heart and a short line.

The repo is public. Entries, sounds and replies live only in Cloudflare (KV and R2). The code contains the route names and the page's labels, but the notes path stays a secret, so nothing in the repo says where the page is or what it holds. Tests use placeholder text.

## Data

### KV `after_dark`

A JSON list of entries:

```
{ id, title, text, created, audio? }
```

- `id`: a random UUID, set on first save and never changed.
- `title`: trimmed, 0 to 120 characters. An empty title is allowed.
- `text`: CRLF normalized to LF and trimmed, 1 to 5000 characters.
- `created`: an ISO timestamp from the first save. Editing an entry keeps it. Entries are shown newest `created` first, and the page shows only the date part in Copenhagen time.
- `audio`: an optional attachment `{ key, type }`, exactly like a note's sound, stored in the `notes-media` R2 bucket.

A missing key means no entries. A stored value that fails validation is an error: it is never overwritten, and pages degrade as described under Errors.

### KV `after_dark_replies`

A JSON list of `{ id, heart, text, at }`, with at most one per entry `id`. The rules are the same as for note replies: up to 280 characters, and a reply with no heart and no text is removed. Deleting an entry removes its reply.

## The way in

### The link

When there is at least one entry, the reader page ends with a small, quiet link: `☾ Daily affirmations… after dark`. It goes to `<base>/after-dark`. With no entries, or if the entries can't be read, the link is absent.

The link carries `data-newest="<id of the newest entry>"`, and a tiny inline script adds a glowing dot when that differs from `localStorage['after-dark-seen']`. The after-dark page sets that value to its newest id. Every storage access is wrapped in try/catch. Without JavaScript or storage, there is simply no dot.

### The door

- `GET <base>/after-dark` needs a reader session; without one it shows the reader login.
  - With an **open door** it shows the room.
  - Otherwise it shows the doorway: a dark page with the line "This part is just for when you're alone", a **Come in** button (a form `POST <base>/after-dark/enter` with the reader CSRF token), and a quiet "Back to your notes" link.
- `POST <base>/after-dark/enter` checks the reader session and CSRF, sets the door cookie, and redirects (303) to `<base>/after-dark`.
- **The door cookie** is `notes_door`, with `Path=<base>`, `Max-Age=1800`, `HttpOnly`, `Secure` and `SameSite=Lax`.
  - Its value is an HMAC-signed token holding the time it was opened and bound to her current reader session.
  - The server also refuses tokens older than 30 minutes, whatever the browser keeps.
  - It covers `<base>/media/...` too, which is how sounds are allowed.
- `POST <base>/after-dark/leave` clears the door cookie (`Max-Age=0`) and redirects to `<base>`. The room has a "Leave" link at the top that submits it.
- After 30 minutes, or in a new visit the next day, she lands on the doorway again.

## The room

- **Style:** the reader page's fonts on a deep plum, almost black, background (`#1a1220`) with warm ink (`#ecdfd0`), muted (`#a8949a`) and candle-gold accent (`#d9a55b`). Entries fade in gently, with no motion under `prefers-reduced-motion`.
- **The top of the page** has the title "after dark" in italics and the "Leave" link.
- **Each entry** shows its title (if any, in italics), the formatted date, the text (`white-space: pre-line`), and the sound (`<audio controls preload="none">`). Under each entry is the reply area, with the same markup and behaviour as on notes. It has the anchor `entry-<id>` and posts to `POST <base>/after-dark/reply` with fields `id`, `heart`, `text` and `csrf`.
- **Replying** needs a reader session, an open door and CSRF.
  - A closed door redirects to the doorway.
  - An unknown id gets a 404.
  - Text that is too long redirects with `?unsent=<id>#entry-<id>` and shows "That didn't send. Try again?".
  - Success redirects to `<base>/after-dark#entry-<id>`.
- **Headers:** `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, the same as every notes page.

### Sounds

`GET <base>/media/<key>` already serves note media to the reader. A key referenced by an after-dark entry is served:
- to the reader only when the door is open;
- to the admin (`<base>/admin/media/<key>`) always.

Any other key keeps today's rules.

## Admin

- The normal admin page gets a link "After dark" to `<base>/admin/after-dark`.
- `GET <base>/admin/after-dark` shows:
  - a form (title, text, optional sound, and "Remove sound" when editing; it uses `?edit=<id>` to prefill);
  - the list of entries, newest first, each with Edit, Delete (with confirm) and her reply line (♥, her text and the time, the same as on notes);
  - a "Preview" link to `<base>/admin/after-dark/preview`, which renders the room as she sees it, with reply controls disabled.
- `POST <base>/admin/after-dark/save` (fields `csrf`, `id` when editing, `title`, `text`, `audio`, `remove_audio`).
  - It validates and re-renders with the typed values on error ("An entry needs text of up to 5000 characters and a title of up to 120.", plus the file check's message if a sound is rejected).
  - On success it redirects with "Saved.".
- `POST <base>/admin/after-dark/delete` (fields `csrf`, `id`) redirects with "Deleted." and removes the entry's reply.
- **Replaced or removed sounds** go to the existing `trash` list and are deleted after 24 hours. The cleanup's "keep" set counts keys referenced by notes and by entries, so neither side ever deletes the other's files.

## Errors and safety

- **A corrupt `after_dark` value:**
  - the reader page simply has no link;
  - the doorway and room show "Something went wrong loading this page." with a 500;
  - admin shows the error line and refuses saves (500) without overwriting.
- **A corrupt `after_dark_replies` value:** the room shows the entries without reply areas, admin shows "Replies could not be read.", and replying fails (500) without overwriting.
- **Escaping:** all entry and reply text reaches HTML only through `escapeHtml`. Nothing goes into scripts except the newest id, which is a UUID the server generated, placed in an attribute.
- **The door token** can't be forged without `COOKIE_SECRET`, and it is useless without her reader session cookie.
- **Concurrency:** writes to `after_dark_replies` happen only when a reply actually changes (the same rule as note replies).

## Operations

- **The deploy backup** also covers `after_dark` and `after_dark_replies` once they exist, with counts only and `cmp` after deploy.
- **Rollback:** older Worker versions don't know these keys, never write them, and would show no link. The entries survive a rollback untouched.

## Testing

- **Unit tests:**
  - parsing entries (valid, missing, invalid, ordering);
  - entry form parsing (limits, trimming, CRLF, empty title);
  - the door token (fresh, expired, wrong session, tampered);
  - parsing after-dark replies;
  - the orphan "keep" set including entry sounds.
- **View tests:**
  - the link appears only with entries and carries the newest id;
  - doorway markup;
  - room markup: order, escaping, sound, reply areas, anchors, disabled in preview, the error line;
  - the admin page: list, form prefill, reply lines.
- **Route tests:**
  - doorway versus room, depending on the door;
  - enter needs a session and CSRF;
  - leave clears the door;
  - the door expires after 30 minutes and is refused with a different reader session;
  - a reply's round trip and refusals;
  - admin save/edit/delete, a sound attached and replaced, and the trash;
  - media served only with an open door;
  - corrupt values never break the notes page or get overwritten;
  - preview.
- **Browser check** at phone and desktop sizes:
  - link and dot;
  - doorway and enter;
  - the room's look;
  - reply round trip;
  - leave;
  - expiry (by shortening the clock in a test, not by waiting);
  - reduced motion;
  - no JavaScript.
