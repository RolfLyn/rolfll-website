# Our Future Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** She scores pictures of houses, rooms, gardens and furniture from 1 to 10 with a slider. A results page shows her dream home, the words she is drawn to and her favourites. Admin manages the pictures and sees her results.

**Architecture:** The code follows the gift feature's layout:
- `worker/home.ts` is a pure model module: parsing, picture edits, scoring, banner hint and results.
- `worker/home-views.ts` holds the reader pages, an inline ES5 script and the admin page.
- Routes go in `worker/index.ts`.
- A one-off loader script outside the repo loads the starter pictures after go-live.

**Tech Stack:** Cloudflare Worker (TypeScript), KV `NOTES`, R2 `MEDIA`, server-rendered HTML with an inline ES5 script, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-home-taste-design.md`. The mockups are in the scratchpad as `home-scoring-mockup.html` and `home-results-mockup.html`; option B is the approved one on each.

## Global Constraints

- **Public repo.** Never commit picture files, real credits, tags lists from the starter set, or private content. Tests use placeholders.
- **Copy.** No em dashes anywhere. No pressure copy.
- **Her device.** Her iPhone is the target. The script is ES5 only, and every action also works without JavaScript.
- **KV keys:** `home` `{ on, pictures }`, `home_scores` (her side), `home_progress` `{ finishedAt? }` (her side).
- **Pictures.** Served `no-store`, behind her session, only while `home.on`, and only keys listed in `home.pictures`. Admin can always see them via `/admin/media`.
- **Saves** need a session and CSRF. JS saves use XHR with `quiet=1`, which returns 204. A failed save falls back to an ordinary form post.
- **Score words:** 1–2 "not for me", 3–4 "not really", 5–6 "it's nice", 7–8 "really like it", 9 "love it", 10 "my dream".
- **Copy fixed by the spec:**
  - "Our future home"
  - "{N} pictures are waiting for you" / "{N} left to score" / "See what you love" / "{N} new pictures". When N is 1: "1 picture is waiting for you", "1 left to score", "1 new picture".
  - "Next", "Back", "That didn't save. Try again?"
  - "That's all the {group}"
  - "Your dream home", "Put together from everything you loved"
  - "Score a few more and your dream home starts to appear."
  - "What you're drawn to", "Nothing here yet.", "Photo credits"
- **Rules:**
  - The dream home and the words appear when `scored >= ceil(total / 2)` for each of houses, rooms and gardens. An empty group counts as met.
  - A word qualifies when it is on at least 3 pictures she scored 8 or more. Words are ranked by her average score across all pictures with that tag; ties go to the word with more loved pictures. Show at most 6.
  - Favourites are pictures scored 7 or more. Sort best first; ties go to the most recently scored.
  - The dream-home pick is the top score in each group; ties go to the most recently scored.
- `prefers-reduced-motion`: no transitions.

## Review Focus

1. **Corrupt KV.** If `home`, `home_scores` or `home_progress` is corrupt, the notes page still renders with no banner, `/home` pages show an error page, and admin still opens with the problem named. Her save writes nothing.
2. **A picture deleted while she is scoring it** (two tabs). Her save of that id is refused with 404 and nothing is written. Its stale score never counts in totals, results or the banner.
3. **Banner off.** Every reader `/home` URL and every picture key returns 404, even with her session.
4. **Out-of-range scores** posted by hand (`0`, `11`, `5.5`, `abc`, empty) are refused and nothing is written.
5. **"New" vs "left".**
   - She finishes, then he adds 2 pictures: "2 new pictures".
   - He then clears her scores: "{N} pictures are waiting for you".
   - She finishes, then he deletes a picture: no new hint, "See what you love".

---

### Task 1: The home model

**Files:**
- Create: `worker/home.ts`
- Test: `tests/notes-home.test.ts`

**Interfaces:**
- Produces:
  - `type HomeGroup = 'houses' | 'rooms' | 'gardens' | 'furniture'`
  - `GROUPS: { id: HomeGroup; name: string }[]` (Houses, Rooms, Gardens, Furniture, in that order)
  - `HOME_LIMITS = { pictures: 300, title: 80, tags: 8, tag: 30, credit: 200 }`
  - `interface HomePicture { id: string; group: HomeGroup; title: string; tags: string[]; credit: string; file: string; added: string }`
  - `interface Home { on: boolean; pictures: HomePicture[] }`
  - `type HomeScores = Record<string, { score: number; at: string }>`
  - `interface HomeProgress { finishedAt?: string }`
  - `interface Scored extends HomePicture { score: number; at: string }`
  - `interface HomeResults { ready: boolean; dream: { house?: Scored; room?: Scored; garden?: Scored }; words: string[]; favourites: Record<HomeGroup, Scored[]> }`
- Parsing:
  - `parseHome(raw: string | null): Home`: null gives `{ on: false, pictures: [] }`; corrupt input throws.
  - `parseHomeScores(raw: string | null): HomeScores`: throws on corrupt input.
  - `parseHomeProgress(raw: string | null): HomeProgress`: throws on corrupt input.
  - `parseTags(text: string): string[]`: comma-separated, trimmed, lower-cased, de-duplicated, blanks dropped; at most 8 tags, each cut to 30 characters.
  - `parsePictureFields(f: { group: string; title: string; tags: string; credit: string }): { ok: true; value: Pick<HomePicture, 'group' | 'title' | 'tags' | 'credit'> } | { ok: false; error: string }`
- Picture changes:
  - `addPicture(home: Home, p: HomePicture): Home | null`: appends; null at the 300 limit.
  - `editPicture(home: Home, id: string, v: Pick<HomePicture, 'group' | 'title' | 'tags' | 'credit'>): Home | null`
  - `movePicture(home: Home, id: string, dir: 'up' | 'down'): Home`: swaps with the neighbour in the same group; unchanged at an end.
  - `removePicture(home: Home, id: string): Home`
  - `dropScore(scores: HomeScores, id: string): HomeScores`
  - `setOn(home: Home, on: boolean): Home`
- Scoring:
  - `scoreWord(score: number): string`
  - `parseScore(v: string): number | null`: whole numbers 1 to 10 only.
  - `saveScore(home: Home, scores: HomeScores, progress: HomeProgress, id: string, score: number, at: string): { scores: HomeScores; progress: HomeProgress } | null`: null for an unknown id. Sets `finishedAt = at` when, after the save, every current picture is scored.
  - `inGroup(home: Home, group: HomeGroup): HomePicture[]`
  - `groupCounts(home: Home, scores: HomeScores): Record<HomeGroup, { scored: number; total: number }>`
  - `firstUnscored(home: Home, scores: HomeScores, group: HomeGroup): HomePicture | undefined`
- Banner and results:
  - `bannerHint(home: Home, scores: HomeScores, progress: HomeProgress): { text: string; waiting: boolean } | null`: null when there are no pictures.
  - `homeResults(home: Home, scores: HomeScores): HomeResults`

Scores whose id is not in `home.pictures` are ignored by every function.

- [ ] **Step 1: Write the failing tests** in `tests/notes-home.test.ts`. Use placeholder pictures built by a helper `pic(id, group, tags, added)`.
  - **Parsing.**
    - `parseHome(null)` gives `{ on: false, pictures: [] }`. `parseHome('{')` throws. `parseHome` throws on a picture with group `'kitchens'`.
    - `parseHomeScores('{"a":{"score":11,"at":"x"}}')` throws.
    - `parseTags(' Wood, big Windows,wood,, ')` gives `['wood', 'big windows']`. Nine tags are cut to 8.
    - `parsePictureFields`:
      - refuses an empty title ("Give the picture a title.");
      - refuses group `'kitchens'` ("Choose a group.");
      - refuses an 81-character title;
      - accepts a valid set.
  - **`parseScore`.** Accepts `'1'` and `'10'`. Gives null for `'0'`, `'11'`, `'5.5'`, `'abc'` and `''`.
  - **`scoreWord`.** For 1 through 10 it gives: not for me, not for me, not really, not really, it's nice, it's nice, really like it, really like it, love it, my dream.
  - **Picture changes.**
    - `movePicture` with two houses and a garden between them swaps the two houses. Moving the first house up changes nothing.
    - `removePicture` followed by `dropScore` removes both the picture and its score.
    - `addPicture` gives null at 300 pictures.
  - **`saveScore`.**
    - An unknown id gives null.
    - When the save scores the last unscored picture, `finishedAt` equals `at`.
    - A save that leaves another picture unscored keeps the old `progress`.
    - Re-scoring a picture replaces both `score` and `at`.
  - **`bannerHint`.**
    - 3 pictures and no scores: `{ text: '3 pictures are waiting for you', waiting: true }`.
    - 1 picture and no scores: '1 picture is waiting for you'.
    - 2 of 3 scored: '1 left to score'.
    - All scored: `{ text: 'See what you love', waiting: false }`.
    - Finished at T, then 2 pictures added after T: '2 new pictures'.
    - Finished at T, then 1 added after T while an older picture is unscored: '2 left to score'.
    - Finished, then a picture removed: 'See what you love'.
    - No pictures: null.
    - A score for an unknown id does not count.
  - **`homeResults` (Review Focus 2).**
    - Houses 4 total with 1 scored: `ready` is false.
    - Houses 4 with 2 scored, rooms 3 with 2 scored, gardens 0, furniture any: `ready` is true.
    - The dream house is the top-scored house. Of two houses scored 9, the one with the later `at` wins.
    - `words`:
      - 'wood' is on 3 pictures scored 8, 9 and 10 plus 1 scored 2, so its average is 7.25. 'light' is on 3 pictures scored 8, 8 and 8.
      - That gives `['light', 'wood']`, since 8 > 7.25.
      - A tag on only 2 loved pictures is absent.
      - With 8 qualifying tags, only 6 are returned.
    - `favourites.houses` holds only scores of 7 or more, best first. Ties go to the later `at`.
    - A stale score for a removed picture appears nowhere.

- [ ] **Step 2: Run the tests to check they fail**
Run: `npx vitest run tests/notes-home.test.ts`
Expected: FAIL, because `../worker/home` cannot be found.

- [ ] **Step 3: Implement `worker/home.ts`** with the signatures above. Validate the stored shapes in the same style as `worker/plans.ts` (`isRecord`, ISO time checks). `id` and `file` are non-empty strings.

- [ ] **Step 4: Run the tests to check they pass**
Run: `npx vitest run tests/notes-home.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
`git add worker/home.ts tests/notes-home.test.ts && git commit -m "feat: model for scoring home pictures"`

