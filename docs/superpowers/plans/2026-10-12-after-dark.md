# After Dark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, darker room behind a doorway on the private notes page. It holds entries the admin writes whenever he likes, each with optional sound and a reply.

**Architecture:**
- **Data:** two new KV keys, `after_dark` (entries) and `after_dark_replies`, parsed by a pure module `worker/after-dark.ts`.
- **The door:** a 30-minute HMAC-signed cookie bound to the reader session (`worker/auth.ts`).
- **Pages:** `worker/after-dark-views.ts` renders the doorway, the room and the admin page, reusing shared pieces exported from `worker/views.ts`.
- **Server:** `worker/index.ts` adds the routes, extends media serving and makes orphan clean-up count both notes and entries.

**Tech Stack:** Cloudflare Workers (TypeScript), KV, R2, Vitest. `npm test` = `astro build && vitest run`.

**Spec:** `docs/superpowers/specs/2026-10-12-after-dark-design.md`

## Global Constraints

- **Public repo.** Never commit entries, replies, real names, dates, the notes path, `.dev.vars` or backups. Tests use placeholder text.
- **User-supplied text** reaches HTML only through `escapeHtml`. Inline scripts contain no data; the newest id travels in a `data-newest` attribute.
- **Limits:**
  - entry title: 0 to 120 characters, trimmed;
  - entry text: 1 to 5000 characters, CRLF→LF, trimmed;
  - reply: 280 characters;
  - sound: the existing `checkFile('audio', …)` rules.
- **Door:** cookie `notes_door`, `Path=<base>`, `Max-Age=1800`, `HttpOnly; Secure; SameSite=Lax`. The server refuses tokens older than 30 minutes or bound to another reader session.
- **KV safety:**
  - A corrupt `after_dark` or `after_dark_replies` value never breaks the normal notes page and is never overwritten.
  - Replies are written only when one changes.
- **Copy:** no em dashes in user-facing text.
- **Inline scripts:** plain ES5 strings, and every `localStorage` access goes inside try/catch.

## Review Focus

1. **A sound on an entry must never be deleted by note clean-up, and the other way round.** Pinned in Task 5 ("notes clean-up never deletes an entry sound").
2. **The door is bound to the session.** A door cookie copied next to a different reader session must not open the room. Pinned in Task 1 and Task 5.
3. **A sound must not play to a logged-in reader whose door is closed,** for example by guessing the URL from an old page. Pinned in Task 5 (media served only with an open door).
4. **A corrupt `after_dark` value** must leave the normal notes page working (with no link) and must not be overwritten by an admin save. Pinned in Task 5.
5. **The unread dot without storage** (private mode, blocked storage) must not throw: no dot, no error. Pinned by the try/catch in Task 3's script; checked in the browser in Task 6.

---

### Task 1: The door token

**Files:**
- Modify: `worker/auth.ts`
- Test: `tests/notes-door.test.ts`

**Interfaces:**
- Produces:
  - `DOOR_SECONDS = 1800`
  - `createDoor(session: string, secret: string, nowMs: number): Promise<string>`
  - `verifyDoor(value: string | undefined, session: string, secret: string, nowMs: number): Promise<boolean>`
  - `doorCookie(value: string, path: string): string`
  - `closedDoorCookie(path: string): string`

- [ ] **Step 1: Write the failing tests**

`tests/notes-door.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createDoor, verifyDoor, doorCookie, closedDoorCookie, DOOR_SECONDS } from '../worker/auth';

const SECRET = 'test-secret';
const SESSION = 'reader.1.sig';
const T = Date.parse('2026-10-12T20:00:00Z');

describe('door', () => {
  it('opens for the same session within 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, SESSION, SECRET, T)).toBe(true);
    expect(await verifyDoor(door, SESSION, SECRET, T + 29 * 60_000)).toBe(true);
  });

  it('closes after 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, SESSION, SECRET, T + DOOR_SECONDS * 1000)).toBe(false);
  });

  it('refuses another session, another secret, tampering and nonsense', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, 'reader.2.sig', SECRET, T)).toBe(false);
    expect(await verifyDoor(door, SESSION, 'other-secret', T)).toBe(false);
    const [, expires, sig] = door.split('.');
    expect(await verifyDoor(`door.${Number(expires) - 60_000}.${sig}`, SESSION, SECRET, T)).toBe(false);
    for (const bad of [undefined, '', 'door', 'door.x.y', `reader.${expires}.${sig}`]) {
      expect(await verifyDoor(bad, SESSION, SECRET, T)).toBe(false);
    }
  });

  it('refuses a door that claims to stay open longer than 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T + 3_600_000);
    expect(await verifyDoor(door, SESSION, SECRET, T)).toBe(false);
  });

  it('sets a 30-minute http-only cookie on the notes path, and can clear it', () => {
    expect(doorCookie('v', '/for-you')).toBe('notes_door=v; Path=/for-you; Max-Age=1800; HttpOnly; Secure; SameSite=Lax');
    expect(closedDoorCookie('/for-you')).toBe('notes_door=; Path=/for-you; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-door.test.ts`
Expected: FAIL. `createDoor` is not a function.

- [ ] **Step 3: Implement**

Append to `worker/auth.ts`:

