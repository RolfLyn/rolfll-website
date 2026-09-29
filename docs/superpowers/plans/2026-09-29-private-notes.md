# Private Daily Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden, password-protected reader page with a daily message and archive, plus an admin page for queuing messages, to the existing rolfll.com Cloudflare Worker.

**Architecture:** A small TypeScript Worker script (`worker/`) is added in front of the existing static-assets Worker. Requests under a secret path (from the `NOTES_PATH` secret) are handled by the script; everything else goes to the `ASSETS` binding unchanged. Messages live as one JSON array in a KV namespace. HTML is rendered as strings in the Worker, so nothing private enters `dist/` or the public repo.

**Tech Stack:** Cloudflare Workers (wrangler 4, static assets + KV), TypeScript, Web Crypto (HMAC-SHA256), Vitest on Node 24 (uses Node's built-in `Request`/`Response`/`crypto.subtle`, no extra deps).

**Spec:** `docs/superpowers/specs/2026-09-29-private-notes-design.md`

## Global Constraints

- The repo is **public**: never commit messages, passwords, the real notes path, or `.dev.vars`. Use `/for-you` only as an example/test value.
- **Pushing `master` to origin deploys the site** (Cloudflare Workers Builds). Do not push until Task 7.
- No new npm dependencies.
- "Today" = calendar date in `Europe/Copenhagen`.
- Every notes response carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`; every HTML page carries `<meta name="robots" content="noindex, nofollow">`.
- Session cookies last 90 days, `HttpOnly; Secure; SameSite=Lax`. Reader cookie `notes_reader` (Path = base), admin cookie `notes_admin` (Path = base + `/admin`).
- Lockout: 5 failed logins per IP, 15-minute TTL restarting on each failure.
- Max message length: 5000 characters.
- House style for visible copy: no em dashes (U+2014).
- Main site behavior and existing tests must be unchanged; `npm test` must pass after every task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Corrupt or hand-edited KV value**: reader and admin show an error page (500), and a save does not overwrite the bad value with a fresh list. Tested in Task 5.
2. **Message containing HTML, quotes, emoji, or line breaks**: shown literally, line breaks preserved, never interpreted as markup. Tested in Tasks 4 and 5.
3. **Trailing slashes** (`/for-you/`, `/for-you/admin/`): behave like the canonical paths. Tested in Task 5.
4. **Look-alike paths** (`/for-youth`, `/works`, `/`): go to static assets untouched, never to the notes code. Tested in Task 5.
5. **Stale or foreign cookies** (reader cookie on admin, cookie signed with an old `COOKIE_SECRET`, expired cookie): treated as logged out, never an error. Tested in Tasks 3 and 5.

## File Structure

| File | Responsibility |
|---|---|
| `worker/types.ts` | `Env` and minimal `KV` interfaces |
| `worker/dates.ts` | Copenhagen "today", date validation, date arithmetic, next empty date |
| `worker/notes.ts` | `Note` type, parsing stored JSON, reader selection, upsert/remove |
| `worker/auth.ts` | password check, signed sessions, CSRF tokens, cookie helpers, login lockout |
| `worker/views.ts` | HTML for reader login, reader, error, admin login, admin pages |
| `worker/index.ts` | routing, KV load/store, request handlers, Worker entry |
| `tests/notes-helpers.ts` | in-memory KV stub for tests |
| `tests/notes-*.test.ts` | unit and route tests |
| `wrangler.jsonc` | add `main`, `ASSETS` binding, `NOTES` KV binding |
| `.gitignore` | add `.dev.vars`, `.wrangler/` |
| `README.md` | short "Private notes" section: setup and daily use |

---

### Task 1: Date helpers

**Files:**
- Create: `worker/dates.ts`
- Test: `tests/notes-dates.test.ts`

**Interfaces:**
- Produces: `todayInCopenhagen(now?: Date): string`, `isValidDate(value: string): boolean`, `addDays(date: string, days: number): string`, `nextEmptyDate(taken: string[], today: string): string`. All dates are `YYYY-MM-DD` strings.

- [ ] **Step 1: Write the failing test**

`tests/notes-dates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { todayInCopenhagen, isValidDate, addDays, nextEmptyDate } from '../worker/dates';

describe('todayInCopenhagen', () => {
  it('uses summer time (UTC+2) in summer', () => {
    expect(todayInCopenhagen(new Date('2026-10-01T21:59:00Z'))).toBe('2026-10-01');
    expect(todayInCopenhagen(new Date('2026-10-01T22:00:00Z'))).toBe('2026-10-02');
  });

  it('uses winter time (UTC+1) in winter', () => {
    expect(todayInCopenhagen(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
    expect(todayInCopenhagen(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });

  it('handles the DST switch days', () => {
    expect(todayInCopenhagen(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
    expect(todayInCopenhagen(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDate('2026-10-01')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('2026-10-01x')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('nextEmptyDate', () => {
  it('is today when today is free', () => {
    expect(nextEmptyDate([], '2026-10-01')).toBe('2026-10-01');
    expect(nextEmptyDate(['2026-09-01'], '2026-10-01')).toBe('2026-10-01');
  });

  it('skips taken days and fills the first gap', () => {
    expect(nextEmptyDate(['2026-10-01', '2026-10-02'], '2026-10-01')).toBe('2026-10-03');
    expect(nextEmptyDate(['2026-10-01', '2026-10-03'], '2026-10-01')).toBe('2026-10-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes-dates.test.ts`
Expected: FAIL, cannot resolve `../worker/dates`.

- [ ] **Step 3: Write minimal implementation**

`worker/dates.ts`:
```ts
const TIME_ZONE = 'Europe/Copenhagen';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayInCopenhagen(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextEmptyDate(taken: string[], today: string): string {
  const takenSet = new Set(taken);
  let date = today;
  while (takenSet.has(date)) date = addDays(date, 1);
  return date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes-dates.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add worker/dates.ts tests/notes-dates.test.ts
git commit -m "Add Copenhagen date helpers for private notes"
```

---

### Task 2: Note selection and storage format

**Files:**
- Create: `worker/notes.ts`
- Test: `tests/notes-notes.test.ts`

**Interfaces:**
- Produces: `interface Note { date: string; text: string }`, `interface ReaderView { current: Note | null; archive: Note[] }`, `parseNotes(raw: string | null): Note[]` (throws on malformed data), `sortNewestFirst(notes: Note[]): Note[]`, `selectForReader(notes: Note[], today: string): ReaderView`, `upsertNote(notes: Note[], note: Note): Note[]`, `removeNote(notes: Note[], date: string): Note[]`.

- [ ] **Step 1: Write the failing test**

`tests/notes-notes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseNotes, selectForReader, upsertNote, removeNote, sortNewestFirst } from '../worker/notes';

const n = (date: string, text = `note ${date}`) => ({ date, text });

describe('selectForReader', () => {
  it('shows the latest note up to today and archives the rest, newest first', () => {
    const view = selectForReader([n('2026-09-28'), n('2026-10-02'), n('2026-09-30')], '2026-10-01');
    expect(view.current).toEqual(n('2026-09-30'));
    expect(view.archive).toEqual([n('2026-09-28')]);
  });

  it('never exposes future notes', () => {
    const view = selectForReader([n('2026-09-28'), n('2026-10-02')], '2026-10-01');
    expect(JSON.stringify(view)).not.toContain('2026-10-02');
  });

  it("shows today's note when there is one", () => {
    expect(selectForReader([n('2026-09-30'), n('2026-10-01')], '2026-10-01').current).toEqual(n('2026-10-01'));
  });

  it('is empty when nothing is visible yet', () => {
    expect(selectForReader([], '2026-10-01')).toEqual({ current: null, archive: [] });
    expect(selectForReader([n('2026-10-05')], '2026-10-01')).toEqual({ current: null, archive: [] });
  });
});

describe('upsertNote / removeNote', () => {
  it('replaces the note for an existing date and keeps newest-first order', () => {
    const notes = upsertNote([n('2026-10-01', 'old'), n('2026-09-01')], n('2026-10-01', 'new'));
    expect(notes).toEqual([n('2026-10-01', 'new'), n('2026-09-01')]);
    expect(upsertNote(notes, n('2026-11-01'))[0]).toEqual(n('2026-11-01'));
  });

  it('removes by date', () => {
    expect(removeNote([n('2026-10-01'), n('2026-09-01')], '2026-10-01')).toEqual([n('2026-09-01')]);
  });

  it('sorts newest first without mutating input', () => {
    const input = [n('2026-01-01'), n('2026-03-01')];
    expect(sortNewestFirst(input).map((x) => x.date)).toEqual(['2026-03-01', '2026-01-01']);
    expect(input[0].date).toBe('2026-01-01');
  });
});

describe('parseNotes', () => {
  it('treats a missing value as no notes', () => {
    expect(parseNotes(null)).toEqual([]);
  });

  it('parses a stored list', () => {
    expect(parseNotes('[{"date":"2026-10-01","text":"hi"}]')).toEqual([n('2026-10-01', 'hi')]);
  });

  it('throws on anything malformed instead of returning an empty list', () => {
    expect(() => parseNotes('garbage')).toThrow();
    expect(() => parseNotes('{"date":"2026-10-01"}')).toThrow();
    expect(() => parseNotes('[{"date":"nope","text":"x"}]')).toThrow();
    expect(() => parseNotes('[{"date":"2026-10-01","text":5}]')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: FAIL, cannot resolve `../worker/notes`.

- [ ] **Step 3: Write minimal implementation**

`worker/notes.ts`:
```ts
import { isValidDate } from './dates';

export interface Note {
  date: string;
  text: string;
}

export interface ReaderView {
  current: Note | null;
  archive: Note[];
}

export function parseNotes(raw: string | null): Note[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored notes are not a list');
  for (const item of data) {
    if (
      typeof item !== 'object' || item === null ||
      typeof item.date !== 'string' || !isValidDate(item.date) ||
      typeof item.text !== 'string'
    ) {
      throw new Error('Stored notes contain an invalid entry');
    }
  }
  return data.map((item) => ({ date: item.date, text: item.text }));
}

export function sortNewestFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function selectForReader(notes: Note[], today: string): ReaderView {
  const visible = sortNewestFirst(notes.filter((note) => note.date <= today));
  return { current: visible[0] ?? null, archive: visible.slice(1) };
}

export function upsertNote(notes: Note[], note: Note): Note[] {
  return sortNewestFirst([...notes.filter((n) => n.date !== note.date), note]);
}

export function removeNote(notes: Note[], date: string): Note[] {
  return notes.filter((n) => n.date !== date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/notes.ts tests/notes-notes.test.ts
git commit -m "Add note selection and storage parsing for private notes"
```

---

### Task 3: Auth (passwords, sessions, CSRF, cookies, lockout)

**Files:**
- Create: `worker/types.ts`, `worker/auth.ts`, `tests/notes-helpers.ts`
- Test: `tests/notes-auth.test.ts`

**Interfaces:**
- Produces (`worker/types.ts`):
  ```ts
  export interface KV {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  }
  export interface Env {
    NOTES: KV;
    ASSETS: { fetch(request: Request): Promise<Response> };
    NOTES_PATH?: string;
    READER_PASSWORD?: string;
    ADMIN_PASSWORD?: string;
    COOKIE_SECRET?: string;
  }
  ```
- Produces (`worker/auth.ts`): `type Role = 'reader' | 'admin'`, `SESSION_DAYS = 90`, `MAX_FAILURES = 5`, `LOCKOUT_SECONDS = 900`, `passwordMatches(given, expected, secret): Promise<boolean>`, `createSession(role, secret, nowMs): Promise<string>`, `verifySession(value: string | undefined, role, secret, nowMs): Promise<boolean>`, `csrfToken(session, secret): Promise<string>`, `verifyCsrf(token: string, session, secret): Promise<boolean>`, `readCookie(request: Request, name: string): string | undefined`, `sessionCookie(name, value, path): string`, `isLockedOut(kv: KV, ip: string): Promise<boolean>`, `recordFailure(kv: KV, ip: string): Promise<void>`.
- Produces (`tests/notes-helpers.ts`): `memoryKV()` returning `KV & { data: Map<string, string>; puts: { key: string; value: string; options?: { expirationTtl?: number } }[] }`.

- [ ] **Step 1: Write the types and test helper**

`worker/types.ts`: exactly the block above.

`tests/notes-helpers.ts`:
```ts
import type { KV } from '../worker/types';

export function memoryKV() {
  const data = new Map<string, string>();
  const puts: { key: string; value: string; options?: { expirationTtl?: number } }[] = [];
  const kv: KV & { data: typeof data; puts: typeof puts } = {
    data,
    puts,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, options) {
      data.set(key, value);
      puts.push({ key, value, options });
    },
  };
  return kv;
}
```

- [ ] **Step 2: Write the failing test**

`tests/notes-auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  passwordMatches, createSession, verifySession, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure,
} from '../worker/auth';
import { memoryKV } from './notes-helpers';

const SECRET = 'test-secret';
const DAY = 86_400_000;

describe('passwordMatches', () => {
  it('matches only the exact password', async () => {
    expect(await passwordMatches('open sesame', 'open sesame', SECRET)).toBe(true);
    expect(await passwordMatches('open sesam', 'open sesame', SECRET)).toBe(false);
    expect(await passwordMatches('', 'open sesame', SECRET)).toBe(false);
  });
});

describe('sessions', () => {
  it('round-trips for the same role within 90 days', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'reader', SECRET, 89 * DAY)).toBe(true);
  });

  it('expires after 90 days', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'reader', SECRET, 91 * DAY)).toBe(false);
  });

  it('does not accept a reader session as admin', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession(s.replace(/^reader/, 'admin'), 'admin', SECRET, 1)).toBe(false);
  });

  it('rejects tampering, a different secret, and garbage', async () => {
    const s = await createSession('admin', SECRET, 0);
    const [role, , sig] = s.split('.');
    expect(await verifySession(`${role}.${999 * DAY}.${sig}`, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession(s, 'admin', 'rotated-secret', 1)).toBe(false);
    expect(await verifySession(undefined, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession('nonsense', 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession('admin.abc.def', 'admin', SECRET, 1)).toBe(false);
  });
});

describe('csrf', () => {
  it('is bound to the session it was made for', async () => {
    const a = await createSession('admin', SECRET, 0);
    const b = await createSession('admin', SECRET, 1000);
    const token = await csrfToken(a, SECRET);
    expect(await verifyCsrf(token, a, SECRET)).toBe(true);
    expect(await verifyCsrf(token, b, SECRET)).toBe(false);
    expect(await verifyCsrf('', a, SECRET)).toBe(false);
  });
});

describe('cookies', () => {
  it('reads a named cookie from the header', () => {
    const req = new Request('https://x.test/', { headers: { Cookie: 'a=1; notes_reader=r.2.sig; b=3' } });
    expect(readCookie(req, 'notes_reader')).toBe('r.2.sig');
    expect(readCookie(req, 'notes_admin')).toBeUndefined();
    expect(readCookie(new Request('https://x.test/'), 'notes_reader')).toBeUndefined();
  });

  it('builds a hardened 90-day cookie scoped to a path', () => {
    const c = sessionCookie('notes_reader', 'v', '/for-you');
    expect(c).toContain('notes_reader=v');
    expect(c).toContain('Path=/for-you');
    expect(c).toContain('Max-Age=7776000');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
  });
});

describe('lockout', () => {
  it('locks an IP out after 5 failures with a 15 minute TTL', async () => {
    const kv = memoryKV();
    for (let i = 0; i < 4; i++) await recordFailure(kv, '1.2.3.4');
    expect(await isLockedOut(kv, '1.2.3.4')).toBe(false);
    await recordFailure(kv, '1.2.3.4');
    expect(await isLockedOut(kv, '1.2.3.4')).toBe(true);
    expect(await isLockedOut(kv, '5.6.7.8')).toBe(false);
    expect(kv.puts.every((p) => p.options?.expirationTtl === 900)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/notes-auth.test.ts`
Expected: FAIL, cannot resolve `../worker/auth`.

- [ ] **Step 4: Write minimal implementation**

`worker/auth.ts`:
```ts
import type { KV } from './types';

export type Role = 'reader' | 'admin';

export const SESSION_DAYS = 90;
export const MAX_FAILURES = 5;
export const LOCKOUT_SECONDS = 900;

const SESSION_MS = SESSION_DAYS * 86_400_000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Compares fixed-length HMACs so timing does not reveal the password's length or prefix.
export async function passwordMatches(given: string, expected: string, secret: string): Promise<boolean> {
  return timingSafeEqual(await hmac(secret, `pw:${given}`), await hmac(secret, `pw:${expected}`));
}

export async function createSession(role: Role, secret: string, nowMs: number): Promise<string> {
  const payload = `${role}.${nowMs + SESSION_MS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(
  value: string | undefined, role: Role, secret: string, nowMs: number,
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [valueRole, expires, signature] = parts;
  if (valueRole !== role) return false;
  const expiresMs = Number(expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
  return timingSafeEqual(signature, await hmac(secret, `${valueRole}.${expires}`));
}

export async function csrfToken(session: string, secret: string): Promise<string> {
  return hmac(secret, `csrf:${session}`);
}

export async function verifyCsrf(token: string, session: string, secret: string): Promise<boolean> {
  return token !== '' && timingSafeEqual(token, await csrfToken(session, secret));
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function sessionCookie(name: string, value: string, path: string): string {
  return `${name}=${value}; Path=${path}; Max-Age=${SESSION_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`;
}

async function failureCount(kv: KV, ip: string): Promise<number> {
  return Number((await kv.get(`fail:${ip}`)) ?? 0);
}

export async function isLockedOut(kv: KV, ip: string): Promise<boolean> {
  return (await failureCount(kv, ip)) >= MAX_FAILURES;
}

export async function recordFailure(kv: KV, ip: string): Promise<void> {
  await kv.put(`fail:${ip}`, String((await failureCount(kv, ip)) + 1), { expirationTtl: LOCKOUT_SECONDS });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/notes-auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/types.ts worker/auth.ts tests/notes-helpers.ts tests/notes-auth.test.ts
git commit -m "Add signed sessions, CSRF and login lockout for private notes"
```

---

### Task 4: HTML views

**Files:**
- Create: `worker/views.ts`
- Test: `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `Note` from `worker/notes.ts`.
- Produces: `escapeHtml(value: string): string`, `formatDate(date: string): string`, `readerLoginPage(opts: { action: string; error?: string }): string`, `readerPage(view: { current: Note | null; archive: Note[] }): string`, `errorPage(message: string): string`, `adminLoginPage(opts: { action: string; error?: string }): string`, `interface AdminPageData { base: string; today: string; current: Note | null; notes: Note[]; form: Note; csrf: string; flash?: string }`, `adminPage(data: AdminPageData): string`.

- [ ] **Step 1: Write the failing test**

`tests/notes-views.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  escapeHtml, formatDate, readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage,
} from '../worker/views';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const admin = adminPage({
  base: '/for-you',
  today: '2026-10-01',
  current: { date: '2026-10-01', text: 'today' },
  notes: [{ date: '2026-10-03', text: 'later' }, { date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'before' }],
  form: { date: '2026-10-02', text: '' },
  csrf: 'tok123',
  flash: 'Saved.',
});
const pages = [
  readerLoginPage({ action: '/for-you/login', error: 'nope' }),
  readerPage({ current: { date: '2026-10-01', text: 'hi' }, archive: [{ date: '2026-09-30', text: 'yo' }] }),
  readerPage({ current: null, archive: [] }),
  errorPage('oops'),
  adminLoginPage({ action: '/for-you/admin/login' }),
  admin,
];

describe('views', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });

  it('formats dates in a readable way', () => {
    const s = formatDate('2026-10-01');
    expect(s).toContain('Thursday');
    expect(s).toContain('1 October 2026');
  });

  it('marks every page noindex and avoids em dashes', () => {
    for (const page of pages) {
      expect(page).toContain(ROBOTS);
      expect(page).not.toContain('—');
    }
  });

  it('shows message text literally, never as markup', () => {
    const page = readerPage({ current: { date: '2026-10-01', text: '<b>hi</b> & "you"\nline two 💛' }, archive: [] });
    expect(page).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;\nline two 💛');
    expect(page).not.toContain('<b>hi</b>');
  });

  it('shows current note and archive on the reader page', () => {
    const page = pages[1];
    expect(page).toContain('hi');
    expect(page).toContain('yo');
    expect(page).toContain('Earlier notes');
  });

  it('shows a gentle placeholder when there is nothing yet', () => {
    expect(pages[2]).toContain('Nothing here yet');
  });

  it('reader login has a password field posting to the action, and shows the error', () => {
    expect(pages[0]).toContain('type="password"');
    expect(pages[0]).toContain('action="/for-you/login"');
    expect(pages[0]).toContain('nope');
  });

  it('admin page carries csrf, prefilled date, statuses, and edit/delete controls', () => {
    expect(admin).toContain('name="csrf" value="tok123"');
    expect(admin).toContain('name="date" value="2026-10-02"');
    expect(admin).toContain('Showing now');
    expect(admin).toContain('Queued');
    expect(admin).toContain('Past');
    expect(admin).toContain('href="/for-you/admin?edit=2026-10-03"');
    expect(admin).toContain('action="/for-you/admin/delete"');
    expect(admin).toContain('action="/for-you/admin/save"');
    expect(admin).toContain('Saved.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: FAIL, cannot resolve `../worker/views`.

- [ ] **Step 3: Write minimal implementation**

`worker/views.ts`:
```ts
import type { Note } from './notes';

const LOCALE = 'en-GB';
const ROBOTS = '<meta name="robots" content="noindex, nofollow">';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

const READER_STYLE = `
:root { --paper: #f6efe3; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 36rem; margin: 0 auto; padding: 16vh 1.25rem 4rem; }
.date { color: var(--muted); font-style: italic; font-size: 1.05rem; margin: 0 0 1rem; }
.message { font-size: clamp(1.6rem, 5vw, 2.2rem); line-height: 1.35; white-space: pre-line; margin: 0; animation: rise 1.8s ease-out both; }
.heart { color: var(--accent); text-align: center; margin: 3.5rem 0 2.5rem; }
.archive h2 { font-weight: 500; font-style: italic; font-size: 1.1rem; color: var(--muted); margin: 0 0 1.5rem; }
.archive article { border-top: 1px solid var(--line); padding: 1.25rem 0; }
.archive .date { font-size: 0.95rem; margin-bottom: 0.4rem; }
.archive p.text { margin: 0; font-size: 1.2rem; line-height: 1.45; white-space: pre-line; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.4rem; }
form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 20rem; }
input { font: inherit; font-size: 1.2rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); }
button { font: inherit; font-size: 1.15rem; padding: 0.55rem 1rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
.error { color: var(--accent); font-style: italic; margin: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .message { animation: none; } }
`;

const ADMIN_STYLE = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #fafafa; color: #222; }
main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
.box { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem 1rem; white-space: pre-line; }
.flash { background: #e8f5e9; padding: 0.5rem 0.75rem; border-radius: 6px; }
form.write, form.login { display: flex; flex-direction: column; gap: 0.6rem; }
input, textarea, button { font: inherit; font-size: 16px; padding: 0.55rem; border: 1px solid #ccc; border-radius: 6px; }
textarea { min-height: 9rem; resize: vertical; }
button { background: #222; color: #fff; border-color: #222; cursor: pointer; }
ul { list-style: none; padding: 0; }
li { border-top: 1px solid #e5e5e5; padding: 0.75rem 0; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #666; }
.tag { font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eee; margin-left: 0.4rem; }
.text { white-space: pre-line; margin: 0.35rem 0 0; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.actions form { display: inline; margin: 0; }
.actions button { padding: 0.2rem 0.6rem; font-size: 0.85rem; background: #fff; color: #a33; border-color: #dbb; }
.error { color: #a33; }
`;

function shell(title: string, style: string, body: string, fonts = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ROBOTS}
<title>${escapeHtml(title)}</title>
${fonts}
<style>${style}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const READER_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap">`;

function readerShell(body: string): string {
  return shell('For you', READER_STYLE, body, READER_FONTS);
}

function adminShell(body: string): string {
  return shell('Notes admin', ADMIN_STYLE, body);
}

function errorLine(error?: string): string {
  return error ? `<p class="error">${escapeHtml(error)}</p>` : '';
}

export function readerLoginPage({ action, error }: { action: string; error?: string }): string {
  return readerShell(`
<p class="quiet">This little corner is just for you.</p>
<form method="post" action="${escapeHtml(action)}">
  <input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" required autofocus>
  <button type="submit">Open</button>
  ${errorLine(error)}
</form>`);
}

export function readerPage({ current, archive }: { current: Note | null; archive: Note[] }): string {
  const today = current
    ? `<p class="date">${formatDate(current.date)}</p>\n<p class="message">${escapeHtml(current.text)}</p>`
    : '<p class="quiet">Nothing here yet. Check back soon.</p>';
  const past = archive.length
    ? `<div class="heart" aria-hidden="true">&#9825;</div>
<section class="archive"><h2>Earlier notes</h2>
${archive.map((n) => `<article><p class="date">${formatDate(n.date)}</p><p class="text">${escapeHtml(n.text)}</p></article>`).join('\n')}
</section>`
    : '';
  return readerShell(today + past);
}

export function errorPage(message: string): string {
  return readerShell(`<p class="quiet">${escapeHtml(message)}</p>`);
}

export function adminLoginPage({ action, error }: { action: string; error?: string }): string {
  return adminShell(`
<h1>Admin</h1>
<form class="login" method="post" action="${escapeHtml(action)}">
  <input type="password" name="password" aria-label="Admin password" placeholder="Admin password" autocomplete="current-password" required autofocus>
  <button type="submit">Log in</button>
  ${errorLine(error)}
</form>`);
}

export interface AdminPageData {
  base: string;
  today: string;
  current: Note | null;
  notes: Note[];
  form: Note;
  csrf: string;
  flash?: string;
}

export function adminPage(d: AdminPageData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const status = (n: Note) => (n.date === d.current?.date ? 'Showing now' : n.date > d.today ? 'Queued' : 'Past');
  const rows = d.notes.map((n) => `<li>
  <div class="meta">
    <span>${formatDate(n.date)}<span class="tag">${status(n)}</span></span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin?edit=${n.date}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/delete`)}" onsubmit="return confirm('Delete this note?')">
        ${csrf}<input type="hidden" name="date" value="${escapeHtml(n.date)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  <p class="text">${escapeHtml(n.text)}</p>
</li>`).join('\n');

  return adminShell(`
<h1>Notes</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
<h2>Showing today (${formatDate(d.today)})</h2>
<div class="box">${d.current ? escapeHtml(d.current.text) : 'Nothing yet.'}</div>
<h2>Write a note</h2>
<form class="write" method="post" action="${escapeHtml(`${d.base}/admin/save`)}">
  ${csrf}
  <input type="date" name="date" value="${escapeHtml(d.form.date)}" required>
  <textarea name="text" maxlength="5000" required placeholder="Today's note">${escapeHtml(d.form.text)}</textarea>
  <button type="submit">Save</button>
</form>
<h2>All notes</h2>
<ul>${rows || '<li>No notes yet.</li>'}</ul>`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: PASS. If the `formatDate` assertion fails because of ICU output differences (e.g. a comma after the weekday), keep the implementation and loosen nothing else: the assertions already only use `toContain` on the weekday and on `1 October 2026`.

- [ ] **Step 5: Commit**

```bash
git add worker/views.ts tests/notes-views.test.ts
git commit -m "Add reader and admin views for private notes"
```

---

### Task 5: Worker routing, KV storage, and wrangler wiring

**Files:**
- Create: `worker/index.ts`
- Modify: `wrangler.jsonc` (whole file), `.gitignore` (append two lines)
- Test: `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: everything produced in Tasks 1–4.
- Produces: `normalizeBase(raw: string | undefined): string | null`, `handleRequest(request: Request, env: Env, now: Date): Promise<Response>`, default export `{ fetch(request: Request, env: Env): Promise<Response> }`.

- [ ] **Step 1: Write the failing test**

`tests/notes-routes.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { handleRequest, normalizeBase } from '../worker/index';
import type { Env } from '../worker/types';
import { memoryKV } from './notes-helpers';

const NOW = new Date('2026-10-01T10:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

function setup(overrides: Partial<Env> = {}) {
  const kv = memoryKV();
  const assets = { fetch: vi.fn(async (r: Request) => new Response(`asset:${new URL(r.url).pathname}`)) };
  const env: Env = {
    NOTES: kv, ASSETS: assets, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
    ...overrides,
  };
  return { env, kv, assets };
}

const get = (path: string, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, {
    method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP,
  });

async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const path = role === 'reader' ? '/for-you/login' : '/for-you/admin/login';
  const res = await handleRequest(post(path, { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}

async function adminCsrf(env: Env, cookie: string): Promise<string> {
  const html = await (await handleRequest(get('/for-you/admin', cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

const seed = (kv: ReturnType<typeof memoryKV>, notes: { date: string; text: string }[]) =>
  kv.data.set('notes', JSON.stringify(notes));

describe('normalizeBase', () => {
  it('normalizes slashes and rejects empty values', () => {
    expect(normalizeBase('/for-you')).toBe('/for-you');
    expect(normalizeBase('for-you/')).toBe('/for-you');
    expect(normalizeBase(' /for-you// ')).toBe('/for-you');
    expect(normalizeBase('/')).toBeNull();
    expect(normalizeBase('')).toBeNull();
    expect(normalizeBase(undefined)).toBeNull();
  });
});

describe('pass-through', () => {
  it('sends the main site and look-alike paths to static assets', async () => {
    const { env, assets } = setup();
    for (const path of ['/', '/works', '/for-youth', '/for-yo']) {
      const res = await handleRequest(get(path), env, NOW);
      expect(await res.text()).toBe(`asset:${path}`);
    }
    expect(assets.fetch).toHaveBeenCalledTimes(4);
  });

  it('serves nothing extra when NOTES_PATH is not set', async () => {
    const { env } = setup({ NOTES_PATH: undefined });
    expect(await (await handleRequest(get('/for-you'), env, NOW)).text()).toBe('asset:/for-you');
  });

  it('fails closed when a secret is missing', async () => {
    const { env } = setup({ COOKIE_SECRET: undefined });
    expect((await handleRequest(get('/for-you'), env, NOW)).status).toBe(503);
  });
});

describe('reader', () => {
  it('shows a noindex login form when logged out', async () => {
    const { env } = setup();
    const res = await handleRequest(get('/for-you'), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('type="password"');
  });

  it('rejects a wrong password and records the failure', async () => {
    const { env, kv } = setup();
    const res = await handleRequest(post('/for-you/login', { password: 'nope' }), env, NOW);
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(kv.data.get('fail:1.2.3.4')).toBe('1');
  });

  it('logs in with the right password and sets a path-scoped cookie', async () => {
    const { env } = setup();
    const res = await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you');
    expect(res.headers.get('Set-Cookie')).toMatch(/^notes_reader=.*Path=\/for-you;/);
  });

  it('locks out after 5 failures, even with the right password', async () => {
    const { env } = setup();
    for (let i = 0; i < 5; i++) await handleRequest(post('/for-you/login', { password: 'x' }), env, NOW);
    const res = await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, NOW);
    expect(res.status).toBe(429);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it("shows today's note and the archive, never future notes, with or without trailing slash", async () => {
    const { env, kv } = setup();
    seed(kv, [
      { date: '2026-10-02', text: 'SECRET FUTURE' },
      { date: '2026-09-30', text: 'Current one' },
      { date: '2026-09-29', text: 'Older one' },
    ]);
    const cookie = await login(env, 'reader');
    for (const path of ['/for-you', '/for-you/']) {
      const html = await (await handleRequest(get(path, cookie), env, NOW)).text();
      expect(html).toContain('Current one');
      expect(html).toContain('Older one');
      expect(html).not.toContain('SECRET FUTURE');
    }
  });

  it('treats a cookie signed with an old secret as logged out', async () => {
    const { env } = setup();
    const cookie = await login(env, 'reader');
    env.COOKIE_SECRET = 'rotated';
    const res = await handleRequest(get('/for-you', cookie), env, NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('type="password"');
  });

  it('returns a noindex 404 for unknown sub-paths', async () => {
    const { env } = setup();
    const res = await handleRequest(get('/for-you/nope'), env, NOW);
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

describe('admin', () => {
  it('does not accept the reader cookie', async () => {
    const { env } = setup();
    const readerCookie = await login(env, 'reader');
    const html = await (await handleRequest(get('/for-you/admin', readerCookie), env, NOW)).text();
    expect(html).toContain('Admin password');
  });

  it('sets the admin cookie on the admin path', async () => {
    const { env } = setup();
    const res = await handleRequest(post('/for-you/admin/login', { password: 'admin-pw' }), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin');
    expect(res.headers.get('Set-Cookie')).toMatch(/^notes_admin=.*Path=\/for-you\/admin;/);
  });

  it('saves a note that the reader then sees, and works with a trailing slash', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    expect((await handleRequest(get('/for-you/admin/', cookie), env, NOW)).status).toBe(200);
    const csrf = await adminCsrf(env, cookie);
    const res = await handleRequest(
      post('/for-you/admin/save', { csrf, date: '2026-10-01', text: '  You are wonderful\r\nTruly  ' }, cookie), env, NOW,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/admin?msg=saved');
    expect(JSON.parse(kv.data.get('notes')!)).toEqual([{ date: '2026-10-01', text: 'You are wonderful\nTruly' }]);
    const readerHtml = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(readerHtml).toContain('You are wonderful\nTruly');
  });

  it('defaults the form date to the first free day and prefills when editing', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }, { date: '2026-10-02', text: 'tomorrow' }]);
    const cookie = await login(env, 'admin');
    const html = await (await handleRequest(get('/for-you/admin', cookie), env, NOW)).text();
    expect(html).toContain('name="date" value="2026-10-03"');
    const edit = await (await handleRequest(get('/for-you/admin?edit=2026-10-02', cookie), env, NOW)).text();
    expect(edit).toContain('name="date" value="2026-10-02"');
    expect(edit).toContain('>tomorrow</textarea>');
  });

  it('refuses a save without a valid csrf token', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    const res = await handleRequest(post('/for-you/admin/save', { csrf: 'forged', date: '2026-10-01', text: 'x' }, cookie), env, NOW);
    expect(res.status).toBe(403);
    expect(kv.data.has('notes')).toBe(false);
  });

  it('refuses a save when not logged in as admin', async () => {
    const { env, kv } = setup();
    const res = await handleRequest(post('/for-you/admin/save', { date: '2026-10-01', text: 'x' }), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/admin');
    expect(kv.data.has('notes')).toBe(false);
  });

  it('rejects invalid input but keeps what was typed', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    const csrf = await adminCsrf(env, cookie);
    for (const fields of [
      { csrf, date: '2026-02-30', text: 'kept text' },
      { csrf, date: '2026-10-01', text: '   ' },
      { csrf, date: '2026-10-01', text: 'x'.repeat(5001) },
    ]) {
      const res = await handleRequest(post('/for-you/admin/save', fields, cookie), env, NOW);
      expect(res.status).toBe(400);
    }
    const res = await handleRequest(post('/for-you/admin/save', { csrf, date: 'bad', text: 'kept text' }, cookie), env, NOW);
    expect(await res.text()).toContain('>kept text</textarea>');
    expect(kv.data.has('notes')).toBe(false);
  });

  it('deletes a note', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'a' }, { date: '2026-09-01', text: 'b' }]);
    const cookie = await login(env, 'admin');
    const csrf = await adminCsrf(env, cookie);
    const res = await handleRequest(post('/for-you/admin/delete', { csrf, date: '2026-10-01' }, cookie), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin?msg=deleted');
    expect(JSON.parse(kv.data.get('notes')!)).toEqual([{ date: '2026-09-01', text: 'b' }]);
  });
});

describe('corrupt storage', () => {
  it('shows an error and never overwrites the stored value', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const readerRes = await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW);
    expect(readerRes.status).toBe(500);
    const cookie = await login(env, 'admin');
    expect((await handleRequest(get('/for-you/admin', cookie), env, NOW)).status).toBe(500);
    // CSRF cannot be read from the (failed) admin page, so compute it the same way the server does.
    const { csrfToken } = await import('../worker/auth');
    const csrf = await csrfToken(cookie.split('=')[1], 'test-secret');
    const saveRes = await handleRequest(post('/for-you/admin/save', { csrf, date: '2026-10-01', text: 'x' }, cookie), env, NOW);
    expect(saveRes.status).toBe(500);
    expect(kv.data.get('notes')).toBe('garbage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: FAIL, cannot resolve `../worker/index`.

- [ ] **Step 3: Write the implementation**

`worker/index.ts`:
```ts
import { todayInCopenhagen, isValidDate, nextEmptyDate } from './dates';
import { parseNotes, selectForReader, upsertNote, removeNote, type Note } from './notes';
import {
  createSession, verifySession, passwordMatches, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, type Role,
} from './auth';
import { readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage } from './views';
import type { Env, KV } from './types';

const NOTES_KEY = 'notes';
const MAX_LENGTH = 5000;
const COOKIE: Record<Role, string> = { reader: 'notes_reader', admin: 'notes_admin' };
const FLASH: Record<string, string> = { saved: 'Saved.', deleted: 'Deleted.' };
const INVALID = `Needs a real date and a message of at most ${MAX_LENGTH} characters.`;

const PAGE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

interface Config {
  base: string;
  readerPassword: string;
  adminPassword: string;
  secret: string;
}

function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...PAGE_HEADERS, ...extra },
  });
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: location, ...PAGE_HEADERS, ...extra } });
}

export function normalizeBase(raw: string | undefined): string | null {
  if (!raw) return null;
  let path = raw.trim().replace(/\/+$/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path.length > 1 ? path : null;
}

async function loadNotes(kv: KV): Promise<Note[]> {
  return parseNotes(await kv.get(NOTES_KEY));
}

async function storeNotes(kv: KV, notes: Note[]): Promise<void> {
  await kv.put(NOTES_KEY, JSON.stringify(notes));
}

async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

async function handleLogin(request: Request, kv: KV, cfg: Config, now: Date, role: Role): Promise<Response> {
  const render = (error: string) =>
    role === 'reader'
      ? readerLoginPage({ action: `${cfg.base}/login`, error })
      : adminLoginPage({ action: `${cfg.base}/admin/login`, error });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isLockedOut(kv, ip)) {
    return html(render('Too many tries. Please wait a few minutes and try again.'), 429);
  }
  const password = field(await readForm(request), 'password');
  const expected = role === 'reader' ? cfg.readerPassword : cfg.adminPassword;
  if (!(await passwordMatches(password, expected, cfg.secret))) {
    await recordFailure(kv, ip);
    return html(render(role === 'reader' ? "That's not quite it. Try again?" : 'Wrong password.'), 401);
  }
  const home = role === 'reader' ? cfg.base : `${cfg.base}/admin`;
  const session = await createSession(role, cfg.secret, now.getTime());
  return redirect(home, { 'Set-Cookie': sessionCookie(COOKIE[role], session, home) });
}

async function showReader(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = readCookie(request, COOKIE.reader);
  if (!(await verifySession(session, 'reader', cfg.secret, now.getTime()))) {
    return html(readerLoginPage({ action: `${cfg.base}/login` }));
  }
  return html(readerPage(selectForReader(await loadNotes(kv), todayInCopenhagen(now))));
}

async function renderAdmin(
  notes: Note[], cfg: Config, now: Date, session: string, form: Note, flash?: string, status = 200,
): Promise<Response> {
  const today = todayInCopenhagen(now);
  return html(adminPage({
    base: cfg.base,
    today,
    current: selectForReader(notes, today).current,
    notes,
    form,
    csrf: await csrfToken(session, cfg.secret),
    flash,
  }), status);
}

async function adminSession(request: Request, cfg: Config, now: Date): Promise<string | null> {
  const session = readCookie(request, COOKIE.admin);
  return session && (await verifySession(session, 'admin', cfg.secret, now.getTime())) ? session : null;
}

async function showAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const notes = await loadNotes(kv);
  const editing = notes.find((n) => n.date === url.searchParams.get('edit'));
  const form = editing ?? { date: nextEmptyDate(notes.map((n) => n.date), todayInCopenhagen(now)), text: '' };
  const msg = url.searchParams.get('msg') ?? '';
  return renderAdmin(notes, cfg, now, session, form, Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined);
}

async function adminAction(
  request: Request, kv: KV, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) {
    return html(errorPage('That form expired. Go back, reload, and try again.'), 403);
  }
  const notes = await loadNotes(kv);
  const date = field(form, 'date');
  if (action === 'delete') {
    await storeNotes(kv, removeNote(notes, date));
    return redirect(`${adminHome}?msg=deleted`);
  }
  const text = field(form, 'text').replace(/\r\n?/g, '\n').trim();
  if (!isValidDate(date) || text === '' || text.length > MAX_LENGTH) {
    return renderAdmin(notes, cfg, now, session, { date, text }, INVALID, 400);
  }
  await storeNotes(kv, upsertNote(notes, { date, text }));
  return redirect(`${adminHome}?msg=saved`);
}

export async function handleRequest(request: Request, env: Env, now: Date): Promise<Response> {
  const base = normalizeBase(env.NOTES_PATH);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!base || (path !== base && !path.startsWith(`${base}/`))) return env.ASSETS.fetch(request);
  if (!env.READER_PASSWORD || !env.ADMIN_PASSWORD || !env.COOKIE_SECRET) {
    return html(errorPage('Not set up yet.'), 503);
  }
  const cfg: Config = {
    base,
    readerPassword: env.READER_PASSWORD,
    adminPassword: env.ADMIN_PASSWORD,
    secret: env.COOKIE_SECRET,
  };
  const kv = env.NOTES;
  try {
    switch (`${request.method} ${path.slice(base.length)}`) {
      case 'GET ': return await showReader(request, kv, cfg, now);
      case 'POST /login': return await handleLogin(request, kv, cfg, now, 'reader');
      case 'GET /admin': return await showAdmin(request, kv, cfg, now, url);
      case 'POST /admin/login': return await handleLogin(request, kv, cfg, now, 'admin');
      case 'POST /admin/save': return await adminAction(request, kv, cfg, now, 'save');
      case 'POST /admin/delete': return await adminAction(request, kv, cfg, now, 'delete');
      default: return html(errorPage('Nothing here.'), 404);
    }
  } catch (error) {
    console.error(error);
    return html(errorPage('Something went wrong loading the notes.'), 500);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, new Date());
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire up wrangler and ignore local secrets**

Replace `wrangler.jsonc` with (the KV `id` is a local placeholder; Task 7 replaces it with the real one before anything is pushed):
```jsonc
{
  "name": "rolfll-website",
  "compatibility_date": "2026-07-20",
  "main": "worker/index.ts",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "kv_namespaces": [
    { "binding": "NOTES", "id": "local-placeholder-set-in-task-7" }
  ]
}
```

Append to `.gitignore`:
```
.dev.vars
.wrangler/
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: Astro build succeeds, all existing tests and all `tests/notes-*.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add worker/index.ts tests/notes-routes.test.ts wrangler.jsonc .gitignore
git commit -m "Route private notes through a Worker script with KV storage"
```

---

### Task 6: Local run-through and README

**Files:**
- Create (not committed): `.dev.vars`
- Modify: `README.md` (append a section)

- [ ] **Step 1: Create local-only secrets**

`.dev.vars` (gitignored; test values only):
```
NOTES_PATH=/for-you
READER_PASSWORD=reader-local
ADMIN_PASSWORD=admin-local
COOKIE_SECRET=local-dev-secret-not-for-production
```
Run: `git status --short` and confirm `.dev.vars` does **not** appear.

- [ ] **Step 2: Build and start the local Worker**

Run: `npx astro build && npx wrangler dev --port 8787` (in the background)
Expected: wrangler reports `Ready on http://localhost:8787` using a local KV simulation.

- [ ] **Step 3: Click through in a browser (Playwright or Chrome tools)**

Check each, and take a screenshot of the reader page on a phone-sized (390px wide) viewport and a desktop viewport:
1. `http://localhost:8787/` and `/works` render the normal site.
2. `/for-you` shows the cream login page; a wrong password shows the kind error.
3. `/for-you/admin` shows the admin login; log in with `admin-local`.
4. Save a note for today, one for yesterday, one for tomorrow. The admin list tags them Showing now / Past / Queued; the date field then defaults to the day after tomorrow.
5. Edit today's note via its Edit link; delete yesterday's note.
6. Open `/for-you`, log in with `reader-local`: today's note fades in, archive shows only past notes, tomorrow's note is absent.
7. Response headers on `/for-you` include `X-Robots-Tag: noindex, nofollow`.

Fix anything broken (with a failing test first if it is logic), then stop the dev server.

- [ ] **Step 4: Document it**

Append to `README.md`:
````markdown
## Private notes

A hidden, password-protected page served by the Worker script in `worker/`. Nothing about it (path, passwords, messages) is stored in this repo.

- Messages live in the `NOTES` KV namespace, as one JSON list under the key `notes`.
- Configuration is Cloudflare secrets: `NOTES_PATH` (e.g. `/for-you`), `READER_PASSWORD`, `ADMIN_PASSWORD`, `COOKIE_SECRET`. Set or change one with `npx wrangler secret put <NAME>`.
- Daily use: open `<NOTES_PATH>/admin`, write a note, pick a date, save. The reader sees the latest note dated today or earlier (Copenhagen time), plus the earlier ones below it.
- Changing `COOKIE_SECRET` logs everyone out. Changing `NOTES_PATH` moves the page.
- Local dev: put test values for the four secrets in `.dev.vars` (gitignored), then `npx astro build && npx wrangler dev`.
````

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document the private notes page"
```

---

### Task 7: Go live (needs Rolf at the keyboard)

Rolf runs the interactive commands himself, prefixed with `!` in Claude Code, so passwords are typed straight into wrangler and never pass through the conversation.

- [ ] **Step 1: Log wrangler in to Cloudflare**

Rolf runs: `! npx wrangler login` (opens a browser to approve).
Verify: `npx wrangler whoami` shows his account.

- [ ] **Step 2: Create the KV namespace**

Run: `npx wrangler kv namespace create NOTES`
Expected: output includes an `id`. Put that id in `wrangler.jsonc` in place of `local-placeholder-set-in-task-7` (namespace IDs are not secret).

- [ ] **Step 3: Set the four secrets on the deployed Worker**

Rolf chooses the path and both passwords, then runs:
```
! npx wrangler secret put NOTES_PATH
! npx wrangler secret put READER_PASSWORD
! npx wrangler secret put ADMIN_PASSWORD
```
Then (random key, never displayed):
```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put COOKIE_SECRET
```
Verify: `npx wrangler secret list` shows all four names.

- [ ] **Step 4: Verify, commit, push (this deploys)**

Run: `npm test` → all pass. Run: `git status --short` → `.dev.vars` absent.
```bash
git add wrangler.jsonc
git commit -m "Point NOTES binding at the production KV namespace"
git push origin master
```
Watch the Cloudflare Workers Builds run for this commit until it reports success.

- [ ] **Step 5: Check production**

1. `https://rolfll.com/`, `/works`, `/resume`, `/contact` look unchanged.
2. `https://rolfll.com/<NOTES_PATH>` shows the cream login page and has `X-Robots-Tag: noindex, nofollow` (`curl -sI`).
3. Rolf logs into `<NOTES_PATH>/admin` on his phone and saves the first real note.
4. Rolf opens `<NOTES_PATH>` in a private window, logs in with the reader password, and sees it.