### Task 2: Reader pages and script

**Files:**
- Create: `worker/home-views.ts`
- Test: `tests/notes-home-views.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - `homeStartPage(d: { groups: { id: HomeGroup; name: string; scored: number; total: number; coverKey?: string; href: string }[]; loveHref?: string; mediaBase: string; back: string }): string`
  - `homeScorePage(d: { groupName: string; picture: { id: string; title: string; file: string }; index: number; total: number; score?: number; action: string; csrf: string; group: HomeGroup; nextHref: string; backHref?: string; mediaBase: string; home: string }): string`
  - `homeDonePage(d: { groupName: string; next?: { name: string; href: string }; loveHref: string; home: string }): string`
  - `homeLovePage(d: { results: HomeResults; mediaBase: string; creditsHref: string; home: string }): string`
  - `homeCreditsPage(d: { credits: { title: string; credit: string }[]; back: string }): string`
  - `homeErrorPage(): string`
  - `HOME_SCRIPT: string`

**Look.**
- Reading-room paper tokens (`--paper #fbf5ea`, `--ink #3a2e28`, `--muted #8c7b6c`, `--accent #b0645a`, `--line #e4d8c4`, `--cream #f1e6d2`), a Georgia serif and a 16px side gutter.
- Scoring page:
  - a top line with the group name and "{index} of {total}";
  - a rounded picture at most 62vh tall with `object-fit: cover`;
  - the number large in the accent colour, with the word small and italic under it;
  - an accent-coloured range slider;
  - a dark rounded "Next" button, with a small "Back" link beside it.
