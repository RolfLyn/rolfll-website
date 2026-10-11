# Notes Sky, Arrival Day and Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a star sky that fills toward the next meeting and turns into a heart on arrival day, plus a heart-and-short-line reply under each note that the admin can read.

**Architecture:**
- Two new KV keys sit next to `notes`: `meetings` and `replies`. Each is parsed by a small pure module (`worker/meetings.ts`, `worker/replies.ts`), in the same style as `worker/notes.ts`.
- The sky is pure server-rendered SVG plus CSS (`worker/sky.ts`), with no JavaScript.
- Replies are a plain form `POST <base>/reply`, protected by the reader session and a CSRF token derived from it. One tiny script makes the heart toggle submit instantly.
- Admin gains a Meetings section and shows each reply under its note.

**Tech Stack:** Cloudflare Workers (TypeScript), KV, Vitest. `npm test` = `astro build && vitest run`.

**Spec:** `docs/superpowers/specs/2026-10-11-sky-and-replies-design.md`

## Global Constraints

- **Public repo.**
  - Never commit real place names, real dates or lines, notes, replies, the real notes path, `.dev.vars` or backups.
  - Tests use placeholders like `Somewhere`, `<script>`, and dates in 2026 chosen for the test.
- **Reader-supplied text** reaches HTML only through `escapeHtml`, and never goes inside a `<script>`.
- **Limits:**
  - Meeting place: 1 to 40 characters, trimmed.
  - Reply text: 0 to 280 characters after CRLF→LF and trim.
  - A reply with no heart and no text is not stored.
- **"Today"** is `todayInCopenhagen(now)`.
- **Copy:** no em dashes in user-facing text. The middle dot `·` is the separator.
- **Inline scripts** are plain ES5 strings. Don't embed functions with `toString()` (the esbuild keepNames `__name` problem only applies to those).
- **KV safety:**
  - A corrupt `meetings` or `replies` value never breaks the reader page; that part is left out.
  - A corrupt value is never overwritten.
  - A missing key is never created just by saving or deleting a note.

## Review Focus

1. **A reply on a game note.** The reply area lives inside the note wrapper, so it is hidden while the game plays and usable after the reveal. Check this in the browser in Task 7.
2. **Long unbroken reply text or emoji on a 375px phone** must wrap and must not widen the page. `overflow-wrap: anywhere` goes on `.reply-sent` and `.reply-line`, and is pinned by a view test in Task 4 and checked in the browser in Task 7.
3. **A note dated exactly on the previous meeting day** belongs to the old sky, not the new one. Pinned in Task 1 (`skyFor` window bounds).
4. **Many stars** (60+) must all stay inside the viewBox. Pinned in Task 3 (`heartPoints(80)` and the scatter bounds).
5. **Saving or deleting a note when no reply exists yet** must not create a `replies` key, and a corrupt one must not be overwritten. Pinned in Task 6.

---

### Task 1: Meetings model and `skyFor`

**Files:**
- Modify: `worker/dates.ts` (add `daysBetween`)
- Create: `worker/meetings.ts`
- Test: `tests/notes-meetings.test.ts`

**Interfaces:**
- Produces:
  - `daysBetween(from: string, to: string): number`
  - `interface Meeting { date: string; place: string }`, `interface MeetingDraft { date: string; place: string }`, `EMPTY_MEETING: MeetingDraft`
  - `MEETING_PLACE_MAX = 40`, `MEETING_INVALID: string`
  - `parseMeetings(raw: string | null): Meeting[]` (sorted oldest first; throws on invalid)
  - `upsertMeeting(meetings, meeting): Meeting[]`, `removeMeeting(meetings, date): Meeting[]`
  - `parseMeetingForm(get: (name: string) => string): { meeting?: Meeting; draft: MeetingDraft; error?: string }` (fields `meet_date`, `meet_place`)
  - `type SkyState = 'growing' | 'arrived' | 'kept'`
  - `interface Sky { state: SkyState; place: string; date: string; stars: string[]; sleeps: number }`
  - `skyFor(notes: Note[], meetings: Meeting[], today: string): Sky | null`

- [ ] **Step 1: Write the failing tests**

`tests/notes-meetings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { daysBetween } from '../worker/dates';
import {
  parseMeetings, upsertMeeting, removeMeeting, parseMeetingForm, skyFor, MEETING_INVALID,
} from '../worker/meetings';

const notes = (...dates: string[]) => dates.map((date) => ({ date, text: 'x' }));

describe('daysBetween', () => {
  it('counts whole days, across months and backwards', () => {
    expect(daysBetween('2026-10-11', '2026-10-21')).toBe(10);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysBetween('2026-10-22', '2026-10-21')).toBe(-1);
  });
});

describe('parseMeetings', () => {
  it('treats a missing key as no meetings', () => {
    expect(parseMeetings(null)).toEqual([]);
  });

  it('copies valid meetings, sorted oldest first, dropping extra fields', () => {
    const raw = JSON.stringify([
      { date: '2026-12-20', place: 'Later', extra: 1 },
      { date: '2026-10-21', place: 'Somewhere' },
    ]);
    expect(parseMeetings(raw)).toEqual([
      { date: '2026-10-21', place: 'Somewhere' },
      { date: '2026-12-20', place: 'Later' },
    ]);
  });

  it('throws on anything invalid', () => {
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ date: '2026-02-30', place: 'x' }]),
      JSON.stringify([{ date: '2026-10-21', place: '  ' }]),
      JSON.stringify([{ date: '2026-10-21', place: 'x'.repeat(41) }]),
      JSON.stringify([{ date: '2026-10-21', place: 'a' }, { date: '2026-10-21', place: 'b' }]),
    ]) {
      expect(() => parseMeetings(raw), raw).toThrow();
    }
  });
});

describe('upsertMeeting / removeMeeting', () => {
  it('adds in date order, replaces the same date, and removes by date', () => {
    let m = upsertMeeting([], { date: '2026-12-20', place: 'B' });
    m = upsertMeeting(m, { date: '2026-10-21', place: 'A' });
    m = upsertMeeting(m, { date: '2026-12-20', place: 'C' });
    expect(m).toEqual([{ date: '2026-10-21', place: 'A' }, { date: '2026-12-20', place: 'C' }]);
    expect(removeMeeting(m, '2026-10-21')).toEqual([{ date: '2026-12-20', place: 'C' }]);
  });
});

describe('parseMeetingForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('accepts a real date and a trimmed place', () => {
    expect(parseMeetingForm(form({ meet_date: '2026-10-21', meet_place: '  Somewhere ' }))).toEqual({
      meeting: { date: '2026-10-21', place: 'Somewhere' },
      draft: { date: '2026-10-21', place: 'Somewhere' },
    });
  });

  it('rejects a bad date, an empty place or a long place, keeping what was typed', () => {
    for (const fields of [
      { meet_date: '2026-13-01', meet_place: 'x' },
      { meet_date: '2026-10-21', meet_place: '' },
      { meet_date: '2026-10-21', meet_place: 'x'.repeat(41) },
    ]) {
      const result = parseMeetingForm(form(fields));
      expect(result.meeting).toBeUndefined();
      expect(result.error).toBe(MEETING_INVALID);
      expect(result.draft.place).toBe(fields.meet_place.trim());
    }
  });
});

describe('skyFor', () => {
  const one = [{ date: '2026-10-21', place: 'Somewhere' }];

  it('shows no sky without meetings', () => {
    expect(skyFor(notes('2026-10-01'), [], '2026-10-11')).toBeNull();
  });

  it('grows with one star per note up to today, counting sleeps', () => {
    expect(skyFor(notes('2026-10-12', '2026-10-11', '2026-10-01'), one, '2026-10-11')).toEqual({
      state: 'growing', place: 'Somewhere', date: '2026-10-21', stars: ['2026-10-01', '2026-10-11'], sleeps: 10,
    });
  });

  it('shows an empty growing sky when there are no notes yet', () => {
    expect(skyFor([], one, '2026-10-11')?.stars).toEqual([]);
  });

  it('arrives on the meeting day, including that day\'s note', () => {
    const sky = skyFor(notes('2026-10-21', '2026-10-20'), one, '2026-10-21');
    expect(sky).toMatchObject({ state: 'arrived', sleeps: 0, stars: ['2026-10-20', '2026-10-21'] });
  });

  it('keeps the last heart after the meeting, ignoring later notes', () => {
    const sky = skyFor(notes('2026-10-25', '2026-10-21', '2026-10-20'), one, '2026-10-25');
    expect(sky).toMatchObject({ state: 'kept', sleeps: 0, stars: ['2026-10-20', '2026-10-21'] });
  });

  it('starts a new sky after the previous meeting, excluding that day', () => {
    const two = [{ date: '2026-12-20', place: 'Next' }, { date: '2026-10-21', place: 'Somewhere' }];
    const sky = skyFor(notes('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-30'), two, '2026-10-30');
    expect(sky).toMatchObject({ state: 'growing', place: 'Next', date: '2026-12-20', stars: ['2026-10-22', '2026-10-30'], sleeps: 51 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-meetings.test.ts`
