# Records and Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A record player and a photo album on a sideboard under the reading room's bookshelf, managed in the reading room admin.

**Architecture:** A model in `worker/keepsakes.ts` (records and album photos, parsing, editing, ordering, "new" checks), views in `worker/keepsake-views.ts` that `readingRoomPage` and `readingRoomAdminPage` call into, and routes in `worker/index.ts` next to the reading room's. KV `records`, `records_played`, `album`, `album_seen`; files in R2.

**Tech Stack:** Cloudflare Workers, KV, R2, server-rendered HTML, inline ES5 script, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-records-and-album-design.md`

## Global Constraints

- Public repo: no song titles, photos, lines, names or dates of his. Tests use placeholders.
- No em dashes in user-facing copy. Inline scripts ES5. Phone first. `prefers-reduced-motion` stops spin, arm swing and page turn.
- Every page works without JavaScript (`?open=records`, `?open=album`).
- Songs: existing `audio` checks and 25 MB limit. Photos: existing `photo` checks.
- Handwriting font: Caveat (Google Fonts), only for album lines and the album cover word "Us".

## Review Focus

- She starts a record while a book is playing (or the reverse): the other one pauses. (Task 2)
- A photo is replaced: the line and position stay, the old file is retired, the new one shows. (Task 4)
- Only records, or only photos: only that object sits on the sideboard; with neither, no sideboard. (Task 2)
- A very wide or very tall photo: shown whole inside the page, never cropped or overflowing. (Task 2)
- A record or photo is deleted while she has the page open: her next play or page shows a quiet failure, no script error. (Task 2)

---

### Task 1: The model

**Files:**
- Create: `worker/keepsakes.ts`
- Test: `tests/notes-keepsakes.test.ts`

**Interfaces:**
- Consumes: `Attachment`, `isAttachment` from `worker/notes.ts`; `Played`, `parsePlayed`, `markPlayed`, `dropPlayed` from `worker/books.ts`.
- Produces:
  - `KEEPSAKE_LIMITS = { title: 120, line: 200 }`
  - `interface Song { id: string; title: string; line: string; created: string; audio: Attachment }`
  - `interface AlbumPhoto { id: string; line: string; created: string; photo: Attachment }`
  - `parseSongs(raw: string|null): Song[]` (newest first), `upsertSong(songs, song): Song[]`, `removeSong(songs, id): Song[]`, `songKeys(songs): string[]`
  - `parseAlbum(raw: string|null): AlbumPhoto[]` (stored order), `upsertPhoto(album, photo): AlbumPhoto[]` (a new one goes last, an existing one keeps its place), `removePhoto(album, id)`, `movePhoto(album, id, by: -1|1): AlbumPhoto[]`, `albumKeys(album): string[]`
  - `parseSongForm(get): { draft: {title,line}; error?: string }`, `parsePhotoForm(get): { line: string; error?: string }`
  - `parseSeen(raw: string|null): string|null`, `albumHasNew(album, seen: string|null): boolean` (any photo created after `seen`; true when never seen and not empty), `songsUnplayed(songs, played: Played[]): string[]`

- [ ] **Step 1: Write the failing tests**: parsing ignores malformed entries and throws on unparsable JSON like `parseBooks`; songs newest first; `upsertPhoto` appends new and keeps place on edit; `movePhoto` up/down, no-op at the ends; `songKeys`/`albumKeys`; form limits (title required for songs, max 120; line max 200, single line: newlines collapse to spaces); `albumHasNew` for never seen, seen before and after the newest; `songsUnplayed`.
- [ ] **Step 2: Run** `npx vitest run tests/notes-keepsakes.test.ts`. Expected: FAIL, cannot resolve `../worker/keepsakes`.
- [ ] **Step 3: Implement** in `worker/keepsakes.ts`, following `worker/books.ts`.
- [ ] **Step 4: Run** the same. Expected: PASS.
- [ ] **Step 5: Commit** `Add records and album model`.

### Task 2: Her side of the room

**Files:**
- Create: `worker/keepsake-views.ts`
- Modify: `worker/reading-room-views.ts` (`readingRoomPage` gains `songs?`, `songsPlayed?`, `album?`, `albumSeen?`, `songPlayAction?`, `albumSeenAction?`; the room's script pauses every page `audio`, not only book ones), `worker/views.ts` (`READER_FONTS` stays; Caveat link added only by the keepsake markup)
- Test: `tests/notes-keepsake-views.test.ts`

**Interfaces:**
- Produces: `sideboard({ songs, songsPlayed, album, albumSeen, mediaBase, home, open }): string` returning the sideboard and its two sheets (`#sheet-records`, `#sheet-album`), and `KEEPSAKE_SCRIPT`. Song audio elements are `<audio class="song" data-id data-title preload="none">`; the album's no-JS form is a list of `<figure>`s.