- Love page:
  - the dream-home grid follows the results mockup (2fr/1fr, with the house spanning two rows);
  - tag chips are cream;
  - favourites are rows with a 44×34 thumbnail, the title and the score.

- [ ] **Step 1: Write the failing tests:**
  - **`homeScorePage`, unscored (`score` undefined):**
    - The form posts to `action`.
    - It has hidden fields `csrf`, `id` and `group`, and `<input type="range" name="score" min="1" max="10" step="1" value="5"`.
    - It shows the number `5` and "it's nice", a button "Next", and `data-next="{nextHref}"`.
  - **`homeScorePage` with `score: 9`:** `value="9"` and "love it".
  - **`homeScorePage` other cases:**
    - With `backHref` it shows a "Back" link to it; without, no Back link.
    - The picture `src` is `{mediaBase}/{file}`, wrapped in a link to the same URL.
    - It shows "3 of 20".
    - The title is escaped (`<b>` becomes `&lt;b&gt;`).
  - **`homeStartPage`:**
    - Four cards, each with "{scored} of {total}".
    - The "See what you love" link only when `loveHref` is given.
  - **`homeDonePage`:**
    - "That's all the houses" (the group name in lower case).
    - "On to rooms" linking to `next.href` when given.
    - "See what you love".
  - **`homeLovePage`:**
    - With `ready` false: "Score a few more and your dream home starts to appear." and no "What you're drawn to".
    - With `ready` true and 2 words: both chips plus the three dream tiles.
    - A group with no favourites shows "Nothing here yet."
    - The "Photo credits" link is present.
  - Each favourite and dream tile links to `{mediaBase}/{file}`. The script opens these links full screen, the same way as on the scoring page.
  - **`homeCreditsPage`** lists each title and credit, escaped.
  - **The no-em-dash check:** none of the outputs contain `—`.
  - **`HOME_SCRIPT`:**
    - It contains `quiet=1` and "That didn't save. Try again?".
    - It has no `=>`, `let ` or `const ` (ES5).