Expected: FAIL. `daysBetween` is not exported, and `../worker/meetings` cannot be resolved.

- [ ] **Step 3: Implement**

Append to `worker/dates.ts`:

```ts
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
```

Create `worker/meetings.ts`:

```ts
import { isValidDate, daysBetween } from './dates';
import type { Note } from './notes';

export const MEETING_PLACE_MAX = 40;
export const MEETING_INVALID = `A meeting needs a real date and a place of up to ${MEETING_PLACE_MAX} characters.`;

export interface Meeting {
  date: string;
  place: string;
}

/** The admin form's meeting fields, as typed, so a bad value can be shown again. */
export interface MeetingDraft {
  date: string;
  place: string;
}

export const EMPTY_MEETING: MeetingDraft = { date: '', place: '' };

export type SkyState = 'growing' | 'arrived' | 'kept';

export interface Sky {
  state: SkyState;
  place: string;
  date: string;
  /** Dates of the notes that are stars, oldest first. */
  stars: string[];
  sleeps: number;
}

function isMeeting(value: unknown): value is Meeting {
  if (typeof value !== 'object' || value === null) return false;
  const { date, place } = value as Record<string, unknown>;
  return typeof date === 'string' && isValidDate(date) &&
    typeof place === 'string' && place.trim() !== '' && place.length <= MEETING_PLACE_MAX;
}

function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function parseMeetings(raw: string | null): Meeting[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isMeeting)) throw new Error('Stored meetings are invalid');
  if (new Set(data.map((m) => m.date)).size !== data.length) throw new Error('Stored meetings repeat a date');
  return sortMeetings(data.map((m) => ({ date: m.date, place: m.place })));
}

export function upsertMeeting(meetings: Meeting[], meeting: Meeting): Meeting[] {
  return sortMeetings([...meetings.filter((m) => m.date !== meeting.date), meeting]);
}

export function removeMeeting(meetings: Meeting[], date: string): Meeting[] {
  return meetings.filter((m) => m.date !== date);
}

export function parseMeetingForm(get: (name: string) => string): { meeting?: Meeting; draft: MeetingDraft; error?: string } {
  const draft: MeetingDraft = { date: get('meet_date').trim(), place: get('meet_place').trim() };
  const meeting: Meeting = { date: draft.date, place: draft.place };
  return isMeeting(meeting) ? { meeting, draft } : { draft, error: MEETING_INVALID };
}

// The sky counts toward the next meeting (or keeps the last one), with a star for every
// note since the meeting before it, up to today.
export function skyFor(notes: Note[], meetings: Meeting[], today: string): Sky | null {
  const sorted = sortMeetings(meetings);
  if (sorted.length === 0) return null;
  const next = sorted.findIndex((m) => m.date >= today);
  const index = next === -1 ? sorted.length - 1 : next;
  const target = sorted[index];
  const after = index > 0 ? sorted[index - 1].date : '';
  const stars = notes
    .map((n) => n.date)
    .filter((d) => d > after && d <= target.date && d <= today)
    .sort();
  const state: SkyState = today < target.date ? 'growing' : today === target.date ? 'arrived' : 'kept';
  return {
    state, place: target.place, date: target.date, stars,
    sleeps: state === 'growing' ? daysBetween(today, target.date) : 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-meetings.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add worker/dates.ts worker/meetings.ts tests/notes-meetings.test.ts
git commit -m "Model meetings and work out the notes sky"
```

---

### Task 2: Replies model

**Files:**
- Create: `worker/replies.ts`
- Test: `tests/notes-replies.test.ts`

**Interfaces:**
- Produces:
  - `REPLY_MAX = 280`
  - `interface Reply { date: string; heart: boolean; text: string; at: string }`
  - `interface Answer { heart: boolean; text: string }`
  - `parseReplies(raw: string | null): Reply[]` (throws on invalid)
  - `parseReplyForm(get: (name: string) => string): Answer | null` (null when too long; fields `heart`, `text`)
  - `setReply(replies: Reply[], date: string, answer: Answer, at: string): Reply[]`
  - `moveReply(replies: Reply[], from: string | undefined, to: string): Reply[]`
  - `dropReply(replies: Reply[], date: string): Reply[]`

- [ ] **Step 1: Write the failing tests**

`tests/notes-replies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseReplies, parseReplyForm, setReply, moveReply, dropReply, REPLY_MAX } from '../worker/replies';

const AT = '2026-10-11T12:00:00.000Z';
const r = (date: string, heart = true, text = '') => ({ date, heart, text, at: AT });

describe('parseReplies', () => {
  it('treats a missing key as no replies and copies valid ones', () => {
    expect(parseReplies(null)).toEqual([]);
    expect(parseReplies(JSON.stringify([{ ...r('2026-10-01', false, 'hi'), extra: 1 }]))).toEqual([r('2026-10-01', false, 'hi')]);
  });

  it('throws on anything invalid', () => {
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...r('2026-10-01'), heart: 'yes' }]),
      JSON.stringify([r('2026-10-01', true, 'x'.repeat(REPLY_MAX + 1))]),
      JSON.stringify([r('2026-10-01', false, '')]),
      JSON.stringify([{ ...r('2026-10-01'), at: 'never' }]),
      JSON.stringify([r('not-a-date')]),
    ]) {
      expect(() => parseReplies(raw), raw).toThrow();
    }
  });
});

describe('parseReplyForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('reads the heart and trims the text, normalizing line endings', () => {
    expect(parseReplyForm(form({ heart: 'on', text: '  hi\r\nthere  ' }))).toEqual({ heart: true, text: 'hi\nthere' });
    expect(parseReplyForm(form({}))).toEqual({ heart: false, text: '' });
  });

  it('allows exactly the limit and refuses longer text', () => {
    expect(parseReplyForm(form({ text: 'x'.repeat(REPLY_MAX) }))?.text).toHaveLength(REPLY_MAX);
    expect(parseReplyForm(form({ text: 'x'.repeat(REPLY_MAX + 1) }))).toBeNull();
  });
});

describe('setReply / moveReply / dropReply', () => {
  it('adds, replaces, and removes a reply that is cleared', () => {
    let list = setReply([], '2026-10-01', { heart: true, text: '' }, AT);
    expect(list).toEqual([r('2026-10-01')]);
    list = setReply(list, '2026-10-01', { heart: false, text: 'hi' }, AT);
    expect(list).toEqual([r('2026-10-01', false, 'hi')]);
    expect(setReply(list, '2026-10-01', { heart: false, text: '' }, AT)).toEqual([]);
  });

  it('moves a reply to a new date, dropping whatever was there', () => {
    const list = [r('2026-10-01', true, 'a'), r('2026-10-02', true, 'b')];
    expect(moveReply(list, '2026-10-01', '2026-10-02')).toEqual([r('2026-10-02', true, 'a')]);
    expect(moveReply(list, undefined, '2026-10-02')).toEqual([r('2026-10-01', true, 'a')]);
    expect(moveReply(list, '2026-10-01', '2026-10-01')).toEqual(list);
  });

  it('drops a reply by date', () => {
    expect(dropReply([r('2026-10-01'), r('2026-10-02')], '2026-10-01')).toEqual([r('2026-10-02')]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-replies.test.ts`
