# Our Plans Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writing desk in the reading room whose leather folder holds his Markdown documents, rendered cosy and safe, hidden until he marks them ready.

**Architecture:** `worker/plans.ts` (model), `worker/markdown.ts` (safe Typora/GFM rendering with `marked` + `marked-footnote`), `worker/plans-views.ts` (desk, folder sheet, document page, script, admin section), wired into `worker/index.ts` and `worker/reading-room-views.ts` beside the keepsakes.

**Tech Stack:** Cloudflare Worker (TypeScript), KV `NOTES`, `marked`, `marked-footnote`, vitest, linkedom (already a dev dependency) for DOM checks in tests.

**Spec:** `docs/superpowers/specs/2026-11-10-plans-desk-design.md`

## Global Constraints

- Public repo: no private document content; tests use placeholders.
- No em dashes in copy. Inline script ES5 only. Her iPhone is the target.
- A draft (`ready: false`) never reaches her: not in the reading room, not at its URL (404), not in any dot.
- Copy fixed by the spec: "Our plans", "Things I worked out for us.", "NEW", "UPDATED", "READ", "For you", "In this letter", "Continue where you left off", "Back to the top", "‹ Our plans", "Ready for her".
- Limits: file 200 KB, title 120, line 200.
- KV `plans` (list incl. markdown), `plans_read` (`{ id, at, version }[]`).

## Review Focus

1. Hostile Markdown (`<script>`, `<img onerror>`, `[x](javascript:alert(1))`, `<iframe>`, an image `![a](https://x)`): output contains no live tag, attribute handler, `javascript:` href or remote image.
2. A draft id requested directly by her session, or a draft that was ready and then unticked: 404, and it disappears from her folder and her dot.
3. A non-UTF-8 or oversized file: refused with a message, nothing stored, the form keeps title and line.
4. A Typora document with a heading repeated twice: both get distinct ids and the contents list jumps to the right one.
5. Corrupt `plans` in KV: the reading room still shows books and the sideboard, without the desk; admin names the problem.

---

### Task 1: The model

**Files:** Create `worker/plans.ts`; Test `tests/notes-plans.test.ts`

