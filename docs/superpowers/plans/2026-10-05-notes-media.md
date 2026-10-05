# Private Notes: Photos and Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each private note carry one optional photo and one optional sound clip, stored privately in Cloudflare R2, without disturbing the live text-only notes.

**Architecture:** Notes in KV gain optional `photo`/`audio` attachment refs (`{ key, type }`). Files live in an R2 bucket bound as `MEDIA` and are served only through the Worker behind the existing cookie checks, with HTTP Range support. The admin form becomes multipart; photos are downsized in the browser before upload.

**Tech Stack:** Cloudflare Workers + KV + R2, TypeScript, Vitest on Node 24 (built-in `File`, `FormData`, `Blob`, `crypto.randomUUID`). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-notes-media-design.md` (builds on `docs/superpowers/specs/2026-09-29-private-notes-design.md`)

## Global Constraints

- The repo is **public**: never commit messages, passwords, the real notes path, `.dev.vars`, or the notes backup.
- **Never print or read the content of the live notes.** Only counts, date ranges, and byte-equality comparisons are allowed.
- **Pushing `master` deploys.** Work on branch `notes-media`; do not merge or push until Task 6.
- Stored note format is **additive only**: `{ date, text, photo?: { key, type }, audio?: { key, type } }`. Text-only notes must round-trip byte-identical.
- Media keys: `<uuid>.<ext>` matching `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/`.
- Photo types `image/jpeg, image/png, image/webp, image/gif`, max 10 MB. Sound types `audio/mp4, audio/x-m4a, audio/m4a, audio/mpeg, audio/aac, audio/wav, audio/x-wav`, max 25 MB. Empty/`application/octet-stream` type → infer from extension `.jpg .jpeg .png .webp .gif .m4a .mp3 .aac .wav`.
- Client-side photo resize: longest edge ≤ 1600 px, JPEG quality 0.85; GIFs untouched; undecodable images sent as-is.
- Save order: validate → upload new files to R2 → write KV → delete orphaned files (best-effort). Delete order: write KV → delete files (best-effort).
- Reader may fetch media only for notes dated ≤ today (Copenhagen); admin may fetch any. All other cases 404.
- Media responses: stored `Content-Type`, `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, max-age=86400`.
- No em dashes (U+2014) in visible copy. `npm test` passes after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Text-only edit of a note that has media** keeps its photo and sound (no silent loss). Tested in Task 4.
2. **Unsupported photo from a PC (HEIC, SVG)** gives a clear error, stores nothing, and keeps the typed text. Tested in Task 4.
3. **Live legacy notes** (text only, emoji, line breaks) stay byte-identical when another note with media is saved. Tested in Tasks 1 and 4.
4. **Moving a note onto a date that already has a note** replaces that note and deletes its files, while the moved note keeps its own. Tested in Task 4.
5. **iPhone Safari audio** needs Range responses (206/416). Unit-tested in Task 2, route-tested in Task 4, checked on a real phone in Task 6.

## File Structure

| File | Change |
|---|---|
| `worker/notes.ts` | `Attachment` type, optional `photo`/`audio`, validation in `parseNotes`, `attachmentKeys`, `findByMediaKey` |
| `worker/types.ts` | minimal `R2` interface, `Env.MEDIA` |
| `worker/media.ts` (new) | type/size checks, key generation, Range parsing, `serveMedia` |
| `worker/views.ts` | reader/admin rendering of media, multipart admin form, resize script |
| `worker/index.ts` | save/delete with files, media routes |
| `wrangler.jsonc` | `r2_buckets` binding |
| `tests/notes-helpers.ts` | `memoryR2()` stub |
| `tests/notes-notes.test.ts`, `tests/notes-media.test.ts` (new), `tests/notes-views.test.ts`, `tests/notes-routes.test.ts` | tests |
| `README.md` | media notes |

---

### Task 1: Attachments in the note model

**Files:**
- Modify: `worker/notes.ts`
- Test: `tests/notes-notes.test.ts` (append)

**Interfaces:**
- Produces: `interface Attachment { key: string; type: string }`, `Note { date; text; photo?: Attachment; audio?: Attachment }`, `MEDIA_KEY: RegExp`, `attachmentKeys(note: Note): string[]`, `findByMediaKey(notes: Note[], key: string): Note | undefined`. `parseNotes` keeps its signature.

- [ ] **Step 1: Write the failing tests** (append to `tests/notes-notes.test.ts`; also add `attachmentKeys, findByMediaKey` to its import from `../worker/notes`)

```ts
const KEY_A = '0b6f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg';
const KEY_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.m4a';
const LEGACY = '[{"date":"2026-10-06","text":"Tomorrow 💛"},{"date":"2026-09-30","text":"Line one\\nLine two"},{"date":"2026-09-29","text":"First \\"quoted\\" note"}]';