- [ ] **Step 2: Run the tests to check they fail**
Run: `npx vitest run tests/notes-home-views.test.ts`
Expected: FAIL, because the module cannot be found.

- [ ] **Step 3: Implement `worker/home-views.ts`.**
  - **`HOME_SCRIPT`**, inline and ES5:
    - On slider `input`, update the number and the word from a 10-entry word table.
    - On form submit, XHR-post the form plus `quiet=1`. On 204, `location.href = data-next`. Otherwise show "That didn't save. Try again?" and leave the slider where it is.
    - Tapping the picture link calls `preventDefault` and toggles a full-screen class; tapping again closes it.
    - Prefetch the next picture: the next picture's file is passed as `data-next-file` on the form, and the script loads it with `new Image()`.
  - **Without JS** the form posts normally (the route redirects).
  - **Reduced motion:** wrap transitions in `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 4: Run the tests to check they pass**
Run: `npx vitest run tests/notes-home-views.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
`git add worker/home-views.ts tests/notes-home-views.test.ts && git commit -m "feat: pages for scoring home pictures"`

### Task 3: Admin page

**Files:**
- Modify: `worker/home-views.ts`
- Test: `tests/notes-home-views.test.ts`

**Interfaces:**
- Produces: `homeAdminPage(d: { base: string; csrf: string; home: Home | null; scores: HomeScores | null; flash?: string; error?: string; problem?: string }): string`.
  - `home` is null when `home` is corrupt: show `problem`, still show the add form, and hide the list.
  - `scores` is null when `home_scores` is corrupt: show "Her scores could not be read." and hide the results.

