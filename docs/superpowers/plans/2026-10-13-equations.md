# Equation Drawings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a daily note hold animated equation drawings, placed by a `[[name]]` marker line in its text.

**Architecture:**
- **`worker/curves.ts`:** the pure maths, how each curve fits the 320×240 panel, the finished curve as an SVG path, and a plain-ES5 copy of the formulas for the browser.
- **`worker/equations.ts`:** finds markers, splits note text and draws a figure (MathML equation plus the still SVG).
- **`worker/equation-script.ts`:** the canvas animation script and its styles.
- **`worker/views.ts`:** renders figures in place of markers and adds the admin hint and tag.
- **`worker/index.ts`:** rejects unknown markers or too many drawings on save.

**Tech Stack:** Cloudflare Workers (TypeScript), Vitest. `npm test` = `astro build && vitest run`.

**Spec:** `docs/superpowers/specs/2026-10-13-equations-design.md`

## Global Constraints

- **Public repo.** Never commit note contents, real names, dates, the notes path, `.dev.vars` or backups. Tests use placeholder text.
- **Markers:**
  - A marker is a line whose whole trimmed content is `[[name]]`.
  - Names are matched case-insensitively with inner spaces collapsed.
  - The names are exactly `heart`, `filling heart`, `butterfly` and `fourier heart`.
  - At most 3 per note.
- **Error copy, verbatim:**
  - "Unknown drawing [[NAME]]. Use [[heart]], [[filling heart]], [[butterfly]] or [[fourier heart]]."
  - "A note can hold at most 3 drawings."
- **Nothing new is stored.** Markers are note text, and the note's stored text is unchanged.
- **Escaping:** note text reaches HTML only through `escapeHtml`. Scripts contain only fixed numbers from `curves.ts`, never note data.
- **Inline scripts:** plain ES5, no outside libraries, no storage.
- **Colours:**
  - panel: `linear-gradient(180deg, #1f1530, #3b2752)`;
  - curve: `#e8c27a` with a glow;
  - circles: faint cream.
- **Copy:** no em dashes in user-facing text.

## Review Focus