Expected: FAIL, because `../worker/replies` cannot be resolved.

- [ ] **Step 3: Implement**

Create `worker/replies.ts`:

```ts
import { isValidDate } from './dates';

export const REPLY_MAX = 280;

export interface Answer {
  heart: boolean;
  text: string;
}

export interface Reply extends Answer {
  date: string;
  /** When she last changed it (ISO, server clock). */
  at: string;
}

function isReply(value: unknown): value is Reply {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.date === 'string' && isValidDate(r.date) &&
    typeof r.heart === 'boolean' &&
    typeof r.text === 'string' && r.text.length <= REPLY_MAX &&
    (r.heart || r.text !== '') &&
    typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at));
}

export function parseReplies(raw: string | null): Reply[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isReply)) throw new Error('Stored replies are invalid');
  return data.map((r) => ({ date: r.date, heart: r.heart, text: r.text, at: r.at }));
}

export function parseReplyForm(get: (name: string) => string): Answer | null {
  const text = get('text').replace(/\r\n?/g, '\n').trim();
  if (text.length > REPLY_MAX) return null;
  return { heart: get('heart') === 'on', text };
}

/** One reply per note; an empty answer removes it. */
export function setReply(replies: Reply[], date: string, answer: Answer, at: string): Reply[] {
  const rest = replies.filter((r) => r.date !== date);
  return answer.heart || answer.text !== '' ? [...rest, { date, heart: answer.heart, text: answer.text, at }] : rest;
}

/** A note saved on `to` replaces whatever reply was there; a moved note brings its own reply along. */
export function moveReply(replies: Reply[], from: string | undefined, to: string): Reply[] {
  if (from === to) return replies;
  return replies.filter((r) => r.date !== to).map((r) => (r.date === from ? { ...r, date: to } : r));
}

export function dropReply(replies: Reply[], date: string): Reply[] {
  return replies.filter((r) => r.date !== date);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-replies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/replies.ts tests/notes-replies.test.ts
git commit -m "Model replies to notes"
```

---

### Task 3: Draw the sky

**Files:**
- Create: `worker/html.ts` (move `escapeHtml` here so `sky.ts` and `views.ts` don't import each other)
- Create: `worker/sky.ts`
- Modify: `worker/views.ts` (import and re-export `escapeHtml` from `./html`; `readerPage` takes `sky`)
- Test: `tests/notes-sky.test.ts`, `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `Sky` from Task 1.
- Produces:
  - `escapeHtml` (still exported from `worker/views.ts` too)
  - `SKY_W = 320`, `SKY_H = 120`
  - `scatterPoint(date: string): { x: number; y: number }`
  - `heartPoints(n: number): { x: number; y: number }[]`
  - `skyCaption(sky: Sky): string`
  - `skyMarkup(sky: Sky): string`, `SKY_STYLE: string`
  - `readerPage({ ..., sky?: Sky | null })`

- [ ] **Step 1: Write the failing tests**

`tests/notes-sky.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scatterPoint, heartPoints, skyCaption, skyMarkup, SKY_W, SKY_H } from '../worker/sky';
import type { Sky } from '../worker/meetings';

const inBounds = (p: { x: number; y: number }) => p.x >= 0 && p.x <= SKY_W && p.y >= 0 && p.y <= SKY_H;
const sky = (over: Partial<Sky>): Sky => ({
  state: 'growing', place: 'Somewhere', date: '2026-10-21', stars: ['2026-10-01', '2026-10-02'], sleeps: 10, ...over,
});