**Interfaces — Produces:**
- `PLAN_LIMITS = { title: 120, line: 200, bytes: 200 * 1024 }`
- `interface Plan { id: string; title: string; line: string; ready: boolean; created: string; updated: string; markdown: string }`
- `interface PlanRead { id: string; at: string; version: string }`
- `parsePlans(raw: string | null): Plan[]` (stored order; throws on corrupt), `parsePlansRead(raw: string | null): PlanRead[]` (drops bad rows; throws on non-JSON)
- `upsertPlan(plans, plan): Plan[]` (new on top, edited in place), `removePlan(plans, id)`, `movePlan(plans, id, by: -1 | 1)`
- `readyPlans(plans): Plan[]`; `planStatus(plan, read: PlanRead[]): 'new' | 'updated' | 'read'`; `plansWaiting(plans, read): boolean` (any ready plan not 'read'); `markPlanRead(read, plan, at): PlanRead[]` (replaces that id's row with `version: plan.updated`)
- `parsePlanForm(get): { draft: { title, line, ready: boolean }; error?: string }` (single-line, trimmed; `ready` true when field `ready` is `on`)
- `readPlanFile(file: File): Promise<{ ok: true; markdown: string } | { ok: false; error: string }>` (accepts `.md`, `.markdown`, `.txt`, or types `text/markdown`, `text/plain`, `text/x-markdown`; ≤ 200 KB; decodes with `TextDecoder('utf-8', { fatal: true })`; strips a BOM; normalises CRLF to LF)

- [ ] **Step 1: Failing tests:** order and corrupt-throw for `parsePlans`; upsert puts a new plan first and keeps an edited one in place; move up/down and not past ends; `readyPlans` drops drafts; `planStatus` new → read after `markPlanRead` → updated when `updated` is later than the read version; `plansWaiting` ignores drafts; form errors for empty title, 121-char title, 201-char line; `readPlanFile` accepts a `.md` UTF-8 file with BOM and CRLF (returns LF, no BOM), refuses a 200 KB + 1 file, refuses bytes `[0xff, 0xfe, 0xfd]` ("isn't UTF-8 text"), refuses `photo.jpg` of type `image/jpeg`.
- [ ] **Step 2:** `npx vitest run tests/notes-plans.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `worker/plans.ts` with the validation style of `worker/keepsakes.ts` (UUID ids, ISO times).
- [ ] **Step 4:** Same command — Expected: PASS.
- [ ] **Step 5:** Commit "Add the plans model".

### Task 2: Safe Markdown rendering

**Files:** Create `worker/markdown.ts`; Modify `package.json` (dependencies `marked`, `marked-footnote`, exact versions installed); Test `tests/notes-markdown.test.ts`

**Interfaces — Produces:** `renderMarkdown(source: string, title: string): { html: string; headings: { id: string; text: string }[] }` — `headings` lists `##` headings in order with their ids.

Rules: GFM on, `breaks: false`. Heading ids are Typora-style slugs (lowercase, spaces to `-`, punctuation dropped except `-` and `_`, non-ASCII letters kept), with `-1`, `-2` suffixes for repeats. The first `#` heading is dropped when its text equals `title` (trimmed, case-insensitive). `html` tokens are escaped as text except `<br>`, `<br/>`, `<br />` which become `<br>`. Links: `http:`, `https:`, `mailto:` get `target="_blank" rel="noopener noreferrer"`; `#…` stays in place; anything else renders as its text only. Images render as their alt text in a `<span class="alt">`. Task list items render a `<span class="box">` or `<span class="box done">` instead of an input. Tables are wrapped in `<div class="table">`. Footnotes from `marked-footnote`. Each `marked` call uses a fresh `Marked` instance (no global state).

- [ ] **Step 1: Failing tests:** headings, lists, nested list, table (wrapped), quote, hr, code, strikethrough (`<del>`), task list boxes, footnote (a `<section` with the note and links both ways), bare URL autolinks with `target="_blank"`, `#anchor` link without target; duplicate headings get `x` and `x-1`; `headings` returns the `##` list; a first `# Title` equal to the title is dropped, a different one kept; `<br>` kept; hostile inputs from Review Focus 1 parsed with linkedom contain no `script`, `iframe` or `img` elements, no attribute starting `on`, and no `href` starting `javascript:`; `[x](data:text/html,…)` renders as plain text.
- [ ] **Step 2:** `npx vitest run tests/notes-markdown.test.ts` — Expected: FAIL.
- [ ] **Step 3:** `npm install marked marked-footnote` and implement.
- [ ] **Step 4:** Same command — Expected: PASS; `npx astro build` still succeeds.
- [ ] **Step 5:** Commit "Render his Markdown safely".

### Task 3: The desk, the folder, the document page and admin

**Files:** Create `worker/plans-views.ts`; Test `tests/notes-plans-views.test.ts`

**Interfaces — Consumes:** Task 1 types, `renderMarkdown`. **Produces:**
- `planDesk({ plans: Plan[]; read: PlanRead[]; home: string; open: boolean; docBase: string }): string` — the desk and the `#sheet-plans` sheet (class `keep-wrap`, hidden unless `open`), only ready plans, empty string when none ready; desk link `href="<home>?open=plans"`; cards link to `<docBase>/<id>` with `NEW`/`UPDATED`/`READ`; class `new` on the desk item while `plansWaiting`.
- `PLAN_SCRIPT: string` — progress line, continue button (localStorage key `plan-at-<id>-<updated>`, wrapped in try/catch), smooth scroll unless reduced motion.
- `planPage({ plan: Plan; back: string; preview?: boolean }): string` — the full document page per the spec, using `renderMarkdown`; "In this letter" only with ≥ 3 headings; `data-id` and `data-version` on the paper for the script.
- `plansAdmin({ base, csrf, plans, read, draft, editing?, error? }): string` — the "Our plans" admin section per the spec, form posting multipart to `<base>/admin/reading-room/plan/save`, delete to `/plan/delete`, move to `/plan/move`, preview link `<base>/admin/reading-room/plan/<id>`.

- [ ] **Step 1: Failing tests:** desk absent with only drafts; present with one ready plan and lists only ready ones in order; markers NEW/UPDATED/READ; `new` class while waiting; titles and lines escaped; page has the title once, "For you", the ornament, "‹ Our plans" linking to `<back>/reading-room?open=plans`, "Back to the top", the progress element, `PLAN_SCRIPT`, contents with 3 headings and none with 2; preview page has no script that records anything (no form); admin shows Ready/Not ready, read time, Up only below the first and Down only above the last, delete with `confirm(`, `name="file" accept=".md,.markdown,.txt,text/markdown,text/plain"` required only when adding, `name="ready"` checkbox checked when editing a ready plan; no em dash in any output.
- [ ] **Step 2:** `npx vitest run tests/notes-plans-views.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement, matching the approved mockup (`mock4/desk.html` in the scratchpad): banker's lamp, inkwell and pen, stitched leather folder with red ribbon and "Our plans" in Caveat, letter cards with a rose edge, cream textured paper, rose h2, gold-ruled tables, gold-edged quote boxes.
- [ ] **Step 4:** Same command — Expected: PASS.
- [ ] **Step 5:** Commit "Draw the desk and the letters".

### Task 4: Routes and wiring

**Files:** Modify `worker/index.ts`, `worker/reading-room-views.ts`, `README.md`; Test `tests/notes-plans-routes.test.ts`

**Interfaces — Produces routes:** `GET /reading-room/plans/<uuid>` (her session; ready only; records read), `GET /admin/reading-room/plan/<uuid>` (preview, any plan, records nothing), `POST /admin/reading-room/plan/save|delete|move`. `readingRoomPage` gets `plans?: { plans: Plan[]; read: PlanRead[] } | null` and renders `planDesk` under the sideboard; `?open=plans` opens the sheet. The notes page reading-room dot also lights on `plansWaiting`. `readingRoomAdminPage` renders `plansAdmin` under the album.

- [ ] **Step 1: Failing route tests:** admin adds a draft (multipart) → not in her reading room, her `/reading-room/plans/<id>` is 404, no dot; admin ticks ready → desk and card appear, dot on the notes page link; she opens it → 200, `plans_read` has her row, dot gone, card says READ; admin replaces the file → card UPDATED and dot back; unticking ready → 404 again and gone from the folder; preview by admin of a draft is 200 and records nothing; a bad file keeps title and line in the form with the error; a non-uuid path is 404; corrupt `plans` → reading room 200 without desk, admin names it; delete and move work; bad CSRF 403.
- [ ] **Step 2:** `npx vitest run tests/notes-plans-routes.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `keepsakeAction`; README bullet.
- [ ] **Step 4:** `npm test` — Expected: all pass.
- [ ] **Step 5:** Commit "Put the desk in the reading room".

### Task 5: Browser check

- [ ] **Step 1:** Local `wrangler dev`; upload a long placeholder Typora-style document covering every feature; walk it at iPhone size with touch: desk, folder, open, contents jump, footnote jump, progress line, leave and return to see "Continue where you left off", draft hidden, no sideways page scroll (tables scroll inside). Screenshots; close every browser context.
- [ ] **Step 2:** Fix anything found test-first; commit.

## Deploy (after the final review, with his go-ahead)

Add `plans`, `plans_read` to the scratchpad `backup.js`; back up; push; compare.
