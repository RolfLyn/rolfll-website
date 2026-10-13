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

describe('equation size', () => {
  it('shrinks the maths on narrow phones so it fits without a scrollbar', () => {
    expect(EQUATION_STYLE).toContain('font-size: clamp(0.8rem, 3.9vw, 1.2rem)');
  });
});