describe('star positions', () => {
  it('scatters each date to the same in-bounds spot every time, and different dates apart', () => {
    const dates = Array.from({ length: 90 }, (_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    const points = dates.map(scatterPoint);
    expect(points.every(inBounds)).toBe(true);
    expect(scatterPoint('2026-10-01')).toEqual(scatterPoint('2026-10-01'));
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(85);
  });

  it('places n points on a heart, all in bounds', () => {
    expect(heartPoints(0)).toEqual([]);
    expect(heartPoints(1)).toHaveLength(1);
    const many = heartPoints(80);
    expect(many).toHaveLength(80);
    expect(many.every(inBounds)).toBe(true);
  });
});

describe('skyCaption', () => {
  it('says how many sleeps are left, then that she is here, then keeps the place and date', () => {
    expect(skyCaption(sky({}))).toBe('A star for every note · Somewhere in 10 sleeps');
    expect(skyCaption(sky({ sleeps: 1 }))).toBe('A star for every note · Somewhere in 1 sleep');
    expect(skyCaption(sky({ state: 'arrived', sleeps: 0 }))).toBe("0 km · You're here ♥");
    expect(skyCaption(sky({ state: 'kept', sleeps: 0 }))).toBe('Somewhere · 21 October');
  });
});

describe('skyMarkup', () => {
  it('draws scattered stars with the newest one twinkling, and no lines, while growing', () => {
    const html = skyMarkup(sky({}));
    expect(html).toContain('class="sky sky-growing"');
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect(html.match(/class="star new"/g)).toHaveLength(1);
    expect(html).not.toContain('sky-lines');
    expect(html).toContain('aria-label="A star for every note · Somewhere in 10 sleeps"');
  });

  it('gathers the stars into a heart with lines on arrival, and keeps it afterwards', () => {
    const arrived = skyMarkup(sky({ state: 'arrived', sleeps: 0 }));
    expect(arrived).toContain('sky-arrived');
    expect(arrived).toContain('class="sky-lines"');
    expect(arrived).toMatch(/--dx:-?[\d.]+px;--dy:-?[\d.]+px;--i:1/);
    const kept = skyMarkup(sky({ state: 'kept', sleeps: 0 }));
    expect(kept).toContain('sky-kept');
    expect(kept).toContain('class="sky-lines"');
  });

  it('escapes the place', () => {
    const html = skyMarkup(sky({ place: '<b>"x"</b>' }));
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});
```

Add to `tests/notes-views.test.ts` (new `describe` at the end of the file; add `import type { Sky } from '../worker/meetings';` at the top):

```ts
describe('sky on the reader page', () => {
  const sky: Sky = { state: 'growing', place: 'Somewhere', date: '2026-10-21', stars: ['2026-10-01'], sleeps: 20 };

  it('shows the sky above the note when there is one', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [], sky });
    expect(html).toContain('class="sky sky-growing"');
    expect(html.indexOf('class="sky ')).toBeLessThan(html.indexOf('hi</p>'));
    expect(html).toContain('@keyframes gather');
  });

  it('leaves the page unchanged without a sky', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [] });
    expect(html).not.toContain('class="sky');
    expect(html).not.toContain('@keyframes gather');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-sky.test.ts tests/notes-views.test.ts`
Expected: FAIL, because `../worker/sky` cannot be resolved. The views test also fails: there is no sky markup yet, and the `sky` property is a type error at build (vitest doesn't typecheck, so it fails on the assertion).

- [ ] **Step 3: Implement**

Create `worker/html.ts` (moved verbatim from `views.ts`):

```ts
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

In `worker/views.ts`, delete the `escapeHtml` function body and add at the top:

```ts
import { escapeHtml } from './html';
import { skyMarkup, SKY_STYLE } from './sky';
import type { Sky } from './meetings';

export { escapeHtml };
```

Create `worker/sky.ts`:

```ts
import { escapeHtml } from './html';
import type { Sky } from './meetings';

export const SKY_W = 320;
export const SKY_H = 120;

interface Point {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

// FNV-1a: a small, stable hash so a note's star always sits in the same place.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function scatterPoint(date: string): Point {
  const margin = 12;
  const a = hash(date) % 10_000;
  const b = hash(`${date}:y`) % 10_000;
  return {
    x: round(margin + (a / 9_999) * (SKY_W - 2 * margin)),
    y: round(margin + (b / 9_999) * (SKY_H - 2 * margin)),
  };
}

// The classic heart curve, sampled evenly and scaled into the middle of the sky.
export function heartPoints(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: round(SKY_W / 2 + 2.9 * hx), y: round(55 - 2.9 * hy) };
  });
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function skyCaption(sky: Sky): string {
  if (sky.state === 'arrived') return "0 km · You're here ♥";
  if (sky.state === 'kept') return `${sky.place} · ${shortDate(sky.date)}`;
  return `A star for every note · ${sky.place} in ${sky.sleeps} ${sky.sleeps === 1 ? 'sleep' : 'sleeps'}`;
}

export function skyMarkup(sky: Sky): string {
  const caption = escapeHtml(skyCaption(sky));
  const gathered = sky.state !== 'growing';
  const heart = heartPoints(sky.stars.length);
  const stars = sky.stars.map((date, i) => {
    const s = scatterPoint(date);
    if (!gathered) {
      const last = i === sky.stars.length - 1;
      return `<circle class="star${last ? ' new' : ''}" cx="${s.x}" cy="${s.y}" r="${last ? 2.6 : 1.8}"/>`;
    }
    const h = heart[i];
    return `<circle class="star" cx="${h.x}" cy="${h.y}" r="2.2" style="--dx:${round(s.x - h.x)}px;--dy:${round(s.y - h.y)}px;--i:${i}"/>`;
  }).join('');
  const lines = gathered && heart.length > 1
    ? `<polygon class="sky-lines" points="${heart.map((p) => `${p.x},${p.y}`).join(' ')}"/>`
    : '';
  return `<figure class="sky sky-${sky.state}" style="--n:${sky.stars.length}">
<svg viewBox="0 0 ${SKY_W} ${SKY_H}" role="img" aria-label="${caption}">${lines}${stars}</svg>
<figcaption class="sky-caption">${caption}</figcaption>
</figure>`;
}

export const SKY_STYLE = `
.sky { margin: 0 0 2.25rem; }
.sky svg { display: block; width: 100%; height: auto; max-height: 12rem; border-radius: 0.9rem; background: linear-gradient(180deg, #1f1530, #3b2752); box-shadow: 0 10px 30px rgba(58, 46, 40, 0.18); }
.sky .star { fill: #fff3d6; }
.sky .star.new { fill: #ffe7a8; animation: twinkle 2.4s ease-in-out infinite alternate; }
.sky-lines { fill: none; stroke: rgba(255, 231, 168, 0.45); stroke-width: 0.8; stroke-linejoin: round; }
.sky-arrived .star { animation: gather 3.2s cubic-bezier(0.45, 0, 0.25, 1) both; animation-delay: calc(var(--i) * 60ms); }
.sky-arrived .sky-lines { animation: glow 2s ease-out both; animation-delay: calc(3.4s + var(--n) * 60ms); }
.sky-caption { margin: 0.7rem 0 0; text-align: center; color: var(--muted); font-style: italic; font-size: 1.05rem; }
@keyframes twinkle { from { opacity: 0.55; } to { opacity: 1; } }
@keyframes gather { from { transform: translate(var(--dx), var(--dy)); } to { transform: translate(0, 0); } }
@keyframes glow { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sky .star, .sky-lines { animation: none !important; } }
`;
```

In `worker/views.ts`, change `readerPage`'s signature and its first line of output:

```ts
export function readerPage({ current, archive, mediaBase, preview = false, sky = null }: {
  current: Note | null; archive: Note[]; mediaBase: string; preview?: boolean; sky?: Sky | null;
}): string {
```

and the return:

```ts
  const top = sky ? `<style>${SKY_STYLE}</style>\n${skyMarkup(sky)}\n` : '';
  return readerShell(top + today + past + game);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-sky.test.ts tests/notes-views.test.ts`
Expected: PASS, including all of the existing views tests.

- [ ] **Step 5: Commit**

```bash
git add worker/html.ts worker/sky.ts worker/views.ts tests/notes-sky.test.ts tests/notes-views.test.ts
git commit -m "Draw a star sky above the note that gathers into a heart on arrival"
```

---

### Task 4: Reply area on the reader page

**Files:**
- Modify: `worker/views.ts`
- Test: `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `Reply` from Task 2.
- Produces:
  - `interface ReplyForm { action: string; csrf: string }` (exported from views)
  - `replySummary(reply: Reply): string` (escaped HTML, e.g. `♥ “hi”`)
  - `readerPage({ ..., replies?: Reply[] | null; reply?: ReplyForm; unsent?: string })`
  - Each note's reply area is `<div class="reply" id="note-<date>">`.

Rules:
- `replies` null or undefined: no reply areas at all.
- With `replies` and `reply` and not preview: active forms plus `REPLY_SCRIPT`.
- With `replies` but in preview or without `reply`: a disabled fieldset with no `action`, and no script.

- [ ] **Step 1: Write the failing tests**

Add to `tests/notes-views.test.ts` (add `import type { Reply } from '../worker/replies';` at the top):

```ts
describe('replies on the reader page', () => {
  const today = { date: '2026-10-01', text: 'hi' };
  const older = { date: '2026-09-30', text: 'yo' };
  const form = { action: '/for-you/reply', csrf: 'tok' };
  const sent: Reply = { date: '2026-09-30', heart: true, text: 'miss <you>', at: '2026-10-01T08:00:00.000Z' };

  it('adds a reply area under every note, with the reader csrf and the note date', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [], reply: form });
    expect(html).toContain('id="note-2026-10-01"');
    expect(html).toContain('id="note-2026-09-30"');
    expect(html.match(/<form class="reply-form" method="post" action="\/for-you\/reply">/g)).toHaveLength(2);
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
    expect(html).toContain('<input type="hidden" name="date" value="2026-09-30">');
    expect(html).toContain('maxlength="280"');
    expect(html).toContain("event.target.form.submit()");
  });

  it('shows and prefills an existing reply, escaped', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [sent], reply: form });
    expect(html).toContain('<p class="reply-sent">You sent ♥ “miss &lt;you&gt;”</p>');
    expect(html).toContain('>miss &lt;you&gt;</textarea>');
    expect(html.match(/name="heart" value="on" checked/g)).toHaveLength(1);
  });

  it('shows the gentle error only under the note that did not send', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [], reply: form, unsent: '2026-09-30' });
    expect(html.match(/That didn&#39;t send\. Try again\?/g)).toHaveLength(1);
    expect(html.indexOf("That didn&#39;t send")).toBeGreaterThan(html.indexOf('id="note-2026-09-30"'));
  });

  it('disables the reply area in preview and has no script', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [], replies: [], reply: form, preview: true });
    expect(html).toContain('<fieldset disabled>');
    expect(html).not.toContain('action="/for-you/reply"');
    expect(html).not.toContain('event.target.form.submit()');
  });

  it('has no reply area when replies are unavailable', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], reply: form });
    expect(html).not.toContain('class="reply');
  });

  it('wraps long unbroken replies instead of widening the page', () => {
    expect(readerPage({ mediaBase: '/m', current: today, archive: [] })).toMatch(/\.reply-sent \{[^}]*overflow-wrap: anywhere/);
  });
});
```

The `That didn&#39;t send` assertion matches `escapeHtml` applied to the line. The implementation below passes the line through `escapeHtml`, so the apostrophe is encoded consistently with the rest of the page.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: FAIL in "replies on the reader page" (no reply markup yet).

