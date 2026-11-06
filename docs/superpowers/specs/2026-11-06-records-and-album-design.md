# Reading room: a record player and a photo album

## Why

The reading room holds his voice reading to her. He also records songs for her and has photos of them together. Those belong in the same warm room: a record player for the songs and an album for the photos, so the room feels like a little library they share. Romantic and quiet, with the same lamp-lit wood as the bookshelf.

## Goals

- Under the bookshelf, a lamp-lit wooden sideboard with a record player and a closed leather album marked "Us".
- The record player plays his songs, keeps her screen awake while one plays, and shows on the lock screen like the books.
- The album shows one photo at a time with his single line under it, turned by swipe or arrows.
- He adds, edits, orders and removes songs and photos in admin, as he does books.
- Designed for her iPhone.

## Non-goals

- Replies or hearts on songs and photos.
- Playlists, shuffle or autoplay of the next song.
- Captions longer than one line, or more than one photo per page.
- Uploading a folder of photos in one go.

## Anti-goals

- Anything in this public repo that is his: song titles, photos, lines, names, dates. Tests use placeholders.
- A song that stops when her screen would have slept.
- Photos or songs reachable without her session.

## What she sees

**The sideboard** sits under the shelf in `<base>/reading-room`, inside the same page. A soft lamp glow above it, a wooden top, a two-door cabinet below. On it, side by side: the record player (a wooden plinth with a black record, red label and a tone arm) labelled "Our records", and the closed red leather album with "Us" in gold handwriting, labelled "Our album". Each is shown only when it has something in it; with neither, the sideboard is hidden.

**Small dots** follow the reading room's own ribbon idea: a new song not yet played, or a photo added since she last opened the album, puts a small gold dot by "Our records" or "Our album", and makes the reading room link on her notes page show its existing "unread" dot.

**The record player sheet** rises from the bottom like a book's:
- A large turntable. While playing, the record spins and the arm swings onto it; when paused, it stops and lifts.
- The song's title on the label and above a progress bar with times, and a round play/pause button. Tapping the turntable also plays and pauses.
- His songs below as record sleeves, newest first, each with its title and his optional line. Tapping a sleeve puts that record on and plays it.
- Where she stopped is remembered on her phone, as for books. Starting one song pauses any other sound on the page.
- The lock screen shows the song title, "Recorded for you" and the album name "Our records".

**The album sheet** has dark red leather around a cream page:
- One photo, white-bordered and slightly tilted, held by four dark photo corners, with his line beneath in handwriting (Caveat).
- Swipe left or right, or the arrow buttons, to turn the page, with a short page-turn animation. "2 of 9" between the arrows.
- Opens at the first page, in the order he set.

`prefers-reduced-motion`: no spinning, no arm swing, no page turn.

Without JavaScript: songs are plain audio players in the sheet and the album is a list of the photos with their lines, through `?open=records` and `?open=album`, as books use `?open=<id>`.

The approved mockup is the visual reference.

## What he sees in admin

On `<base>/admin/reading-room`, two new sections under the books:
- **Records:** add a song with a title (required), a line (optional) and the sound file; edit, delete. A song's "played" time shows like a book's.
- **Album:** add a photo with its line (optional, one line); edit the line or replace the photo; move up and down; delete. Shows the photo small.

Preview of the reading room shows the sideboard too.

## Rules

- KV `records`, `records_played`, `album`, `album_seen` (the time she last opened the album). Files in R2 with random keys.
- Song files use the existing sound checks and 25 MB limit; photos use the existing photo checks.
- Songs and album photos are served to her session like book recordings, and count in `keysInUse` so the purge never touches them.
- Opening the album records `album_seen`; first playing a song records it in `records_played`; both in the background, as for books.
- The keep-awake script already covers reader pages with audio, so the record player is covered by being an `<audio>` on the page.
- Deploy backups cover the four new keys.

## His files for the first load (not in the repo)

Two songs (WAV, about 3½ minutes and 38 MB each, over the 25 MB limit): converted to AAC in `.m4a` at 192 kbps, about 5 MB each, before upload. Four photos (JPEG, 1200 by 1600): uploaded as they are. He writes the lines.

## Left to the builder

File layout, whether records and album share a module with books, exact sizes, and the drawing of the turntable and album in CSS.