**Sections, in order:**
1. **Back link.**
2. **Banner switch.** A form posting to `{base}/admin/home/toggle` with hidden `on`. The button reads "Switch the banner on" or "Switch the banner off", followed by the state: "The banner is on" or "The banner is off".
3. **Add pictures.** A form, `multipart`, posting to `{base}/admin/home/add`:
   - group select;
   - `photos` file input with `multiple`;
   - `title`, `tags` and `credit` text inputs;
   - a note "Title, tags and credit are used for every picture in this upload."
4. **Pictures, per group.** Each row has:
   - a thumbnail `{base}/admin/media/{file}`, the title, the tags, the credit, and her score or "not scored";
   - an Edit form posting to `/admin/home/edit` (id, group, title, tags, credit);
   - up and down buttons posting to `/admin/home/move` (id, dir);
   - Delete posting to `/admin/home/delete` (id), with `onclick="return confirm('Delete this picture and her score for it?')"`.
5. **Her results.** The dream home, the words and the favourites, as on her page, followed by a table of every scored picture: title, group, score and the time scored, newest first.
6. **Clear her scores.** Posts to `/admin/home/clear`, with a confirm.

- [ ] **Step 1: Write the failing tests:**
  - **Banner switch.** With `home.on` false the page shows "Switch the banner on" and a hidden `on` value `1`. With `on` true it shows `0`.
  - **Rows.** A picture row shows its title, tags joined with ", ", "not scored", or "8" when scored.
  - **The full table** lists scored pictures, newest first.
  - **`home` null.** Shows the problem text and still shows the add form.
  - **`scores` null.** Shows "Her scores could not be read."
  - **No em dash.**

- [ ] **Step 2: Run the tests to check they fail.** Run `npx vitest run tests/notes-home-views.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `homeAdminPage`.** Reuse the love-page section renderer from Task 2, giving it the admin media base.

- [ ] **Step 4: Run the tests to check they pass.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit**
`git commit -am "feat: admin page for home pictures"`

### Task 4: Routes, media, banner and admin link

**Files:**
- Modify:
  - `worker/index.ts`: keys, loaders, routes, `showMedia`, `keysInUse`, the notes page banner.
  - `worker/views.ts`: a `home` prop on `readerPage`, rendered as `.event-link` with a new `HOME_ICON` (house with a heart); the admin link "Our future home" after "Gift".
  - `README.md`: one bullet.
- Test: `tests/notes-home-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Constants: `HOME_KEY = 'home'`, `HOME_SCORES_KEY = 'home_scores'`, `HOME_PROGRESS_KEY = 'home_progress'`.

**Reader routes.** All need the reader session. All return 404 when `!home.on` or there are no pictures.
- `GET /home`: the start page. Each card's `href` is `/home/<group>`. `loveHref` appears when any current picture is scored.
- `GET /home/<group>` (`houses|rooms|gardens|furniture`):
  - With `?at=<id>`, show that picture; 404 if it is not in the group.
  - Otherwise show `firstUnscored`, or the group's first picture when all are scored.
  - With `?done=1`, show the done page. Its `next` is the first group after this one, in `GROUPS` order (wrapping round), that has an unscored picture.
  - An empty group gives 404.
  - Links on the scoring page:
    - `nextHref` is `/home/<group>?at=<next id>`, or `/home/<group>?done=1` after the last picture.
    - `backHref` is the previous picture in the group, if any.
- `POST /home/score`: fields `csrf`, `id`, `group`, `score`, optional `quiet`.
  - Bad CSRF gives the expired page, 403.
  - A bad score gives 400. An unknown id gives 404. Nothing is written in either case.
  - Otherwise write `home_scores`, and write `home_progress` only when it changed.
  - With `quiet=1`, return 204.
  - Otherwise redirect 303 to the next picture's URL, computed the same way as `nextHref`.
