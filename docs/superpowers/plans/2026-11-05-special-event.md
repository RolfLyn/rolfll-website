# Special Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reader page with a house of doors that unlock by date, where she picks dishes, and an admin page holding the event JSON, photos, her picks and private shopping lists.

**Architecture:** A pure model in `worker/event.ts` (parse, check, picks, and one function that strips an event down to what the reader may see), views in `worker/event-views.ts`, routes in `worker/index.ts` following the reading room. KV keys `event`, `event_picks`, `event_photos`; photos in R2 through the existing media helpers.

**Tech Stack:** Cloudflare Workers, KV, R2, server-rendered HTML with `escapeHtml`, inline ES5 script, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-special-event-design.md`

## Global Constraints

- The repo is public: no event content, names or real dates in code, tests or docs. Tests use placeholders.
- No em dashes in user-facing copy. Inline scripts are ES5 with no libraries; `localStorage` is not needed.
- Phone first: 390px wide, tap targets, `prefers-reduced-motion` removes snow, swing and pulse.
- Dates use `todayInCopenhagen`. Reader pages send `PAGE_HEADERS`; event photos are served with `no-store`.
- Every page works without JavaScript through links and forms.

## Review Focus

- The event is edited after she picked, removing a dish or lowering `pick`: the page renders, the missing pick is ignored, the card is trimmed to the limit. (Task 1)
- `event` or `event_picks` holds corrupt JSON: the notes page still loads without the card; the event page shows a friendly error; admin still shows the raw text so it can be fixed. (Task 4)
- She taps three dishes quickly: saves run one at a time and the last tap wins. (Task 2, Task 5)
- Event text contains `<script>` or quotes: everything is escaped, on both reader and admin. (Task 2, Task 3)
- An uploaded photo in use by the saved event is removed: refused with a message, so the page never shows a broken image. (Task 4)

---

### Task 1: The event model

**Files:**
- Create: `worker/event.ts`
- Test: `tests/notes-event.test.ts`

**Interfaces:**
- Produces, all exported from `worker/event.ts`:
  - Types `EventDish {id,title,text,photo?,buy?}`, `EventDoor {id,label,heading,opens,opensLabel,doorway?,line?,dishes?}`, `EventCard {title,prompt,pick,opens,opensLabel?,dishes}`, `SpecialEvent {id,title,intro,closing?,from,until,doors,card?,credits?}`, `EventPhoto {key,name}`, `EventPicks {event,opened:Record<string,string>,doors:Record<string,{dish:string,at:string}>,card:{dish:string,at:string}[]}`.
  - `EVENT_LIMITS`, `EMPTY_PICKS(eventId: string): EventPicks`.
  - `checkEvent(text: string, photos: EventPhoto[]): {ok:true,event:SpecialEvent}|{ok:false,error:string}`
  - `parseStoredEvent(raw: string|null): SpecialEvent|null` (null when absent; throws when corrupt)
  - `parsePhotos(raw: string|null): EventPhoto[]`, `parsePicks(raw: string|null, eventId: string): EventPicks` (a different event id returns empty picks)
  - `openDoor(picks, doorId, at)`, `pickDish(picks, doorId, dishId, at)`, `toggleCardItem(picks, dishId, limit, at)`: each returns new `EventPicks`.
  - `isOpen(opens: string, today: string): boolean`, `isShowing(event, today): boolean`
  - `readerEvent(event, picks, photos, today): ReaderEvent`, the only thing the reader page may render. `ReaderDoor` is `{id,label,heading,opensLabel,locked:true}` or `{id,label,heading,locked:false,opened:boolean,doorway?,line?,dishes:ReaderDish[],picked?:string}`; `ReaderDish` is `{id,title,text,photoKey?}`. `ReaderEvent.card` is similar, with `picked:string[]` and a locked form.
  - `hasWaiting(view: ReaderEvent): boolean`: an unopened open door, or an open card with fewer picks than its limit.
  - `openPhotoKeys(event, photos, today): string[]`, `allDishes(event)`, `photoNamesInUse(event): string[]`

- [ ] **Step 1: Write the failing tests**

Use placeholder events. Name them and assert:
- `checkEvent` accepts a valid event and returns it; `opensLabel` is required on doors.
- `checkEvent` refuses, naming the place, each of: bad JSON; duplicate door id; duplicate dish id in one door; a door with neither dishes nor line; `opens` of `2026-02-31`; a `photo` not in the uploaded list; text over its limit; `pick` of 0 or above the card's dish count.
- `card` and `credits` may be left out.
- `isOpen('2026-01-03','2026-01-02')` false, `isOpen('2026-01-03','2026-01-03')` true; `isShowing` true on `from` and `until`, false the day after.
- `readerEvent` for a locked door: `JSON.stringify` of the view contains none of the dish's title, text, photo key or the door's `line`.
- `readerEvent` for an open door: never contains `buy` text. Dish `photo` becomes the uploaded `key`, never the file name.
- A pick for a dish no longer in the event gives no `picked`, and does not throw.
- `toggleCardItem`: adds, removes on a second tap, and a third item with limit 2 drops the oldest. `readerEvent` trims stored card picks to the current limit and drops unknown dishes.
- `parsePicks` with another event's id returns empty picks.
- `pickDish` keeps other doors' picks; a new pick on the same door replaces the old one.
- `hasWaiting` true for an unopened open door, false once opened and the card is full.
- `openPhotoKeys` leaves out photos of locked doors and unused photos.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/notes-event.test.ts`. Expected: FAIL, cannot resolve `../worker/event`.

