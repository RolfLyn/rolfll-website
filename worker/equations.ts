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
  'filling heart': '<math display="block"><mi>y</mi><mo>=</mo><msup><mi>x</mi><mfrac><mn>2</mn><mn>3</mn></mfrac></msup><mo>+</mo><mn>0.9</mn><mi>sin</mi><mo stretchy="false">(</mo><mi>k</mi><mi>x</mi><mo stretchy="false">)</mo><msqrt><mn>3</mn><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></msqrt></math>',
  'butterfly': '<math display="block"><mi>r</mi><mo>=</mo><msup><mi>e</mi><mrow><mi>sin</mi><mi>θ</mi></mrow></msup><mo>−</mo><mn>2</mn><mi>cos</mi><mn>4</mn><mi>θ</mi><mo>+</mo><msup><mi>sin</mi><mn>5</mn></msup><mrow><mo>(</mo><mfrac><mrow><mn>2</mn><mi>θ</mi><mo>−</mo><mi>π</mi></mrow><mn>24</mn></mfrac><mo>)</mo></mrow></math>',
  'fourier heart': '<math display="block"><mi>f</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo><mo>=</mo><munderover><mo>∑</mo><mrow><mi>n</mi><mo>=</mo><mo>−</mo><mi>∞</mi></mrow><mi>∞</mi></munderover><msub><mi>c</mi><mi>n</mi></msub><msup><mi>e</mi><mrow><mi>i</mi><mi>n</mi><mi>t</mi></mrow></msup></math>',
};

/** The equation, the finished curve (seen without JavaScript or with reduced motion) and a replay button. */
export function equationFigure(name: CurveName): string {
  return `<figure class="equation" data-curve="${escapeHtml(name)}">
<div class="eq-math">${MATH[name]}</div>
<div class="eq-panel"><svg viewBox="0 0 ${EQ_W} ${EQ_H}" aria-hidden="true"><path d="${curvePath(name)}"/></svg><span class="eq-counter" aria-hidden="true"></span></div>
<button type="button" class="eq-again" hidden>Draw again</button>
</figure>`;
}