1. **A drawing inside a game note** must not play behind the game card; it starts once the game reveals the note. Pinned in Task 4 (the figure sits inside the game note's wrapper, which the game hides with `hidden`, and hidden elements never intersect). Checked in the browser in Task 6.
2. **A narrow phone (320px wide):** a wide equation scrolls inside its own box, and the page never scrolls sideways. Checked in the browser in Task 6.
3. **Several drawings on one page** (today's note and the archive, or the same curve twice) animate independently. Pinned in Task 3 (the stand-in page runs two heart figures).
4. **A note with markers** saves and re-edits with its text byte for byte unchanged. Pinned in Task 5.
5. **Rotating the phone or resizing after a drawing finishes** must not leave a blank panel. Pinned in Task 3 (the resize handler redraws). Checked in the browser in Task 6.

---

### Task 1: The curves

**Files:**
- Create: `worker/curves.ts`
- Test: `tests/notes-curves.test.ts`

**Interfaces:**
- Produces:
  - `EQ_W = 320`, `EQ_H = 240`
  - `type CurveName = 'heart' | 'filling heart' | 'butterfly' | 'fourier heart'`, `CURVE_NAMES: CurveName[]`
  - `interface Point { x: number; y: number }`
  - `heartPoint(t): Point`, `fillingHeartY(x, k): number`, `butterflyPoint(theta): Point`, `implicitHeartPoint(phi): Point`
  - `FILL_K = 100`, `FILL_X = √3`, `BUTTERFLY_TURNS = 12`, `FOURIER_TERMS = 40`
  - `interface Term { n; re; im }`, `interface Series { center: Point; terms: Term[] }`, `fourierSeries(): Series`, `fourierPoint(s, count, t): Point`
  - `finishedPoints(name): Point[]`
  - `interface Fit { scale; cx; cy }`, `fitFor(name): Fit`, `toPanel(p, fit): Point`
  - `curvePath(name): string`
  - `CURVE_MATH_JS: string` (ES5 versions of `heartPoint`, `fillingHeartY`, `butterflyPoint`, `fourierPoint`)

- [ ] **Step 1: Write the failing tests**

`tests/notes-curves.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CURVE_NAMES, CURVE_MATH_JS, EQ_W, EQ_H, FILL_X, FOURIER_TERMS, curvePath, finishedPoints, fitFor, toPanel,
  fourierSeries, fourierPoint, implicitHeartPoint, heartPoint, fillingHeartY, butterflyPoint, type Point,
} from '../worker/curves';

function inPanel(points: Point[]): boolean {
  return points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && q.x >= 0 && q.x <= EQ_W && q.y >= 0 && q.y <= EQ_H);
}

describe('curves', () => {
  it('fits every finished curve inside the panel', () => {
    for (const name of CURVE_NAMES) {
      const fit = fitFor(name);
      expect(inPanel(finishedPoints(name).map((p) => toPanel(p, fit))), name).toBe(true);
    }
  });

  it('keeps the filling heart inside the panel for every k on the way', () => {
    const fit = fitFor('filling heart');
    for (const k of [0, 3.7, 25, 61.2, 100]) {
      const points = Array.from({ length: 401 }, (_, i) => {
        const x = -FILL_X + (2 * FILL_X * i) / 400;
        return toPanel({ x, y: fillingHeartY(x, k) }, fit);
      });
      expect(inPanel(points), `k=${k}`).toBe(true);
    }
  });

  it('writes each finished curve as a compact SVG path', () => {
    for (const name of CURVE_NAMES) {
      const d = curvePath(name);
      expect(d, name).toMatch(/^M\d+(\.\d)? \d+(\.\d)?(L\d+(\.\d)? \d+(\.\d)?)+$/);
      expect(d.length, name).toBeLessThan(40_000);
    }
  });

  it('finds points on the heart (x² + y² − 1)³ = x²y³', () => {
    for (const phi of [0.3, 1.2, 2.5, 4, 5.5]) {
      const { x, y } = implicitHeartPoint(phi);
      expect(Math.abs((x * x + y * y - 1) ** 3 - x * x * y ** 3)).toBeLessThan(1e-9);
    }
  });

  it('draws that heart with 40 Fourier terms, largest first, and visibly rougher with few', () => {
    const s = fourierSeries();
    expect(s.terms).toHaveLength(FOURIER_TERMS);
    const sizes = s.terms.map((t) => Math.hypot(t.re, t.im));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    const worst = (count: number) => {
      let error = 0;
      for (let j = 0; j < 500; j++) {
        const t = (2 * Math.PI * j) / 500;
        const a = fourierPoint(s, count, t);
        const b = implicitHeartPoint(t);
        error = Math.max(error, Math.hypot(a.x - b.x, a.y - b.y));
      }
      return error;
    };
    expect(worst(FOURIER_TERMS)).toBeLessThan(0.06);
    expect(worst(3)).toBeGreaterThan(0.15);
  });

  it('gives the browser the same maths', () => {
    const js = new Function(`${CURVE_MATH_JS}; return { heartPoint, fillingHeartY, butterflyPoint, fourierPoint };`)();
    const s = fourierSeries();
    for (const u of [0, 0.7, 2.1, 5.9, 40.3]) {
      expect(js.heartPoint(u).x).toBeCloseTo(heartPoint(u).x, 9);
      expect(js.heartPoint(u).y).toBeCloseTo(heartPoint(u).y, 9);
      expect(js.butterflyPoint(u).x).toBeCloseTo(butterflyPoint(u).x, 9);
      expect(js.butterflyPoint(u).y).toBeCloseTo(butterflyPoint(u).y, 9);
      expect(js.fillingHeartY(u / 30, 57)).toBeCloseTo(fillingHeartY(u / 30, 57), 9);
      expect(js.fourierPoint(s, 12, u).x).toBeCloseTo(fourierPoint(s, 12, u).x, 9);
      expect(js.fourierPoint(s, 12, u).y).toBeCloseTo(fourierPoint(s, 12, u).y, 9);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-curves.test.ts`
Expected: FAIL, because `../worker/curves` cannot be resolved.

- [ ] **Step 3: Implement**

`worker/curves.ts`:

```ts
// The four equation drawings: their maths, how each fits the 320×240 panel, and the finished curve as SVG.
export const EQ_W = 320;
export const EQ_H = 240;
const MARGIN = 16;
const TAU = 2 * Math.PI;

export type CurveName = 'heart' | 'filling heart' | 'butterfly' | 'fourier heart';
export const CURVE_NAMES: CurveName[] = ['heart', 'filling heart', 'butterfly', 'fourier heart'];

export interface Point {
  x: number;
  y: number;
}

/** x = 16 sin³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t */
export function heartPoint(t: number): Point {
  return { x: 16 * Math.sin(t) ** 3, y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) };
}

export const FILL_K = 100;
export const FILL_X = Math.sqrt(3);

/** y = x^(2/3) + 0.9 sin(kx) √(3 − x²), for |x| ≤ √3 */
export function fillingHeartY(x: number, k: number): number {
  return Math.cbrt(x * x) + 0.9 * Math.sin(k * x) * Math.sqrt(Math.max(0, 3 - x * x));
}

export const BUTTERFLY_TURNS = 12;

/** r = e^(sin θ) − 2 cos 4θ + sin⁵((2θ − π)/24), for θ from 0 to 24π */
export function butterflyPoint(theta: number): Point {
  const r = Math.exp(Math.sin(theta)) - 2 * Math.cos(4 * theta) + Math.sin((2 * theta - Math.PI) / 24) ** 5;
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** The point of (x² + y² − 1)³ = x²y³ in direction φ from the origin, found by bisection. */
export function implicitHeartPoint(phi: number): Point {
  const c = Math.cos(phi) ** 2 * Math.sin(phi) ** 3;
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if ((mid * mid - 1) ** 3 - mid ** 5 * c < 0) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  return { x: r * Math.cos(phi), y: r * Math.sin(phi) };
}

export interface Term {
  n: number;
  re: number;
  im: number;
}

export interface Series {
  center: Point;
  terms: Term[];
}

const FOURIER_SAMPLES = 256;
export const FOURIER_TERMS = 40;
let series: Series | null = null;

/** The 40 largest Fourier terms of the implicit heart, largest first. Computed once. */
export function fourierSeries(): Series {
  if (series) return series;
  const z = Array.from({ length: FOURIER_SAMPLES }, (_, j) => implicitHeartPoint((TAU * j) / FOURIER_SAMPLES));
  const all: Term[] = [];
  for (let n = -FOURIER_SAMPLES / 2; n < FOURIER_SAMPLES / 2; n++) {
    let re = 0;
    let im = 0;
    z.forEach((p, j) => {
      const a = (-n * TAU * j) / FOURIER_SAMPLES;
      re += p.x * Math.cos(a) - p.y * Math.sin(a);
      im += p.x * Math.sin(a) + p.y * Math.cos(a);
    });
    all.push({ n, re: re / FOURIER_SAMPLES, im: im / FOURIER_SAMPLES });
  }
  const zero = all.find((t) => t.n === 0)!;
  const terms = all
    .filter((t) => t.n !== 0)
    .sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im))
    .slice(0, FOURIER_TERMS);
  series = { center: { x: zero.re, y: zero.im }, terms };
  return series;
}

/** The partial sum of the first `count` terms at t. */
export function fourierPoint(s: Series, count: number, t: number): Point {
  let x = s.center.x;
  let y = s.center.y;
  for (const c of s.terms.slice(0, count)) {
    const cos = Math.cos(c.n * t);
    const sin = Math.sin(c.n * t);
    x += c.re * cos - c.im * sin;
    y += c.re * sin + c.im * cos;
  }
  return { x, y };
}

function sample(f: (u: number) => Point, from: number, to: number, steps: number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => f(from + ((to - from) * i) / steps));
}

/** The finished curve, in its own coordinates. */
export function finishedPoints(name: CurveName): Point[] {
  switch (name) {
    case 'heart':
      return sample(heartPoint, 0, TAU, 400);
    case 'filling heart':
      return sample((x) => ({ x, y: fillingHeartY(x, FILL_K) }), -FILL_X, FILL_X, 1600);
    case 'butterfly':
      return sample(butterflyPoint, 0, BUTTERFLY_TURNS * TAU, 2400);
    case 'fourier heart': {
      const s = fourierSeries();
      return sample((t) => fourierPoint(s, FOURIER_TERMS, t), 0, TAU, 400);
    }
  }
}

// Every k keeps the filling heart between these two curves, so it never leaves the panel as k grows.
function extentPoints(name: CurveName): Point[] {
  if (name !== 'filling heart') return finishedPoints(name);
  const edge = (sign: number) => (x: number) => ({ x, y: Math.cbrt(x * x) + sign * 0.9 * Math.sqrt(Math.max(0, 3 - x * x)) });
  return [...sample(edge(1), -FILL_X, FILL_X, 400), ...sample(edge(-1), -FILL_X, FILL_X, 400)];
}

export interface Fit {
  scale: number;
  cx: number;
  cy: number;
}

const fits = new Map<CurveName, Fit>();

/** Scale and centre that fit the curve's whole extent inside the panel, keeping its proportions. */
export function fitFor(name: CurveName): Fit {
  const known = fits.get(name);
  if (known) return known;
  const points = extentPoints(name);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fit = {
    scale: Math.min((EQ_W - 2 * MARGIN) / (maxX - minX), (EQ_H - 2 * MARGIN) / (maxY - minY)),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
  fits.set(name, fit);
  return fit;
}

export function toPanel(p: Point, fit: Fit): Point {
  return { x: EQ_W / 2 + (p.x - fit.cx) * fit.scale, y: EQ_H / 2 - (p.y - fit.cy) * fit.scale };
}

const paths = new Map<CurveName, string>();

/** The finished curve as an SVG path in panel coordinates, one decimal, repeated points dropped. */
export function curvePath(name: CurveName): string {
  const known = paths.get(name);
  if (known) return known;
  const fit = fitFor(name);
  const parts: string[] = [];
  let last = '';
  for (const p of finishedPoints(name)) {
    const q = toPanel(p, fit);
    const xy = `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    if (xy !== last) parts.push(`${parts.length ? 'L' : 'M'}${xy}`);
    last = xy;
  }
  const d = parts.join('');
  paths.set(name, d);
  return d;
}