```ts
export const DOOR_SECONDS = 1800;
const DOOR_MS = DOOR_SECONDS * 1000;

/** A short-lived pass into the after-dark room, bound to one reader session. */
export async function createDoor(session: string, secret: string, nowMs: number): Promise<string> {
  const expires = nowMs + DOOR_MS;
  return `door.${expires}.${await hmac(secret, `door:${session}:${expires}`)}`;
}

export async function verifyDoor(
  value: string | undefined, session: string, secret: string, nowMs: number,
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'door') return false;
  const expiresMs = Number(parts[1]);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs || expiresMs > nowMs + DOOR_MS) return false;
  return timingSafeEqual(parts[2], await hmac(secret, `door:${session}:${parts[1]}`));
}

export function doorCookie(value: string, path: string): string {
  return `notes_door=${value}; Path=${path}; Max-Age=${DOOR_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function closedDoorCookie(path: string): string {
  return `notes_door=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-door.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/auth.ts tests/notes-door.test.ts
git commit -m "Add a short-lived door pass bound to the reader session"
```

---

### Task 2: The entries model

**Files:**
- Modify: `worker/notes.ts` (export `isAttachment`)
- Create: `worker/after-dark.ts`
- Test: `tests/notes-after-dark.test.ts`

**Interfaces:**
- Consumes: `Attachment`, `isAttachment` (notes.ts); `Answer`, `REPLY_MAX` (replies.ts).
- Produces:
  - `ENTRY_LIMITS = { title: 120, text: 5000 }`, `ENTRY_INVALID: string`
  - `interface Entry { id; title; text; created; audio?: Attachment }`
  - `interface EntryDraft { title; text }`, `EMPTY_ENTRY: EntryDraft`
  - `interface EntryReply extends Answer { id; at }`
  - `parseEntries(raw: string | null): Entry[]` (sorted newest `created` first; throws on invalid or repeated ids)
  - `upsertEntry(entries, entry): Entry[]`, `removeEntry(entries, id): Entry[]`, `entryKeys(entries): string[]`
  - `parseEntryForm(get): { draft: EntryDraft; error?: string }` (fields `title`, `text`)
  - `parseEntryReplies(raw): EntryReply[]`, `setEntryReply(replies, id, answer, at): EntryReply[]`, `dropEntryReply(replies, id): EntryReply[]`

- [ ] **Step 1: Write the failing tests**

`tests/notes-after-dark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseEntries, upsertEntry, removeEntry, entryKeys, parseEntryForm, ENTRY_INVALID, EMPTY_ENTRY,
  parseEntryReplies, setEntryReply, dropEntryReply,
} from '../worker/after-dark';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const entry = (id: string, created: string, extra = {}) => ({ id, title: '', text: 'words', created, ...extra });

describe('parseEntries', () => {
  it('treats a missing key as no entries, sorts newest first, and drops extra fields', () => {
    expect(parseEntries(null)).toEqual([]);
    const raw = JSON.stringify([
      { ...entry(ID1, '2026-10-01T10:00:00.000Z'), extra: 1 },
      entry(ID2, '2026-10-05T10:00:00.000Z', { title: 'T', audio: { key: KEY, type: 'audio/mp4' } }),
    ]);
    expect(parseEntries(raw)).toEqual([
      entry(ID2, '2026-10-05T10:00:00.000Z', { title: 'T', audio: { key: KEY, type: 'audio/mp4' } }),
      entry(ID1, '2026-10-01T10:00:00.000Z'),
    ]);
  });

  it('throws on anything invalid', () => {
    const ok = entry(ID1, '2026-10-01T10:00:00.000Z');
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...ok, id: 'not-a-uuid' }]),
      JSON.stringify([{ ...ok, text: '   ' }]),
      JSON.stringify([{ ...ok, text: 'x'.repeat(5001) }]),
      JSON.stringify([{ ...ok, title: 'x'.repeat(121) }]),
      JSON.stringify([{ ...ok, created: 'never' }]),
      JSON.stringify([{ ...ok, audio: { key: '../x', type: 'audio/mp4' } }]),
      JSON.stringify([ok, ok]),
    ]) {
      expect(() => parseEntries(raw), raw).toThrow();
    }
  });
});

describe('editing entries', () => {
  it('upserts by id keeping newest first, removes by id, and lists sound keys', () => {
    const a = entry(ID1, '2026-10-01T10:00:00.000Z');
    const b = entry(ID2, '2026-10-05T10:00:00.000Z', { audio: { key: KEY, type: 'audio/mp4' } });
    let list = upsertEntry(upsertEntry([], a), b);
    expect(list.map((e) => e.id)).toEqual([ID2, ID1]);
    list = upsertEntry(list, { ...a, text: 'changed' });
    expect(list).toHaveLength(2);
    expect(list[1].text).toBe('changed');
    expect(entryKeys(list)).toEqual([KEY]);
    expect(removeEntry(list, ID2).map((e) => e.id)).toEqual([ID1]);
  });
});

describe('parseEntryForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('trims, normalizes line endings and allows an empty title', () => {
    expect(parseEntryForm(form({ title: '  A title ', text: ' one\r\ntwo ' }))).toEqual({ draft: { title: 'A title', text: 'one\ntwo' } });
    expect(parseEntryForm(form({ text: 'only text' }))).toEqual({ draft: { title: '', text: 'only text' } });
  });

  it('rejects empty or long text and a long title, keeping what was typed', () => {
    for (const fields of [{ text: '  ' }, { text: 'x'.repeat(5001) }, { text: 'ok', title: 'x'.repeat(121) }]) {
      const result = parseEntryForm(form(fields));
      expect(result.error).toBe(ENTRY_INVALID);
      expect(result.draft.text).toBe((fields.text ?? '').trim());
    }
    expect(EMPTY_ENTRY).toEqual({ title: '', text: '' });
  });
});

describe('entry replies', () => {
  const AT = '2026-10-12T20:00:00.000Z';

  it('parses, sets, clears and drops replies by entry id', () => {
    expect(parseEntryReplies(null)).toEqual([]);
    let list = setEntryReply([], ID1, { heart: true, text: 'hi' }, AT);
    expect(parseEntryReplies(JSON.stringify(list))).toEqual([{ id: ID1, heart: true, text: 'hi', at: AT }]);
    list = setEntryReply(list, ID2, { heart: true, text: '' }, AT);
    expect(setEntryReply(list, ID1, { heart: false, text: '' }, AT).map((r) => r.id)).toEqual([ID2]);
    expect(dropEntryReply(list, ID2).map((r) => r.id)).toEqual([ID1]);
  });

  it('throws on invalid stored replies', () => {
    for (const raw of ['garbage', JSON.stringify([{ id: 'x', heart: true, text: '', at: AT }]), JSON.stringify([{ id: ID1, heart: false, text: '', at: AT }])]) {
      expect(() => parseEntryReplies(raw), raw).toThrow();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-after-dark.test.ts`
Expected: FAIL, because `../worker/after-dark` cannot be resolved.

- [ ] **Step 3: Implement**

In `worker/notes.ts`, change `function isAttachment(` to `export function isAttachment(`.

Create `worker/after-dark.ts`:

```ts
import { isAttachment, type Attachment } from './notes';
import { REPLY_MAX, type Answer } from './replies';

export const ENTRY_LIMITS = { title: 120, text: 5000 };
export const ENTRY_INVALID =
  `An entry needs text of up to ${ENTRY_LIMITS.text} characters and a title of up to ${ENTRY_LIMITS.title}.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Entry {
  id: string;
  title: string;
  text: string;
  /** ISO timestamp of the first save; kept on edits. */
  created: string;
  audio?: Attachment;
}

/** The admin form's fields as typed, so a rejected save can show them again. */
export interface EntryDraft {
  title: string;
  text: string;
}

export const EMPTY_ENTRY: EntryDraft = { title: '', text: '' };

export interface EntryReply extends Answer {
  id: string;
  at: string;
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === 'string' && UUID.test(e.id) &&
    typeof e.title === 'string' && e.title.length <= ENTRY_LIMITS.title &&
    typeof e.text === 'string' && e.text.trim() !== '' && e.text.length <= ENTRY_LIMITS.text &&
    typeof e.created === 'string' && !Number.isNaN(Date.parse(e.created)) &&
    (e.audio === undefined || isAttachment(e.audio));
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
}

function copyEntry(e: Entry): Entry {
  const entry: Entry = { id: e.id, title: e.title, text: e.text, created: e.created };
  if (e.audio) entry.audio = { key: e.audio.key, type: e.audio.type };
  return entry;
}

export function parseEntries(raw: string | null): Entry[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isEntry)) throw new Error('Stored after dark entries are invalid');
  if (new Set(data.map((e) => e.id)).size !== data.length) throw new Error('Stored after dark entries repeat an id');
  return sortEntries(data.map(copyEntry));
}

export function upsertEntry(entries: Entry[], entry: Entry): Entry[] {
  return sortEntries([...entries.filter((e) => e.id !== entry.id), entry]);
}

export function removeEntry(entries: Entry[], id: string): Entry[] {
  return entries.filter((e) => e.id !== id);
}

export function entryKeys(entries: Entry[]): string[] {
  return entries.flatMap((e) => (e.audio ? [e.audio.key] : []));
}

export function parseEntryForm(get: (name: string) => string): { draft: EntryDraft; error?: string } {
  const draft: EntryDraft = { title: get('title').trim(), text: get('text').replace(/\r\n?/g, '\n').trim() };
  const ok = draft.text !== '' && draft.text.length <= ENTRY_LIMITS.text && draft.title.length <= ENTRY_LIMITS.title;
  return ok ? { draft } : { draft, error: ENTRY_INVALID };
}

function isEntryReply(value: unknown): value is EntryReply {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && UUID.test(r.id) &&
    typeof r.heart === 'boolean' &&
    typeof r.text === 'string' && r.text.length <= REPLY_MAX &&
    (r.heart || r.text !== '') &&
    typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at));
}