- [ ] **Step 3: Implement `worker/event.ts`**

Limits: title 80, paragraph 600, line 300, dish title 80, dish text 300, buy item 120, doors 12, dishes per door 8, intro paragraphs 6, credits 40. Reuse `isValidDate` from `worker/dates.ts`. `checkEvent` builds a clean object holding only known fields.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/notes-event.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/event.ts tests/notes-event.test.ts docs/superpowers
git commit -m "Add the special event model"
```

### Task 2: The reader page

**Files:**
- Create: `worker/event-views.ts`
- Modify: `worker/views.ts` (`readerPage` takes `event?: {href:string,title:string,waiting:boolean}|null`)
- Test: `tests/notes-event-views.test.ts`

**Interfaces:**
- Consumes: `ReaderEvent` and friends from Task 1; `shell`, `READER_FONTS`, `escapeHtml` from `worker/views.ts`.
- Produces: `eventPage({view, home, mediaBase, saveAction?, csrf?, sheet?, flash?, preview?}): string`, `eventErrorPage(): string`, `EVENT_SCRIPT`. `sheet` is a door id, or `card`, opened server-side for the no-JS flow. Form fields posted to `saveAction`: `csrf`, `do` (`open`|`pick`|`card`), `door`, `dish`, and `quiet=1` from the script.

- [ ] **Step 1: Write the failing tests**

- `eventPage` shows title, intro paragraphs, one door per entry; a locked door has class `locked` and its `opensLabel`, and no link or form that opens it.
- Each open unopened door is a link to `<home>?open=<id>`, each opened door shows its pick's photo and title in the doorway, or `Pick one`, or its `doorway` line.
- A sheet with `sheet` set is visible, others `hidden`; each dish is a form button posting `do=pick`; the chosen one has class `picked` and `♥ Yours`.
- A door with `line` shows that line and no dish forms.
- Card sheet: `prompt`, a two-column list, `picked` marks; the summary reads `You picked: A and B`. A locked card shows `Opens <opensLabel>` and no contents.
- Text containing `<script>"` is escaped everywhere, including photo-less dishes and credits.
- No `buy` text in the output, given a view built from an event with `buy`.
- With `preview` set: no forms post anywhere and no script saves.
- `readerPage` with `event` shows a card linking to `href` with the title, with class `waiting` when `waiting`; without `event`, no card.
- The script is present only when there is at least one open door or an open card.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/notes-event-views.test.ts`. Expected: FAIL, cannot resolve `../worker/event-views`.

- [ ] **Step 3: Implement the page**

Copy layout, colours and type from the approved mockup: night gradient, roof with snow cap, plaster and timber grid, arched doors (grey locked, green with gold pulse when ready), photo cards, `♥ Yours`, sheet rising from the bottom, up to 22 falling flakes built by script. The door sits on a `perspective` parent and swings with `rotateY(-108deg)` over 0.9s. `EVENT_SCRIPT` handles door swing then sheet, a pick without reload, a serial XHR queue (one save at a time, each carrying the latest state from a tap in order), the locked wiggle with a short message, and on a failed save restores the earlier state and says "That didn't save. Try again?". Credits sit in a `<details>` labelled "Photo credits". Build the notes-page card as a `.event-link` above the sky markup, styled in `READER_STYLE`.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/notes-event-views.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/event-views.ts worker/views.ts tests/notes-event-views.test.ts
git commit -m "Add the special event reader page"
```

### Task 3: The admin page

**Files:**
- Modify: `worker/event-views.ts`, `worker/views.ts` (a link on the admin page next to Reading room)
- Test: `tests/notes-event-views.test.ts`

**Interfaces:**
- Produces: `eventAdminPage({base, csrf, text, event, picks, photos, inUse, flash?, error?}): string` where `text` is the JSON to show, and `event` may be null.