/** The same formulas for the browser, as plain ES5. Tests check they agree with the ones above. */
export const CURVE_MATH_JS = `
function heartPoint(t) { var s = Math.sin(t); return { x: 16 * s * s * s, y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) }; }
function fillingHeartY(x, k) { return Math.pow(x * x, 1 / 3) + 0.9 * Math.sin(k * x) * Math.sqrt(Math.max(0, 3 - x * x)); }
function butterflyPoint(th) { var s = Math.sin((2 * th - Math.PI) / 24); var r = Math.exp(Math.sin(th)) - 2 * Math.cos(4 * th) + s * s * s * s * s; return { x: r * Math.cos(th), y: r * Math.sin(th) }; }
function fourierPoint(f, count, t) { var x = f.center.x, y = f.center.y; for (var i = 0; i < count && i < f.terms.length; i++) { var c = f.terms[i], co = Math.cos(c.n * t), si = Math.sin(c.n * t); x += c.re * co - c.im * si; y += c.re * si + c.im * co; } return { x: x, y: y }; }
`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-curves.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/curves.ts tests/notes-curves.test.ts
git commit -m "Add the maths for four equation drawings"
```

---

### Task 2: Markers and figures

**Files:**
- Create: `worker/equations.ts`
- Test: `tests/notes-equations.test.ts`

**Interfaces:**
- Consumes: `CURVE_NAMES`, `curvePath`, `EQ_W`, `EQ_H`, `CurveName` (curves.ts); `escapeHtml` (html.ts).
- Produces:
  - `MAX_DRAWINGS = 3`
  - `type Piece = { kind: 'text'; text: string } | { kind: 'curve'; name: CurveName }`
  - `splitNote(text): Piece[]`
  - `checkDrawings(text): string | undefined`
  - `hasDrawings(text): boolean`
  - `equationFigure(name: CurveName): string`

- [ ] **Step 1: Write the failing tests**

`tests/notes-equations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitNote, checkDrawings, hasDrawings, equationFigure, MAX_DRAWINGS } from '../worker/equations';

