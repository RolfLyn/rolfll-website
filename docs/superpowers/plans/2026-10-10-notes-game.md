# Private Notes: Small Game Before a Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a private note carry an optional small game ("Close the distance") that plays before the note's text, photo and sound are revealed.

**Architecture:** Notes in KV gain an optional `game` object (`{ kind: 'distance', from, to, km, meet?, lines }`), validated in `parseNotes`. The admin form gets game fields parsed by a new `worker/game.ts`. The reader page always renders the note in HTML (so it works without JavaScript) and, for game notes, adds a JSON data block plus one inline script (`worker/game-script.ts`) that hides the note, draws the game on a `<canvas>`, and reveals the note at the end. An admin-only preview route shows any note as the reader would see it.

**Tech Stack:** Cloudflare Workers + KV + R2, TypeScript, Vitest on Node 24, canvas 2D and pointer events in the browser. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-10-notes-game-design.md` (builds on `2026-09-29-private-notes-design.md` and `2026-10-05-notes-media-design.md`)

**Deviations from the spec (small, deliberate):**
- The browser script and styles live in `worker/game-script.ts`, separate from the form parsing in `worker/game.ts`, to keep files focused.
- Instead of a server-side `daysUntil`, the countdown text is one self-contained function `meetText(game, today)` in `game-script.ts`. It is unit-tested in Node and embedded into the browser script with `toString()`, so the tested code is the code that runs.
- Adds a "Preview" link per note in the admin list (`GET <path>/admin/preview?date=`), which spec step "preview the game note in admin before its date arrives" needs.

## Global Constraints

- The repo is **public**: never commit messages, passwords, the real notes path, `.dev.vars`, the notes backup, real place names, real dates, or real game lines. Tests use neutral values (`Harbour`, `Hill`).
- **Never print or read the content of the live notes.** Only counts and byte-equality comparisons.
- **Pushing `master` deploys.** Work on branch `notes-game`; do not merge or push until Task 6, and only after Rolf says go.
- Stored note format is **additive only**: `{ date, text, photo?, audio?, game? }`. Notes without `game` round-trip byte-identical.
- Game limits: `from`/`to` 1 to 40 chars (non-blank), `km` whole number 1 to 40,000, `meet` optional valid `YYYY-MM-DD`, `lines` 0 to 8 entries, each non-blank and at most 160 chars. Only `kind: 'distance'` exists.
- Game text reaches the browser only as JSON inside `<script type="application/json">` with every `<` written as `<`, and is only ever put on the page with `textContent`.
- Countdown text: `<to>, <day month> · N more sleeps`, `1 more sleep`, `Today!`, omitted after the date. Computed from the device's local date.
- Journey takes about 60 seconds; clouds only slow (factor 0.45 for 0.9 s); every line shows even if missed; "Skip to the note" always visible.
- `localStorage` key `notes-game-played:<date>`, every access in try/catch. Preview pages neither read nor write it.
- No em dashes (U+2014) in visible copy. `npm test` passes after every task. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A line containing `</script>` or `<!--`** must not break the page or inject markup. Tested in Task 4 (view test with `a </script><b>x</b>`).
2. **Distance typed Danish- or English-style** (`10.000`, `10,000`, `10 000`) must save as 10000, while `10.5` or `far` is rejected, not silently misread. Tested in Task 2.
3. **Lines pasted with Windows line endings, blank rows, or stray spaces** become clean lines with no empty ones. Tested in Task 2 and Task 3 (route test with `\r\n\r\n  second line  `).
4. **Editing a game note's text only** keeps the game; choosing None removes it; a fresh note on the same date never inherits it. Tested in Task 3.
5. **A game with zero lines and no meet date** still renders and plays (no countdown line). Tested in Task 4 (view) and Task 5 (browser).

---

### Task 1: Game in the note model

**Files:**
- Modify: `worker/notes.ts`
- Test: `tests/notes-notes.test.ts`

**Interfaces:**
- Consumes: `isValidDate(value: string): boolean` from `worker/dates.ts`.
- Produces: `GAME_LIMITS = { place: 40, km: 40000, lines: 8, line: 160 }`, `interface Game { kind: 'distance'; from: string; to: string; km: number; meet?: string; lines: string[] }`, `isGame(value: unknown): value is Game`, `Note.game?: Game`. `parseNotes` keeps valid games and throws on malformed ones.

- [ ] **Step 0: Create the branch**

```bash
cd /c/Users/Admin/Documents/rolfll-website && git checkout -b notes-game
```

- [ ] **Step 1: Write the failing tests**

Add `isGame` to the import line at the top of `tests/notes-notes.test.ts`:

```ts
import { parseNotes, selectForReader, upsertNote, removeNote, sortNewestFirst, attachmentKeys, findByMediaKey, isGame } from '../worker/notes';
```

Append at the end of the file:

```ts
describe('games on notes', () => {
  const game = { kind: 'distance', from: 'Harbour', to: 'Hill', km: 10000, meet: '2026-10-21', lines: ['one', 'two'] };

  it('keeps a valid game and drops unknown fields', () => {
    const raw = JSON.stringify([{ date: '2026-10-10', text: 'hi', game: { ...game, extra: 'x' } }]);
    expect(parseNotes(raw)).toEqual([{ date: '2026-10-10', text: 'hi', game }]);
  });

  it('accepts a game with no lines and no meet date', () => {
    const plain = { kind: 'distance', from: 'Harbour', to: 'Hill', km: 1, lines: [] };
    expect(parseNotes(JSON.stringify([{ date: '2026-10-10', text: 'hi', game: plain }]))[0].game).toEqual(plain);
  });

  it('leaves notes without a game exactly as they were', () => {
    const raw = JSON.stringify([{ date: '2026-10-10', text: 'hi' }]);
    expect(JSON.stringify(parseNotes(raw))).toBe(raw);
  });

  it.each([
    ['unknown kind', { ...game, kind: 'maze' }],
    ['blank start', { ...game, from: '  ' }],
    ['long destination', { ...game, to: 'x'.repeat(41) }],
    ['zero km', { ...game, km: 0 }],
    ['fractional km', { ...game, km: 1.5 }],
    ['too many km', { ...game, km: 40001 }],
    ['km as text', { ...game, km: '10' }],
    ['impossible meet date', { ...game, meet: '2026-02-30' }],
    ['nine lines', { ...game, lines: Array(9).fill('x') }],
    ['long line', { ...game, lines: ['x'.repeat(161)] }],
    ['blank line', { ...game, lines: [' '] }],
    ['lines not a list', { ...game, lines: 'one' }],
  ])('rejects a game with %s', (_label, bad) => {
    expect(isGame(bad)).toBe(false);
    expect(() => parseNotes(JSON.stringify([{ date: '2026-10-10', text: 'hi', game: bad }]))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: FAIL (`isGame` is not exported; the game is dropped by `parseNotes`).

- [ ] **Step 3: Implement**

In `worker/notes.ts`, after the `Attachment` interface add:

```ts
export const GAME_LIMITS = { place: 40, km: 40_000, lines: 8, line: 160 };

export interface Game {
  kind: 'distance';
  from: string;
  to: string;
  km: number;
  meet?: string;
  lines: string[];
}
```

Add `game?: Game;` as the last field of `interface Note`.

After `isAttachment` add:

```ts
function isText(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

export function isGame(value: unknown): value is Game {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return g.kind === 'distance' &&
    isText(g.from, GAME_LIMITS.place) && isText(g.to, GAME_LIMITS.place) &&
    typeof g.km === 'number' && Number.isInteger(g.km) && g.km >= 1 && g.km <= GAME_LIMITS.km &&
    (g.meet === undefined || (typeof g.meet === 'string' && isValidDate(g.meet))) &&
    Array.isArray(g.lines) && g.lines.length <= GAME_LIMITS.lines &&
    g.lines.every((line) => isText(line, GAME_LIMITS.line));
}

function copyGame(g: Game): Game {
  const game: Game = { kind: g.kind, from: g.from, to: g.to, km: g.km, lines: [...g.lines] };
  if (g.meet !== undefined) game.meet = g.meet;
  return game;
}
```

Note the key order in `copyGame` (`kind, from, to, km, lines, meet`). Task 2 builds games in the same order so stored JSON stays stable.

In `parseNotes`, add to the rejection condition after the audio line:

```ts
      (item.audio !== undefined && !isAttachment(item.audio)) ||
      (item.game !== undefined && !isGame(item.game))
```

and after `if (item.audio) ...`:

```ts
    if (item.game) note.game = copyGame(item.game);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/notes-notes.test.ts`
Expected: PASS. Then `npm test`: all pass.

Note: the `blank start` case passes `isGame` only if `isText` trims. It does.

- [ ] **Step 5: Commit**

```bash
git add worker/notes.ts tests/notes-notes.test.ts
git commit -m "Allow an optional game on private notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reading game fields from the admin form

**Files:**
- Create: `worker/game.ts`
- Test: `tests/notes-game.test.ts` (new)

**Interfaces:**
- Consumes: `Game`, `GAME_LIMITS`, `isGame` from `worker/notes.ts`.
- Produces:
  - `interface GameDraft { kind: string; from: string; to: string; km: string; meet: string; lines: string }` (what the admin form shows; all strings).
  - `EMPTY_DRAFT: GameDraft` (all `''`).
  - `gameToDraft(game: Game | undefined): GameDraft` (lines joined with `\n`, km as plain digits).
  - `GAME_INVALID: string` (the error text; starts with `The game needs`).
  - `parseGameForm(get: (name: string) => string): { game?: Game; draft: GameDraft; error?: string }`. Form field names: `game_kind`, `game_from`, `game_to`, `game_km`, `game_meet`, `game_lines`. `game_kind` of `''` means no game (no error).

- [ ] **Step 1: Write the failing tests**

Create `tests/notes-game.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGameForm, gameToDraft, EMPTY_DRAFT, GAME_INVALID } from '../worker/game';

const fields = (over: Record<string, string> = {}) => {
  const all: Record<string, string> = {
    game_kind: 'distance', game_from: ' Harbour ', game_to: 'Hill', game_km: '10000',
    game_meet: '2026-10-21', game_lines: 'one\ntwo', ...over,
  };
  return (name: string) => all[name] ?? '';
};

describe('parseGameForm', () => {
  it('means no game when None is chosen, whatever else was typed', () => {
    const result = parseGameForm(fields({ game_kind: '', game_km: 'far' }));
    expect(result.game).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('builds a game from the fields, trimming places', () => {
    expect(parseGameForm(fields()).game).toEqual({
      kind: 'distance', from: 'Harbour', to: 'Hill', km: 10000, lines: ['one', 'two'], meet: '2026-10-21',
    });
  });

  it('drops blank rows, stray spaces and Windows line endings from lines', () => {
    expect(parseGameForm(fields({ game_lines: 'one\r\n\r\n  two  \r\n   \n' })).game?.lines).toEqual(['one', 'two']);
  });

  it('allows no lines and no meet date', () => {
    const game = parseGameForm(fields({ game_lines: '', game_meet: '' })).game;
    expect(game).toEqual({ kind: 'distance', from: 'Harbour', to: 'Hill', km: 10000, lines: [] });
    expect(game && 'meet' in game).toBe(false);
  });

  it.each(['10000', '10.000', '10,000', '10 000'])('reads the distance %s as 10000', (km) => {
    expect(parseGameForm(fields({ game_km: km })).game?.km).toBe(10000);
  });

  it.each([
    ['distance as words', { game_km: 'far' }],
    ['decimal distance', { game_km: '10.5' }],
    ['zero distance', { game_km: '0' }],
    ['too far', { game_km: '40001' }],
    ['missing start', { game_from: '   ' }],
    ['missing destination', { game_to: '' }],
    ['long start', { game_from: 'x'.repeat(41) }],
    ['impossible meet date', { game_meet: '2026-02-30' }],
    ['nine lines', { game_lines: Array(9).fill('x').join('\n') }],
    ['a long line', { game_lines: 'x'.repeat(161) }],
    ['unknown game', { game_kind: 'maze' }],
  ])('rejects %s and keeps the draft', (_label, over) => {
    const result = parseGameForm(fields(over));
    expect(result.game).toBeUndefined();
    expect(result.error).toBe(GAME_INVALID);
    expect(result.draft.kind).toBe(over.game_kind ?? 'distance');
    expect(result.draft.to).toBe(over.game_to ?? 'Hill');
  });

  it('has a readable error without em dashes', () => {
    expect(GAME_INVALID.startsWith('The game needs')).toBe(true);
    expect(GAME_INVALID).not.toContain('—');
  });
});

describe('gameToDraft', () => {
  it('is empty without a game', () => {
    expect(gameToDraft(undefined)).toEqual(EMPTY_DRAFT);
  });

  it('turns a game back into form values that parse to the same game', () => {
    const game = { kind: 'distance' as const, from: 'Harbour', to: 'Hill', km: 10000, lines: ['one', 'two'], meet: '2026-10-21' };
    const draft = gameToDraft(game);
    expect(draft).toEqual({ kind: 'distance', from: 'Harbour', to: 'Hill', km: '10000', meet: '2026-10-21', lines: 'one\ntwo' });
    const get = (name: string) => (draft as unknown as Record<string, string>)[name.replace('game_', '')] ?? '';
    expect(parseGameForm(get).game).toEqual(game);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/notes-game.test.ts`
Expected: FAIL (cannot resolve `../worker/game`).

- [ ] **Step 3: Implement**

Create `worker/game.ts`:

```ts
import { GAME_LIMITS, isGame, type Game } from './notes';

/** The admin form's game fields, as typed (all strings, so a bad value can be shown again). */
export interface GameDraft {
  kind: string;
  from: string;
  to: string;
  km: string;
  meet: string;
  lines: string;
}

export const EMPTY_DRAFT: GameDraft = { kind: '', from: '', to: '', km: '', meet: '', lines: '' };

export const GAME_INVALID =
  `The game needs a start and a destination (up to ${GAME_LIMITS.place} characters each), ` +
  `a distance from 1 to 40,000 km, a real meet date or none, ` +
  `and at most ${GAME_LIMITS.lines} lines of up to ${GAME_LIMITS.line} characters.`;

// Plain digits, or thousands grouped with a space, comma or dot ("10.000", "10,000", "10 000").
const KM_PATTERN = /^(\d+|\d{1,3}([ ,.]\d{3})+)$/;

export function gameToDraft(game: Game | undefined): GameDraft {
  if (!game) return EMPTY_DRAFT;
  return {
    kind: game.kind, from: game.from, to: game.to, km: String(game.km),
    meet: game.meet ?? '', lines: game.lines.join('\n'),
  };
}

export function parseGameForm(get: (name: string) => string): { game?: Game; draft: GameDraft; error?: string } {
  const draft: GameDraft = {
    kind: get('game_kind'),
    from: get('game_from').trim(),
    to: get('game_to').trim(),
    km: get('game_km').trim(),
    meet: get('game_meet').trim(),
    lines: get('game_lines').replace(/\r\n?/g, '\n'),
  };
  if (draft.kind === '') return { draft };
  const km = KM_PATTERN.test(draft.km) ? Number(draft.km.replace(/[ ,.]/g, '')) : NaN;
  const lines = draft.lines.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const game = { kind: draft.kind, from: draft.from, to: draft.to, km, lines } as Game;
  if (draft.meet !== '') game.meet = draft.meet;
  return isGame(game) ? { game, draft } : { draft, error: GAME_INVALID };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/notes-game.test.ts`
Expected: PASS. Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add worker/game.ts tests/notes-game.test.ts
git commit -m "Read and validate game fields from the notes admin form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Game fields in the admin page and saving them

**Files:**
- Modify: `worker/views.ts` (ADMIN_STYLE, `AdminPageData`, `adminPage`)
- Modify: `worker/index.ts` (`AdminView`, `showAdmin`, `adminAction` save branch)
- Test: `tests/notes-views.test.ts`, `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: `GameDraft`, `EMPTY_DRAFT`, `gameToDraft`, `parseGameForm` from `worker/game.ts`; `GAME_LIMITS` from `worker/notes.ts`.
- Produces: `AdminPageData.game?: GameDraft` (defaults to `EMPTY_DRAFT`). The admin list shows a `Game` tag and a `Preview` link to `<base>/admin/preview?date=<date>` for every note (the route itself arrives in Task 4). Saved notes carry `game` when one was chosen.

- [ ] **Step 1: Write the failing view tests**

In `tests/notes-views.test.ts`, append inside `describe('views', ...)` (before its closing `});`):

```ts
  it('admin form has game fields, hidden until a game is chosen', () => {
    expect(admin).toContain('<select name="game_kind">');
    expect(admin).toContain('<option value="distance">Close the distance</option>');
    expect(admin).toContain('<div class="game-fields" hidden>');
  });

  it('admin form shows a game being edited', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, notes: [], csrf: 't',
      form: { date: '2026-10-02', text: 'x' },
      game: { kind: 'distance', from: 'Harbour', to: 'Hill', km: '10000', meet: '2026-10-21', lines: 'one\n<two>' },
    });
    expect(page).toContain('<option value="distance" selected>');
    expect(page).toContain('<div class="game-fields">');
    expect(page).toContain('name="game_from" maxlength="40" value="Harbour"');
    expect(page).toContain('name="game_km" inputmode="numeric" value="10000"');
    expect(page).toContain('name="game_meet" value="2026-10-21"');
    expect(page).toContain('one\n&lt;two&gt;</textarea>');
  });

  it('admin list tags game notes and links every note to a preview', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, csrf: 't', form: { date: '2026-10-02', text: '' },
      notes: [{ date: '2026-10-03', text: 'later', game: { kind: 'distance', from: 'Harbour', to: 'Hill', km: 5, lines: [] } }],
    });
    expect(page).toContain('<span class="tag">Game</span>');
    expect(page).toContain('href="/for-you/admin/preview?date=2026-10-03"');
  });
```

- [ ] **Step 2: Write the failing route tests**

In `tests/notes-routes.test.ts`, append at the end of the file:

```ts
describe('game', () => {
  const GAME_FIELDS = {
    game_kind: 'distance', game_from: 'Harbour', game_to: 'Hill', game_km: '10.000',
    game_meet: '2026-10-21', game_lines: 'first line\r\n\r\n  second line  \n',
  };
  const GAME = { kind: 'distance', from: 'Harbour', to: 'Hill', km: 10000, lines: ['first line', 'second line'], meet: '2026-10-21' };

  it('saves a game with a note', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    expect((await save({ date: '2026-10-01', text: 'hello', ...GAME_FIELDS })).status).toBe(303);
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'hello', game: GAME }]);
  });

  it('prefills the game when editing, keeps it on a text-only edit, and None removes it', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'hello', game: GAME }]));
    const { cookie, save } = await adminWith(env);
    const form = await (await handleRequest(get('/for-you/admin?edit=2026-10-01', cookie), env, NOW)).text();
    expect(form).toContain('<option value="distance" selected>');
    expect(form).toContain('name="game_from" maxlength="40" value="Harbour"');
    expect(form).toContain('first line\nsecond line</textarea>');

    await save({
      original: '2026-10-01', date: '2026-10-01', text: 'edited', game_kind: 'distance', game_from: 'Harbour',
      game_to: 'Hill', game_km: '10000', game_meet: '2026-10-21', game_lines: 'first line\nsecond line',
    });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'edited', game: GAME }]);

    await save({ original: '2026-10-01', date: '2026-10-01', text: 'edited', game_kind: '' });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'edited' }]);
  });

  it('a new note on a date that has a game note does not inherit the game', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'hello', game: GAME }]));
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'fresh' });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'fresh' }]);
  });

  it('rejects a bad game, stores nothing, and keeps what was typed', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    const res = await save({ date: '2026-10-01', text: 'hello', ...GAME_FIELDS, game_km: 'far' });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('The game needs');
    expect(html).toContain('name="game_km" inputmode="numeric" value="far"');
    expect(html).toContain('value="Harbour"');
    expect(html).toContain('>hello</textarea>');
    expect(kv.data.has('notes')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/notes-views.test.ts tests/notes-routes.test.ts`
Expected: the new tests FAIL (no game fields; game not stored). Existing tests still pass.

- [ ] **Step 4: Implement the admin view**

In `worker/views.ts`:

Add imports at the top:

```ts
import { GAME_LIMITS, type Note } from './notes';
import { EMPTY_DRAFT, type GameDraft } from './game';
```

(replacing the existing `import type { Note } from './notes';`).

In `ADMIN_STYLE`, change `input, textarea, button { ... }` to start with `input, textarea, button, select {` and append before the closing backtick:

```css
fieldset.game, .game-fields { display: flex; flex-direction: column; gap: 0.6rem; }
fieldset.game { border: 1px solid #ddd; border-radius: 8px; padding: 0.6rem 0.9rem 0.9rem; margin: 0; }
.game-fields[hidden] { display: none; }
```

After `RESIZE_SCRIPT` add:

```ts
// Shows the game's own fields only when a game is chosen.
const GAME_TOGGLE_SCRIPT = `<script>
(function () {
  var select = document.querySelector('select[name=game_kind]');
  var fields = document.querySelector('.game-fields');
  if (!select || !fields) return;
  select.addEventListener('change', function () { fields.hidden = select.value === ''; });
})();
</script>`;

function gameFields(draft: GameDraft): string {
  const on = draft.kind === 'distance';
  return `<fieldset class="game">
  <label class="file">Game<select name="game_kind">
    <option value="">None</option>
    <option value="distance"${on ? ' selected' : ''}>Close the distance</option>
  </select></label>
  <div class="game-fields"${on ? '' : ' hidden'}>
    <label class="file">From<input name="game_from" maxlength="${GAME_LIMITS.place}" value="${escapeHtml(draft.from)}"></label>
    <label class="file">To<input name="game_to" maxlength="${GAME_LIMITS.place}" value="${escapeHtml(draft.to)}"></label>
    <label class="file">Distance (km)<input name="game_km" inputmode="numeric" value="${escapeHtml(draft.km)}"></label>
    <label class="file">Meet date (optional)<input type="date" name="game_meet" value="${escapeHtml(draft.meet)}"></label>
    <label class="file">Lines along the way (one per row, up to ${GAME_LIMITS.lines})<textarea name="game_lines" rows="6">${escapeHtml(draft.lines)}</textarea></label>
  </div>
</fieldset>`;
}
```

In `AdminPageData`, add after `form: Note;`:

```ts
  /** The game fields as typed or as stored; empty when the note has no game. */
  game?: GameDraft;
```

In `adminPage`, in the `rows` template change the tag line to:

```ts
    <span>${formatDate(n.date)}<span class="tag">${status(n)}</span>${n.audio ? '<span class="tag">Sound</span>' : ''}${n.game ? '<span class="tag">Game</span>' : ''}</span>
```

and in `<span class="actions">`, before the Edit link, add:

```ts
      <a href="${escapeHtml(`${d.base}/admin/preview?date=${n.date}`)}">Preview</a>
```

In the form, after the `<p class="hint">Photos are shrunk ...</p>` line add:

```ts
  ${gameFields(d.game ?? EMPTY_DRAFT)}
```

and after `${RESIZE_SCRIPT}` add `${GAME_TOGGLE_SCRIPT}`.

- [ ] **Step 5: Implement saving**

In `worker/index.ts`:

Add the import:

```ts
import { gameToDraft, parseGameForm, type GameDraft } from './game';
```

Add `game?: GameDraft;` to `interface AdminView`.

In `showAdmin`, change the return to:

```ts
  return renderAdmin(notes, cfg, now, session, { form, original: editing?.date, flash, game: gameToDraft(editing?.game) });
```

In `adminAction`'s save branch, after `const audioCheck = ...;` add:

```ts
  const gameForm = parseGameForm((name) => field(form, name));
```

after `if (audioCheck && !audioCheck.ok) errors.push(audioCheck.error);` add:

```ts
  if (gameForm.error) errors.push(gameForm.error);
```

in the error `renderAdmin` call, add `game: gameForm.draft,` after `error: errors.join(' '),`.

After `if (audio) note.audio = audio;` add:

```ts
  if (gameForm.game) note.game = gameForm.game;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/notes-views.test.ts tests/notes-routes.test.ts`
Expected: PASS. Then `npm test`: all pass.

- [ ] **Step 7: Commit**

```bash
git add worker/views.ts worker/index.ts tests/notes-views.test.ts tests/notes-routes.test.ts
git commit -m "Add game fields to the notes admin form and save them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The game on the reader page, and admin preview

**Files:**
- Create: `worker/game-script.ts`
- Modify: `worker/views.ts` (`readerPage`)
- Modify: `worker/index.ts` (preview route)
- Test: `tests/notes-game.test.ts`, `tests/notes-views.test.ts`, `tests/notes-routes.test.ts`

**Interfaces:**
- Consumes: `Note`, `Game` from `worker/notes.ts`.
- Produces:
  - `meetText(game: { to: string; meet?: string }, today: string): string` (self-contained; embedded in the browser script).
  - `GAME_STYLE: string` (CSS), `GAME_SCRIPT: string` (a full `<script>...</script>` element; contains the marker `notes-game-played:`).
  - `readerPage({ current, archive, mediaBase, preview? })`. For a game note, today's block is wrapped in `<div class="note" data-game="<date>">`, archive game notes are `<article data-game="<date>">`, and each game note gets `<script type="application/json" class="game-data" data-date="<date>"[ data-preview]>JSON</script>`. Style and script are included once, only if some note has a game. Pages without game notes are unchanged.
  - Route `GET <base>/admin/preview?date=YYYY-MM-DD`: admin only, any date, renders `readerPage({ current: note, archive: [], mediaBase: '<base>/admin/media', preview: true })`. Unknown date: 404. No admin session: admin login page.

- [ ] **Step 1: Write the failing tests**

Append to `tests/notes-game.test.ts` (add `import { meetText, GAME_SCRIPT } from '../worker/game-script';` at the top):

```ts
describe('meetText', () => {
  const game = { to: 'Hill', meet: '2026-10-21' };

  it('counts the sleeps until the meet date', () => {
    expect(meetText(game, '2026-10-10')).toBe('Hill, 21 October · 11 more sleeps');
  });

  it('says one sleep, then today, then nothing', () => {
    expect(meetText(game, '2026-10-20')).toBe('Hill, 21 October · 1 more sleep');
    expect(meetText(game, '2026-10-21')).toBe('Hill, 21 October · Today!');
    expect(meetText(game, '2026-10-22')).toBe('');
  });

  it('counts across month ends and is empty without a meet date', () => {
    expect(meetText({ to: 'Hill', meet: '2026-11-02' }, '2026-10-30')).toBe('Hill, 2 November · 3 more sleeps');
    expect(meetText({ to: 'Hill' }, '2026-10-30')).toBe('');
  });
});

describe('GAME_SCRIPT', () => {
  it('is one script element that parses as JavaScript', () => {
    expect(GAME_SCRIPT.startsWith('<script>')).toBe(true);
    expect(GAME_SCRIPT.indexOf('</script>')).toBe(GAME_SCRIPT.length - '</script>'.length);
    expect(() => new Function(GAME_SCRIPT.slice('<script>'.length, -'</script>'.length))).not.toThrow();
  });

  it('carries the tested countdown code and no em dashes', () => {
    expect(GAME_SCRIPT).toContain('more sleeps');
    expect(GAME_SCRIPT).not.toContain('—');
  });
});
```

Append inside `describe('views', ...)` in `tests/notes-views.test.ts` (add `import { GAME_SCRIPT } from '../worker/game-script';` at the top):

```ts
  const GAME = { kind: 'distance' as const, from: 'Harbour', to: 'Hill', km: 10000, lines: ['first', 'a </script><b>x</b> <!--'], meet: '2026-10-21' };
  const gameJson = (page: string, date: string) =>
    JSON.parse(page.match(new RegExp(`class="game-data" data-date="${date}"[^>]*>([^<]*)</script>`))![1]);

  it('a game note keeps its text in the page and carries its settings safely', () => {
    const page = readerPage({ mediaBase: '/m', current: { date: '2026-10-10', text: 'hello', game: GAME }, archive: [] });
    expect(page).toContain('<div class="note" data-game="2026-10-10">');
    expect(page).toContain('<p class="message">hello</p>');
    expect(page).not.toContain('</script><b>');
    expect(page).not.toContain('<!--');
    expect(gameJson(page, '2026-10-10')).toEqual(GAME);
    expect(page).toContain(GAME_SCRIPT);
    expect(page).not.toContain('data-preview');
  });

  it('plain notes carry no game code', () => {
    for (const page of [pages[1], pages[2]]) {
      expect(page).not.toContain('game-data');
      expect(page).not.toContain('data-game');
      expect(page).not.toContain('notes-game-played:');
    }
  });

  it('archive game notes get a hook, and a game with no lines or meet date is fine', () => {
    const plain = { kind: 'distance' as const, from: 'Harbour', to: 'Hill', km: 5, lines: [] };
    const page = readerPage({
      mediaBase: '/m', current: { date: '2026-10-10', text: 'today' },
      archive: [{ date: '2026-10-05', text: 'old', game: plain }],
    });
    expect(page).toContain('<article data-game="2026-10-05">');
    expect(page).not.toContain('class="note"');
    expect(gameJson(page, '2026-10-05')).toEqual(plain);
    expect(page.split('notes-game-played:').length).toBe(2);
  });

  it('marks preview pages so the game always plays and remembers nothing', () => {
    const page = readerPage({ mediaBase: '/m', current: { date: '2026-10-10', text: 'hi', game: GAME }, archive: [], preview: true });
    expect(page).toContain('data-date="2026-10-10" data-preview>');
  });
```

Append inside `describe('game', ...)` in `tests/notes-routes.test.ts`:

```ts
  it('lets the admin preview any note, even a future one, as the reader would see it', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-05', text: 'soon', game: GAME }]));
    const admin = await login(env, 'admin');
    const res = await handleRequest(get('/for-you/admin/preview?date=2026-10-05', admin), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const html = await res.text();
    expect(html).toContain('soon');
    expect(html).toContain('data-preview');
    expect((await handleRequest(get('/for-you/admin/preview?date=2026-10-06', admin), env, NOW)).status).toBe(404);
    const reader = await login(env, 'reader');
    const asReader = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-05', reader), env, NOW)).text();
    expect(asReader).toContain('Admin password');
    expect(asReader).not.toContain('soon');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/notes-game.test.ts tests/notes-views.test.ts tests/notes-routes.test.ts`
Expected: FAIL (cannot resolve `../worker/game-script`; no preview route).

- [ ] **Step 3: Create `worker/game-script.ts`**

The browser script is a TypeScript string, like `RESIZE_SCRIPT`. Inside it: no backticks, no `${`, no backslashes, no `</script>`. `meetText` is real TypeScript, embedded with `toString()` as a `var` so a bundler renaming the function cannot break it. Keep `meetText` free of nested functions and imports: wrangler's esbuild uses `keepNames`, which inserts `__name(...)` helper calls inside the bodies of functions that contain nested functions, and the browser has no `__name`.

```ts
// Shared by the server tests and the browser (embedded via toString), so it must stay self-contained.
export function meetText(game: { to: string; meet?: string }, today: string): string {
  if (!game.meet) return '';
  const days = Math.round((Date.parse(game.meet + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (days < 0) return '';
  const day = new Date(game.meet + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return game.to + ', ' + day + ' · ' + (days === 0 ? 'Today!' : days === 1 ? '1 more sleep' : days + ' more sleeps');
}

export const GAME_STYLE = `
.game-card { margin: 0 0 1rem; }
.game-stage { position: relative; border-radius: 0.9rem; overflow: hidden; box-shadow: 0 10px 30px rgba(58, 46, 40, 0.18); }
.game-stage canvas { display: block; width: 100%; aspect-ratio: 3 / 2; touch-action: none; outline: none; }
@media (max-width: 520px) { .game-stage canvas { aspect-ratio: 4 / 5; } }
.game-line { position: absolute; left: 1rem; right: 1rem; top: 0.9rem; margin: 0; text-align: center; color: #fff7ec; font-style: italic; font-size: clamp(1.05rem, 3.6vw, 1.35rem); line-height: 1.3; opacity: 0; text-shadow: 0 1px 8px rgba(42, 27, 61, 0.6); pointer-events: none; }
.game-line.show { animation: drift 5s ease-out both; }
.game-km { position: absolute; right: 0.9rem; bottom: 0.6rem; margin: 0; color: rgba(255, 247, 236, 0.85); font-size: 0.95rem; font-variant-numeric: tabular-nums; pointer-events: none; }
.game-begin { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(255, 247, 236, 0.92); color: var(--ink); font-size: 1.3rem; padding: 0.6rem 1.6rem; border-radius: 999px; }
.game-skip { display: block; margin: 0.7rem auto 0; background: none; color: var(--muted); font-style: italic; font-size: 1rem; padding: 0.3rem; text-decoration: underline; }
.replay { display: inline-block; margin: 1rem 0 0; background: none; color: var(--accent); border: 1px solid var(--accent); font-size: 1rem; padding: 0.3rem 0.9rem; border-radius: 999px; }
.meet { color: var(--accent); font-style: italic; font-size: 1.15rem; margin: 0 0 0.6rem; }
.game-reveal { animation: rise 1.8s ease-out both; }
[hidden] { display: none !important; }
@keyframes drift { 0% { opacity: 0; transform: translateY(8px); } 15% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
@media (prefers-reduced-motion: reduce) { .game-line.show { animation: none; opacity: 1; } .game-reveal { animation: none; } }
`;

export const GAME_SCRIPT = `<script>
(function () {
  var PLAYED = 'notes-game-played:';
  var START = 0.84, END = 0.16, GAP = 0.05, SECONDS = 60;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var meetText = ${meetText.toString()};

  function storage(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  function hasPlayed(date) { return storage(function (s) { return s.getItem(PLAYED + date); }) === '1'; }
  function remember(date) { storage(function (s) { s.setItem(PLAYED + date, '1'); }); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function deviceToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function frac(v) { return v - Math.floor(v); }
  function rgb(hex) { var v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
  }

  function createGame(g, before, onDone) {
    var card = el('div', 'game-card');
    var stage = el('div', 'game-stage');
    var canvas = el('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A little light travelling from ' + g.from + ' to ' + g.to);
    var line = el('p', 'game-line');
    line.setAttribute('aria-live', 'polite');
    var km = el('p', 'game-km');
    var begin = el('button', 'game-begin', 'Begin');
    var skip = el('button', 'game-skip', 'Skip to the note');
    begin.type = 'button';
    skip.type = 'button';
    stage.appendChild(canvas);
    stage.appendChild(line);
    stage.appendChild(km);
    stage.appendChild(begin);
    card.appendChild(stage);
    card.appendChild(skip);
    before.parentNode.insertBefore(card, before);

    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, p = 0, y = 0.5, targetY = 0.5;
    var running = false, ended = false, last = 0, slowUntil = 0, metAt = 0, raf = 0;
    var count = g.lines.length;
    var lights = g.lines.map(function (text, i) {
      return { at: (i + 1) / (count + 1), y: 0.22 + 0.56 * frac(Math.sin((i + 1) * 12.9898) * 43758.5453), text: text, shown: false, caught: false, t: 0 };
    });
    var clouds = [0, 1, 2, 3].map(function (i) {
      return { x: i / 4, y: 0.15 + Math.random() * 0.7, r: 0.06 + Math.random() * 0.04, v: 0.035 + Math.random() * 0.03 };
    });
    var stars = [];
    for (var i = 0; i < 60; i++) stars.push({ x: Math.random(), y: Math.random() * 0.8, s: 0.4 + Math.random() * 1.1, t: Math.random() * 6 });

    function routeX(at) { return START + (END + GAP - START) * at; }
    function near(x1, y1, x2, y2, r) { var dx = (x1 - x2) * W, dy = (y1 - y2) * H; return dx * dx + dy * dy < r * r * H * H; }
    function showKm() { km.textContent = Math.round(g.km * (1 - p)).toLocaleString('en-GB') + ' km'; }
    function showLine(text) {
      line.textContent = text;
      line.classList.remove('show');
      void line.offsetWidth;
      line.classList.add('show');
    }
    function resize() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function dot(x, y0, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    function glow(x, y0, r, color) {
      var grad = ctx.createRadialGradient(x, y0, 0, x, y0, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,220,160,0)');
      dot(x, y0, r, grad);
    }
    function label(text, x, y0, alpha) {
      if (alpha <= 0) return;
      ctx.fillStyle = 'rgba(255,247,236,' + alpha + ')';
      ctx.font = 'italic ' + Math.round(H * 0.045) + 'px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y0);
    }

    function draw(t) {
      var warm = metAt ? clamp((t - metAt) / 2000, 0, 1) : 0;
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, mix('#2a1b3d', '#f0b06e', warm));
      sky.addColorStop(0.6, mix('#5b2f4f', '#f6cf9f', warm));
      sky.addColorStop(1, mix('#9c5560', '#fbe6cc', warm));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      stars.forEach(function (s) {
        var a = (reduce ? 0.6 : 0.45 + 0.35 * Math.sin(t / 1300 + s.t)) * (1 - warm);
        dot(s.x * W, s.y * H, s.s, 'rgba(255,244,230,' + a + ')');
      });
      ctx.fillStyle = 'rgba(42,27,61,0.28)';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.bezierCurveTo(W * 0.3, H * 0.86, W * 0.6, H * 0.95, W, H * 0.88);
      ctx.lineTo(W, H);
      ctx.fill();
      lights.forEach(function (l) {
        var lx = routeX(l.at) * W, ly = l.y * H;
        if (!l.shown) {
          var pulse = reduce ? 1 : 1 + 0.15 * Math.sin(t / 400 + l.at * 10);
          glow(lx, ly, H * 0.05 * pulse, 'rgba(255,236,190,0.95)');
        } else if (l.caught && t - l.t < 800) {
          var k = (t - l.t) / 800;
          glow(lx, ly, H * (0.05 + 0.12 * k), 'rgba(255,236,190,' + (0.9 * (1 - k)) + ')');
        }
      });
      clouds.forEach(function (c) {
        [[-0.7, 0.15, 0.7], [0, 0, 1], [0.75, 0.1, 0.75]].forEach(function (b) {
          dot(c.x * W + b[0] * c.r * H, c.y * H + b[1] * c.r * H, b[2] * c.r * H, 'rgba(255,238,232,0.2)');
        });
      });
      var sx = routeX(p) * W, sy = y * H, ex = END * W, ey = 0.5 * H;
      glow(ex, ey, H * (0.09 + 0.5 * warm), 'rgba(255,224,150,0.9)');
      dot(ex, ey, H * 0.018, '#fff6dc');
      glow(sx, sy, H * 0.1, 'rgba(255,200,120,0.85)');
      dot(sx, sy, H * 0.03, '#ffd98f');
      label(g.to, ex, ey + H * 0.1, 0.85 * (1 - warm));
      label(g.from, START * W, 0.5 * H + H * 0.13, 0.85 * (1 - p * 10));
    }

    function frame(t) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      if (running) {
        p = Math.min(1, p + (t < slowUntil ? 0.45 : 1) * dt / SECONDS);
        if (p > 0.92) targetY = 0.5;
        y += (targetY - y) * Math.min(1, dt * 6);
        var sx = routeX(p);
        clouds.forEach(function (c) {
          c.x += c.v * dt;
          if (c.x > 1.2) { c.x = -0.2; c.y = 0.15 + Math.random() * 0.7; }
          if (near(c.x, c.y, sx, y, c.r + 0.03)) slowUntil = t + 900;
        });
        lights.forEach(function (l) {
          if (!l.shown && p >= l.at) {
            l.shown = true;
            l.caught = Math.abs(l.y - y) < 0.09;
            l.t = t;
            showLine(l.text);
          }
        });
        showKm();
        if (p >= 1) { running = false; metAt = t; }
      }
      draw(t);
      if (metAt && t - metAt > 2600) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    function aim(e) {
      var r = canvas.getBoundingClientRect();
      targetY = clamp((e.clientY - r.top) / r.height, 0.1, 0.9);
    }
    function onKey(e) {
      if (!running) return;
      if (e.key === 'ArrowUp') targetY = clamp(targetY - 0.1, 0.1, 0.9);
      else if (e.key === 'ArrowDown') targetY = clamp(targetY + 0.1, 0.1, 0.9);
      else return;
      e.preventDefault();
    }
    function onResize() { resize(); draw(last); }
    function finish() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      card.parentNode.removeChild(card);
      onDone();
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      aim(e);
    });
    canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) aim(e); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    begin.addEventListener('click', function () {
      begin.hidden = true;
      running = true;
      try { canvas.focus({ preventScroll: true }); } catch (e) {}
    });
    skip.addEventListener('click', finish);
    resize();
    showKm();
    raf = requestAnimationFrame(frame);
  }

  Array.prototype.forEach.call(document.querySelectorAll('script.game-data'), function (data) {
    var date = data.getAttribute('data-date');
    var note = document.querySelector('[data-game="' + date + '"]');
    var g;
    try { g = JSON.parse(data.textContent); } catch (e) { return; }
    if (!note || !g || !g.lines) return;
    var preview = data.hasAttribute('data-preview');
    var seen = !preview && hasPlayed(date);
    var meet = meetText(g, deviceToday());
    if (meet) note.insertBefore(el('p', 'meet', meet), note.firstChild);
    var button = el('button', 'replay', 'Play again');
    button.type = 'button';
    note.appendChild(button);
    function play() {
      note.hidden = true;
      createGame(g, note, function () {
        if (!preview) remember(date);
        button.textContent = 'Play again';
        note.classList.remove('game-reveal');
        void note.offsetWidth;
        note.classList.add('game-reveal');
        note.hidden = false;
      });
    }
    button.addEventListener('click', play);
    if (!note.classList.contains('note')) return;
    if (!reduce && !seen) play();
    else if (!seen) button.textContent = 'Play';
  });
})();
</script>`;
```

- [ ] **Step 4: Render game notes on the reader page**

In `worker/views.ts`:

Add `import { GAME_SCRIPT, GAME_STYLE } from './game-script';` to the imports.

Add before `readerPage`:

```ts
// Game settings travel as JSON; every "<" is escaped so a line can never close the script tag.
function gameData(note: Note, preview: boolean): string {
  if (!note.game) return '';
  const json = JSON.stringify(note.game).replace(/</g, '\\u003c');
  return `<script type="application/json" class="game-data" data-date="${escapeHtml(note.date)}"${preview ? ' data-preview' : ''}>${json}</script>`;
}
```

Replace `readerPage` with:

```ts
export function readerPage({ current, archive, mediaBase, preview = false }: {
  current: Note | null; archive: Note[]; mediaBase: string; preview?: boolean;
}): string {
  const body = current
    ? `<p class="date">${formatDate(current.date)}</p>
<p class="message">${escapeHtml(current.text)}</p>
${photoTag(current, mediaBase, false)}
${soundTag(current, mediaBase, false)}`
    : '';
  const today = !current
    ? '<p class="quiet">Nothing here yet. Check back soon.</p>'
    : current.game
      ? `<div class="note" data-game="${escapeHtml(current.date)}">\n${body}\n</div>`
      : body;
  const past = archive.length
    ? `<div class="heart" aria-hidden="true">&#9825;</div>
<section class="archive"><h2>Earlier notes</h2>
${archive.map((n) => `<article${n.game ? ` data-game="${escapeHtml(n.date)}"` : ''}><p class="date">${formatDate(n.date)}</p><p class="text">${escapeHtml(n.text)}</p>${photoTag(n, mediaBase, true)}${soundTag(n, mediaBase, true)}</article>`).join('\n')}
</section>`
    : '';
  const games = [current, ...archive].filter((n): n is Note => Boolean(n?.game));
  const game = games.length
    ? `\n${games.map((n) => gameData(n, preview)).join('\n')}\n<style>${GAME_STYLE}</style>\n${GAME_SCRIPT}`
    : '';
  return readerShell(today + past + game);
}
```

For notes without a game, the output is the same string as before (`today + past + ''`).

- [ ] **Step 5: Add the preview route**

In `worker/index.ts`, add after `showAdmin`:

```ts
async function showPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const note = (await loadNotes(kv)).find((n) => n.date === url.searchParams.get('date'));
  if (!note) return notFound();
  return html(readerPage({ current: note, archive: [], mediaBase: `${cfg.base}/admin/media`, preview: true }));
}
```

and in the `switch` in `handleRequest`, after the `GET /admin` case:

```ts
      case 'GET /admin/preview': return await showPreview(request, kv, cfg, now, url);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/notes-game.test.ts tests/notes-views.test.ts tests/notes-routes.test.ts`
Expected: PASS. Then `npm test`: all pass.

If the `GAME_SCRIPT` parse test fails, look for a backtick, `${` (other than the `meetText` one) or backslash that slipped into the script string.

- [ ] **Step 7: Commit**

```bash
git add worker/game-script.ts worker/views.ts worker/index.ts tests/notes-game.test.ts tests/notes-views.test.ts tests/notes-routes.test.ts
git commit -m "Play a small game before a private note, with admin preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Check it in a real browser, and document it

**Files:** Modify `README.md`. Uses the existing gitignored `.dev.vars` (`NOTES_PATH=/for-you`, local passwords) and local wrangler storage (never production).

- [ ] **Step 1: Run locally**

```bash
npx astro build && npx wrangler dev --port 8787
```
(background). Use Playwright against `http://localhost:8787/for-you`.

- [ ] **Step 2: Click through on a phone-sized screen (390×844)**

1. Admin: save today's note with text `Test note`, Game "Close the distance", From `Harbour`, To `Hill`, Distance `10.000`, Meet date 11 days from today, Lines `First line`, `Second line`, `Third line`. Also save yesterday's note with a game that has no lines and no meet date.
2. The admin list shows `Game` tags. Open Preview for today's note: the game plays every time, even after finishing once.
3. Reader: the game card shows with Begin; the note text is not visible. Tap Begin, drag on the canvas: the light follows. Screenshot mid-journey with a line showing.
4. Wait until the end (about 60 s): the sky warms, then the note appears with `Hill, <date> · 11 more sleeps` above it and a "Play again" button. Screenshot.
5. Reload: the note shows directly with "Play again". "Play again" replays. "Skip to the note" reveals the note right away.
6. Yesterday's archive entry has "Play again". It plays and reveals with no countdown line.
7. `document.documentElement.scrollWidth <= window.innerWidth` is true during play and after.
8. Emulate `prefers-reduced-motion: reduce` with storage cleared: the note shows directly with a "Play" button.

- [ ] **Step 3: Desktop (1280×800)**

Card width matches the text column. Arrow keys move the light after Begin. Screenshot.

- [ ] **Step 4: Main site unchanged**

`/` and `/works/` return 200. Stop the dev server. Delete `.playwright-mcp/` if created. Save screenshots under `.superpowers/sdd/2026-10-10-notes-game/` (gitignored).

- [ ] **Step 5: README**

In `README.md`'s "Private notes" section, add after the photos and sound bullet:

```markdown
- A note can carry an optional game (`game`, currently only "Close the distance"): start and destination labels, distance, optional meet date, and up to 8 short lines. The reader page shows the game first and reveals the note at the end; the note is always in the HTML, so it still shows without JavaScript. "Preview" in the admin list shows any note as the reader would see it. Older Worker versions drop `game` when saving, so after a rollback do not save notes.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Document the game on private notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Go live safely (needs Rolf's go-ahead)

- [ ] **Step 1: Back up the live notes (never print them)**

```bash
npx wrangler kv key get notes --binding NOTES --remote > /c/Users/Admin/Documents/rolfll-notes-backup/notes-2026-10-10.json
node -e "const n=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('backed up',n.length,'notes')" /c/Users/Admin/Documents/rolfll-notes-backup/notes-2026-10-10.json
```
Expected: a count of at least 8.

- [ ] **Step 2: Merge and publish (only after Rolf says go)**

```bash
git checkout master && git merge --ff-only notes-game && npm test
git push origin master
```
Wait for a new entry in `npx wrangler deployments list` newer than the push.

- [ ] **Step 3: Verify nothing broke**

1. `https://rolfll.com/` and `/works/` return 200. The notes page returns 200 with `X-Robots-Tag: noindex, nofollow`.
2. Live notes unchanged: fetch `notes` again and compare byte-for-byte with the backup. Print only "identical" or "different".
3. Rolf opens the reader page on his phone: today's note shows as before.

- [ ] **Step 4: The real game note (in chat, never in the repo)**

Draft 6 to 8 lines from Rolf's earlier notes and give them to him in chat. He edits them and writes the game note in admin, then checks it with Preview on his phone before its date.

- [ ] **Step 5: If anything is wrong**

Rolf runs `npx wrangler rollback` in his own PowerShell (it prompts). Reading still works, but the previous code drops `game` (it keeps photo and sound) when it saves. After a rollback, back up KV and do not save or delete notes until this version is redeployed.