- [ ] **Step 3: Implement**

In `worker/views.ts`:

1. Add the import `import type { Reply } from './replies';`.
2. Append to `READER_STYLE` (before the closing backtick):

```css
.reply { margin: 1.25rem 0 0; }
.reply-form { display: block; max-width: none; }
.reply-form fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1.1rem; }
.reply-form fieldset:disabled { opacity: 0.6; }
.reply-heart { position: relative; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; color: var(--muted); font-style: italic; font-size: 1rem; }
.reply-heart input { position: absolute; opacity: 0; width: 1px; height: 1px; padding: 0; pointer-events: none; }
.reply-heart .glyph { font-size: 1.6rem; line-height: 1; color: var(--line); transition: color 0.3s, transform 0.3s; }
.reply-heart input:checked + .glyph { color: var(--accent); transform: scale(1.15); }
.reply-heart input:focus-visible + .glyph { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.reply details { flex: 1 1 auto; }
.reply summary { cursor: pointer; color: var(--muted); font-style: italic; list-style: none; }
.reply summary::-webkit-details-marker { display: none; }
.reply textarea { display: block; width: 100%; margin: 0.6rem 0; font: inherit; font-size: 1.15rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); resize: vertical; }
.reply-send { font-size: 1rem; padding: 0.3rem 0.8rem; }
.reply-sent { margin: 0 0 0.5rem; color: var(--muted); font-style: italic; white-space: pre-line; overflow-wrap: anywhere; }
.reply .error { margin-top: 0.5rem; }
```

3. Add below `soundTag`:

```ts
export interface ReplyForm {
  action: string;
  csrf: string;
}

/** "♥ “her words”", escaped, for the reader and the admin. */
export function replySummary(reply: Reply): string {
  return [reply.heart ? '♥' : '', reply.text ? `“${escapeHtml(reply.text)}”` : ''].filter(Boolean).join(' ');
}

// Tapping the heart sends it straight away; without JavaScript the Send buttons do it.
const REPLY_SCRIPT = `<script>
(function () {
  var boxes = document.querySelectorAll('.reply-form input[name=heart]');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].addEventListener('change', function (event) { event.target.form.submit(); });
  }
})();
</script>`;

function replyArea(date: string, reply: Reply | undefined, form: ReplyForm | undefined, unsent: boolean): string {
  const sent = reply ? `<p class="reply-sent">You sent ${replySummary(reply)}</p>\n` : '';
  return `<div class="reply" id="note-${escapeHtml(date)}">
${sent}<form class="reply-form" method="post"${form ? ` action="${escapeHtml(form.action)}"` : ''}><fieldset${form ? '' : ' disabled'}>
<input type="hidden" name="csrf" value="${form ? escapeHtml(form.csrf) : ''}"><input type="hidden" name="date" value="${escapeHtml(date)}">
<label class="reply-heart"><input type="checkbox" name="heart" value="on"${reply?.heart ? ' checked' : ''}><span class="glyph" aria-hidden="true">♥</span>Send a heart</label>
<noscript><button type="submit" class="reply-send">Send</button></noscript>
<details><summary>Write something back</summary>
<textarea name="text" maxlength="280" rows="3" aria-label="Write something back">${escapeHtml(reply?.text ?? '')}</textarea>
<button type="submit">Send</button></details>
</fieldset></form>
${unsent ? `<p class="error">${escapeHtml("That didn't send. Try again?")}</p>\n` : ''}</div>`;
}
```

4. Change `readerPage`'s signature and the places that build each note:

```ts
export function readerPage({ current, archive, mediaBase, preview = false, sky = null, replies = null, reply, unsent }: {
  current: Note | null; archive: Note[]; mediaBase: string; preview?: boolean; sky?: Sky | null;
  replies?: Reply[] | null; reply?: ReplyForm; unsent?: string;
}): string {
  const form = preview ? undefined : reply;
  const area = (n: Note) => (replies ? replyArea(n.date, replies.find((r) => r.date === n.date), form, unsent === n.date) : '');
  const body = current
    ? `<p class="date">${formatDate(current.date)}</p>
<p class="message">${escapeHtml(current.text)}</p>
${photoTag(current, mediaBase, false)}
${soundTag(current, mediaBase, false)}
${area(current)}`
    : '';
```

In the archive `map`, append `${area(n)}` right after `${soundTag(n, mediaBase, true)}` inside the `<article>`. Then replace the two closing lines from Task 3 (`const top = …` and `return …`) with:

