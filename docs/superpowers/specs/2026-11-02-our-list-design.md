# Our list: design

A shared board of cards inside the after dark room. Both people add, edit, sort, compare and comment on cards. The code treats cards as opaque text. The repo is public: card text, comments, placements and display names live only in KV, and tests use placeholder text.

## Using it

- **Finding it.** A card at the top of the after dark room shows the card count and a dot when something is new. The page is `<base>/after-dark/list` (reader session and open door) or `<base>/admin/after-dark/list` (admin session).
- **Boxes.** New, then the configured boxes: Have to, Yes please, Curious, In the right mood, Just a fantasy, Not for me. Each collapses to its name and count; New starts open, and the open state is remembered on the device.
- **Sorting.** Each person has their own sorting. Press and hold to drag between or within boxes (touch and mouse), with auto-scroll near the edges; hovering a closed box opens it. Every card also has a "Move to…" control. Moves save in the background; a failed move goes back and shows "That didn't save. Try again?".
- **Cards.** Title (up to 100 characters), description (up to 1000), author, an "edited" mark, both people's boxes, a gold match mark when both chose the same box (not New or "Not for me"), a comment count, and a dot when the other person's change is unseen.
- **A card's sheet.** Full text, comments, edit, delete (with confirmation), and a comment box. Either person can edit or delete any card; each deletes only their own comments.
- **Settings.** `<base>/admin/after-dark/list/settings` renames, adds and removes boxes and sets display names. A card in a removed box returns to New. Without JavaScript every action works through ordinary forms.

## Storage

- `list_reader` and `list_admin`: each person's log of cards, edits, comments, removed card ids, placements and last-seen time. Each person writes only their own key, so a stale read of one person cannot undo the other's work. Pages merge both logs: the latest edit wins, and a removed card stays removed.
- `list_settings`: boxes and display names, admin only.

## Safety

Existing sessions and CSRF on every POST. Saves need no open door, so a closing door cannot lose text; reading does. Text is escaped and pages are not cached. Corrupt data shows an error and is never overwritten; the rest of after dark keeps working. Limits: 200 cards per person, 200 comments per card, 1000 characters per comment.

## Testing

Model, view and route tests with placeholder text, then browser checks at iPhone size with touch input, reduced motion and no JavaScript.
