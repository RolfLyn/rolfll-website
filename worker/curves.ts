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