```ts
  const replyScript = replies && form && (current || archive.length) ? `\n${REPLY_SCRIPT}` : '';
  const top = sky ? `<style>${SKY_STYLE}</style>\n${skyMarkup(sky)}\n` : '';
  return readerShell(top + today + past + game + replyScript);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: PASS, including the existing game-on-reader-page tests. The reply area sits inside the game wrapper, so those tests are unaffected because they don't pass `replies`.

- [ ] **Step 5: Commit**

```bash
git add worker/views.ts tests/notes-views.test.ts
git commit -m "Let the reader send a heart and a short line back under each note"
```

---

### Task 5: Admin meetings section and reply lines

**Files:**
- Modify: `worker/views.ts`
- Test: `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `Meeting`, `MeetingDraft`, `EMPTY_MEETING`, `MEETING_PLACE_MAX` (Task 1); `Reply` (Task 2); `replySummary` (Task 4).
- Produces: `AdminPageData` gains `meetings?: Meeting[]`, `meetingDraft?: MeetingDraft` and `replies?: Reply[]`. The forms post to `<base>/admin/meeting/save` (fields `csrf`, `meet_date`, `meet_place`) and `<base>/admin/meeting/delete` (fields `csrf`, `date`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/notes-views.test.ts`:

```ts
describe('admin meetings and replies', () => {
  const base = {
    base: '/for-you', today: '2026-10-01', current: null,
    notes: [{ date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'before' }],
    form: { date: '2026-10-02', text: '' }, csrf: 'tok123',
  };

  it('lists meetings with a remove button and has an add form', () => {
    const html = adminPage({ ...base, meetings: [{ date: '2026-10-21', place: 'Some<where>' }] });
    expect(html).toContain('<h2>Meetings</h2>');
    expect(html).toContain('Some&lt;where&gt;');
    expect(html).toContain('action="/for-you/admin/meeting/delete"');
    expect(html).toContain('<input type="hidden" name="date" value="2026-10-21">');
    expect(html).toContain('action="/for-you/admin/meeting/save"');
    expect(html).toContain('name="meet_place" maxlength="40"');
  });

  it('says when there are no meetings and keeps a typed draft', () => {
    const html = adminPage({ ...base, meetings: [], meetingDraft: { date: '2026-13-01', place: 'typed' } });
    expect(html).toContain('No meetings yet.');
    expect(html).toContain('name="meet_date" value="2026-13-01"');
    expect(html).toContain('name="meet_place" maxlength="40" value="typed"');
  });

  it('shows her reply under its note, escaped, with when she sent it', () => {
    const html = adminPage({ ...base, replies: [{ date: '2026-09-30', heart: true, text: '<3 you', at: '2026-10-01T06:05:00.000Z' }] });
    expect(html).toContain('<p class="reply-line">♥ “&lt;3 you”');
    expect(html).toContain('1 Oct, 08:05');
    expect(html.indexOf('class="reply-line"')).toBeGreaterThan(html.indexOf('before</p>'));
    expect(html.match(/class="reply-line"/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: FAIL in "admin meetings and replies".

- [ ] **Step 3: Implement**

In `worker/views.ts`:

1. Add imports: `import { EMPTY_MEETING, MEETING_PLACE_MAX, type Meeting, type MeetingDraft } from './meetings';`. Merge this with the `Sky` type import from Task 3.
2. Append to `ADMIN_STYLE`:

```css
.reply-line { margin: 0.4rem 0 0; color: #8a4a42; white-space: pre-line; overflow-wrap: anywhere; }
.reply-line .hint { display: inline; }
ul.meetings li { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
form.meeting { display: flex; flex-wrap: wrap; gap: 0.5rem; }
form.meeting input[name=meet_place] { flex: 1 1 10rem; }
```

3. Add to `AdminPageData`:

```ts
  meetings?: Meeting[];
  /** The meeting fields as typed, after a rejected add. */
  meetingDraft?: MeetingDraft;
  replies?: Reply[];
```

4. Add helpers above `adminPage`:

```ts
function formatStamp(at: string): string {
  return new Date(at).toLocaleString(LOCALE, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen',
  });
}

function replyLine(reply: Reply | undefined): string {
  return reply ? `<p class="reply-line">${replySummary(reply)} <span class="hint">${escapeHtml(formatStamp(reply.at))}</span></p>` : '';
}

function meetingsSection(base: string, csrf: string, meetings: Meeting[], draft: MeetingDraft): string {
  const rows = meetings.map((m) => `<li><span>${formatDate(m.date)} · ${escapeHtml(m.place)}</span>
    <span class="actions"><form method="post" action="${escapeHtml(`${base}/admin/meeting/delete`)}" onsubmit="return confirm('Remove this meeting?')">
      ${csrf}<input type="hidden" name="date" value="${escapeHtml(m.date)}"><button type="submit">Remove</button>
    </form></span></li>`).join('\n');
  return `<h2>Meetings</h2>
<p class="hint">The sky on her page fills with a star for every note until the next meeting.</p>
<ul class="meetings">${rows || '<li>No meetings yet.</li>'}</ul>
<form class="meeting" method="post" action="${escapeHtml(`${base}/admin/meeting/save`)}">
  ${csrf}
  <input type="date" name="meet_date" value="${escapeHtml(draft.date)}" required aria-label="Meeting date">
  <input name="meet_place" maxlength="${MEETING_PLACE_MAX}" value="${escapeHtml(draft.place)}" placeholder="Place" required aria-label="Place">
  <button type="submit">Add meeting</button>
</form>`;
}
```

5. In `adminPage`, inside each note row, add `${replyLine(d.replies?.find((r) => r.date === n.date))}` right after `<p class="text">${escapeHtml(n.text)}</p>`. Then insert the meetings section after the "Showing today" box and before `<h2>Write a note</h2>`:

```ts
<div class="box">${d.current ? escapeHtml(d.current.text) : 'Nothing yet.'}</div>
${meetingsSection(d.base, csrf, d.meetings ?? [], d.meetingDraft ?? EMPTY_MEETING)}
<h2>Write a note</h2>
```

The test expects `name="meet_place" maxlength="40" value="typed"`. The attribute order in the markup above (`name`, `maxlength`, `value`) produces exactly that, and the date input produces `name="meet_date" value="..."`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: PASS, all of the views tests.

- [ ] **Step 5: Commit**

```bash
git add worker/views.ts tests/notes-views.test.ts
git commit -m "Show meetings and her replies in the notes admin"
```

---

### Task 6: Routes

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces these routes:
  - `POST <base>/reply` (reader)
  - `POST <base>/admin/meeting/save`
  - `POST <base>/admin/meeting/delete` (admin)
- The reader page and preview now pass `sky`, `replies`, `reply` and `unsent`. The admin page passes `meetings` and `replies`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/notes-routes.test.ts`:

```ts
async function readerCsrf(env: Env, cookie: string): Promise<string> {
  const html = await (await handleRequest(get('/for-you', cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

const replies = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('replies') ?? '[]');

describe('replies', () => {
  async function reader() {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-02', text: 'future' }, { date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'older' }]);
    const cookie = await login(env, 'reader');
    const csrf = await readerCsrf(env, cookie);
    const reply = (fields: Record<string, string>, c = cookie) => handleRequest(post('/for-you/reply', { csrf, ...fields }, c), env, NOW);
    return { env, kv, cookie, csrf, reply };
  }

  it('saves a heart and a line, shows it back, and returns to the note', async () => {
    const { env, kv, cookie, reply } = await reader();
    const res = await reply({ date: '2026-09-30', heart: 'on', text: '  miss you\r\n ' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you#note-2026-09-30');
    expect(replies(kv)).toEqual([{ date: '2026-09-30', heart: true, text: 'miss you', at: NOW.toISOString() }]);
    const html = await (await handleRequest(get('/for-you', cookie), env, NOW)).text();
    expect(html).toContain('You sent ♥ “miss you”');
  });

  it('updates and clears a reply', async () => {
    const { kv, reply } = await reader();
    await reply({ date: '2026-10-01', heart: 'on' });
    await reply({ date: '2026-10-01', text: 'only words' });
    expect(replies(kv)).toEqual([{ date: '2026-10-01', heart: false, text: 'only words', at: NOW.toISOString() }]);
    await reply({ date: '2026-10-01' });
    expect(replies(kv)).toEqual([]);
  });

  it('sends a too-long reply back with a gentle error and stores nothing', async () => {
    const { env, kv, cookie, reply } = await reader();
    const res = await reply({ date: '2026-10-01', text: 'x'.repeat(281) });
    expect(res.headers.get('Location')).toBe('/for-you?unsent=2026-10-01#note-2026-10-01');
    expect(kv.data.has('replies')).toBe(false);
    const html = await (await handleRequest(get('/for-you?unsent=2026-10-01', cookie), env, NOW)).text();
    expect(html).toContain('That didn&#39;t send. Try again?');
  });

  it('refuses replies without the reader session, with a bad token, or to unseen notes', async () => {
    const { env, kv, reply } = await reader();
    expect((await handleRequest(post('/for-you/reply', { date: '2026-10-01', heart: 'on' }), env, NOW)).status).toBe(303);
    expect((await reply({ date: '2026-10-01', heart: 'on', csrf: 'nope' })).status).toBe(403);
    const admin = await login(env, 'admin');
    expect((await reply({ date: '2026-10-01', heart: 'on' }, admin)).status).toBe(303);
    expect((await reply({ date: '2026-10-02', heart: 'on' })).status).toBe(404);
    expect((await reply({ date: '2026-09-01', heart: 'on' })).status).toBe(404);
    expect(kv.data.has('replies')).toBe(false);
  });

  it('a corrupt replies value never breaks the page and is never overwritten', async () => {
    const { env, kv, cookie, reply } = await reader();
    kv.data.set('replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleRequest(get('/for-you', cookie), env, NOW);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('today');
    expect(html).not.toContain('class="reply');
    expect((await reply({ date: '2026-10-01', heart: 'on' })).status).toBe(500);
    const admin = await login(env, 'admin');
    expect(await (await handleRequest(get('/for-you/admin', admin), env, NOW)).text()).toContain('Replies could not be read.');
    expect(kv.data.get('replies')).toBe('garbage');
  });

  it('deleting a note deletes its reply; moving a note moves it; a new note on its date drops it', async () => {
    const { env, kv, reply } = await reader();
    await reply({ date: '2026-09-30', heart: 'on' });
    await reply({ date: '2026-10-01', text: 'b' });
    const { save, csrf, cookie } = await adminWith(env);
    await save({ original: '2026-09-30', date: '2026-09-28', text: 'older' });
    expect(replies(kv).map((r: { date: string }) => r.date).sort()).toEqual(['2026-09-28', '2026-10-01']);
    await save({ date: '2026-10-01', text: 'fresh note' });
    expect(replies(kv).map((r: { date: string }) => r.date)).toEqual(['2026-09-28']);
    await handleRequest(postForm('/for-you/admin/delete', { csrf, date: '2026-09-28' }, cookie), env, NOW);
    expect(replies(kv)).toEqual([]);
  });

  it('a text-only edit keeps the reply, and saving notes never creates or overwrites the replies key', async () => {
    const { env, kv, reply } = await reader();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-05', text: 'new' });
    expect(kv.data.has('replies')).toBe(false);
    await reply({ date: '2026-10-01', heart: 'on' });
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'edited' });
    expect(replies(kv)).toHaveLength(1);
    kv.data.set('replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await save({ original: '2026-10-01', date: '2026-10-03', text: 'moved' })).status).toBe(303);
    expect(kv.data.get('replies')).toBe('garbage');
  });

  it('shows her reply in admin, and preview shows it with the form turned off', async () => {
    const { env, reply } = await reader();
    await reply({ date: '2026-10-01', heart: 'on', text: 'hi' });
    const admin = await login(env, 'admin');
    expect(await (await handleRequest(get('/for-you/admin', admin), env, NOW)).text()).toContain('<p class="reply-line">♥ “hi”');
    const preview = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-01', admin), env, NOW)).text();
    expect(preview).toContain('You sent ♥ “hi”');
    expect(preview).toContain('<fieldset disabled>');
  });
});

describe('meetings and the sky', () => {
  it('adds, replaces and removes meetings, and the reader sees the sky', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'older' }]);
    const { csrf, cookie } = await adminWith(env);
    const meet = (path: string, fields: Record<string, string>) =>
      handleRequest(postForm(`/for-you/admin/meeting/${path}`, { csrf, ...fields }, cookie), env, NOW);
    expect((await meet('save', { meet_date: '2026-10-21', meet_place: 'Nowhere' })).headers.get('Location')).toBe('/for-you/admin?msg=meeting-saved');
    await meet('save', { meet_date: '2026-10-21', meet_place: 'Somewhere' });
    expect(JSON.parse(kv.data.get('meetings')!)).toEqual([{ date: '2026-10-21', place: 'Somewhere' }]);
    const html = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(html).toContain('A star for every note · Somewhere in 20 sleeps');
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect((await meet('delete', { date: '2026-10-21' })).headers.get('Location')).toBe('/for-you/admin?msg=meeting-removed');
    expect(JSON.parse(kv.data.get('meetings')!)).toEqual([]);
  });

  it('rejects a bad meeting, keeps what was typed, and stores nothing', async () => {
    const { env, kv } = setup();
    const { csrf, cookie } = await adminWith(env);
    const res = await handleRequest(postForm('/for-you/admin/meeting/save', { csrf, meet_date: '2026-10-21', meet_place: '' }, cookie), env, NOW);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('A meeting needs a real date');
    expect(kv.data.has('meetings')).toBe(false);
  });

  it('refuses meeting changes without admin or a valid token', async () => {
    const { env, kv } = setup();
    const reader = await login(env, 'reader');
    expect((await handleRequest(postForm('/for-you/admin/meeting/save', { meet_date: '2026-10-21', meet_place: 'x' }, reader), env, NOW)).status).toBe(303);
    const { cookie } = await adminWith(env);
    expect((await handleRequest(postForm('/for-you/admin/meeting/save', { csrf: 'nope', meet_date: '2026-10-21', meet_place: 'x' }, cookie), env, NOW)).status).toBe(403);
    expect(kv.data.has('meetings')).toBe(false);
  });

  it('previews the arrival heart on the meeting date', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-21', text: 'here' }, { date: '2026-10-01', text: 'today' }]);
    kv.data.set('meetings', JSON.stringify([{ date: '2026-10-21', place: 'Somewhere' }]));
    const admin = await login(env, 'admin');
    const html = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-21', admin), env, NOW)).text();
    expect(html).toContain('sky-arrived');
    expect(html).toContain("0 km · You&#39;re here ♥");
  });

  it('a corrupt meetings value hides the sky but keeps the notes', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }]);
    kv.data.set('meetings', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(html).toContain('today');
    expect(html).not.toContain('class="sky');
    expect(kv.data.get('meetings')).toBe('garbage');
  });
});
```

Notes for the implementer:
- `NOW` is `2026-10-01T10:00:00Z`, so today is 2026-10-01 and the 21st is 20 sleeps away.
- `escapeHtml` encodes `'` as `&#39;`, which is why the arrival caption assertion uses `You&#39;re`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: FAIL in the new `replies` and `meetings and the sky` blocks. The routes return 404, and the reader page has no csrf. Existing tests still pass.

- [ ] **Step 3: Implement**

In `worker/index.ts`:

1. Imports:

```ts
import { parseMeetings, upsertMeeting, removeMeeting, parseMeetingForm, skyFor, type MeetingDraft } from './meetings';
import { parseReplies, parseReplyForm, setReply, moveReply, dropReply, type Reply } from './replies';
```

2. Constants. Add these, and extend `FLASH`:

```ts
const MEETINGS_KEY = 'meetings';
const REPLIES_KEY = 'replies';
const FLASH: Record<string, string> = {
  saved: 'Saved.', deleted: 'Deleted.', 'meeting-saved': 'Meeting saved.', 'meeting-removed': 'Meeting removed.',
};
const EXPIRED = 'That form expired. Go back, reload, and try again.';
```

Replace the literal in `adminAction`'s CSRF failure with `EXPIRED`.

3. Loaders, below `storeNotes`:

```ts
async function loadMeetings(kv: KV) {
  return parseMeetings(await kv.get(MEETINGS_KEY));
}

async function loadReplies(kv: KV): Promise<Reply[]> {
  return parseReplies(await kv.get(REPLIES_KEY));
}

// Pages show the notes even when an extra (meetings, replies) cannot be read; that part is left out.
async function tryLoad<T>(load: () => Promise<T>, what: string): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`Could not read ${what}`, error);
    return null;
  }
}

// Keeps replies with their notes. Best-effort: the notes are already saved when this runs,
// and a missing or unreadable replies value is left exactly as it is.
async function updateReplies(kv: KV, change: (replies: Reply[]) => Reply[]): Promise<void> {
  try {
    const raw = await kv.get(REPLIES_KEY);
    if (raw === null) return;
    await kv.put(REPLIES_KEY, JSON.stringify(change(parseReplies(raw))));
  } catch (error) {
    console.error('Could not update replies', error);
  }
}
```

4. Make `readerSession` return the session. `showMedia` then uses `Boolean(...)`:

```ts
async function readerSession(request: Request, cfg: Config, now: Date): Promise<string | null> {
  const session = readCookie(request, COOKIE.reader);
  return session && (await verifySession(session, 'reader', cfg.secret, now.getTime())) ? session : null;
}
```

In `showMedia`: `const allowed = asAdmin ? Boolean(await adminSession(request, cfg, now)) : Boolean(await readerSession(request, cfg, now));`

5. `showReader` (it now takes `url`):

```ts
async function showReader(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const today = todayInCopenhagen(now);
  const notes = await loadNotes(kv);
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  return html(readerPage({
    ...selectForReader(notes, today),
    mediaBase: `${cfg.base}/media`,
    sky: meetings && skyFor(notes, meetings, today),
    replies: await tryLoad(() => loadReplies(kv), 'replies'),
    reply: { action: `${cfg.base}/reply`, csrf: await csrfToken(session, cfg.secret) },
    unsent: url.searchParams.get('unsent') ?? undefined,
  }));
}
```

6. `handleReply`:

```ts
async function handleReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const date = field(form, 'date');
  const today = todayInCopenhagen(now);
  if (!(await loadNotes(kv)).some((n) => n.date === date && n.date <= today)) return notFound();
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return redirect(`${cfg.base}?unsent=${date}#note-${date}`);
  await kv.put(REPLIES_KEY, JSON.stringify(setReply(await loadReplies(kv), date, answer, now.toISOString())));
  return redirect(`${cfg.base}#note-${date}`);
}
```

`date` is safe to put into the Location header: it equals a stored note date, which `parseNotes` already validated as `YYYY-MM-DD`.

7. Admin rendering. Add `meetingDraft?: MeetingDraft` to `AdminView`. Change `renderAdmin` to take the KV and load the extras:

```ts
async function renderAdmin(
  kv: KV, notes: Note[], cfg: Config, now: Date, session: string, view: AdminView, status = 200,
): Promise<Response> {
  const today = todayInCopenhagen(now);
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  const replies = await tryLoad(() => loadReplies(kv), 'replies');
  const problems = [meetings ? '' : 'Meetings could not be read.', replies ? '' : 'Replies could not be read.'];
  const error = [view.error ?? '', ...problems].filter(Boolean).join(' ') || undefined;
  return html(adminPage({
    base: cfg.base,
    today,
    current: selectForReader(notes, today).current,
    notes,
    ...view,
    error,
    meetings: meetings ?? [],
    replies: replies ?? [],
    csrf: await csrfToken(session, cfg.secret),
  }), status);
}

function freshForm(notes: Note[], now: Date): Note {
  return { date: nextEmptyDate(notes.map((n) => n.date), todayInCopenhagen(now)), text: '' };
}
```

Update the callers:
- In `showAdmin`, use `const form = editing ?? freshForm(notes, now);` and `return renderAdmin(kv, notes, ...)`.
- In `adminAction`'s error path, use `return renderAdmin(env.NOTES, notes, ...)`.

8. `showPreview`:

```ts
async function showPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const notes = await loadNotes(kv);
  const note = notes.find((n) => n.date === url.searchParams.get('date'));
  if (!note) return notFound();
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  return html(readerPage({
    current: note, archive: [], mediaBase: `${cfg.base}/admin/media`, preview: true,
    sky: meetings && skyFor(notes, meetings, note.date),
    replies: await tryLoad(() => loadReplies(kv), 'replies'),
  }));
}
```

9. Replies follow their notes in `adminAction`:
- In the delete branch, after `retireOrphans`, add `await updateReplies(env.NOTES, (r) => dropReply(r, date));`.
- In the save branch, after `retireOrphans`, add:

```ts
  if (original !== date) await updateReplies(env.NOTES, (r) => moveReply(r, original || undefined, date));
```

10. `meetingAction`:

```ts
async function meetingAction(
  request: Request, kv: KV, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const meetings = await loadMeetings(kv);
  if (action === 'delete') {
    await kv.put(MEETINGS_KEY, JSON.stringify(removeMeeting(meetings, field(form, 'date'))));
    return redirect(`${adminHome}?msg=meeting-removed`);
  }
  const parsed = parseMeetingForm((name) => field(form, name));
  if (!parsed.meeting) {
    const notes = await loadNotes(kv);
    return renderAdmin(kv, notes, cfg, now, session, { form: freshForm(notes, now), error: parsed.error, meetingDraft: parsed.draft }, 400);
  }
  await kv.put(MEETINGS_KEY, JSON.stringify(upsertMeeting(meetings, parsed.meeting)));
  return redirect(`${adminHome}?msg=meeting-saved`);
}
```

11. Routes in `handleRequest`:

```ts
      case 'GET ': return await showReader(request, kv, cfg, now, url);
      case 'POST /reply': return await handleReply(request, kv, cfg, now);
      case 'POST /admin/meeting/save': return await meetingAction(request, kv, cfg, now, 'save');
      case 'POST /admin/meeting/delete': return await meetingAction(request, kv, cfg, now, 'delete');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: PASS, all of the routes tests, old and new.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: the build succeeds and every test passes.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts tests/notes-routes.test.ts
git commit -m "Save replies and meetings, and show the sky and replies on the notes pages"
```

---

### Task 7: README and browser check

**Files:**
- Modify: `README.md` (Private notes section)

- [ ] **Step 1: Document**

In `README.md`, add after the game bullet in "Private notes":

```markdown
- Meetings (`meetings` in KV: date and place, set in the admin's Meetings section) drive a star sky at the top of the reader page: one star per note since the previous meeting, gathering into a heart on the meeting day and kept afterwards. The note dated on the meeting day is the arrival message.
- The reader can answer each note with a heart and/or a short line (up to 280 characters), stored under `replies` in KV and shown under the note in the admin list. Deleting a note deletes its reply; moving a note moves it. Older Worker versions ignore both keys, so a rollback leaves them untouched.
```

- [ ] **Step 2: Browser check**

Start the local server: `npx astro build && npx wrangler dev --port 8787` (local KV only; `.dev.vars` already has test secrets). In local admin, add a meeting about ten days ahead and a few notes. Then check each of these with Playwright at 375×553, 390×664 and 1280×800:
- **Growing sky:**
  - the caption reads correctly with the right number of sleeps;
  - the newest star twinkles;
  - the page doesn't scroll sideways.
- **Arrival:** add a meeting dated today. The stars gather into a heart and the lines fade in after them. Also preview the meeting date from admin.
- **Kept:** set the meeting a day in the past. The heart shows still, with "<place> · <date>".
- **Reduced motion** (emulate `prefers-reduced-motion: reduce`): the finished heart shows with no animation.
- **Reply round trip:**
  - tapping ♥ sends it at once and the page lands on that note;
  - "Write something back" plus Send saves the text;
  - clearing both removes the reply;
  - admin shows the reply line with the time.
- **Without JavaScript** (`javaScriptEnabled: false` context): the Send button appears next to the heart, and a heart-only reply saves.
- **Long text:** a 280-character unbroken string wraps on a 375px phone, both in "You sent" and in the admin line.
- **Game note:** the reply area is hidden while the game plays and works after the reveal.
- **Too long:** posting 281 characters with curl shows the gentle error under that note.

Afterwards, stop workerd: `Get-NetTCPConnection -LocalPort 8787` → `Stop-Process`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document meetings, the sky and replies on private notes"
```

Deploying is a separate, confirmed step: run the backup routine for `notes`, `meetings` and `replies`, then merge, test, push, and do the post-deploy `cmp` of all three keys.
