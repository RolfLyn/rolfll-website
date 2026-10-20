# A painting with secrets: design

Van Gogh's *Almond Blossom* (1890, public domain) gets its own page. The admin hides short secrets on blossoms; she finds them by watching for a soft twinkle, opens them, and can send a heart or a line back.

The repo is public. Secrets, found times and replies live only in KV. The image is the public-domain painting.

## Her side

- **The link.** Under today's note, before the moon link: a small blossom with "A painting for you". It shows whenever the notes page shows. A gold dot appears on it while at least one secret is unfound. The dot is worked out on the server (no browser storage).
- **The page** (`<base>/painting`, reader login required):
  - a dark page; the painting fills the screen height and scrolls sideways when it is wider than the screen;
  - a top bar with "Back to your notes" and a count line: "1 secret hidden here", "3 secrets hidden here", or "You found all 3" once every secret is found; no line when there are no secrets;
  - a credit line: "Vincent van Gogh, Almond Blossom, 1890. Van Gogh Museum, Amsterdam."
- **Spots.** Each secret is a tap target centred on its position (7% of the painting height square).
  - Unfound spots take turns to twinkle, one every 3 seconds.
  - Found spots carry a small, still gold mark.
  - Under reduced motion, unfound spots show a faint still glint instead of twinkling.
- **Opening.** A card rises over the painting with the text, the date it was hidden and the reply area (heart and "Write something back", as on the notes). "Close" or a tap outside closes it.
  - The first opening records the secret as found, with the time. Later openings change nothing.
  - With JavaScript, opening is in place (a background POST); after a heart or reply the page reloads with the card open and the painting scrolled to that spot.
  - Without JavaScript, each spot is a button that posts and reloads the page with the card open.

## Admin

- `<base>/admin/painting`, linked from the notes admin next to After dark.
- The painting with numbered markers (gold: found, cream: not yet). Secrets are numbered by creation order.
- **Write a secret:** text (up to 500 characters) and a spot. Tapping the painting fills "Across (%)" and "Down (%)" and moves a "new" marker; the fields also work by hand.
- **Checks:** "A secret needs text of up to 500 characters.", "Tap the painting to choose where it hides.", "Too close to secret N, pick another blossom." (centres closer than 7% of the painting height). A rejected save keeps what was typed.
- **List:** number, text, "Found 21 Oct, 14:02" or "Not found yet", her heart and reply, Edit and Delete. Editing keeps the found time. Deleting removes its found time and reply.
- **Preview** shows her page with nothing recorded and replies disabled.

## Storage

- `secrets`: `[{ id, text, x, y, created }]`, x and y from 0 to 1.
- `secrets_found`: `[{ id, at }]`.
- `secret_replies`: `[{ id, heart, text, at }]`, the after dark reply shape.

## Safety and edge cases

- All routes use the existing reader or admin sessions; every POST needs the CSRF token.
- Text is escaped; positions are numbers checked to lie in 0 to 1 and are written into styles only as numbers.
- Unknown ids get 404.
- Unreadable secrets show the painting without secrets; admin says "Secrets could not be read." Admin saves refuse to overwrite unreadable data.
- Deleting uses the best-effort `updateStored` for found times and replies.

## Testing

Model, view and route tests, test-first, then a browser check at phone and desktop sizes (scrolling, twinkle, opening, replying, reduced motion, no JavaScript, admin placement).
