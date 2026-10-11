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
