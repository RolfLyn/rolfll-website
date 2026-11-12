# Our future home: she scores pictures, a dream home appears

## Why

They will be looking for a house in Denmark together. He wants a cosy way to learn her taste in homes: she scores pictures of houses, rooms, gardens and furniture, and the site shows what she loves. It is both something to dream over now and a practical guide later, when real listings come up ("she wants wood and big windows").

Only her scores count. He does not score. He can see her scores and results in admin.

## Goals

- A front-page banner that leads to a scoring page and a results page, designed for her iPhone.
- She scores one picture at a time from 1 to 10 with a slider, in four groups: houses, rooms, gardens, furniture.
- She can stop at any time, carry on later, and go back to change a score.
- A results page: "Your dream home" (her top house, room and garden together), the words she is drawn to, and her favourites per group, best first.
- Admin: add and remove pictures (with group, title, tags and credit), switch the banner on and off, and see her scores and the same results.
- A starter set of pictures that the builder finds, checks and loads (see "The starter pictures").

## Non-goals

- Him scoring, or comparing two people's tastes.
- Matching or importing real house listings.
- Pairwise "this or that" ranking. The slider was chosen.
- A form-based tag editor beyond plain text fields.

## Anti-goals

- Anything that feels like homework or a test. No scores shown as judgements of her, no "you have 40 left!" pressure copy.
- Pictures taken from estate-agent listings or anywhere without a licence that allows this use.
- Pages that load images from a third-party host. Pictures are served from our storage behind her session, like gift photos.
- A score saved that she did not choose (for example the slider's starting value being saved without her touching it, see Rules).
- Losing her scores when pictures are added, edited or reordered.
- Private content in this public repo. Tests use placeholders; the picture set is loaded through admin or a script, never committed.
- Copy that emphasises distance or the time difference. No em dashes in any copy.

## What she sees

**Banner.** On the notes page, in the same place and style as the event and gift cards (`.event-link`), with a small house-and-heart icon and the title "Our future home". Shown while admin has it switched on. The hint line under the title:

- nothing scored yet: "{N} pictures are waiting for you"
- some left: "{N} left to score"
- all scored: "See what you love"
- new pictures added after she had finished: "{N} new pictures"

The banner gets the `waiting` glow while any picture is unscored.

"New" is decided by a stored marker (the builder's call): when one of her saves leaves nothing unscored, `home_progress.finishedAt` is set to that time. Unscored pictures whose `added` is later than `finishedAt` count as new; while any unscored picture is older (or there is no `finishedAt`), the hint is "{N} left to score". "Clear her scores" also clears `finishedAt`. Deleting pictures never sets or clears it.

**Start page** at `<base>/home`. A heading, one short warm line, and four cards (Houses, Rooms, Gardens, Furniture), each showing "{scored} of {total}" and a small cover picture (the group's first picture). A link "See what you love" to the results page once she has scored anything. Tapping a card opens the scoring page for that group at her first unscored picture, or at the start if she has scored everything in it.

**Scoring page** at `<base>/home/<group>`. One picture at a time, big, with a small top line: group name on the left and "4 of 20" on the right.

- Under the picture: a large number, a word under it, a slider from 1 to 10 in whole steps, and a "Next" button. A small "Back" link beside Next goes to the previous picture in the group.
- The words: 1 to 2 "not for me", 3 to 4 "not really", 5 to 6 "it's nice", 7 to 8 "really like it", 9 "love it", 10 "my dream". The number and word follow the slider as she moves it.
- The slider starts at 5 for an unscored picture, at her score for a scored one.
- Tapping the picture shows it full screen; tapping again closes it.
- Next saves the score and moves to the next picture in the group. After the last one: a short "That's all the {group}" screen with buttons to the next unfinished group and to the results.
- A failed save keeps her on the picture with the slider where she left it and says "That didn't save. Try again?".

The approved mockups stay outside the repo, in the builder's scratchpad as `home-scoring-mockup.html` (option B, "Slide to score") and `home-results-mockup.html` (option B, "Your dream home"); coloured blocks there stand in for photos. The approved look for scoring: the reader site's cream paper (`--paper`, `--ink`, `--accent` from the reading room), a Georgia-style serif, a rounded photo, the number large in the accent colour, the word small and italic, and a dark rounded Next button.

**Results page** at `<base>/home/love`. Heading "Your dream home" and the subline "Put together from everything you loved".

1. **Dream home.** Her top house large on the left, her top room and top garden stacked on the right (mockup option B). Shown once she has scored at least half of each of houses, rooms and gardens. Before that: "Score a few more and your dream home starts to appear."
2. **What you're drawn to.** Up to 6 tag words as soft chips. A tag qualifies only when it appears on at least 3 pictures she scored 8 or higher. Rank the qualifying tags by her average score across all pictures with that tag (ties: more loved pictures first). Hidden until the same "half of each" threshold as the dream home.
3. **Favourites.** Per group (Houses, Rooms, Gardens, Furniture), her pictures scored 7 or higher, best first (ties: most recently scored first), each as a small thumbnail, the picture's title and the score. Tapping one opens it full screen. A group with none says "Nothing here yet."

Top picture for the dream home means highest score in that group; ties go to the most recently scored.

A small "Photo credits" link at the bottom of the results page lists each picture's credit.

**Without JavaScript** the slider is a plain range input in a form that posts to save and returns the next picture; the number and word show the saved value.

`prefers-reduced-motion`: no slide transitions between pictures.

## What admin sees

`<base>/admin/home`, linked from the admin page beside "Gift".

- **Banner on/off** switch.
- **Pictures**, listed by group in their order: thumbnail, title, tags, credit, her score if any, with Edit (title, tags, credit, group), move up/down, and Delete (with a confirmation; her score for it is then ignored).
- **Add pictures**: upload one or several images with a group, and for each a title, tags (comma-separated) and credit. Same photo checks as gift and album photos.
- **Her results**: the same three sections as her results page, plus a full table of every scored picture with score and when she scored it.
- **Clear her scores** with a confirmation, for test runs.

## Data

- KV `home` holds `{ on: boolean, pictures: Picture[] }`, where `Picture` is `{ id, group: 'houses'|'rooms'|'gardens'|'furniture', title, tags: string[], credit, file, added }`. `id` is a uuid. Order within a group is the array order.
- KV `home_scores` holds her side only: `{ [pictureId]: { score: 1..10, at: ISO time } }`. Only her saves write it; admin writes it only for "Clear her scores". Deleting a picture leaves her score in place, where it is ignored, so a stale read can never drop scores she just saved. Kept apart from `home` so his edits and her saves never overwrite each other.
- KV `home_progress` holds `{ finishedAt?: ISO time }`, her side, written by her saves and cleared by "Clear her scores".
- Image files in R2 with the same flat `<uuid>.<ext>` keys as every other upload (the builder's call, so the existing upload code is reused), served behind her session as gift photos are, and counted in `keysInUse` so media cleanup never deletes them.
- Add all three keys to the scratchpad backup script.

## Rules

- A score is saved only when she presses Next (or the no-JS form). Pressing Next on an untouched unscored picture saves 5. That is accepted: she saw the picture and chose to move on. (The builder's call.)
- Tags are lower-case, trimmed, and shown as written. One tag per idea ("wood", "big windows", "countryside").
- "Half of each group" means `scored >= ceil(total / 2)` for houses, rooms and gardens separately. A group with no pictures counts as satisfied.
- Scores for pictures that no longer exist are ignored everywhere.

## The starter pictures

The builder finds and loads the first set. These are content, so they live outside the repo.

- **Source:** Unsplash and Pexels only (their licences allow this use without payment). Keep the photographer's name and source as the `credit`.
- **How many:** 15 to 25 per group.
- **What:** realistic for a house in Denmark, suburban or rural, not central Copenhagen.
  - **Houses:** red-brick villa, 1930s mason's villa, white farmhouse with courtyard, thatched cottage, black-timber modern house, wooden summer-house style, townhouse.
  - **Rooms:** living rooms, kitchens, bedrooms, bathrooms, across light Scandinavian, Japandi, warm rustic, mid-century, colourful and classic.
  - **Gardens:** wild meadow, neat lawn with flower beds, kitchen garden, orchard, terrace under trees, garden at the forest edge.
  - **Furniture:** sofas, dining tables, beds and lamps across the same styles.
- **Checked:** the builder looks at every picture before it goes in and drops anything that is blurry, has watermarks, shows people prominently, or doesn't look like a real home.
- **Tagged:** each picture gets 3 to 6 tags from a shared vocabulary (style, material, colour, light, setting), so the "drawn to" words have something to find.
- **Sized:** resized to at most 1600 px on the long side, JPEG, under 400 KB where possible, for her phone.
- **Titles:** short and plain, such as "White farmhouse" or "Oak kitchen".
- **Loading (the builder's call):** after he gives the go-ahead to go live, the builder loads the set into the live site with a one-off script run on this PC, using `wrangler` (KV and R2 access is already set up there). The script reads the current `home` key and adds to it, so it never overwrites pictures that are already there. Reading `home`, which is his picture list and not her content, is allowed. The banner stays off after loading. He previews the set in admin and switches the banner on himself when he is happy with it.

## Left to the builder

- Route handling, form and CSRF details, following the gift and plans patterns.
- The exact shared tag vocabulary.
- The house-and-heart icon.