describe('attachments', () => {
  it('round-trips legacy text-only notes byte for byte', () => {
    expect(JSON.stringify(parseNotes(LEGACY))).toBe(LEGACY);
  });

  it('parses notes with a photo and a sound', () => {
    const raw = JSON.stringify([{ date: '2026-10-01', text: 'hi', photo: { key: KEY_A, type: 'image/jpeg' }, audio: { key: KEY_B, type: 'audio/mp4' } }]);
    expect(parseNotes(raw)[0]).toEqual({ date: '2026-10-01', text: 'hi', photo: { key: KEY_A, type: 'image/jpeg' }, audio: { key: KEY_B, type: 'audio/mp4' } });
  });

  it('rejects malformed attachments', () => {
    expect(() => parseNotes('[{"date":"2026-10-01","text":"x","photo":{"key":"../../etc","type":"image/jpeg"}}]')).toThrow();
    expect(() => parseNotes(`[{"date":"2026-10-01","text":"x","audio":{"key":"${KEY_B}"}}]`)).toThrow();
    expect(() => parseNotes('[{"date":"2026-10-01","text":"x","photo":"nope"}]')).toThrow();
  });

  it('lists and finds attachment keys', () => {
    const notes = [
      { date: '2026-10-01', text: 'a', photo: { key: KEY_A, type: 'image/jpeg' } },
      { date: '2026-09-01', text: 'b', audio: { key: KEY_B, type: 'audio/mp4' } },
      { date: '2026-08-01', text: 'c' },
    ];
    expect(notes.flatMap(attachmentKeys)).toEqual([KEY_A, KEY_B]);
    expect(findByMediaKey(notes, KEY_B)?.date).toBe('2026-09-01');
    expect(findByMediaKey(notes, 'missing')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: FAIL (`attachmentKeys` is not exported / attachment parsing drops fields).

- [ ] **Step 3: Implement** (replace `worker/notes.ts` fully)

```ts
import { isValidDate } from './dates';

export interface Attachment {
  key: string;
  type: string;
}

export interface Note {
  date: string;
  text: string;
  photo?: Attachment;
  audio?: Attachment;
}

export interface ReaderView {
  current: Note | null;
  archive: Note[];
}

export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

function isAttachment(value: unknown): value is Attachment {
  if (typeof value !== 'object' || value === null) return false;
  const { key, type } = value as Record<string, unknown>;
  return typeof key === 'string' && MEDIA_KEY.test(key) && typeof type === 'string';
}

export function parseNotes(raw: string | null): Note[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored notes are not a list');
  return data.map((item) => {
    if (
      typeof item !== 'object' || item === null ||
      typeof item.date !== 'string' || !isValidDate(item.date) ||
      typeof item.text !== 'string' ||
      (item.photo !== undefined && !isAttachment(item.photo)) ||
      (item.audio !== undefined && !isAttachment(item.audio))
    ) {
      throw new Error('Stored notes contain an invalid entry');
    }
    const note: Note = { date: item.date, text: item.text };
    if (item.photo) note.photo = { key: item.photo.key, type: item.photo.type };
    if (item.audio) note.audio = { key: item.audio.key, type: item.audio.type };
    return note;
  });
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

export function attachmentKeys(note: Note): string[] {
  return [note.photo?.key, note.audio?.key].filter((key): key is string => Boolean(key));
}

export function findByMediaKey(notes: Note[], key: string): Note | undefined {
  return notes.find((n) => n.photo?.key === key || n.audio?.key === key);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Commit**

```bash
git add worker/notes.ts tests/notes-notes.test.ts
git commit -m "Allow an optional photo and sound on private notes"
```

---

### Task 2: Media helpers (validation, keys, ranges, serving)

**Files:**
- Create: `worker/media.ts`, `tests/notes-media.test.ts`
- Modify: `worker/types.ts`, `tests/notes-helpers.ts`

**Interfaces:**
- Produces (`worker/types.ts`, appended; and `MEDIA: R2;` added to `Env`):
  ```ts
  export interface R2Head { size: number; httpMetadata?: { contentType?: string } }
  export interface R2Body { body: ReadableStream }
  export interface R2 {
    head(key: string): Promise<R2Head | null>;
    get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2Body | null>;
    put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
    delete(keys: string | string[]): Promise<void>;
  }
  ```
- Produces (`worker/media.ts`): `type MediaKind = 'photo' | 'audio'`, `MAX_BYTES: Record<MediaKind, number>`, `resolveType(kind, file: { name: string; type: string }): string | null`, `type FileCheck = { ok: true; type: string } | { ok: false; error: string }`, `checkFile(kind, file: { name: string; type: string; size: number }): FileCheck`, `newKey(kind, type: string): string`, `parseRange(header: string | null, size: number): { offset: number; length: number } | null | 'unsatisfiable'`, `serveMedia(bucket: R2, key: string, request: Request): Promise<Response | null>`.
- Produces (`tests/notes-helpers.ts`): `memoryR2()` returning `R2 & { objects: Map<string, { bytes: Uint8Array; contentType?: string }> }`.

- [ ] **Step 1: Add types and the R2 test stub**

Append the `R2Head`, `R2Body`, `R2` interfaces above to `worker/types.ts` and add `MEDIA: R2;` to `Env` (after `NOTES: KV;`).

Append to `tests/notes-helpers.ts` (and change its import to `import type { KV, R2 } from '../worker/types';`):
```ts
export function memoryR2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const r2: R2 & { objects: typeof objects } = {
    objects,
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, httpMetadata: { contentType: o.contentType } } : null;
    },
    async get(key, options) {
      const o = objects.get(key);
      if (!o) return null;
      const r = options?.range;
      const bytes = r ? o.bytes.slice(r.offset, r.offset + r.length) : o.bytes;
      return { body: new Blob([bytes]).stream() };
    },
    async put(key, value, options) {
      objects.set(key, { bytes: new Uint8Array(value), contentType: options?.httpMetadata?.contentType });
    },
    async delete(keys) {
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
  return r2;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/notes-media.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveType, checkFile, newKey, parseRange, serveMedia, MAX_BYTES } from '../worker/media';
import { MEDIA_KEY } from '../worker/notes';
import { memoryR2 } from './notes-helpers';

describe('resolveType', () => {
  it('accepts allowed types and infers from extension when the type is empty', () => {
    expect(resolveType('photo', { name: 'a.jpg', type: 'image/jpeg' })).toBe('image/jpeg');
    expect(resolveType('audio', { name: 'x.m4a', type: 'audio/x-m4a' })).toBe('audio/x-m4a');
    expect(resolveType('audio', { name: 'Recording (3).M4A', type: '' })).toBe('audio/mp4');
    expect(resolveType('audio', { name: 'song.mp3', type: 'application/octet-stream' })).toBe('audio/mpeg');
  });

  it('rejects everything else', () => {
    expect(resolveType('photo', { name: 'x.svg', type: 'image/svg+xml' })).toBeNull();
    expect(resolveType('photo', { name: 'IMG_1.HEIC', type: 'image/heic' })).toBeNull();
    expect(resolveType('photo', { name: 'a.mp3', type: '' })).toBeNull();
    expect(resolveType('audio', { name: 'a.jpg', type: 'image/jpeg' })).toBeNull();
  });
});

describe('checkFile', () => {
  it('enforces size limits', () => {
    expect(checkFile('photo', { name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES.photo })).toEqual({ ok: true, type: 'image/jpeg' });
    const tooBig = checkFile('photo', { name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES.photo + 1 });
    expect(tooBig.ok).toBe(false);
    expect(!tooBig.ok && tooBig.error).toContain('too large');
    expect(MAX_BYTES).toEqual({ photo: 10 * 1024 * 1024, audio: 25 * 1024 * 1024 });
  });

  it('explains unsupported types', () => {
    const r = checkFile('photo', { name: 'IMG.HEIC', type: 'image/heic', size: 10 });
    expect(!r.ok && r.error).toBe('Photo must be JPG, PNG, WebP or GIF.');
    const s = checkFile('audio', { name: 'x.ogg', type: 'audio/ogg', size: 10 });
    expect(!s.ok && s.error).toBe('Sound must be M4A, MP3, AAC or WAV.');
  });
});

describe('newKey', () => {
  it('makes unique keys with the right extension', () => {
    const a = newKey('audio', 'audio/x-m4a');
    const b = newKey('audio', 'audio/x-m4a');
    expect(a).toMatch(MEDIA_KEY);
    expect(a.endsWith('.m4a')).toBe(true);
    expect(a).not.toBe(b);
    expect(newKey('photo', 'image/jpeg').endsWith('.jpg')).toBe(true);
  });
});

describe('parseRange', () => {
  it('parses single byte ranges', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-', 100)).toEqual({ offset: 0, length: 100 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ offset: 10, length: 10 });
    expect(parseRange('bytes=-10', 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange('bytes=90-200', 100)).toEqual({ offset: 90, length: 10 });
  });

  it('flags unsatisfiable ranges and ignores ones it does not support', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=20-10', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});

describe('serveMedia', () => {
  const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
  const setup = async () => {
    const r2 = memoryR2();
    await r2.put('k.m4a', bytes.buffer, { httpMetadata: { contentType: 'audio/mp4' } });
    return r2;
  };
  const req = (range?: string) => new Request('https://x.test/m', { headers: range ? { Range: range } : {} });

  it('serves the whole file with safe headers', async () => {
    const res = (await serveMedia(await setup(), 'k.m4a', req()))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mp4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('serves a byte range as 206', async () => {
    const res = (await serveMedia(await setup(), 'k.m4a', req('bytes=10-19')))!;
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(10, 20));
  });

  it('answers 416 for an unsatisfiable range and null for a missing file', async () => {
    const r2 = await setup();
    const res = (await serveMedia(r2, 'k.m4a', req('bytes=500-')))!;
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */100');
    expect(await serveMedia(r2, 'nope.m4a', req())).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/notes-media.test.ts`
Expected: FAIL, cannot resolve `../worker/media`.

- [ ] **Step 4: Implement** `worker/media.ts`

```ts
import type { R2 } from './types';

export type MediaKind = 'photo' | 'audio';

export const MAX_BYTES: Record<MediaKind, number> = {
  photo: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

const EXTENSION_FOR_TYPE: Record<MediaKind, Record<string, string>> = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' },
  audio: {
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3',
    'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  },
};

const TYPE_FOR_EXTENSION: Record<MediaKind, Record<string, string>> = {
  photo: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' },
  audio: { m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav' },
};

const TYPE_ERROR: Record<MediaKind, string> = {
  photo: 'Photo must be JPG, PNG, WebP or GIF.',
  audio: 'Sound must be M4A, MP3, AAC or WAV.',
};

export function resolveType(kind: MediaKind, file: { name: string; type: string }): string | null {
  const type = file.type.toLowerCase();
  if (Object.hasOwn(EXTENSION_FOR_TYPE[kind], type)) return type;
  if (type !== '' && type !== 'application/octet-stream') return null;
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return Object.hasOwn(TYPE_FOR_EXTENSION[kind], extension) ? TYPE_FOR_EXTENSION[kind][extension] : null;
}

export type FileCheck = { ok: true; type: string } | { ok: false; error: string };

export function checkFile(kind: MediaKind, file: { name: string; type: string; size: number }): FileCheck {
  const type = resolveType(kind, file);
  if (!type) return { ok: false, error: TYPE_ERROR[kind] };
  if (file.size > MAX_BYTES[kind]) {
    const label = kind === 'photo' ? 'Photo' : 'Sound';
    return { ok: false, error: `${label} is too large (max ${MAX_BYTES[kind] / 1024 / 1024} MB).` };
  }
  return { ok: true, type };
}

export function newKey(kind: MediaKind, type: string): string {
  return `${crypto.randomUUID()}.${EXTENSION_FOR_TYPE[kind][type]}`;
}

export function parseRange(
  header: string | null, size: number,
): { offset: number; length: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { offset: start, length: end - start + 1 };
}

export async function serveMedia(bucket: R2, key: string, request: Request): Promise<Response | null> {
  const head = await bucket.head(key);
  if (!head) return null;
  const headers: Record<string, string> = {
    'Content-Type': head.httpMetadata?.contentType ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'private, max-age=86400',
  };
  const range = parseRange(request.headers.get('Range'), head.size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${head.size}` } });
  }
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return null;
  if (!range) return new Response(object.body, { headers });
  const last = range.offset + range.length - 1;
  return new Response(object.body, {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${range.offset}-${last}/${head.size}` },
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/notes-media.test.ts`
Expected: PASS. Then `npx vitest run` (whole vitest suite, no build): the existing route tests still pass because `setup()` does not yet need `MEDIA` at runtime (TypeScript is not type-checked by vitest).

- [ ] **Step 6: Commit**

```bash
git add worker/media.ts worker/types.ts tests/notes-media.test.ts tests/notes-helpers.ts
git commit -m "Add media validation, keys, and range serving for private notes"
```

---

### Task 3: Views for photos and sound

**Files:**
- Modify: `worker/views.ts` (replace fully)
- Test: `tests/notes-views.test.ts` (update calls, append tests)

**Interfaces:**
- Consumes: `Note`, `Attachment` from `worker/notes.ts`.
- Produces: `readerPage(view: { current: Note | null; archive: Note[]; mediaBase: string }): string` (new required `mediaBase`, e.g. `/for-you/media`). `adminPage(data: AdminPageData)` unchanged signature; it derives `${base}/admin/media` itself and renders `d.form.photo` / `d.form.audio`. Form field names: `photo`, `audio` (files), `remove_photo`, `remove_audio` (value `1`), plus existing `csrf`, `original`, `date`, `text`.

- [ ] **Step 1: Update existing view tests and add new ones**

In `tests/notes-views.test.ts`, change the two `readerPage({ ... })` entries in `pages` and the one in "shows message text literally" to include `mediaBase: '/for-you/media'`. Then append:
```ts
const PK = '0b6f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg';
const AK = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.m4a';

describe('media in views', () => {
  it('shows the photo above and the sound below today\'s message, and lazy media in the archive', () => {
    const page = readerPage({
      mediaBase: '/for-you/media',
      current: { date: '2026-10-01', text: 'hi', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } },
      archive: [{ date: '2026-09-30', text: 'yo', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } }],
    });
    const photoAt = page.indexOf(`<img class="photo" src="/for-you/media/${PK}"`);
    const textAt = page.indexOf('<p class="message">hi</p>');
    const audioAt = page.indexOf(`<audio class="sound" controls preload="metadata" src="/for-you/media/${AK}"`);
    expect(photoAt).toBeGreaterThan(-1);
    expect(photoAt).toBeLessThan(textAt);
    expect(audioAt).toBeGreaterThan(textAt);
    expect(page).toContain('loading="lazy"');
    expect(page).toContain(`preload="none" src="/for-you/media/${AK}"`);
  });

  it('renders text-only notes without media elements', () => {
    const page = readerPage({ mediaBase: '/for-you/media', current: { date: '2026-10-01', text: 'hi' }, archive: [{ date: '2026-09-30', text: 'yo' }] });
    expect(page).not.toContain('<img');
    expect(page).not.toContain('<audio');
  });

  it('admin form uploads files, shows current attachments with remove options, and resizes photos', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, csrf: 't',
      notes: [{ date: '2026-10-01', text: 'x', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } }],
      form: { date: '2026-10-01', text: 'x', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } },
      original: '2026-10-01',
    });
    expect(page).toContain('enctype="multipart/form-data"');
    expect(page).toContain('name="photo" accept="image/*"');
    expect(page).toContain('name="audio" accept="audio/*,.m4a"');
    expect(page).toContain('name="remove_photo" value="1"');
    expect(page).toContain('name="remove_audio" value="1"');
    expect(page).toContain(`src="/for-you/admin/media/${PK}"`);
    expect(page).toContain(`src="/for-you/admin/media/${AK}"`);
    expect(page).toContain('createImageBitmap');
    expect(page).not.toContain('—');
  });

  it('admin form without attachments has no remove options', () => {
    const page = adminPage({ base: '/for-you', today: '2026-10-01', current: null, csrf: 't', notes: [], form: { date: '2026-10-01', text: '' } });
    expect(page).not.toContain('remove_photo');
    expect(page).not.toContain('remove_audio');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: FAIL on the new media tests (no `<img class="photo"`, no `enctype`).

- [ ] **Step 3: Implement** (replace `worker/views.ts` fully)

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
.photo { display: block; width: 100%; height: auto; border-radius: 0.6rem; margin: 0 0 1.5rem; animation: rise 1.8s ease-out both; }
.sound { display: block; width: 100%; margin: 1.5rem 0 0; }
.heart { color: var(--accent); font-size: 1.4rem; text-align: center; margin: 3.5rem 0 2.5rem; }
.archive h2 { font-weight: 500; font-style: italic; font-size: 1.1rem; color: var(--muted); margin: 0 0 1.5rem; }
.archive article { border-top: 1px solid var(--line); padding: 1.25rem 0; }
.archive .date { font-size: 0.95rem; margin-bottom: 0.4rem; }
.archive p.text { margin: 0; font-size: 1.2rem; line-height: 1.45; white-space: pre-line; }
.archive .photo { max-width: 16rem; margin: 0 0 0.75rem; animation: none; }
.archive .sound { margin-top: 0.75rem; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.4rem; }
form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 20rem; }
input { font: inherit; font-size: 1.2rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); }
button { font: inherit; font-size: 1.15rem; padding: 0.55rem 1rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
.error { color: var(--accent); font-style: italic; margin: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .message, .photo { animation: none; } }
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
button:disabled { opacity: 0.6; }
label.file { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; color: #444; }
.attached { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; flex-wrap: wrap; }
.attached audio { max-width: 16rem; }
.hint { font-size: 0.8rem; color: #777; margin: 0; }
.thumb { width: 4rem; height: 4rem; object-fit: cover; border-radius: 6px; display: block; }
ul { list-style: none; padding: 0; }
li { border-top: 1px solid #e5e5e5; padding: 0.75rem 0; }
li .thumb { margin-top: 0.4rem; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #666; }
.tag { white-space: nowrap; font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eee; margin-left: 0.4rem; }
.text { white-space: pre-line; margin: 0.35rem 0 0; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.actions form { display: inline; margin: 0; }
.actions button { padding: 0.2rem 0.6rem; font-size: 0.85rem; background: #fff; color: #a33; border-color: #dbb; }
.error { color: #a33; }
`;

// Shrinks a chosen photo in the browser before upload (also drops EXIF such as location).
// GIFs are left alone; anything the browser cannot decode is sent as-is for the server to judge.
const RESIZE_SCRIPT = `<script>
(function () {
  var form = document.querySelector('form.write');
  if (!form) return;
  form.addEventListener('submit', async function (event) {
    var input = form.querySelector('input[name=photo]');
    var button = form.querySelector('button[type=submit]');
    if (!input.files.length || input.files[0].type === 'image/gif') return;
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Saving...';
    try {
      var bitmap = await createImageBitmap(input.files[0], { imageOrientation: 'from-image' });
      var scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
      if (blob) {
        var transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        input.files = transfer.files;
      }
    } catch (error) {
      console.warn('Photo not resized, uploading original', error);
    }
    form.submit();
  });
})();
</script>`;

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

function photoTag(note: Note, mediaBase: string, lazy: boolean): string {
  if (!note.photo) return '';
  return `<img class="photo" src="${escapeHtml(`${mediaBase}/${note.photo.key}`)}" alt=""${lazy ? ' loading="lazy"' : ''}>`;
}

function soundTag(note: Note, mediaBase: string, lazy: boolean): string {
  if (!note.audio) return '';
  return `<audio class="sound" controls preload="${lazy ? 'none' : 'metadata'}" src="${escapeHtml(`${mediaBase}/${note.audio.key}`)}"></audio>`;
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

export function readerPage({ current, archive, mediaBase }: { current: Note | null; archive: Note[]; mediaBase: string }): string {
  const today = current
    ? `<p class="date">${formatDate(current.date)}</p>
${photoTag(current, mediaBase, false)}
<p class="message">${escapeHtml(current.text)}</p>
${soundTag(current, mediaBase, false)}`
    : '<p class="quiet">Nothing here yet. Check back soon.</p>';
  const past = archive.length
    ? `<div class="heart" aria-hidden="true">&#9825;</div>
<section class="archive"><h2>Earlier notes</h2>
${archive.map((n) => `<article><p class="date">${formatDate(n.date)}</p>${photoTag(n, mediaBase, true)}<p class="text">${escapeHtml(n.text)}</p>${soundTag(n, mediaBase, true)}</article>`).join('\n')}
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
  /** Date of the note being edited, so a changed date moves it instead of copying it. */
  original?: string;
  csrf: string;
  flash?: string;
  error?: string;
}

export function adminPage(d: AdminPageData): string {
  const mediaBase = `${d.base}/admin/media`;
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const status = (n: Note) => (n.date === d.current?.date ? 'Showing now' : n.date > d.today ? 'Queued' : 'Past');
  const rows = d.notes.map((n) => `<li>
  <div class="meta">
    <span>${formatDate(n.date)}<span class="tag">${status(n)}</span>${n.audio ? '<span class="tag">Sound</span>' : ''}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin?edit=${n.date}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/delete`)}" onsubmit="return confirm('Delete this note?')">
        ${csrf}<input type="hidden" name="date" value="${escapeHtml(n.date)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  ${n.photo ? `<img class="thumb" src="${escapeHtml(`${mediaBase}/${n.photo.key}`)}" alt="" loading="lazy">` : ''}
  <p class="text">${escapeHtml(n.text)}</p>
</li>`).join('\n');

  const currentPhoto = d.form.photo
    ? `<div class="attached"><img class="thumb" src="${escapeHtml(`${mediaBase}/${d.form.photo.key}`)}" alt=""><label><input type="checkbox" name="remove_photo" value="1"> Remove photo</label></div>`
    : '';
  const currentSound = d.form.audio
    ? `<div class="attached"><audio controls preload="none" src="${escapeHtml(`${mediaBase}/${d.form.audio.key}`)}"></audio><label><input type="checkbox" name="remove_audio" value="1"> Remove sound</label></div>`
    : '';

  return adminShell(`
<h1>Notes</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<h2>Showing today (${formatDate(d.today)})</h2>
<div class="box">${d.current ? escapeHtml(d.current.text) : 'Nothing yet.'}</div>
<h2>Write a note</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${escapeHtml(`${d.base}/admin/save`)}">
  ${csrf}
  ${d.original ? `<input type="hidden" name="original" value="${escapeHtml(d.original)}">` : ''}
  <input type="date" name="date" value="${escapeHtml(d.form.date)}" required>
  <textarea name="text" maxlength="5000" required placeholder="Today's note">${escapeHtml(d.form.text)}</textarea>
  <label class="file">Photo (optional)<input type="file" name="photo" accept="image/*"></label>
  ${currentPhoto}
  <label class="file">Sound (optional)<input type="file" name="audio" accept="audio/*,.m4a"></label>
  ${currentSound}
  <p class="hint">Photos are shrunk before upload. Sound: M4A, MP3, AAC or WAV, up to 25 MB.</p>
  <button type="submit">Save</button>
</form>
${RESIZE_SCRIPT}
<h2>All notes</h2>
<ul>${rows || '<li>No notes yet.</li>'}</ul>`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/notes-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/views.ts tests/notes-views.test.ts
git commit -m "Render photos and sound on private notes and add upload fields"
```

---

### Task 4: Routes: saving, deleting, and serving media

**Files:**
- Modify: `worker/index.ts` (replace fully), `wrangler.jsonc`
- Test: `tests/notes-routes.test.ts` (update `setup`, append tests)

**Interfaces:**
- Consumes: Task 1 (`attachmentKeys`, `findByMediaKey`, `Attachment`), Task 2 (`checkFile`, `newKey`, `serveMedia`, `MediaKind`, `R2`), Task 3 (`readerPage` with `mediaBase`).
- Produces: routes `GET <base>/media/<key>` (reader) and `GET <base>/admin/media/<key>` (admin); multipart `POST <base>/admin/save` with `photo`, `audio`, `remove_photo`, `remove_audio`.

- [ ] **Step 1: Update `setup` and add helpers**

In `tests/notes-routes.test.ts`: import `memoryR2` alongside `memoryKV`; in `setup()` create `const media = memoryR2();`, add `MEDIA: media` to `env`, and return `{ env, kv, assets, media }`. Add below the existing helpers:
```ts
const postForm = (path: string, fields: Record<string, string | File>, cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size).fill(7)], name, { type });
const stored = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('notes')!);

async function adminWith(env: Env) {
  const cookie = await login(env, 'admin');
  const csrf = await adminCsrf(env, cookie);
  const save = (fields: Record<string, string | File>) => handleRequest(postForm('/for-you/admin/save', { csrf, ...fields }, cookie), env, NOW);
  return { cookie, csrf, save };
}
```

- [ ] **Step 2: Write the failing tests** (append)

```ts
describe('media', () => {
  it('saves a photo and a sound with a note, and the reader can load them', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    const res = await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg', 50), audio: file('Recording.m4a', '', 80) });
    expect(res.status).toBe(303);
    const [note] = stored(kv);
    expect(note.photo.type).toBe('image/jpeg');
    expect(note.audio.type).toBe('audio/mp4');
    expect(media.objects.size).toBe(2);
    const reader = await login(env, 'reader');
    const html = await (await handleRequest(get('/for-you', reader), env, NOW)).text();
    expect(html).toContain(`src="/for-you/media/${note.photo.key}"`);
    const img = await handleRequest(get(`/for-you/media/${note.photo.key}`, reader), env, NOW);
    expect(img.status).toBe(200);
    expect(img.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await img.arrayBuffer()).byteLength).toBe(50);
  });

  it('keeps attachments when only the text is edited', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    const before = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'changed' });
    const after = stored(kv)[0];
    expect(after.text).toBe('changed');
    expect(after.photo).toEqual(before.photo);
    expect(after.audio).toEqual(before.audio);
    expect(media.objects.size).toBe(2);
  });

  it('replaces and removes attachments, deleting the old files', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    const before = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'hi', photo: file('new.png', 'image/png'), remove_audio: '1' });
    const after = stored(kv)[0];
    expect(after.photo.key).not.toBe(before.photo.key);
    expect(after.photo.type).toBe('image/png');
    expect(after.audio).toBeUndefined();
    expect([...media.objects.keys()]).toEqual([after.photo.key]);
  });

  it('moving a note keeps its attachments', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'hi', photo: file('p.jpg', 'image/jpeg') });
    const key = stored(kv)[0].photo.key;
    await save({ original: '2026-10-02', date: '2026-10-05', text: 'hi' });
    expect(stored(kv)).toEqual([{ date: '2026-10-05', text: 'hi', photo: { key, type: 'image/jpeg' } }]);
    expect(media.objects.has(key)).toBe(true);
  });

  it('moving onto a date that has a note replaces it and deletes its files', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'a', photo: file('p.jpg', 'image/jpeg') });
    await save({ date: '2026-10-05', text: 'b', audio: file('a.mp3', 'audio/mpeg') });
    const photoKey = stored(kv).find((n: { date: string }) => n.date === '2026-10-02').photo.key;
    await save({ original: '2026-10-02', date: '2026-10-05', text: 'a' });
    expect(stored(kv)).toEqual([{ date: '2026-10-05', text: 'a', photo: { key: photoKey, type: 'image/jpeg' } }]);
    expect([...media.objects.keys()]).toEqual([photoKey]);
  });

  it('deleting a note deletes its files', async () => {
    const { env, kv, media } = setup();
    const { save, cookie, csrf } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    await handleRequest(post('/for-you/admin/delete', { csrf, date: '2026-10-01' }, cookie), env, NOW);
    expect(stored(kv)).toEqual([]);
    expect(media.objects.size).toBe(0);
  });

  it('rejects unsupported files, stores nothing, and keeps the typed text', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    for (const photo of [file('IMG_1.HEIC', 'image/heic'), file('x.svg', 'image/svg+xml')]) {
      const res = await save({ date: '2026-10-01', text: 'kept', photo });
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Photo must be JPG, PNG, WebP or GIF.');
      expect(html).toContain('>kept</textarea>');
    }
    expect(kv.data.has('notes')).toBe(false);
    expect(media.objects.size).toBe(0);
  });

  it('only serves media to the right people at the right time', async () => {
    const { env, kv } = setup();
    const { save, cookie: admin } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'future', photo: file('p.jpg', 'image/jpeg') });
    const key = stored(kv)[0].photo.key;
    const reader = await login(env, 'reader');
    expect((await handleRequest(get(`/for-you/media/${key}`, reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${key}`), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, admin), env, NOW)).status).toBe(200);
    expect((await handleRequest(get('/for-you/media/00000000-0000-4000-8000-000000000000.jpg', reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get('/for-you/media/../notes', reader), env, NOW)).status).toBe(404);
  });

  it('serves byte ranges so iPhones can play sound', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', audio: file('a.m4a', 'audio/mp4', 80) });
    const key = stored(kv)[0].audio.key;
    const reader = await login(env, 'reader');
    const res = await handleRequest(new Request(`https://rolfll.com/for-you/media/${key}`, { headers: { Cookie: reader, Range: 'bytes=0-9' } }), env, NOW);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-9/80');
  });

  it('leaves legacy text-only notes untouched when saving another note with media', async () => {
    const { env, kv } = setup();
    const legacy = [
      { date: '2026-09-30', text: 'Line one\nLine two 💛' },
      { date: '2026-09-29', text: 'First "quoted" note' },
    ];
    seed(kv, legacy);
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'new', photo: file('p.jpg', 'image/jpeg') });
    const notes = stored(kv);
    expect(notes.slice(1)).toEqual(legacy);
    expect(JSON.stringify(notes.slice(1))).toBe(JSON.stringify(legacy));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/notes-routes.test.ts`
Expected: the new `media` tests FAIL (attachments not stored, media routes 404); older tests still pass.

- [ ] **Step 4: Implement** (replace `worker/index.ts` fully)

```ts
import { todayInCopenhagen, isValidDate, nextEmptyDate } from './dates';
import {
  parseNotes, selectForReader, upsertNote, removeNote, attachmentKeys, findByMediaKey,
  type Note, type Attachment,
} from './notes';
import {
  createSession, verifySession, passwordMatches, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, clientKey, type Role,
} from './auth';
import { checkFile, newKey, serveMedia, type MediaKind } from './media';
import { readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage } from './views';
import type { Env, KV, R2 } from './types';

const NOTES_KEY = 'notes';
const MAX_LENGTH = 5000;
const COOKIE: Record<Role, string> = { reader: 'notes_reader', admin: 'notes_admin' };
const FLASH: Record<string, string> = { saved: 'Saved.', deleted: 'Deleted.' };
const INVALID = `Needs a real date and a message of at most ${MAX_LENGTH} characters.`;
const MEDIA_ROUTE = /^(\/admin)?\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4})$/;

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

function notFound(): Response {
  return html(errorPage('Nothing here.'), 404);
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

function uploadedFile(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value !== null && typeof value !== 'string' && value.size > 0 ? value : null;
}

async function storeUpload(
  bucket: R2, kind: MediaKind, file: File | null, type: string | undefined, fallback: Attachment | undefined,
): Promise<Attachment | undefined> {
  if (!file || !type) return fallback;
  const key = newKey(kind, type);
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
  return { key, type };
}

// Deletes files no longer referenced by any note. Best-effort: the notes are already saved.
async function deleteOrphans(bucket: R2, before: Note[], after: Note[]): Promise<void> {
  const keep = new Set(after.flatMap(attachmentKeys));
  const orphans = before.flatMap(attachmentKeys).filter((key) => !keep.has(key));
  if (orphans.length === 0) return;
  try {
    await bucket.delete(orphans);
  } catch (error) {
    console.error('Could not delete media', error);
  }
}

async function handleLogin(request: Request, kv: KV, cfg: Config, now: Date, role: Role): Promise<Response> {
  const render = (error: string) =>
    role === 'reader'
      ? readerLoginPage({ action: `${cfg.base}/login`, error })
      : adminLoginPage({ action: `${cfg.base}/admin/login`, error });
  const ip = clientKey(request.headers.get('CF-Connecting-IP') ?? 'unknown');
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

async function readerSession(request: Request, cfg: Config, now: Date): Promise<boolean> {
  return verifySession(readCookie(request, COOKIE.reader), 'reader', cfg.secret, now.getTime());
}

async function showReader(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  if (!(await readerSession(request, cfg, now))) {
    return html(readerLoginPage({ action: `${cfg.base}/login` }));
  }
  const view = selectForReader(await loadNotes(kv), todayInCopenhagen(now));
  return html(readerPage({ ...view, mediaBase: `${cfg.base}/media` }));
}

interface AdminView {
  form: Note;
  original?: string;
  flash?: string;
  error?: string;
}

async function renderAdmin(
  notes: Note[], cfg: Config, now: Date, session: string, view: AdminView, status = 200,
): Promise<Response> {
  const today = todayInCopenhagen(now);
  return html(adminPage({
    base: cfg.base,
    today,
    current: selectForReader(notes, today).current,
    notes,
    ...view,
    csrf: await csrfToken(session, cfg.secret),
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
  const flash = Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined;
  return renderAdmin(notes, cfg, now, session, { form, original: editing?.date, flash });
}

async function showMedia(
  request: Request, env: Env, cfg: Config, now: Date, key: string, asAdmin: boolean,
): Promise<Response> {
  const allowed = asAdmin ? Boolean(await adminSession(request, cfg, now)) : await readerSession(request, cfg, now);
  if (!allowed) return notFound();
  const note = findByMediaKey(await loadNotes(env.NOTES), key);
  if (!note || (!asAdmin && note.date > todayInCopenhagen(now))) return notFound();
  return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
}

async function adminAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) {
    return html(errorPage('That form expired. Go back, reload, and try again.'), 403);
  }
  const notes = await loadNotes(env.NOTES);
  const date = field(form, 'date');
  if (action === 'delete') {
    const next = removeNote(notes, date);
    await storeNotes(env.NOTES, next);
    await deleteOrphans(env.MEDIA, notes, next);
    return redirect(`${adminHome}?msg=deleted`);
  }

  const original = field(form, 'original');
  const text = field(form, 'text').replace(/\r\n?/g, '\n').trim();
  const existing = notes.find((n) => n.date === (original || date));
  const photoFile = uploadedFile(form, 'photo');
  const audioFile = uploadedFile(form, 'audio');
  const photoCheck = photoFile ? checkFile('photo', photoFile) : null;
  const audioCheck = audioFile ? checkFile('audio', audioFile) : null;
  const errors: string[] = [];
  if (!isValidDate(date) || text === '' || text.length > MAX_LENGTH) errors.push(INVALID);
  if (photoCheck && !photoCheck.ok) errors.push(photoCheck.error);
  if (audioCheck && !audioCheck.ok) errors.push(audioCheck.error);
  if (errors.length > 0) {
    return renderAdmin(notes, cfg, now, session, {
      form: { ...existing, date, text },
      original: original || undefined,
      error: errors.join(' '),
    }, 400);
  }

  const note: Note = { date, text };
  const photo = await storeUpload(
    env.MEDIA, 'photo', photoFile, photoCheck?.ok ? photoCheck.type : undefined,
    field(form, 'remove_photo') === '1' ? undefined : existing?.photo,
  );
  const audio = await storeUpload(
    env.MEDIA, 'audio', audioFile, audioCheck?.ok ? audioCheck.type : undefined,
    field(form, 'remove_audio') === '1' ? undefined : existing?.audio,
  );
  if (photo) note.photo = photo;
  if (audio) note.audio = audio;
  const kept = original && original !== date ? removeNote(notes, original) : notes;
  const next = upsertNote(kept, note);
  await storeNotes(env.NOTES, next);
  await deleteOrphans(env.MEDIA, notes, next);
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
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const sub = path.slice(base.length);
    const media = MEDIA_ROUTE.exec(sub);
    if (media && method === 'GET') return await showMedia(request, env, cfg, now, media[2], media[1] === '/admin');
    switch (`${method} ${sub}`) {
      case 'GET ': return await showReader(request, kv, cfg, now);
      case 'POST /login': return await handleLogin(request, kv, cfg, now, 'reader');
      case 'GET /admin': return await showAdmin(request, kv, cfg, now, url);
      case 'POST /admin/login': return await handleLogin(request, kv, cfg, now, 'admin');
      case 'POST /admin/save': return await adminAction(request, env, cfg, now, 'save');
      case 'POST /admin/delete': return await adminAction(request, env, cfg, now, 'delete');
      default: return notFound();
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

- [ ] **Step 5: Add the R2 binding**

In `wrangler.jsonc`, after the `kv_namespaces` array, add:
```jsonc
  "r2_buckets": [
    { "binding": "MEDIA", "bucket_name": "notes-media" }
  ]
```
(with a comma after the `kv_namespaces` closing bracket).

- [ ] **Step 6: Run everything**

Run: `npx vitest run tests/notes-routes.test.ts` → PASS.
Run: `npm test` → all pass.
Run: `npx tsc --ignoreConfig --noEmit --strict --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler worker/index.ts` → no output.
Run: `npx wrangler deploy --dry-run --outdir <workspace>/bundle` → lists `env.MEDIA (notes-media)  R2 Bucket`, exits at dry-run.

- [ ] **Step 7: Commit**

```bash
git add worker/index.ts wrangler.jsonc tests/notes-routes.test.ts
git commit -m "Save, delete, and privately serve photos and sound on private notes"
```

---

### Task 5: Local run-through and README

**Files:** Modify `README.md`. Uses the existing gitignored `.dev.vars` (`NOTES_PATH=/for-you`, local passwords).

- [ ] **Step 1: Make test files** (in the plan workspace, never committed)

A 3000×2000 PNG: take a Playwright screenshot of any page with viewport 3000×2000. A short WAV:
```bash
node -e "const r=8000,n=r*2,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(r,24);b.writeUInt32LE(r*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(8000*Math.sin(i*2*Math.PI*440/r)),44+i*2);require('fs').writeFileSync(process.argv[1],b)" <workspace>/tone.wav
```

- [ ] **Step 2: Run locally and click through** (`npx astro build && npx wrangler dev --port 8787`, background)

1. Admin: save today's note with the big PNG and the WAV. Confirm the stored photo is JPEG and its longest edge is ≤ 1600 px (fetch `/for-you/admin/media/<key>` in the page and read `naturalWidth`/`naturalHeight` of the thumbnail, or the response's `Content-Type`).
2. Edit only the text: photo and sound remain. Tick "Remove sound": sound gone, photo stays.
3. Try a `.svg` photo: red error, text kept.
4. Reader (phone 390 px and desktop 1280 px): photo above text, player below, archive entries smaller; screenshots of both.
5. `curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-9"` with the reader cookie on the sound URL → `206`.
6. Main site `/`, `/works/` still 200.
Stop the dev server and delete `.playwright-mcp/` if created.

- [ ] **Step 3: README**

In `README.md`'s "Private notes" section, add after the "Messages live in" bullet:
```markdown
- Photos and sound live in the `notes-media` R2 bucket (binding `MEDIA`), referenced from each note as `photo`/`audio`. They are only served through the Worker to logged-in viewers, with Range support. Deleting or replacing an attachment deletes its file.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document photos and sound on private notes"
```

---

### Task 6: Go live safely (needs Rolf)

- [ ] **Step 1: Back up the live notes (never print them)**

```bash
mkdir -p /c/Users/Admin/Documents/rolfll-notes-backup
npx wrangler kv key get notes --binding NOTES --remote > /c/Users/Admin/Documents/rolfll-notes-backup/notes-2026-10-05.json
node -e "const n=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('backed up',n.length,'notes')" /c/Users/Admin/Documents/rolfll-notes-backup/notes-2026-10-05.json
```
Expected: a count matching the live notes (8 at planning time, possibly more).

- [ ] **Step 2: Enable R2 and create the bucket**

Rolf: Cloudflare dashboard → R2 Object Storage → enable (free plan; may ask for a card). Then try `npx wrangler r2 bucket create notes-media`. If wrangler lacks R2 permission, Rolf creates a bucket named exactly `notes-media` in the dashboard (default location). Confirm it exists (dashboard or `npx wrangler r2 bucket list`).

- [ ] **Step 3: Merge and publish**

```bash
git checkout master && git merge --ff-only notes-media && npm test
git push origin master
```
Wait for a new entry in `npx wrangler deployments list` newer than the push.

- [ ] **Step 4: Verify nothing broke**

1. `https://rolfll.com/` and `/works/` return 200; the notes page returns 200 with `X-Robots-Tag: noindex, nofollow`.
2. Live notes unchanged: fetch `notes` again and compare byte-for-byte with the backup (`cmp` or a node comparison; print only "identical"/"different").
3. Rolf opens the reader page on his phone: existing notes show as before.
4. Rolf adds a photo and a Sound Recorder `.m4a` to a note on his PC, then plays the sound on his iPhone (reader page if the note is today or earlier, otherwise the admin page).

- [ ] **Step 5: If anything is wrong**

Rolf runs `npx wrangler rollback` in his own PowerShell (it prompts). Reading still works, but the previous code drops `photo`/`audio` when it saves: after a rollback, back up KV and do not save or delete notes until the media version is redeployed.
