# Private Notes: Photos and Sound — Design Spec

## Background

The private notes page (spec `2026-09-29-private-notes-design.md`) is live and holds real notes. This adds at most one photo and at most one sound clip per note. Existing notes must keep working exactly as they are.

## Requirements

- A note may have an optional **photo** and an optional **sound** clip (zero or one of each).
- **Admin**: the write/edit form gains a Photo and a Sound file field. When editing, each existing attachment can be kept (default), replaced (pick a new file), or removed (checkbox). Deleting a note deletes its files (after a one-day grace period, see Flows).
- **Photos** are resized in the admin's browser before upload: longest edge at most 1600 px, re-encoded as JPEG (quality 0.85), which also strips EXIF metadata such as location. GIFs are uploaded unchanged (to keep animation). If the browser cannot decode the image (e.g. HEIC on Windows Chrome), the original file is sent and the server's type check decides.
- **Sound** files are uploaded as-is.
- **Reader page**: photo above the message text, audio player below it. Archive entries show their photo (smaller, lazy-loaded) and audio player too.
- **Privacy**: media is served only through the Worker, only to a logged-in viewer. The reader can fetch a file only if it belongs to a note dated today or earlier (Copenhagen); the admin can fetch any file. File keys are random UUIDs.
- **Backward compatibility**: notes without media are valid and render exactly as before. The stored format only gains optional fields; no migration, no rewrite of existing notes.

## Storage

- Cloudflare **R2** bucket `notes-media`, bound to the Worker as `MEDIA`.
- Object key: `<uuid>.<ext>`. The R2 object's `httpMetadata.contentType` holds the type.
- Note shape becomes `{ date, text, photo?: { key, type }, audio?: { key, type } }`. `parseNotes` accepts the optional fields and rejects malformed ones (so a bad value still fails closed, as today).

### Accepted files

| Kind | Types | Max size |
|---|---|---|
| Photo | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | 10 MB |
| Sound | `audio/mp4`, `audio/x-m4a`, `audio/m4a`, `audio/mpeg`, `audio/aac`, `audio/wav`, `audio/x-wav` | 25 MB |

If a file arrives with an empty or generic type, it is inferred from the extension (`.jpg .jpeg .png .webp .gif .m4a .mp3 .aac .wav`). SVG and anything else is rejected with a clear error, and the typed text is kept (as for other validation errors). Windows Sound Recorder's `.m4a` output is the expected sound source.

## Flows

- **Save** (`POST <path>/admin/save`, now `multipart/form-data`): validate the date, text, and files first. Then upload new files to R2. Then write the notes list to KV. Then move replaced or removed files to a `trash` list in KV; they are deleted from R2 on a later save once they are a day old, unless a note references them again (protects against stale KV reads). Unreferenced files are never served. A failure before the KV write leaves the notes untouched; at worst an unused file is orphaned in R2 (harmless).
- **Delete** (`POST <path>/admin/delete`): write the notes list to KV first, then move the note's files to the trash list.
- **A new note** (no `original`) never inherits media from a note it replaces; only an edited note keeps its attachments.
- **Moving a note's date** keeps its attachments.
- **Serve to reader** (`GET <path>/media/<key>`): requires the reader cookie, and the key must belong to a note dated `<= today`. Otherwise 404.
- **Serve to admin** (`GET <path>/admin/media/<key>`): requires the admin cookie (its cookie path is `<path>/admin`).
- Media responses support HTTP **Range** requests (206 Partial Content). iPhone Safari needs this to play audio. Headers: stored `Content-Type`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, max-age=86400` (keys never change content).

## Units (changes)

- `worker/notes.ts`: `Note` gains optional `photo`/`audio` of type `Attachment = { key: string; type: string }`; `parseNotes` validates them.
- `worker/media.ts` (new): file validation (type/size/extension inference), key generation, R2 put/delete helpers, ranged-response building.
- `worker/views.ts`: render photo/audio on the reader and admin pages; admin form becomes multipart with file inputs, "remove" checkboxes, and a small inline script for client-side photo resizing.
- `worker/index.ts`: save/delete use media helpers in the order above; new media routes.
- `worker/types.ts`: `Env.MEDIA` with a minimal R2 interface.
- `wrangler.jsonc`: `r2_buckets` binding `MEDIA` → `notes-media`.

## Safety During Rollout

1. Back up the live `notes` KV value to `C:\Users\Admin\Documents\rolfll-notes-backup\notes-<date>.json` (outside the repo, never committed).
2. Tests include a fixture shaped exactly like the live data (text-only notes) and assert it parses, renders, and survives an unrelated save unchanged.
3. Rolf enables R2 and the `notes-media` bucket is created **before** pushing. If the bucket were missing, the deploy would fail and the current version would stay live.
4. After deploy: check the reader page shows the existing notes, then add one test note with a photo and sound, then remove it.
5. Rollback: `npx wrangler rollback` restores the previous Worker version. Reading is unaffected, but the old code drops `photo`/`audio` when it saves. So after a rollback, back up KV first and do not save or delete any note until the media version is redeployed.

## Testing

- Unit: `parseNotes` with and without attachments, malformed attachments rejected; file validation (types, sizes, extension inference, SVG rejected).
- Route (with in-memory KV and R2 stubs): save with photo/sound; keep/replace/remove on edit; delete removes files; moving a date keeps files; the reader cannot fetch future or unknown media; the reader cookie cannot use the admin media route; Range requests return 206; a validation failure stores nothing and keeps the typed text; the legacy fixture is untouched by saving a different note.
- Manual (Playwright, local `wrangler dev`): photo resize actually shrinks a large image; `.m4a` plays; phone and desktop layout.

## Out of Scope

Multiple photos per note, video, in-browser recording, image cropping/editing.
