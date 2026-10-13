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