- `GET /home/love`: the love page.
- `GET /home/credits`: the credits page.

**Admin routes.** All need the admin session and CSRF on POSTs. Each redirects to `/admin/home?msg=…` with a new FLASH entry:
- `home-on` / `home-off`: "The banner is on." / "The banner is off."
- `home-added`: "Pictures added."
- `home-saved`: "Saved."
- `home-deleted`: "Picture deleted."
- `home-cleared`: "Her scores are cleared."

The routes:
- `GET /admin/home`
- `POST /admin/home/toggle`
- `POST /admin/home/add`: uses `checkFile('photo', f)` and `storeUpload`. Each file is added with a `crypto.randomUUID()` id, the group, title, tags and credit from the form (validated with `parsePictureFields`), and `added = now`. "Choose at least one photo." when there are none.
- `POST /admin/home/edit`
- `POST /admin/home/move`
- `POST /admin/home/delete`: removes the picture and its score. Retires the file through `retireOrphans` with `keysInUse`.
- `POST /admin/home/clear`: writes `{}` to `home_scores` and `{}` to `home_progress`.

If `home` is corrupt, admin actions other than `add` render the admin page with "The saved pictures could not be read, so nothing was changed." and status 500.

**Media.** In `showMedia`, after the gift block:
- If the key is a `file` in `home.pictures`, serve it `no-store` to admin always.
- Serve it to the reader only when `home.on` is true.

**`keysInUse`** includes every `home.pictures[].file`.

**Notes page banner.** `homeWayIn(kv, cfg)` returns `{ href, title: 'Our future home', hint, waiting }` from `bannerHint`, or null when the banner is off, when there are no pictures, or when anything is corrupt. Use `tryLoad`. The banner shows after the gift card.

- [ ] **Step 1: Write the failing tests** in `tests/notes-home-routes.test.ts`, using the setup, login and `postForm` pattern from `tests/notes-gift-routes.test.ts`. Seed `home` directly in KV with placeholder pictures whose files exist in `memoryR2`.
  - **Banner off (Review Focus 3).**
    - `GET /for-you/home`, `/home/houses`, `/home/love` and the picture's media URL all give 404 for her.
    - Admin `/for-you/admin/media/<file>` gives 200.
  - **Banner on, no scores.**
    - The notes page contains "Our future home" and "3 pictures are waiting for you".
    - `GET /home/houses` shows the first house.
  - **A score post** with `score=8` and `quiet=1` gives 204.
    - `home_scores` holds 8 for that id.
    - The notes page now says "2 left to score".
  - **A score post without `quiet`** redirects 303 to `/for-you/home/houses?at=<second house>`. After the last house it redirects to `?done=1`.
  - **Review Focus 4.** `score` of `0`, `11`, `5.5` or `abc` gives 400, and `home_scores` is unchanged.
  - **Review Focus 2.**
    - A score for an id not in `home` gives 404, with nothing written.
    - After admin deletes a scored picture, its score is gone from `home_scores` and its file is retired.
  - **Review Focus 1.**
    - With `home` set to `'{'`: the notes page is 200 with no "Our future home", and `/home` gives 500 with the error page.
    - Admin `/admin/home` gives 200 and shows the problem.
    - With `home_scores` set to `'{'`, a score post gives 500 and writes nothing.
  - **Review Focus 5.**
    - She scores all 3 pictures, so `home_progress.finishedAt` is set. Admin adds 2 pictures and the notes page says "2 new pictures".
    - Admin clears her scores and the notes page says "5 pictures are waiting for you".
  - **Admin actions.**
    - `toggle` with `on=1` sets `home.on` to true.
    - `add` with 2 files creates 2 pictures with the form's group and tags.
    - `move` with `down` swaps the order.
    - `edit` changes the title.
    - A missing CSRF gives 403.
  - **The admin page** links to `/for-you/admin/home`, with the text "Our future home".

