# The reading room: design

A bookshelf of the admin's voice recordings: he reads chapters, passages and poems aloud, and she listens at bedtime. Built phone-first for iPhone Safari. Replaces the painting with secrets, which is removed.

The repo is public. Titles, lines, recordings, play times and replies live only in KV and R2.

## Her side

- **The link.** Under today's note, before the moon link: a small book icon with "The reading room". A dot shows while at least one book has never been played. The dot is worked out on the server. The link always shows.
- **The room** (`<base>/reading-room`, reader login): a dim walnut room, "Back to your notes" at the top, and the shelf.
  - Books stand as spines, oldest first, wrapping onto further shelves. Each book's height, width and colour come from its id, so they never change. Colours are calm: dusty blue, cream, sage, muted rose, pale green, lavender grey.
  - The spine shows the title (running vertically) and the author.
  - Every book never played has a faint gold ribbon hanging from it.
  - No books: an empty shelf and "Nothing on the shelf yet."
- **Opening a book.** Each spine is a link to `?open=<id>`. With JavaScript the card opens in place; without, the page reloads with that card open. The card is a bottom sheet with title, author, the admin's line, "Read on <date>", the player, and the heart and reply area. "Close" or a tap outside closes it.
- **Playing.**
  - The first play of a book sends a background POST that records it as played (first time only), and its ribbon goes.
  - Playing one book pauses any other.
  - The position is saved on her phone every few seconds and on pause; opening the book again resumes there (unless within 10 seconds of the end). Storage access is wrapped in try/catch.
  - Lock screen: the Media Session API shows the title, the author and "Read for you".
- **Replies** go to `<base>/reading-room/reply` and return to the open card.

## Admin

- `<base>/admin/reading-room`, linked from the notes admin next to After dark.
- **Add or edit a book:** title (up to 120 characters), author (up to 120), an optional line (up to 200), and the recording (M4A, MP3, AAC or WAV, up to 25 MB; required for a new book, optional when editing). Rejected saves keep what was typed.
- **List**, oldest first: title, author, "Listened 3 Nov, 23:10" or "Not played yet", her heart and reply, Edit and Delete.
- **Preview** shows the room with replies disabled; playing there records nothing.

## Storage

- `books`: `[{ id, title, author, line, created, audio: { key, type } }]`.
- `books_played`: `[{ id, at }]`.
- `book_replies`: `[{ id, heart, text, at }]`, the after dark reply shape.
- Recordings are in R2 and served to the reader session or the admin. They count as in use for the media clean-up; a replaced or deleted recording goes to the 24-hour trash.

## Safety and edge cases

- Existing sessions and CSRF on every POST. Text is escaped. Unknown ids get 404.
- Unreadable books: the room shows "Something went wrong loading this page."; the notes page keeps its link without a dot; admin says "Books could not be read." and refuses to save over them.
- Deletes drop the book's play time and reply (best effort).

## Removing the painting

Code, image, routes and tests are removed. The secrets and found times were backed up locally first. The KV keys `secrets` and `secrets_found` are deleted after the deploy, with confirmation.

## Testing

Model, view and route tests, test-first; then WebKit at iPhone size: shelf, opening, playing and resuming, ribbon and dot, replies, reduced motion, no JavaScript.