- [ ] **Step 1: Write the failing tests**: no sideboard with neither; only "Our records" with songs only; only "Our album" with photos only; `?open=records`/`album` sheet visible, others hidden; sleeves newest first, escaped title and line; a gold dot class on records when a song is unplayed and on the album when `albumHasNew`; album pages in stored order with escaped lines, `img` with `object-fit: contain` class; the Caveat stylesheet link present only when the album shows; `data-played`/`data-seen` actions absent in preview; keep-awake script present when songs exist (it comes from `listeningShell` because of the `<audio>`); the room script pauses all `audio`, tested by its source selecting `audio` rather than `.sheet audio`.
- [ ] **Step 2: Run** `npx vitest run tests/notes-keepsake-views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** to the approved mockup: lamp glow, wood top, two-door cabinet; CSS turntable (wood plinth, grooved record, red label with the song title, tone arm that swings on play); sleeves; progress bar and times; round play/pause; album sheet in dark red leather with a cream page, white tilted photo with four corners, Caveat line, "n of N", arrows, swipe, page-turn. `KEEPSAKE_SCRIPT`: plays the chosen sleeve, pauses others, remembers position per song in `localStorage` key `song-at-<id>` (try/catch), Media Session (`title`, artist "Recorded for you", album "Our records"), posts first play to `data-played` and album opening to `data-seen` with the CSRF token, removes the dots locally, shows "That didn't play. Try again?" on an audio `error`.
- [ ] **Step 4: Run** the same and `npx vitest run tests/notes-reading-room-views.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the record player and album to the reading room`.

### Task 3: His side in admin

**Files:**
- Modify: `worker/keepsake-views.ts`, `worker/reading-room-views.ts` (`ReadingRoomAdminData` gains `songs`, `songsPlayed`, `album`, `songDraft`, `editingSong?`, `editingPhoto?`)
- Test: `tests/notes-keepsake-views.test.ts`

- [ ] **Step 1: Write the failing tests**: a Records section with a form (title, line, `audio` file, `enctype="multipart/form-data"`, file required only when adding) and a list with Edit, Delete (confirm), "Listened …" or "Not played yet"; an Album section with a form (line, photo file) and a list with a small photo, its line, Edit, Up, Down, Delete (confirm); Up absent on the first and Down on the last; everything escaped.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** `songsAdmin(...)` and `albumAdmin(...)` in `worker/keepsake-views.ts`, rendered under the books.
- [ ] **Step 4: Run**. Expected: PASS.
- [ ] **Step 5: Commit** `Add records and album admin`.

### Task 4: Routes

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/notes-keepsake-routes.test.ts`

**Interfaces:**
- Routes: `POST /reading-room/song-played` (`id`, `quiet`), `POST /reading-room/album-seen` (`quiet`), `POST /admin/reading-room/song/save`, `/song/delete`, `/photo/save`, `/photo/delete`, `/photo/move` (`id`, `by`).

- [ ] **Step 1: Write the failing tests**: adding a song stores it and its file; a too-large or wrong-type file is refused with the draft kept; editing without a file keeps the recording; deleting retires its file and drops its play time; first play is recorded once; adding, editing (line only, and replacing the photo), moving and deleting photos; a replaced photo's old key is retired and the new one served; album-seen stores the time; reader media serves songs and album photos with her session and refuses without; `keysInUse` keeps them when a note file changes; the notes page's reading room link shows `unread` for an unplayed song and for an unseen photo; reading room page renders with corrupt `records` or `album` (sideboard part missing, books still there) and admin says which could not be read; preview shows the sideboard and records nothing.
- [ ] **Step 2: Run** `npx vitest run tests/notes-keepsake-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, following `readingRoomAction`, `handlePlayed`, `showMedia` and `keysInUse` (extend with songs and album keys via `tryLoad`).
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `Add records and album routes`.

### Task 5: Browser check and docs

- [ ] **Step 1:** Build and run locally, add placeholder songs (generated WAV) and photos in admin.
- [ ] **Step 2:** On a phone-sized touch screen in Chromium: record spins and arm swings on play, stops on pause; switching sleeves; a book pauses when a record starts; position remembered; album swipe and arrows; dots go out after play and after opening the album; reduced motion; no JavaScript. Close every browser context.
- [ ] **Step 3:** README bullet beside the reading room's, naming the four KV keys and that deploy backups cover them.
- [ ] **Step 4:** `npm test`, commit `Document records and album`.

Converting and loading his songs and photos, and going live, are separate steps after Rolf's go-ahead.
