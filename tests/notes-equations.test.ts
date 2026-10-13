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

describe('equation typesetting', () => {
  it('keeps small brackets small next to tall symbols', () => {
    expect(equationFigure('fourier heart')).toContain('<mi>f</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo>');
    expect(equationFigure('filling heart')).toContain('<mi>sin</mi><mo stretchy="false">(</mo><mi>k</mi><mi>x</mi><mo stretchy="false">)</mo>');
  });
});