describe('splitNote', () => {
  it('splits at marker lines, with any case and spacing', () => {
    expect(splitNote('Before\n[[heart]]\nAfter')).toEqual([
      { kind: 'text', text: 'Before' }, { kind: 'curve', name: 'heart' }, { kind: 'text', text: 'After' },
    ]);
    expect(splitNote('  [[ Fourier   HEART ]]  ')).toEqual([{ kind: 'curve', name: 'fourier heart' }]);
    expect(splitNote('a\n\n[[butterfly]]\n\nb\nc')).toEqual([
      { kind: 'text', text: 'a' }, { kind: 'curve', name: 'butterfly' }, { kind: 'text', text: 'b\nc' },
    ]);
  });

  it('leaves markers inside a line, unknown names and plain notes as text', () => {
    expect(splitNote('I said [[heart]] mid-line')).toEqual([{ kind: 'text', text: 'I said [[heart]] mid-line' }]);
    expect(splitNote('[[hart]]\nx')).toEqual([{ kind: 'text', text: '[[hart]]\nx' }]);
    expect(splitNote('one\ntwo')).toEqual([{ kind: 'text', text: 'one\ntwo' }]);
  });
});

describe('checkDrawings', () => {
  it('accepts known markers up to the limit, and notes without markers', () => {
    expect(checkDrawings('[[heart]]\n[[Filling Heart]]\n[[butterfly]]')).toBeUndefined();
    expect(checkDrawings('no markers, [[x]] mid-line')).toBeUndefined();
  });

  it('names an unknown marker and lists the choices', () => {
    expect(checkDrawings('Hi\n[[hart]]')).toBe(
      'Unknown drawing [[hart]]. Use [[heart]], [[filling heart]], [[butterfly]] or [[fourier heart]].',
    );
  });

  it('refuses more than three drawings', () => {
    expect(checkDrawings('[[heart]]\n'.repeat(MAX_DRAWINGS + 1))).toBe('A note can hold at most 3 drawings.');
  });
});

describe('hasDrawings', () => {
  it('is true only for a known marker on its own line', () => {
    expect(hasDrawings('x\n[[Heart]]')).toBe(true);
    expect(hasDrawings('[[hart]]')).toBe(false);
    expect(hasDrawings('see [[heart]]')).toBe(false);
  });
});

