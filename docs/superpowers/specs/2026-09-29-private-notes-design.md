# Private Daily Notes — Design Spec

## Background

A hidden, password-protected page on rolfll.com where one specific person can read a short daily message from Rolf, plus a separate admin page where Rolf writes and queues those messages. Not linked from anywhere on the site.

The repo is public, so nothing personal lives in it: no messages, no passwords, and not the real URL path. `/for-you` below is only an example.

## Requirements

- **Reader page** at a secret path (example: `/for-you`). Password-gated. Shows today's message, plus an archive of earlier messages below it.
- **Admin page** at `<path>/admin`. Separate password. Rolf writes a message for a date, and can view, edit, and delete queued and past messages. Must be comfortable on a phone.
- **"Today"** is the calendar date in `Europe/Copenhagen` time (correct across DST changes).
- **Shown message** = the message with the latest date `<= today`. If nothing is queued for today, the most recent past message stays up. If no messages exist at all, a gentle placeholder line is shown.
- **Archive** = all messages with date `<= today` except the one currently shown, newest first. Future-dated messages are never sent to the reader's browser.
- **Login** is remembered on the device for 90 days.
- **Not indexed**: `noindex, nofollow` meta tag and `X-Robots-Tag` header; no links from the main site; not in any sitemap.

## Architecture

- The existing Cloudflare Worker (static assets from `./dist`) gains a Worker script (`main` in `wrangler.jsonc`).
- The script handles requests under the secret path. Everything else is passed to the static assets binding unchanged, so the main site's behavior does not change.
- Messages are stored in a Cloudflare KV namespace as a single JSON array under the key `notes` (`[{date: "YYYY-MM-DD", text}]`), so one KV read serves a whole page. There is only one writer (the admin), so write races are not a concern. One message per date (saving a date again overwrites it). If the stored value is unreadable, pages show an error and nothing is written, so a corrupt value is never silently replaced with an empty list.
- Pages are rendered as HTML strings by the Worker (no Astro involvement), so no secret content or path ever ends up in `dist/` or in the repo.

### Configuration (all set as Cloudflare secrets, never committed)

| Name | Purpose |
|---|---|
| `NOTES_PATH` | Secret URL path, e.g. `/for-you` |
| `READER_PASSWORD` | Password for the reader page |
| `ADMIN_PASSWORD` | Password for the admin page |
| `COOKIE_SECRET` | Key for signing login cookies (HMAC-SHA256) |

If `NOTES_PATH` is unset, the script serves nothing extra (fail closed).

### Units

- `worker/dates.ts`: today's date in Copenhagen time, the next empty date after the latest queued one.
- `worker/notes.ts`: selection logic over a list of `{date, text}` (current message, archive, future filtering). Pure functions.
- `worker/auth.ts`: password comparison (constant-time), signed cookie create/verify, with a separate cookie per role (reader/admin), rate limiting of failed attempts.
- `worker/views.ts`: HTML templates for the login, reader, and admin pages. All message text is HTML-escaped.
- `worker/index.ts`: routing, KV access, and wiring the above together.

### Flows

- `GET <path>` → not logged in: login form. Logged in: current message + archive.
- `POST <path>/login` → correct password: set the reader cookie and redirect. Wrong: form again with a kind error.
- `GET <path>/admin` → not logged in as admin: admin login form. Logged in: form (date defaults to the first date from today onward with no message) + list of all messages, with "currently showing" marked at top.
- `POST <path>/admin/save|delete` → admin cookie required. Redirect back after the action (POST-redirect-GET).
- Admin forms include a CSRF token tied to the admin cookie.

### Rate limiting

Failed logins are counted per IP in KV (key `fail:<ip>`) with a 15-minute TTL that restarts on each failure. After 5 failures, further attempts from that IP are refused until 15 minutes have passed since the last failure.

## Visual Design

- **Reader**: warm cream paper background, soft serif (loaded from Google Fonts), large comfortable message text, gentle fade-in on load, respects `prefers-reduced-motion`. The archive is a quiet list of dated entries below. The login is one password field with a single kind line above it.
- **Admin**: plain, practical, mobile-first form. No styling effort beyond legibility.
- Visually independent of the main site's dark theme.

## Testing

- Vitest unit tests for `dates.ts`, `notes.ts`, `auth.ts`: Copenhagen midnight and DST boundaries, fallback to the most recent message, future messages excluded, archive order, cookie signing/tampering/expiry, reader cookie not accepted as admin.
- Route-level tests against the Worker with an in-memory KV stub and a stub assets binding: gate enforcement, save/delete, non-secret paths passed through to assets.
- Existing `npm test` (build + current tests) keeps passing.
- Manual click-through locally with `wrangler dev` before deploying.

## Out of Scope

- Multiple readers, multiple messages per day, images/attachments, notifications, scheduled times within a day.