- [ ] **Step 1: Write the failing tests**

- Shows the textarea holding `text` escaped, an `error` line, and a photo upload form with `multiple` and `enctype="multipart/form-data"`.
- Lists each photo with its name; a Remove button only when its name is not in `inUse`.
- For each door: `Not opened yet`, or `Opened, nothing picked`, or the dish title with the time and its `buy` items as a list. Same for card picks.
- A Preview form with a date input, and a clear form with a `confirm` prompt.
- Escapes `<script>` in text, names and buy items.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/notes-event-views.test.ts`. Expected: new tests FAIL, `eventAdminPage` is not a function.

- [ ] **Step 3: Implement `eventAdminPage`** using `adminShell`, and add the admin link.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run tests/notes-event-views.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/event-views.ts worker/views.ts tests/notes-event-views.test.ts
git commit -m "Add the special event admin page"
```

### Task 4: Routes

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; `checkFile`, `newKey`, `serveMedia`, `retireOrphans`, `tryLoad`.
- Produces routes: `GET /event`, `POST /event/save`, `GET /admin/event`, `GET /admin/event/preview?on=YYYY-MM-DD`, `POST /admin/event/save`, `POST /admin/event/photos`, `POST /admin/event/photos/delete`, `POST /admin/event/clear`.

- [ ] **Step 1: Write the failing tests**

- `GET /event` without a session shows the login; with one and no event, or outside `from`..`until`, returns 404.
- `POST /event/save`: bad CSRF 403; `do=pick` on a locked door 404 and nothing stored; unknown dish 404; `do=open` then `do=pick` stored; `quiet=1` gives 204, otherwise a redirect to `/event?open=<door>`; `do=card` respects the limit.
- A picks save never writes `event`.
- Media: a reader gets 404 for the photo of a locked door and 200 once its date arrives, with `Cache-Control: no-store`; admin always gets 200; an unknown key still 404s.
- `keysInUse` keeps uploaded event photos: replacing a note's file does not trash them.
- Admin save: invalid JSON re-renders with the text kept and the error, and `event` unchanged; valid JSON stored and picks untouched.
- Photo upload: stores in R2 and `event_photos` under a random key, keeping the name; a wrong file type gives an error; deleting a photo in use is refused; deleting an unused one retires it.
- Clear removes `event_picks`.
- Preview: with `on` shows that day's doors, records nothing; an invalid `on` falls back to today.
- Corrupt `event`: `GET ''` (notes) still 200 with no card; `GET /event` shows the friendly error; `GET /admin/event` is 200 with the raw text in the textarea.
- Notes page: shows the card with `waiting` while a door is waiting.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/notes-routes.test.ts`. Expected: new tests FAIL with 404s.

- [ ] **Step 3: Implement**

Add `EVENT_KEY='event'`, `EVENT_PICKS_KEY='event_picks'`, `EVENT_PHOTOS_KEY='event_photos'`. Extend `keysInUse` with event photo keys, loaded through `tryLoad`, and treat a failure as keeping the existing behaviour: only a side's own old keys are ever retired. In `showMedia`, check event photos before the after dark branch, serving with `no-store`: admin always; a reader only when the key is in `openPhotoKeys`. Admin reads the raw KV text to fill the textarea, so a corrupt stored event can be fixed.

- [ ] **Step 4: Run all tests**

Run: `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts tests/notes-routes.test.ts
git commit -m "Add special event routes"
```

### Task 5: Check it in a browser, and document it

**Files:**
- Modify: `README.md`
- Local only, outside the repo: a placeholder event for testing.

- [ ] **Step 1: Run it locally**

`npx astro build && npx wrangler dev --port 8787`, save a placeholder event in admin, upload placeholder photos.

- [ ] **Step 2: Check on a phone-sized touch screen in Chromium, then close every browser context**

Expected: door swing and sheet; pick, reload, pick still shown; three quick picks end on the last; locked wiggle; a locked door's contents absent from the page source; failed save restores and says so; admin shows picks and buy lists, the reader page does not; preview by date unlocks doors and saves nothing; JavaScript off still lets her open and pick; reduced motion drops snow and swing. Compare against the mockup screenshots. WebKit check for the layout with the existing local harness.

- [ ] **Step 3: Add a README bullet** beside the reading room's, stating the route and KV keys, and that deploy backups cover `event`, `event_picks`, `event_photos`.

- [ ] **Step 4: Stop the server, run the tests, commit**

Run: `npm test`. Expected: all pass.

```bash
git add README.md
git commit -m "Document the special event"
```

Going live and loading the real event are separate steps that need Rolf's go-ahead.
