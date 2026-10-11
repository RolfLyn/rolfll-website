import { escapeHtml } from './html';
import type { Sky } from './meetings';

export const SKY_W = 320;
export const SKY_H = 120;
const OUTLINE_POINTS = 96;

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
  // The outline is a smooth heart of its own, so it reads as a heart however few stars sit on it.
  const lines = gathered && heart.length > 1
    ? `<polygon class="sky-lines" points="${heartPoints(Math.max(OUTLINE_POINTS, heart.length)).map((p) => `${p.x},${p.y}`).join(' ')}"/>`
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