- [ ] **Step 2: Run the tests to check they fail.** Run `npx vitest run tests/notes-home-routes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the routes, media serving, `keysInUse`, the banner and the admin link** as above. Follow the gift handlers for the session, CSRF and `tryLoad` patterns.

- [ ] **Step 4: Run the full suite**
Run: `npm test`
Expected: the astro build succeeds and all tests pass (585 before this work, plus the new ones).

- [ ] **Step 5: Commit**
`git add -A worker tests README.md && git commit -m "feat: our future home, routes and banner"`

### Task 5: Local browser check, backup keys, review

**Files:**
- Modify (scratchpad, not the repo): `backup.js`, to add `home`, `home_scores` and `home_progress`.
- Create (scratchpad): `wk/home-walk.js`

- [ ] **Step 1: Seed and walk locally.**
  - Run `npx astro build`, then `npx wrangler dev --port 8787`.
  - Seed placeholder pictures through the admin add form, using any local JPGs from `wk/`. Switch the banner on.
  - With Playwright at 390×844, `isMobile`, walk through the following. Expected: all checks pass and there are no page errors.
    1. The banner shows "3 pictures are waiting for you" (or whatever the seeded count is).
    2. On a scoring page, moving the slider to 9 updates the number and shows "love it".
    3. Next moves to picture 2. Back returns to picture 1, with the slider at 9.
    4. Tapping the picture opens it full screen.
    5. After the last house, the done page shows.
    6. The love page shows "Score a few more…" until half of each group is scored, then shows the dream home.
    7. Admin shows the score table.
  - Take screenshots for the record.
- [ ] **Step 2: Close every browser context and stop the dev server.**
- [ ] **Step 3: Request a final review.** A reviewer subagent on opus reads the whole diff against the spec and the Review Focus list. Fix what it finds, with failing tests first, in one pass.

### Task 6: Go live and load the starter pictures (only after his go-ahead)

- [ ] **Step 1: Back up.** Run `node backup.js <date>`, which now includes the `home` keys. Then push master and check `npx wrangler deployments list`, which should show a new deployment. Check that the backup compares identical afterwards and that home returns 200.
- [ ] **Step 2: Gather the pictures** in the scratchpad under `home-pics/`. They never go in the repo.
  - **Sources:** Unsplash and Pexels only, 15 to 25 per group, matching the spec's lists.
  - **Check each one:** download it and look at it with the Read tool. Drop anything blurry, watermarked, showing people prominently, or not a real home.
  - **Write `home-pics/pictures.json`:** for each picture, `{ file, group, title, tags, credit }`, where the credit is "Photographer on Unsplash" or "Photographer on Pexels".
  - **Use one shared tag vocabulary:**
    - **style:** scandinavian, japandi, rustic, mid-century, classic, colourful, modern;
    - **material:** wood, brick, stone, white walls, black timber, thatch;
    - **light:** big windows, bright, cosy;
    - **setting:** countryside, suburb, forest, sea;
    - **garden:** wild, neat, kitchen garden, orchard, terrace.
  - **Resize** to at most 1600 px on the long side, JPEG, using `ff/` ffmpeg (aim for under 400 KB).
- [ ] **Step 3: Write and run `home-pics/load.js`.** For each entry:
  - Generate a uuid key `<uuid>.jpg`.
  - Run `npx wrangler r2 object put notes-media/<key> --file <path> --content-type image/jpeg --remote`.
  - Then read the current `home` (`wrangler kv key get home --remote`) and append pictures with new ids and `added = now`, keeping `on` as it is (false).
  - Write it back with `wrangler kv key put --remote`.
  - Print only counts.
- [ ] **Step 4: Verify.** Admin `/admin/home` lists every picture with its thumbnail, and the banner is off. The backup comparison shows only `home` changed.
- [ ] **Step 5: Report to him.** He reviews the pictures in admin, removes any he doesn't like, and switches the banner on himself.