describe('equationFigure', () => {
  it('holds the curve name, its equation, the finished drawing and a hidden replay button', () => {
    const html = equationFigure('filling heart');
    expect(html).toContain('<figure class="equation" data-curve="filling heart">');
    expect(html).toContain('<math display="block">');
    expect(html).toContain('<msqrt>');
    expect(html).toMatch(/<svg viewBox="0 0 320 240" aria-hidden="true"><path d="M[\d. L]+"\/><\/svg>/);
    expect(html).toContain('<span class="eq-counter" aria-hidden="true"></span>');
    expect(html).toContain('<button type="button" class="eq-again" hidden>Draw again</button>');
  });

  it('typesets each curve', () => {
    expect(equationFigure('heart')).toContain('<msup><mi>sin</mi><mn>3</mn></msup>');
    expect(equationFigure('butterfly')).toContain('<mn>24</mn>');
    expect(equationFigure('fourier heart')).toContain('<mo>∑</mo>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-equations.test.ts`
Expected: FAIL, because `../worker/equations` cannot be resolved.

- [ ] **Step 3: Implement**

`worker/equations.ts`:

```ts
import { CURVE_NAMES, curvePath, EQ_W, EQ_H, type CurveName } from './curves';
import { escapeHtml } from './html';

export const MAX_DRAWINGS = 3;
const TOO_MANY = `A note can hold at most ${MAX_DRAWINGS} drawings.`;
const MARKER = /^\[\[([^[\]]+)\]\]$/;

export type Piece = { kind: 'text'; text: string } | { kind: 'curve'; name: CurveName };

/** The marker's name if the whole line is one, known or not. */
function markerOn(line: string): string | null {
  const match = MARKER.exec(line.trim());
  return match ? match[1].trim().toLowerCase().replace(/\s+/g, ' ') : null;
}

function isCurve(name: string): name is CurveName {
  return (CURVE_NAMES as string[]).includes(name);
}

function markers(text: string): string[] {
  return text.split('\n').map(markerOn).filter((name): name is string => name !== null);
}

/** Why the note's markers can't be drawn, or undefined when they can. */
export function checkDrawings(text: string): string | undefined {
  const names = markers(text);
  const unknown = names.find((name) => !isCurve(name));
  if (unknown !== undefined) {
    const choices = CURVE_NAMES.map((n) => `[[${n}]]`);
    return `Unknown drawing [[${unknown}]]. Use ${choices.slice(0, -1).join(', ')} or ${choices[choices.length - 1]}.`;
  }
  return names.length > MAX_DRAWINGS ? TOO_MANY : undefined;
}

export function hasDrawings(text: string): boolean {
  return markers(text).some(isCurve);
}

/** The note split at its drawing markers. Unknown markers stay as text. */
export function splitNote(text: string): Piece[] {
  const pieces: Piece[] = [];
  let lines: string[] = [];
  const flush = () => {
    const chunk = lines.join('\n').replace(/^\n+|\n+$/g, '');
    if (chunk.trim() !== '') pieces.push({ kind: 'text', text: chunk });
    lines = [];
  };
  for (const line of text.split('\n')) {
    const name = markerOn(line);
    if (name !== null && isCurve(name)) {
      flush();
      pieces.push({ kind: 'curve', name });
    } else {
      lines.push(line);
    }
  }
  flush();
  return pieces;
}

// The typeset equations, written once per curve.
const MATH: Record<CurveName, string> = {
  'heart': '<math display="block"><mtable><mtr><mtd><mi>x</mi><mo>=</mo><mn>16</mn><msup><mi>sin</mi><mn>3</mn></msup><mi>t</mi></mtd></mtr><mtr><mtd><mi>y</mi><mo>=</mo><mn>13</mn><mi>cos</mi><mi>t</mi><mo>−</mo><mn>5</mn><mi>cos</mi><mn>2</mn><mi>t</mi><mo>−</mo><mn>2</mn><mi>cos</mi><mn>3</mn><mi>t</mi><mo>−</mo><mi>cos</mi><mn>4</mn><mi>t</mi></mtd></mtr></mtable></math>',
  'filling heart': '<math display="block"><mi>y</mi><mo>=</mo><msup><mi>x</mi><mfrac><mn>2</mn><mn>3</mn></mfrac></msup><mo>+</mo><mn>0.9</mn><mi>sin</mi><mo>(</mo><mi>k</mi><mi>x</mi><mo>)</mo><msqrt><mn>3</mn><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></msqrt></math>',
  'butterfly': '<math display="block"><mi>r</mi><mo>=</mo><msup><mi>e</mi><mrow><mi>sin</mi><mi>θ</mi></mrow></msup><mo>−</mo><mn>2</mn><mi>cos</mi><mn>4</mn><mi>θ</mi><mo>+</mo><msup><mi>sin</mi><mn>5</mn></msup><mrow><mo>(</mo><mfrac><mrow><mn>2</mn><mi>θ</mi><mo>−</mo><mi>π</mi></mrow><mn>24</mn></mfrac><mo>)</mo></mrow></math>',
  'fourier heart': '<math display="block"><mi>f</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>=</mo><munderover><mo>∑</mo><mrow><mi>n</mi><mo>=</mo><mo>−</mo><mi>∞</mi></mrow><mi>∞</mi></munderover><msub><mi>c</mi><mi>n</mi></msub><msup><mi>e</mi><mrow><mi>i</mi><mi>n</mi><mi>t</mi></mrow></msup></math>',
};

/** The equation, the finished curve (seen without JavaScript or with reduced motion) and a replay button. */
export function equationFigure(name: CurveName): string {
  return `<figure class="equation" data-curve="${escapeHtml(name)}">
<div class="eq-math">${MATH[name]}</div>
<div class="eq-panel"><svg viewBox="0 0 ${EQ_W} ${EQ_H}" aria-hidden="true"><path d="${curvePath(name)}"/></svg><span class="eq-counter" aria-hidden="true"></span></div>
<button type="button" class="eq-again" hidden>Draw again</button>
</figure>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-equations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/equations.ts tests/notes-equations.test.ts
git commit -m "Find drawing markers in notes and draw their figures"
```

---

### Task 3: The animation script and styles

**Files:**
- Create: `worker/equation-script.ts`
- Test: `tests/notes-equation-script.test.ts`

**Interfaces:**
- Consumes: from curves.ts, `CURVE_NAMES`, `CURVE_MATH_JS`, `fitFor`, `fourierSeries`, `FILL_K`, `FILL_X`, `BUTTERFLY_TURNS`, `EQ_W` and `EQ_H`.
- Produces: `EQUATION_STYLE: string` and `equationScript(): string` (one `<script>…</script>`, memoised).

- [ ] **Step 1: Write the failing tests**

`tests/notes-equation-script.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { equationScript, EQUATION_STYLE } from '../worker/equation-script';

const script = equationScript();
const body = script.slice('<script>'.length, -'</script>'.length);

describe('equation script', () => {
  it('is one plain ES5 script', () => {
    expect(script.startsWith('<script>')).toBe(true);
    expect(script.endsWith('</script>')).toBe(true);
    expect(body).not.toMatch(/=>|\blet\b|\bconst\b|`|<\//);
    expect(() => new Function(body)).not.toThrow();
  });

  it('waits until a drawing is in view, leaves reduced motion alone and stores nothing', () => {
    expect(body).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(body).toContain('threshold: 0.4');
    expect(body).not.toContain('localStorage');
  });

  it('styles the panel, hides the still drawing once live and keeps a hidden button hidden', () => {
    expect(EQUATION_STYLE).toContain('linear-gradient(180deg, #1f1530, #3b2752)');
    expect(EQUATION_STYLE).toContain('.eq-panel.live svg { visibility: hidden; }');
    expect(EQUATION_STYLE).toContain('.eq-again[hidden] { display: none; }');
    expect(EQUATION_STYLE).toContain('overflow-x: auto');
  });

  it('plays every curve to the end on a stand-in page, and again on request', () => {
    const frames: ((now: number) => void)[] = [];
    let observe: (entries: unknown[]) => void = () => {};
    const watched: unknown[] = [];
    const resizers: (() => void)[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}) });
    const figure = (curve: string) => {
      const panel = { className: 'eq-panel', clientWidth: 320, parentNode: null as unknown, appendChild() {} };
      const counter = { textContent: '' };
      const again = { hidden: true, click: () => {}, addEventListener(_: string, f: () => void) { this.click = f; } };
      const parts: Record<string, unknown> = { '.eq-panel': panel, '.eq-counter': counter, '.eq-again': again };
      const fig = { getAttribute: () => curve, querySelector: (sel: string) => parts[sel] };
      panel.parentNode = fig;
      return { fig, panel, counter, again };
    };
    const figs = ['heart', 'filling heart', 'butterfly', 'fourier heart', 'heart'].map(figure);
    const win = {
      requestAnimationFrame: (f: (now: number) => void) => frames.push(f),
      IntersectionObserver: class {
        constructor(cb: (entries: unknown[]) => void) { observe = cb; }
        observe(target: unknown) { watched.push(target); }
        unobserve() {}
      },
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 2,
      addEventListener: (_: string, f: () => void) => resizers.push(f),
    };
    const doc = {
      querySelectorAll: () => figs.map((f) => f.fig),
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    };
    new Function('window', 'document', 'requestAnimationFrame', 'IntersectionObserver', body)(
      win, doc, win.requestAnimationFrame, win.IntersectionObserver,
    );
    let now = 0;
    const run = () => {
      for (let i = 0; i < 2000 && frames.length > 0; i++) {
        now += 16;
        frames.splice(0).forEach((f) => f(now));
      }
    };
    expect(watched).toHaveLength(5);
    observe(watched.map((target) => ({ isIntersecting: true, target })));
    run();
    for (const f of figs) {
      expect(f.again.hidden, f.fig.getAttribute()).toBe(false);
      expect(f.panel.className).toBe('eq-panel live done');
    }
    expect(figs[1].counter.textContent).toBe('k = 100.0');
    expect(figs[3].counter.textContent).toBe('n = 40');
    expect(() => resizers.forEach((r) => r())).not.toThrow();
    figs[0].again.click();
    expect(figs[0].again.hidden).toBe(true);
    run();
    expect(figs[0].again.hidden).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notes-equation-script.test.ts`
Expected: FAIL, because `../worker/equation-script` cannot be resolved.

- [ ] **Step 3: Implement**

`worker/equation-script.ts`:

```ts
import { CURVE_NAMES, CURVE_MATH_JS, fitFor, fourierSeries, FILL_K, FILL_X, BUTTERFLY_TURNS, EQ_W, EQ_H } from './curves';

export const EQUATION_STYLE = `
.equation { margin: 1.75rem 0; }
.eq-math { overflow-x: auto; overflow-y: hidden; color: var(--ink); font-size: 1.2rem; padding: 0.2rem 0 0.7rem; }
.eq-panel { position: relative; aspect-ratio: 4 / 3; border-radius: 0.9rem; overflow: hidden; background: linear-gradient(180deg, #1f1530, #3b2752); box-shadow: 0 10px 30px rgba(58, 46, 40, 0.18); }
.eq-panel svg, .eq-panel canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.eq-panel svg path { fill: none; stroke: #e8c27a; stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(232, 194, 122, 0.7)); }
.eq-panel.live svg { visibility: hidden; }
.eq-counter { position: absolute; right: 0.8rem; bottom: 0.55rem; color: rgba(255, 243, 214, 0.75); font-style: italic; font-size: 1rem; }
.eq-again { display: block; margin: 0.6rem auto 0; background: none; border: 0; color: var(--muted); font-style: italic; font-size: 1rem; padding: 0.3rem; text-decoration: underline; cursor: pointer; }
.eq-again[hidden] { display: none; }
.equation[data-curve="heart"] .eq-panel.done canvas { animation: eq-breathe 3.2s ease-in-out infinite; }
.archive .equation { max-width: 28rem; }
@keyframes eq-breathe { 50% { transform: scale(1.02); } }
`;

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

// Fixed numbers only: how each curve sits in the panel, and the Fourier terms. Nothing from a note.
function curveData(): string {
  const fits: Record<string, { scale: number; cx: number; cy: number }> = {};
  for (const name of CURVE_NAMES) {
    const f = fitFor(name);
    fits[name] = { scale: round(f.scale), cx: round(f.cx), cy: round(f.cy) };
  }
  const s = fourierSeries();
  return JSON.stringify({
    w: EQ_W, h: EQ_H, fillK: FILL_K, fillX: round(FILL_X), turns: BUTTERFLY_TURNS, fits,
    fourier: {
      center: { x: round(s.center.x), y: round(s.center.y) },
      terms: s.terms.map((t) => ({ n: t.n, re: round(t.re), im: round(t.im) })),
    },
  });
}

let script: string | null = null;

/** Draws each figure on a canvas once it is 40% in view; the still SVG stays wherever this can't run. */
export function equationScript(): string {
  if (script) return script;
  script = `<script>
(function () {
  if (!window.requestAnimationFrame || !window.IntersectionObserver) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var D = ${curveData()};
${CURVE_MATH_JS}
  var TAU = Math.PI * 2, FILL_SECONDS = 10, FADE_SECONDS = 1;
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(2 - 2 * p, 2) / 2; }
  function toPanel(p, fit) { return { x: D.w / 2 + (p.x - fit.cx) * fit.scale, y: D.h / 2 - (p.y - fit.cy) * fit.scale }; }
  function sample(f, from, to, steps, fit) {
    var pts = [];
    for (var i = 0; i <= steps; i++) pts.push(toPanel(f(from + (to - from) * i / steps), fit));
    return pts;
  }
  function glow(ctx) {
    ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(232, 194, 122, 0.75)'; ctx.shadowBlur = 8;
  }
  function line(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i].x, pts[i].y); else ctx.moveTo(pts[i].x, pts[i].y); }
    ctx.stroke();
  }
  function tip(ctx, p) {
    ctx.save(); ctx.fillStyle = '#fff3d6'; ctx.shadowColor = '#ffe7a8'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill(); ctx.restore();
  }
  // A curve that traces itself: the finished points, drawn up to the eased progress.
  function tracer(seconds, make) {
    return {
      setup: function () { return { pts: make() }; },
      frame: function (ctx, s, t) {
        var p = Math.min(1, t / seconds), n = Math.max(2, Math.round(ease(p) * (s.pts.length - 1)) + 1);
        glow(ctx); line(ctx, s.pts.slice(0, n));
        if (p < 1) tip(ctx, s.pts[n - 1]);
        return { done: p >= 1, counter: '' };
      }
    };
  }
  var CURVES = {
    'heart': tracer(6, function () { return sample(heartPoint, 0, TAU, 400, D.fits['heart']); }),
    'butterfly': tracer(12, function () { return sample(butterflyPoint, 0, D.turns * TAU, 2400, D.fits['butterfly']); }),
    'filling heart': {
      setup: function () { return {}; },
      frame: function (ctx, s, t) {
        var p = Math.min(1, t / FILL_SECONDS), k = D.fillK * ease(p), fit = D.fits['filling heart'];
        var steps = Math.max(300, Math.ceil(k * 16)), pts = [];
        for (var i = 0; i <= steps; i++) {
          var x = -D.fillX + 2 * D.fillX * i / steps;
          pts.push(toPanel({ x: x, y: fillingHeartY(x, k) }, fit));
        }
        glow(ctx); line(ctx, pts);
        return { done: p >= 1, counter: 'k = ' + k.toFixed(1) };
      }
    },
    'fourier heart': {
      // Round n draws one turn of the n largest circles; the rounds get quicker as circles join.
      setup: function () {
        var ends = [], at = 0;
        for (var n = 0; n < D.fourier.terms.length; n++) { at += 0.15 + 0.85 * Math.pow(0.85, n); ends.push(at); }
        return { ends: ends };
      },
      frame: function (ctx, s, t) {
        var f = D.fourier, fit = D.fits['fourier heart'], ends = s.ends, total = ends[ends.length - 1], round = 0;
        while (round < ends.length - 1 && t >= ends[round]) round++;
        var count = round + 1, from = round ? ends[round - 1] : 0;
        var within = t >= total ? 1 : (t - from) / (ends[round] - from);
        var fade = t >= total ? Math.min(1, (t - total) / FADE_SECONDS) : 0;
        function partial(terms, upto) {
          return sample(function (u) { return fourierPoint(f, terms, u); }, 0, upto * TAU, Math.max(2, Math.round(240 * upto)), fit);
        }
        if (count > 1 && within < 1) { ctx.globalAlpha = 0.3; glow(ctx); line(ctx, partial(count - 1, 1)); ctx.globalAlpha = 1; }
        glow(ctx); line(ctx, partial(count, within));
        if (fade < 1) {
          var angle = within * TAU, x = f.center.x, y = f.center.y;
          ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = 1 - fade;
          ctx.strokeStyle = 'rgba(255, 243, 214, 0.28)'; ctx.lineWidth = 0.8;
          for (var i = 0; i < count; i++) {
            var c = f.terms[i], o = toPanel({ x: x, y: y }, fit);
            ctx.beginPath(); ctx.arc(o.x, o.y, Math.sqrt(c.re * c.re + c.im * c.im) * fit.scale, 0, TAU); ctx.stroke();
            x += c.re * Math.cos(c.n * angle) - c.im * Math.sin(c.n * angle);
            y += c.re * Math.sin(c.n * angle) + c.im * Math.cos(c.n * angle);
            var e = toPanel({ x: x, y: y }, fit);
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.x, e.y); ctx.stroke();
          }
          ctx.restore();
          if (within < 1) tip(ctx, toPanel({ x: x, y: y }, fit));
        }
        return { done: fade >= 1, counter: 'n = ' + count };
      }
    }
  };
  function start(fig) {
    var curve = CURVES[fig.getAttribute('data-curve')];
    var panel = fig.querySelector('.eq-panel'), counter = fig.querySelector('.eq-counter'), again = fig.querySelector('.eq-again');
    var canvas = document.createElement('canvas'), ctx = canvas.getContext && canvas.getContext('2d');
    if (!curve || !ctx) return;
    panel.appendChild(canvas);
    var state = curve.setup(), begun = 0, elapsed = 0, done = false;
    function draw() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(panel.clientWidth * ratio), h = Math.round(w * D.h / D.w);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(w / D.w, 0, 0, w / D.w, 0, 0);
      ctx.clearRect(0, 0, D.w, D.h);
      var out = curve.frame(ctx, state, elapsed);
      counter.textContent = out.counter;
      return out.done;
    }
    function tick(now) {
      if (!begun) begun = now;
      elapsed = (now - begun) / 1000;
      done = draw();
      if (done) { panel.className = 'eq-panel live done'; again.hidden = false; }
      else { panel.className = 'eq-panel live'; requestAnimationFrame(tick); }
    }
    function play() { begun = 0; done = false; again.hidden = true; requestAnimationFrame(tick); }
    again.addEventListener('click', function () { if (done) play(); });
    window.addEventListener('resize', function () { if (done) draw(); });
    play();
  }
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) { io.unobserve(entries[i].target); start(entries[i].target.parentNode); }
    }
  }, { threshold: 0.4 });
  var figures = document.querySelectorAll('figure.equation');
  for (var i = 0; i < figures.length; i++) io.observe(figures[i].querySelector('.eq-panel'));
})();
</script>`;
  return script;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notes-equation-script.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/equation-script.ts tests/notes-equation-script.test.ts
git commit -m "Animate the equation drawings on a canvas"
```

---

### Task 4: Drawings on her page, and in admin

**Files:**
- Modify: `worker/views.ts`
- Test: `tests/notes-views.test.ts`

**Interfaces:**
- Consumes: `splitNote`, `equationFigure`, `hasDrawings` (equations.ts); `EQUATION_STYLE`, `equationScript` (equation-script.ts).
- Produces: `readerPage` renders figures in place of markers in today's note and in archive notes, and adds the style and script once if any shown note has a drawing. `adminPage` gains the marker hint and an "Equation" tag.

- [ ] **Step 1: Write the failing tests**

Append to `tests/notes-views.test.ts`:

```ts
describe('equation drawings', () => {
  const page = (current: string, archive: string[] = [], game = false) => readerPage({
    mediaBase: '/m',
    current: { date: '2026-10-05', text: current, ...(game ? { game: { kind: 'distance' as const, from: 'A', to: 'B', km: 10, lines: [] } } : {}) },
    archive: archive.map((text, i) => ({ date: `2026-10-0${4 - i}`, text })),
  });

  it('puts the drawing where its marker was, between escaped paragraphs', () => {
    const html = page('Some <maths>:\n[[filling heart]]\nThat is us.');
    const before = html.indexOf('<p class="message">Some &lt;maths&gt;:</p>');
    const figure = html.indexOf('<figure class="equation" data-curve="filling heart">');
    const after = html.indexOf('<p class="message">That is us.</p>');
    expect(before).toBeGreaterThan(-1);
    expect(figure).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(figure);
    expect(html).toContain('<style>');
    expect(html).toContain('threshold: 0.4');
  });

  it('draws in archive notes too, and leaves notes without markers exactly as before', () => {
    const html = page('plain today', ['older\n[[butterfly]]', 'older plain']);
    expect(html).toContain('<p class="message">plain today</p>');
    expect(html).toContain('<p class="text">older</p>\n<figure class="equation" data-curve="butterfly">');
    expect(html).toContain('<p class="text">older plain</p>');
  });

  it('adds no script or style when no note has a drawing', () => {
    const html = page('plain\nsee [[heart]] mid-line');
    expect(html).not.toContain('figure class="equation"');
    expect(html).not.toContain('threshold: 0.4');
    expect(html).toContain('see [[heart]] mid-line');
  });

  it('keeps a drawing inside the game note, so it waits for the game to reveal it', () => {
    const html = page('text\n[[heart]]', [], true);
    const wrapper = html.indexOf('<div class="note" data-game="2026-10-05">');
    expect(wrapper).toBeGreaterThan(-1);
    expect(html.indexOf('data-curve="heart"')).toBeGreaterThan(wrapper);
    expect(html.indexOf('data-curve="heart"')).toBeLessThan(html.indexOf('</div>', html.indexOf('eq-again')));
  });

  it('lists the markers under the admin text box and tags notes with drawings', () => {
    const html = adminPage({
      base: '/for-you', today: '2026-10-05', current: null, csrf: 't',
      notes: [{ date: '2026-10-05', text: 'x\n[[heart]]' }, { date: '2026-10-04', text: 'plain' }],
      form: { date: '2026-10-06', text: '' },
    });
    expect(html).toContain('Drawings: put [[heart]], [[filling heart]], [[butterfly]] or [[fourier heart]] on a line of its own.');
    expect(html.match(/<span class="tag">Equation<\/span>/g)).toHaveLength(1);
  });
});
```