export function parseEntryReplies(raw: string | null): EntryReply[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isEntryReply)) throw new Error('Stored after dark replies are invalid');
  return data.map((r) => ({ id: r.id, heart: r.heart, text: r.text, at: r.at }));
}

/** One reply per entry; an empty answer removes it. */
export function setEntryReply(replies: EntryReply[], id: string, answer: Answer, at: string): EntryReply[] {
  const rest = replies.filter((r) => r.id !== id);
  return answer.heart || answer.text !== '' ? [...rest, { id, heart: answer.heart, text: answer.text, at }] : rest;
}

export function dropEntryReply(replies: EntryReply[], id: string): EntryReply[] {
  return replies.filter((r) => r.id !== id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-after-dark.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/notes.ts worker/after-dark.ts tests/notes-after-dark.test.ts
git commit -m "Model after dark entries and their replies"
```

---

### Task 3: Shared view pieces, the moon link and the admin link

**Files:**
- Modify: `worker/views.ts`
- Test: `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `Answer` (replies.ts).
- Produces (exported from `worker/views.ts`):
  - `shell`, `READER_FONTS`, `adminShell`, `errorLine`, `REPLY_STYLE`, `REPLY_SCRIPT`, `replyLine`
  - `replyArea(target: ReplyTarget, reply: Answer | undefined, form: ReplyForm | undefined, unsent: boolean)`, where `interface ReplyTarget { field: 'date' | 'id'; value: string; anchor: string }`
  - `replySummary(reply: Answer)` (now takes the broader `Answer`)
  - `readerPage({ ..., afterDark?: { href: string; newest: string } | null })`
- The admin page gets a link to `<base>/admin/after-dark`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/notes-views.test.ts`:

```ts
describe('after dark link', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('ends the reader page with a quiet moon link carrying the newest entry id', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [], afterDark: { href: '/for-you/after-dark', newest: ID } });
    expect(html).toContain(`<a href="/for-you/after-dark" data-newest="${ID}">☾ Daily affirmations… after dark</a>`);
    expect(html).toContain("localStorage.getItem('after-dark-seen')");
    expect(html.indexOf('after-dark-link"')).toBeGreaterThan(html.indexOf('hi</p>'));
  });

  it('has no link without entries', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [] });
    expect(html).not.toContain('after dark</a>');
    expect(html).not.toContain('after-dark-seen');
  });

  it('links the admin to the after dark admin', () => {
    expect(admin).toContain('href="/for-you/admin/after-dark"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: FAIL in "after dark link".

- [ ] **Step 3: Implement**

In `worker/views.ts`:

1. **Imports:** change `import type { Reply } from './replies';` to `import type { Answer, Reply } from './replies';`.

2. **Split out the reply styles.** Cut the reply rules (the lines from `.reply { margin: 1.25rem 0 0; }` through `.reply .error { margin-top: 0.5rem; }`) out of `READER_STYLE` into:

```ts
export const REPLY_STYLE = `
<the cut lines, unchanged>
`;
```

Then make `READER_STYLE` end with `${REPLY_STYLE}` inside its template, plus the link styles:

```css
.after-dark-link { text-align: center; margin: 4rem 0 0; }
.after-dark-link a { color: var(--muted); font-style: italic; text-decoration: none; font-size: 1.05rem; }
.after-dark-link a.unread::after { content: ''; display: inline-block; width: 0.45rem; height: 0.45rem; margin-left: 0.45rem; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); vertical-align: middle; }
```

`READER_STYLE` must be declared after `REPLY_STYLE`, so move `REPLY_STYLE` above it.

3. **Exports:** add `export` to `shell`, `READER_FONTS`, `adminShell`, `errorLine`, `REPLY_SCRIPT` and `replyLine`.

4. **Generalize the reply area:**

```ts
export interface ReplyTarget {
  field: 'date' | 'id';
  value: string;
  anchor: string;
}

/** "♥ “her words”", escaped, for the reader and the admin. */
export function replySummary(reply: Answer): string {
  return [reply.heart ? '♥' : '', reply.text ? `“${escapeHtml(reply.text)}”` : ''].filter(Boolean).join(' ');
}

export function replyArea(target: ReplyTarget, reply: Answer | undefined, form: ReplyForm | undefined, unsent: boolean): string {
  const sent = reply ? `<p class="reply-sent">You sent ${replySummary(reply)}</p>\n` : '';
  return `<div class="reply" id="${escapeHtml(target.anchor)}">
${sent}<form class="reply-form" method="post"${form ? ` action="${escapeHtml(form.action)}"` : ''}><fieldset${form ? '' : ' disabled'}>
<input type="hidden" name="csrf" value="${form ? escapeHtml(form.csrf) : ''}"><input type="hidden" name="${target.field}" value="${escapeHtml(target.value)}">
<label class="reply-heart"><input type="checkbox" name="heart" value="on"${reply?.heart ? ' checked' : ''}><span class="glyph" aria-hidden="true">♥</span>Send a heart</label>
<noscript><button type="submit" class="reply-send">Send</button></noscript>
<details><summary>Write something back</summary>
<textarea name="text" maxlength="280" rows="3" aria-label="Write something back">${escapeHtml(reply?.text ?? '')}</textarea>
<button type="submit">Send</button></details>
</fieldset></form>
${unsent ? `<p class="error">${escapeHtml("That didn't send. Try again?")}</p>\n` : ''}</div>`;
}
```

`replyLine`'s parameter becomes `reply: (Answer & { at: string }) | undefined`.

5. **Update `readerPage`:**
   - Its `area` uses `replyArea({ field: 'date', value: n.date, anchor: \`note-${n.date}\` }, replies.find((r) => r.date === n.date), form, unsent === n.date)`.
   - Add `afterDark = null` to the destructured params and `afterDark?: { href: string; newest: string } | null` to the type.
   - Before `return`:

```ts
  const door = afterDark
    ? `\n<p class="after-dark-link"><a href="${escapeHtml(afterDark.href)}" data-newest="${escapeHtml(afterDark.newest)}">☾ Daily affirmations… after dark</a></p>\n${UNREAD_SCRIPT}`
    : '';
  return readerShell(top + today + past + game + replyScript + door);
```

with this, above `readerPage`:

```ts
// A glowing dot on the moon link until she has opened the newest entry (remembered on her phone only).
const UNREAD_SCRIPT = `<script>
(function () {
  var link = document.querySelector('.after-dark-link a');
  if (!link) return;
  var seen = null;
  try { seen = localStorage.getItem('after-dark-seen'); } catch (e) {}
  if (seen !== link.getAttribute('data-newest')) link.className = 'unread';
})();
</script>`;
```

6. **Admin link:** in `adminPage`, right after `<h1>Notes</h1>`, add:

```ts
<p><a href="${escapeHtml(`${d.base}/admin/after-dark`)}">After dark ☾</a></p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-views.test.ts tests/notes-routes.test.ts`
Expected: PASS, including all the existing reply tests (anchors and `name="date"` are unchanged for notes).

- [ ] **Step 5: Commit**

```bash
git add worker/views.ts tests/notes-views.test.ts
git commit -m "Add the after dark moon link and share the reply pieces"
```

---

### Task 4: After-dark pages

**Files:**
- Create: `worker/after-dark-views.ts`
- Test: `tests/notes-after-dark-views.test.ts`

**Interfaces:**
- Consumes: Task 2 types; Task 3 exports; `todayInCopenhagen` (dates.ts); `formatDate`, `escapeHtml` (views.ts).
- Produces:
  - `doorwayPage({ enter, csrf, back }): string`
  - `roomPage({ entries, replies, mediaBase, leave?, reply?, unsent?, preview? }): string`
  - `roomErrorPage(): string`
  - `interface AfterDarkAdminData { base; csrf; entries: Entry[]; replies: EntryReply[]; draft: EntryDraft; editing?: Entry; flash?; error? }`
  - `afterDarkAdminPage(d: AfterDarkAdminData): string`

- [ ] **Step 1: Write the failing tests**

`tests/notes-after-dark-views.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { doorwayPage, roomPage, roomErrorPage, afterDarkAdminPage } from '../worker/after-dark-views';
import type { Entry } from '../worker/after-dark';
import { formatDate } from '../worker/views';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const entries: Entry[] = [
  { id: ID2, title: 'A <b>title</b>', text: 'second\nentry', created: '2026-10-12T19:00:00.000Z', audio: { key: KEY, type: 'audio/mp4' } },
  { id: ID1, title: '', text: 'first entry', created: '2026-10-01T22:30:00.000Z' },
];
const form = { action: '/for-you/after-dark/reply', csrf: 'tok' };

describe('doorway', () => {
  it('asks her to come in with the reader csrf, with a way back', () => {
    const html = doorwayPage({ enter: '/for-you/after-dark/enter', csrf: 'tok', back: '/for-you' });
    expect(html).toContain(ROBOTS);
    expect(html).toContain("This part is just for when you're alone.");
    expect(html).toContain('<form method="post" action="/for-you/after-dark/enter">');
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
    expect(html).toContain('href="/for-you">Back to your notes</a>');
    expect(html).toContain('#1a1220');
  });
});

describe('room', () => {
  it('shows entries newest first, escaped, with date, sound, reply areas and a leave button', () => {
    const html = roomPage({ entries, replies: [], mediaBase: '/for-you/media', leave: '/for-you/after-dark/leave', reply: form });
    expect(html.indexOf('second\nentry')).toBeLessThan(html.indexOf('first entry'));
    expect(html).toContain('<h2>A &lt;b&gt;title&lt;/b&gt;</h2>');
    expect(html.match(/<h2>/g)).toHaveLength(1);
    expect(html).toContain(formatDate('2026-10-12'));
    expect(html).toContain(formatDate('2026-10-02'));
    expect(html).toContain(`<audio controls preload="none" src="/for-you/media/${KEY}"></audio>`);
    expect(html).toContain(`id="entry-${ID1}"`);
    expect(html).toContain(`<input type="hidden" name="id" value="${ID2}">`);
    expect(html).toContain('action="/for-you/after-dark/reply"');
    expect(html).toContain('<form method="post" action="/for-you/after-dark/leave"><button type="submit">Leave</button></form>');
    expect(html).toContain(`data-newest="${ID2}"`);
    expect(html).toContain("localStorage.setItem('after-dark-seen'");
    expect(html).toContain('event.target.form.submit()');
  });

  it('shows her reply and the gentle error under the right entry', () => {
    const html = roomPage({
      entries, replies: [{ id: ID1, heart: true, text: 'yes', at: '2026-10-12T20:00:00.000Z' }],
      mediaBase: '/m', leave: '/l', reply: form, unsent: ID2,
    });
    expect(html).toContain('You sent ♥ “yes”');
    expect(html.match(/That didn&#39;t send/g)).toHaveLength(1);
    expect(html.indexOf("That didn&#39;t send")).toBeLessThan(html.indexOf(`id="entry-${ID1}"`));
  });

  it('turns replies off in preview, does not mark anything read, and has no leave button', () => {
    const html = roomPage({ entries, replies: [], mediaBase: '/m', preview: true });
    expect(html).toContain('<fieldset disabled>');
    expect(html).not.toContain('after-dark-seen');
    expect(html).not.toContain('Leave</button>');
    expect(html).not.toContain('event.target.form.submit()');
  });

  it('leaves reply areas out when replies cannot be read, and says when it is empty', () => {
    expect(roomPage({ entries, replies: null, mediaBase: '/m', leave: '/l', reply: form })).not.toContain('class="reply"');
    expect(roomPage({ entries: [], replies: [], mediaBase: '/m', leave: '/l', reply: form })).toContain('Nothing here yet.');
    expect(roomErrorPage()).toContain('Something went wrong loading this page.');
  });
});

describe('after dark admin', () => {
  const base = { base: '/for-you', csrf: 'tok123', entries, replies: [{ id: ID1, heart: false, text: '<3', at: '2026-10-12T20:05:00.000Z' }], draft: { title: '', text: '' } };

  it('lists entries with edit, delete, sound tag and her reply, plus a preview link', () => {
    const html = afterDarkAdminPage(base);
    expect(html).toContain(ROBOTS);
    expect(html).toContain(`href="/for-you/admin/after-dark?edit=${ID2}"`);
    expect(html).toContain('action="/for-you/admin/after-dark/delete"');
    expect(html).toContain(`<input type="hidden" name="id" value="${ID1}">`);
    expect(html).toContain('<span class="tag">Sound</span>');
    expect(html).toContain('<p class="reply-line">“&lt;3”');
    expect(html).toContain('href="/for-you/admin/after-dark/preview"');
    expect(html).toContain('href="/for-you/admin"');
    expect(html).toContain('enctype="multipart/form-data" action="/for-you/admin/after-dark/save"');
  });

  it('prefills an entry being edited, with its sound and a remove option', () => {
    const html = afterDarkAdminPage({ ...base, editing: entries[0], draft: { title: entries[0].title, text: entries[0].text } });
    expect(html).toContain(`<input type="hidden" name="id" value="${ID2}">`);
    expect(html).toContain('value="A &lt;b&gt;title&lt;/b&gt;"');
    expect(html).toContain('>second\nentry</textarea>');
    expect(html).toContain(`src="/for-you/admin/media/${KEY}"`);
    expect(html).toContain('name="remove_audio" value="1"');
  });

  it('shows errors and flash messages', () => {
    const html = afterDarkAdminPage({ ...base, error: 'Nope.', flash: 'Saved.' });
    expect(html).toContain('<p class="error">Nope.</p>');
    expect(html).toContain('<p class="flash">Saved.</p>');
  });
});
```

The second entry was created at 22:30Z on 1 October, which is 00:30 on 2 October in Copenhagen, so it shows the 2 October date.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-after-dark-views.test.ts`
Expected: FAIL, because `../worker/after-dark-views` cannot be resolved.

- [ ] **Step 3: Implement**

Create `worker/after-dark-views.ts`:

```ts
import { todayInCopenhagen } from './dates';
import {
  escapeHtml, formatDate, shell, READER_FONTS, adminShell, errorLine, replyArea, replyLine,
  REPLY_STYLE, REPLY_SCRIPT, type ReplyForm,
} from './views';
import { ENTRY_LIMITS, type Entry, type EntryDraft, type EntryReply } from './after-dark';

const AFTER_DARK_STYLE = `
:root { --paper: #1a1220; --ink: #ecdfd0; --muted: #a8949a; --accent: #d9a55b; --line: #3a2a3c; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at top, #2a1b30 0%, #1a1220 65%) fixed; background-color: #1a1220; color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 46rem; margin: 0 auto; padding: 12vh 1.25rem 4rem; }
a { color: var(--muted); }
button { font: inherit; font-size: 1.2rem; padding: 0.55rem 1.6rem; border: 1px solid var(--accent); border-radius: 999px; background: transparent; color: var(--accent); cursor: pointer; }
.door { text-align: center; padding-top: 8vh; }
.door p { font-size: clamp(1.5rem, 5vw, 2rem); font-style: italic; line-height: 1.3; margin: 0 0 2.25rem; animation: glow-in 2.4s ease-out both; }
.door form { display: inline-block; margin: 0; }
.back { display: block; margin-top: 2.5rem; font-style: italic; }
.top { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 2.5rem; }
.top h1 { margin: 0; font-weight: 400; font-style: italic; font-size: 1.7rem; color: var(--accent); }
.top form { margin: 0; }
.top button { border: 0; padding: 0; font-size: 1.05rem; font-style: italic; color: var(--muted); text-decoration: underline; }
.entry { border-top: 1px solid var(--line); padding: 1.75rem 0; animation: glow-in 1.8s ease-out both; }
.entry h2 { margin: 0 0 0.3rem; font-weight: 400; font-style: italic; font-size: 1.6rem; color: var(--accent); }
.entry .date { color: var(--muted); font-style: italic; margin: 0 0 1rem; }
.entry .text { font-size: 1.3rem; line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; margin: 0; }
.entry audio { display: block; width: 100%; margin: 1.25rem 0 0; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.3rem; }
.error { color: var(--accent); font-style: italic; margin: 0; }
${REPLY_STYLE}
.reply textarea { background: #24182a; color: var(--ink); border-color: var(--line); }
.reply-form button { font-size: 1rem; padding: 0.3rem 0.9rem; }
@keyframes glow-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .door p, .entry { animation: none; } }
`;

// Remembers, on her phone only, the newest entry she has seen, so the moon link's dot can go out.
const MARK_SEEN_SCRIPT = `<script>
(function () {
  var mark = document.querySelector('[data-newest]');
  if (!mark) return;
  try { localStorage.setItem('after-dark-seen', mark.getAttribute('data-newest')); } catch (e) {}
})();
</script>`;

function darkShell(body: string): string {
  return shell('after dark', AFTER_DARK_STYLE, body, READER_FONTS);
}

function entryDate(entry: Entry): string {
  return formatDate(todayInCopenhagen(new Date(entry.created)));
}

export function doorwayPage({ enter, csrf, back }: { enter: string; csrf: string; back: string }): string {
  return darkShell(`<div class="door">
<p>This part is just for when you're alone.</p>
<form method="post" action="${escapeHtml(enter)}"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button type="submit">Come in</button></form>
<a class="back" href="${escapeHtml(back)}">Back to your notes</a>
</div>`);
}

export function roomPage({ entries, replies, mediaBase, leave, reply, unsent, preview = false }: {
  entries: Entry[]; replies: EntryReply[] | null; mediaBase: string;
  leave?: string; reply?: ReplyForm; unsent?: string; preview?: boolean;
}): string {
  const form = preview ? undefined : reply;
  const items = entries.map((e) => `<article class="entry">
${e.title ? `<h2>${escapeHtml(e.title)}</h2>\n` : ''}<p class="date">${entryDate(e)}</p>
<p class="text">${escapeHtml(e.text)}</p>
${e.audio ? `<audio controls preload="none" src="${escapeHtml(`${mediaBase}/${e.audio.key}`)}"></audio>\n` : ''}${replies ? replyArea({ field: 'id', value: e.id, anchor: `entry-${e.id}` }, replies.find((r) => r.id === e.id), form, unsent === e.id) : ''}
</article>`).join('\n');
  const leaveButton = leave && !preview
    ? `<form method="post" action="${escapeHtml(leave)}"><button type="submit">Leave</button></form>`
    : '';
  const top = `<div class="top"><h1>after dark</h1>${leaveButton}</div>\n`;
  const seen = entries[0] && !preview ? `\n<div hidden data-newest="${escapeHtml(entries[0].id)}"></div>\n${MARK_SEEN_SCRIPT}` : '';
  const script = replies && form && entries.length ? `\n${REPLY_SCRIPT}` : '';
  return darkShell(top + (items || '<p class="quiet">Nothing here yet.</p>') + seen + script);
}

export function roomErrorPage(): string {
  return darkShell('<p class="quiet">Something went wrong loading this page.</p>');
}

export interface AfterDarkAdminData {
  base: string;
  csrf: string;
  entries: Entry[];
  replies: EntryReply[];
  draft: EntryDraft;
  editing?: Entry;
  flash?: string;
  error?: string;
}

export function afterDarkAdminPage(d: AfterDarkAdminData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const rows = d.entries.map((e) => `<li>
  <div class="meta">
    <span>${entryDate(e)}${e.audio ? '<span class="tag">Sound</span>' : ''}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin/after-dark?edit=${e.id}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/after-dark/delete`)}" onsubmit="return confirm('Delete this entry?')">
        ${csrf}<input type="hidden" name="id" value="${escapeHtml(e.id)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  ${e.title ? `<p class="text"><strong>${escapeHtml(e.title)}</strong></p>` : ''}
  <p class="text">${escapeHtml(e.text)}</p>
  ${replyLine(d.replies.find((r) => r.id === e.id))}
</li>`).join('\n');
  const sound = d.editing?.audio
    ? `<div class="attached"><audio controls preload="none" src="${escapeHtml(`${d.base}/admin/media/${d.editing.audio.key}`)}"></audio><label><input type="checkbox" name="remove_audio" value="1"> Remove sound</label></div>`
    : '';
  return adminShell(`
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>After dark</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<p><a href="${escapeHtml(`${d.base}/admin/after-dark/preview`)}">Preview</a></p>
<h2>${d.editing ? 'Edit entry' : 'Write an entry'}</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${escapeHtml(`${d.base}/admin/after-dark/save`)}">
  ${csrf}
  ${d.editing ? `<input type="hidden" name="id" value="${escapeHtml(d.editing.id)}">` : ''}
  <input name="title" maxlength="${ENTRY_LIMITS.title}" placeholder="Title (optional)" value="${escapeHtml(d.draft.title)}">
  <textarea name="text" maxlength="${ENTRY_LIMITS.text}" required placeholder="Entry">${escapeHtml(d.draft.text)}</textarea>
  <label class="file">Sound (optional)<input type="file" name="audio" accept="audio/*,.m4a"></label>
  ${sound}
  <p class="hint">Sound: M4A, MP3, AAC or WAV, up to 25 MB.</p>
  <button type="submit">Save</button>
</form>
<h2>All entries</h2>
<ul>${rows || '<li>No entries yet.</li>'}</ul>`);
}
```

`formatDate` is already exported from `views.ts`. `escapeHtml` is re-exported there.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-after-dark-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/after-dark-views.ts tests/notes-after-dark-views.test.ts
git commit -m "Draw the after dark doorway, room and admin page"
```

---

### Task 5: Routes

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces these routes:
  - `GET /after-dark`
  - `POST /after-dark/enter`
  - `POST /after-dark/leave`
  - `POST /after-dark/reply`
  - `GET /admin/after-dark`
  - `GET /admin/after-dark/preview`
  - `POST /admin/after-dark/save`
  - `POST /admin/after-dark/delete`
- Also: media serving for entry sounds; orphan clean-up across notes and entries; `afterDark` on the reader page.

- [ ] **Step 1: Write the failing tests**

Append to `tests/notes-routes.test.ts` (it already has `setup`, `get`, `post`, `postForm`, `file`, `login`, `adminWith`, `readerCsrf`, `seed`, `NOW` and `LATER`):

```ts
describe('after dark', () => {
  const TEXT = 'A placeholder entry';

  async function withEntry(extra: Record<string, string | File> = {}) {
    const ctx = setup();
    seed(ctx.kv, [{ date: '2026-10-01', text: 'today' }]);
    const admin = await adminWith(ctx.env);
    const saveEntry = (fields: Record<string, string | File>, when = NOW) =>
      handleRequest(postForm('/for-you/admin/after-dark/save', { csrf: admin.csrf, ...fields }, admin.cookie), ctx.env, when);
    const res = await saveEntry({ title: 'A title', text: TEXT, ...extra });
    const entries = () => JSON.parse(ctx.kv.data.get('after_dark')!);
    return { ...ctx, admin, res, entries, saveEntry };
  }

  async function comeIn(env: Env) {
    const cookie = await login(env, 'reader');
    const csrf = await readerCsrf(env, cookie);
    const enter = await handleRequest(post('/for-you/after-dark/enter', { csrf }, cookie), env, NOW);
    const door = enter.headers.get('Set-Cookie')!.split(';')[0];
    return { cookie, csrf, enter, inside: `${cookie}; ${door}` };
  }

  it('shows the moon link only once there is an entry', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }]);
    const reader = await login(env, 'reader');
    expect(await (await handleRequest(get('/for-you', reader), env, NOW)).text()).not.toContain('after dark</a>');
    const w = await withEntry();
    expect(w.res.status).toBe(303);
    expect(w.res.headers.get('Location')).toBe('/for-you/admin/after-dark?msg=saved');
    const html = await (await handleRequest(get('/for-you', await login(w.env, 'reader')), w.env, NOW)).text();
    expect(html).toContain(`data-newest="${w.entries()[0].id}"`);
  });

  it('shows the doorway until she comes in, then the room for 30 minutes', async () => {
    const { env } = await withEntry();
    const { cookie, enter, inside } = await comeIn(env);
    const door = await (await handleRequest(get('/for-you/after-dark', cookie), env, NOW)).text();
    expect(door).toContain("This part is just for when you're alone.");
    expect(door).not.toContain(TEXT);
    expect(enter.status).toBe(303);
    expect(enter.headers.get('Location')).toBe('/for-you/after-dark');
    expect(enter.headers.get('Set-Cookie')).toContain('Max-Age=1800');
    const room = await handleRequest(get('/for-you/after-dark', inside), env, NOW);
    expect(room.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(room.headers.get('Cache-Control')).toBe('no-store');
    expect(await room.text()).toContain(TEXT);
    const later = await (await handleRequest(get('/for-you/after-dark', inside), env, new Date(NOW.getTime() + 31 * 60_000))).text();
    expect(later).toContain("This part is just for when you're alone.");
  });

  it('asks for the password when logged out, and refuses to open without a valid token or session', async () => {
    const { env } = await withEntry();
    const out = await (await handleRequest(get('/for-you/after-dark'), env, NOW)).text();
    expect(out).toContain('name="password"');
    expect(out).not.toContain(TEXT);
    const noSession = await handleRequest(post('/for-you/after-dark/enter', { csrf: 'x' }), env, NOW);
    expect(noSession.headers.get('Set-Cookie')).toBeNull();
    const reader = await login(env, 'reader');
    expect((await handleRequest(post('/for-you/after-dark/enter', { csrf: 'nope' }, reader), env, NOW)).status).toBe(403);
  });

  it('does not open for a different reader session', async () => {
    const { env } = await withEntry();
    const { inside } = await comeIn(env);
    const door = inside.split('; ')[1];
    const other = (await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, new Date(NOW.getTime() + 1000)))
      .headers.get('Set-Cookie')!.split(';')[0];
    const html = await (await handleRequest(get('/for-you/after-dark', `${other}; ${door}`), env, NOW)).text();
    expect(html).toContain("This part is just for when you're alone.");
  });

  it('leave closes the door and goes back to the notes', async () => {
    const { env } = await withEntry();
    const { inside } = await comeIn(env);
    const res = await handleRequest(post('/for-you/after-dark/leave', {}, inside), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you');
    expect(res.headers.get('Set-Cookie')).toContain('notes_door=;');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('saves her reply to an entry, and refuses it with the door closed or for an unknown entry', async () => {
    const { env, kv, entries } = await withEntry();
    const id = entries()[0].id;
    const { cookie, csrf, inside } = await comeIn(env);
    const reply = (fields: Record<string, string>, c = inside) => handleRequest(post('/for-you/after-dark/reply', { csrf, ...fields }, c), env, NOW);
    const res = await reply({ id, heart: 'on', text: ' yes ' });
    expect(res.headers.get('Location')).toBe(`/for-you/after-dark#entry-${id}`);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)).toEqual([{ id, heart: true, text: 'yes', at: NOW.toISOString() }]);
    expect(await (await handleRequest(get('/for-you/after-dark', inside), env, NOW)).text()).toContain('You sent ♥ “yes”');
    const closed = await reply({ id, heart: 'on', text: 'again' }, cookie);
    expect(closed.headers.get('Location')).toBe('/for-you/after-dark');
    expect((await reply({ id: '99999999-9999-4999-8999-999999999999', heart: 'on' })).status).toBe(404);
    expect((await reply({ id, text: 'x'.repeat(281) })).headers.get('Location')).toBe(`/for-you/after-dark?unsent=${id}#entry-${id}`);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)[0].text).toBe('yes');
  });

  it('edits an entry keeping its id and date, deletes it with its reply, and rejects bad input', async () => {
    const { env, kv, entries, saveEntry, admin } = await withEntry();
    const first = entries()[0];
    await saveEntry({ id: first.id, title: '', text: 'changed' }, LATER);
    expect(entries()).toEqual([{ id: first.id, title: '', text: 'changed', created: first.created }]);
    const bad = await saveEntry({ text: '   ' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('An entry needs text');
    expect(entries()).toHaveLength(1);
    const { csrf, inside } = await comeIn(env);
    await handleRequest(post('/for-you/after-dark/reply', { csrf, id: first.id, heart: 'on' }, inside), env, NOW);
    const del = await handleRequest(postForm('/for-you/admin/after-dark/delete', { csrf: admin.csrf, id: first.id }, admin.cookie), env, NOW);
    expect(del.headers.get('Location')).toBe('/for-you/admin/after-dark?msg=deleted');
    expect(entries()).toEqual([]);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)).toEqual([]);
  });

  it('serves an entry sound only with the door open, and to the admin', async () => {
    const { env, entries, admin } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const key = entries()[0].audio.key;
    const { cookie, inside } = await comeIn(env);
    expect((await handleRequest(get(`/for-you/media/${key}`, cookie), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${key}`, inside), env, NOW)).status).toBe(200);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, admin.cookie), env, NOW)).status).toBe(200);
  });

  it('replaces and removes entry sounds, deleting old files after a day', async () => {
    const { media, entries, saveEntry } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const first = entries()[0];
    await saveEntry({ id: first.id, text: TEXT, audio: file('b.mp3', 'audio/mpeg') });
    const second = entries()[0].audio.key;
    expect(media.objects.has(first.audio.key)).toBe(true);
    await saveEntry({ id: first.id, text: TEXT, remove_audio: '1' }, LATER);
    expect(entries()[0].audio).toBeUndefined();
    expect(media.objects.has(first.audio.key)).toBe(false);
    expect(media.objects.has(second)).toBe(true);
  });

  it('notes clean-up never deletes an entry sound, and entry clean-up never deletes a note file', async () => {
    const { env, media, entries, saveEntry, admin } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const entryKey = entries()[0].audio.key;
    await admin.save({ date: '2026-10-03', text: 'with photo', photo: file('p.jpg', 'image/jpeg') });
    const noteKey = JSON.parse((env.NOTES as ReturnType<typeof memoryKV>).data.get('notes')!).find((n: { date: string }) => n.date === '2026-10-03').photo.key;
    await admin.saveAt(LATER, { date: '2026-10-04', text: 'later' });
    await saveEntry({ text: 'another' }, new Date(LATER.getTime() + 1000));
    expect(media.objects.has(entryKey)).toBe(true);
    expect(media.objects.has(noteKey)).toBe(true);
  });

  it('keeps the notes page working and never overwrites a corrupt value', async () => {
    const { env, kv, saveEntry, admin } = await withEntry();
    kv.data.set('after_dark', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reader = await login(env, 'reader');
    const page = await handleRequest(get('/for-you', reader), env, NOW);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain('after dark</a>');
    const { inside } = await comeIn(env);
    expect((await handleRequest(get('/for-you/after-dark', inside), env, NOW)).status).toBe(500);
    expect(await (await handleRequest(get('/for-you/admin/after-dark', admin.cookie), env, NOW)).text()).toContain('Entries could not be read.');
    expect((await saveEntry({ text: 'x' })).status).toBe(500);
    expect(kv.data.get('after_dark')).toBe('garbage');
  });

  it('shows entries without reply areas when replies are corrupt', async () => {
    const { env, kv } = await withEntry();
    kv.data.set('after_dark_replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { inside } = await comeIn(env);
    const html = await (await handleRequest(get('/for-you/after-dark', inside), env, NOW)).text();
    expect(html).toContain(TEXT);
    expect(html).not.toContain('class="reply"');
  });

  it('lets the admin preview the room with replies off, and only the admin', async () => {
    const { env, admin } = await withEntry();
    const html = await (await handleRequest(get('/for-you/admin/after-dark/preview', admin.cookie), env, NOW)).text();
    expect(html).toContain(TEXT);
    expect(html).toContain('<fieldset disabled>');
    const reader = await login(env, 'reader');
    expect(await (await handleRequest(get('/for-you/admin/after-dark/preview', reader), env, NOW)).text()).toContain('Admin password');
    expect(await (await handleRequest(get('/for-you/admin/after-dark', reader), env, NOW)).text()).toContain('Admin password');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: FAIL in the `after dark` block (routes 404, no link). Existing tests pass.

- [ ] **Step 3: Implement**

In `worker/index.ts`:

1. **Imports:**

```ts
import { createDoor, verifyDoor, doorCookie, closedDoorCookie } from './auth';   // merge into the existing auth import
import {
  parseEntries, upsertEntry, removeEntry, entryKeys, parseEntryForm, EMPTY_ENTRY,
  parseEntryReplies, setEntryReply, dropEntryReply, type Entry, type EntryDraft,
} from './after-dark';
import { doorwayPage, roomPage, roomErrorPage, afterDarkAdminPage } from './after-dark-views';
```

2. **Constants:**

```ts
const ENTRIES_KEY = 'after_dark';
const ENTRY_REPLIES_KEY = 'after_dark_replies';
const DOOR_COOKIE = 'notes_door';
```

3. **Loaders**, next to `loadReplies`:

```ts
async function loadEntries(kv: KV): Promise<Entry[]> {
  return parseEntries(await kv.get(ENTRIES_KEY));
}

async function loadEntryReplies(kv: KV) {
  return parseEntryReplies(await kv.get(ENTRY_REPLIES_KEY));
}
```

4. **Generalize `updateReplies`** into a helper that works for any stored list. Keep its comment, and update its two callers to `updateStored(env.NOTES, REPLIES_KEY, parseReplies, (r) => …)`:

```ts
async function updateStored<T>(kv: KV, key: string, parse: (raw: string) => T[], change: (items: T[]) => T[]): Promise<void> {
  try {
    const raw = await kv.get(key);
    if (raw === null) return;
    const before = parse(raw);
    const after = change(before);
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    await kv.put(key, JSON.stringify(after));
  } catch (error) {
    console.error(`Could not update ${key}`, error);
  }
}
```

5. **Orphan clean-up across notes and entries.** Replace `retireOrphans` with one that takes key lists:

```ts
// Files no longer referenced by any note or entry go to a trash list and are deleted a day later.
// The delay protects against a stale KV read putting a reference back; such files are rescued.
// Best-effort: the change is already saved when this runs.
async function retireOrphans(env: Env, before: string[], inUse: string[], now: Date): Promise<void> {
  try {
    const keep = new Set(inUse);
    let trash = parseTrash(await env.NOTES.get(TRASH_KEY)).filter((e) => !keep.has(e.key));
    for (const key of before) {
      if (!keep.has(key) && !trash.some((e) => e.key === key)) trash.push({ key, at: now.getTime() });
    }
    const due = trash.filter((e) => now.getTime() - e.at >= TRASH_GRACE_MS);
    if (due.length > 0) {
      await env.MEDIA.delete(due.map((e) => e.key));
      trash = trash.filter((e) => !due.includes(e));
    }
    await env.NOTES.put(TRASH_KEY, JSON.stringify(trash));
  } catch (error) {
    console.error('Could not clean up media', error);
  }
}

// Every file still referenced. Keys are unique per upload, so if entries can't be read
// the note side still never touches an entry's file.
async function keysInUse(kv: KV, notes: Note[], entries?: Entry[]): Promise<string[]> {
  const others = entries ?? (await tryLoad(() => loadEntries(kv), 'after dark')) ?? [];
  return [...notes.flatMap(attachmentKeys), ...entryKeys(others)];
}
```

In `adminAction`, replace both `await retireOrphans(env, notes, next, now);` with:

```ts
    await retireOrphans(env, notes.flatMap(attachmentKeys), await keysInUse(env.NOTES, next), now);
```

6. **`showMedia`:**

```ts
async function showMedia(
  request: Request, env: Env, cfg: Config, now: Date, key: string, asAdmin: boolean,
): Promise<Response> {
  const session = asAdmin ? await adminSession(request, cfg, now) : await readerSession(request, cfg, now);
  if (!session) return notFound();
  const note = findByMediaKey(await loadNotes(env.NOTES), key);
  if (note) {
    if (!asAdmin && note.date > todayInCopenhagen(now)) return notFound();
  } else {
    const entry = (await tryLoad(() => loadEntries(env.NOTES), 'after dark'))?.find((e) => e.audio?.key === key);
    if (!entry || (!asAdmin && !(await doorOpen(request, cfg, now, session)))) return notFound();
  }
  return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
}

async function doorOpen(request: Request, cfg: Config, now: Date, session: string): Promise<boolean> {
  return verifyDoor(readCookie(request, DOOR_COOKIE), session, cfg.secret, now.getTime());
}
```

7. **`showReader`:** add the link.

```ts
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  // inside readerPage({...}):
    afterDark: entries && entries.length ? { href: `${cfg.base}/after-dark`, newest: entries[0].id } : null,
```

8. **The reader side of after dark:**

```ts
async function showAfterDark(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const csrf = await csrfToken(session, cfg.secret);
  if (!(await doorOpen(request, cfg, now, session))) {
    return html(doorwayPage({ enter: `${cfg.base}/after-dark/enter`, csrf, back: cfg.base }));
  }
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  if (!entries) return html(roomErrorPage(), 500);
  return html(roomPage({
    entries,
    replies: await tryLoad(() => loadEntryReplies(kv), 'after dark replies'),
    mediaBase: `${cfg.base}/media`,
    leave: `${cfg.base}/after-dark/leave`,
    reply: { action: `${cfg.base}/after-dark/reply`, csrf },
    unsent: url.searchParams.get('unsent') ?? undefined,
  }));
}

async function enterAfterDark(request: Request, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const door = await createDoor(session, cfg.secret, now.getTime());
  return redirect(`${cfg.base}/after-dark`, { 'Set-Cookie': doorCookie(door, cfg.base) });
}

// Leaving needs no token: the worst a forged request can do is close the door.
function leaveAfterDark(cfg: Config): Response {
  return redirect(cfg.base, { 'Set-Cookie': closedDoorCookie(cfg.base) });
}

async function handleEntryReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const room = `${cfg.base}/after-dark`;
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  if (!(await doorOpen(request, cfg, now, session))) return redirect(room);
  const id = field(form, 'id');
  if (!(await loadEntries(kv)).some((e) => e.id === id)) return notFound();
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return redirect(`${room}?unsent=${id}#entry-${id}`);
  await kv.put(ENTRY_REPLIES_KEY, JSON.stringify(setEntryReply(await loadEntryReplies(kv), id, answer, now.toISOString())));
  return redirect(`${room}#entry-${id}`);
}
```

`id` is safe in `Location`: it matched a stored entry id, which `parseEntries` validated as a UUID.

9. **The admin side of after dark:**

```ts
interface AfterDarkView {
  editing?: Entry;
  draft?: EntryDraft;
  flash?: string;
  error?: string;
}

async function renderAfterDarkAdmin(kv: KV, cfg: Config, session: string, view: AfterDarkView, status = 200): Promise<Response> {
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  const replies = await tryLoad(() => loadEntryReplies(kv), 'after dark replies');
  const problems = [entries ? '' : 'Entries could not be read.', replies ? '' : 'Replies could not be read.'];
  return html(afterDarkAdminPage({
    base: cfg.base,
    csrf: await csrfToken(session, cfg.secret),
    entries: entries ?? [],
    replies: replies ?? [],
    draft: view.draft ?? (view.editing ? { title: view.editing.title, text: view.editing.text } : EMPTY_ENTRY),
    editing: view.editing,
    flash: view.flash,
    error: [view.error ?? '', ...problems].filter(Boolean).join(' ') || undefined,
  }), status);
}

async function showAfterDarkAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const editId = url.searchParams.get('edit');
  const editing = editId ? (await tryLoad(() => loadEntries(kv), 'after dark'))?.find((e) => e.id === editId) : undefined;
  const msg = url.searchParams.get('msg') ?? '';
  return renderAfterDarkAdmin(kv, cfg, session, { editing, flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined });
}

async function showAfterDarkPreview(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  if (!entries) return html(roomErrorPage(), 500);
  return html(roomPage({
    entries, replies: await tryLoad(() => loadEntryReplies(kv), 'after dark replies'),
    mediaBase: `${cfg.base}/admin/media`, preview: true,
  }));
}

async function afterDarkAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const home = `${cfg.base}/admin/after-dark`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  // Both loads throw on corrupt data, before anything is written.
  const entries = await loadEntries(env.NOTES);
  const notes = await loadNotes(env.NOTES);
  const id = field(form, 'id');
  const existing = entries.find((e) => e.id === id);

  if (action === 'delete') {
    if (!existing) return redirect(`${home}?msg=deleted`);
    const next = removeEntry(entries, id);
    await env.NOTES.put(ENTRIES_KEY, JSON.stringify(next));
    await retireOrphans(env, entryKeys([existing]), await keysInUse(env.NOTES, notes, next), now);
    await updateStored(env.NOTES, ENTRY_REPLIES_KEY, parseEntryReplies, (r) => dropEntryReply(r, id));
    return redirect(`${home}?msg=deleted`);
  }

  if (id && !existing) return notFound();
  const parsed = parseEntryForm((name) => field(form, name));
  const audioFile = uploadedFile(form, 'audio');
  const audioCheck = audioFile ? checkFile('audio', audioFile) : null;
  const errors = [parsed.error ?? '', audioCheck && !audioCheck.ok ? audioCheck.error : ''].filter(Boolean);
  if (errors.length > 0) {
    return renderAfterDarkAdmin(env.NOTES, cfg, session, { editing: existing, draft: parsed.draft, error: errors.join(' ') }, 400);
  }
  const entry: Entry = {
    id: existing?.id ?? crypto.randomUUID(),
    title: parsed.draft.title,
    text: parsed.draft.text,
    created: existing?.created ?? now.toISOString(),
  };
  const audio = await storeUpload(
    env.MEDIA, 'audio', audioFile, audioCheck?.ok ? audioCheck.type : undefined,
    field(form, 'remove_audio') === '1' ? undefined : existing?.audio,
  );
  if (audio) entry.audio = audio;
  const next = upsertEntry(entries, entry);
  await env.NOTES.put(ENTRIES_KEY, JSON.stringify(next));
  await retireOrphans(env, entryKeys(entries), await keysInUse(env.NOTES, notes, next), now);
  return redirect(`${home}?msg=saved`);
}
```

The corrupt-value test expects the save to return 500. `loadEntries` throws, the top-level catch returns 500, and nothing is written.

10. **Routes** (add to the `switch`):

```ts
      case 'GET /after-dark': return await showAfterDark(request, kv, cfg, now, url);
      case 'POST /after-dark/enter': return await enterAfterDark(request, cfg, now);
      case 'POST /after-dark/leave': return leaveAfterDark(cfg);
      case 'POST /after-dark/reply': return await handleEntryReply(request, kv, cfg, now);
      case 'GET /admin/after-dark': return await showAfterDarkAdmin(request, kv, cfg, now, url);
      case 'GET /admin/after-dark/preview': return await showAfterDarkPreview(request, kv, cfg, now);
      case 'POST /admin/after-dark/save': return await afterDarkAction(request, env, cfg, now, 'save');
      case 'POST /admin/after-dark/delete': return await afterDarkAction(request, env, cfg, now, 'delete');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: PASS, all of the routes tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test`, then `npx tsc --noEmit -p . 2>&1 | grep -c error`
Expected: all tests pass, and the type error count equals the pre-existing 6.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts tests/notes-routes.test.ts
git commit -m "Open the after dark room behind a doorway, with admin, sounds and replies"
```

---

### Task 6: README and browser check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document**

Add after the replies bullet in "Private notes":

```markdown
- After dark: a second room (`<NOTES_PATH>/after-dark`) behind a doorway, reached from a quiet link at the bottom of the reader page once there is at least one entry. Entering sets a 30-minute door cookie bound to the reader session; "Leave" closes it. Entries (`after_dark` in KV: optional title, text, optional sound) are written at `<NOTES_PATH>/admin/after-dark`; replies go to `after_dark_replies`. Entry sounds are served only while the door is open. Older Worker versions ignore both keys.
```

- [ ] **Step 2: Browser check**

Run `npx astro build && npx wrangler dev --port 8787` (local KV only). Then check, with Playwright at 375×553 and 1280×800:
- **Before any entry:** no moon link.
- **Write an entry in local admin** (title, text, a sound), then check its preview.
- **Reader page:** the moon link sits at the bottom with a glowing dot. It is still visible, just without the dot, in a context with storage blocked (an init script that makes `localStorage` throw), and there are no console errors.
- **Doorway:** looks right, and "Come in" opens the room.
- **The room:**
  - check the look;
  - the sound plays;
  - the reply round trip works;
  - "Leave" returns to the notes;
  - opening `/after-dark` again shows the doorway.
- **The dot goes out** after visiting the room.
- **Reduced motion** and **no JavaScript** both still work.

Stop workerd when done.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the after dark room"
```

Deploying is a separate, confirmed step: back up `notes`, `meetings`, `replies`, `after_dark` and `after_dark_replies` (counts only, skipping keys that don't exist yet), then merge, test, push, and compare after deploy.
