import { describe, it, expect } from 'vitest';
import {
  parseSecrets, upsertSecret, removeSecret, parseSecretForm, tooClose, parseFound, markFound, dropFound,
  SECRET_INVALID, SPOT_INVALID, EMPTY_SECRET, PAINTING, SPOT_SIZE, type Secret,
} from '../worker/painting';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const secret = (id: string, created: string, extra: Partial<Secret> = {}): Secret =>
  ({ id, text: 'a secret', x: 0.5, y: 0.5, created, ...extra });

describe('parseSecrets', () => {
  it('treats a missing key as none, sorts oldest first, and drops extra fields', () => {
    expect(parseSecrets(null)).toEqual([]);
    const raw = JSON.stringify([
      { ...secret(ID2, '2026-10-05T10:00:00.000Z', { x: 0.1 }), extra: 1 },
      secret(ID1, '2026-10-01T10:00:00.000Z', { y: 0.9 }),
    ]);
    expect(parseSecrets(raw)).toEqual([
      secret(ID1, '2026-10-01T10:00:00.000Z', { y: 0.9 }),
      secret(ID2, '2026-10-05T10:00:00.000Z', { x: 0.1 }),
    ]);
  });

  it('throws on anything invalid', () => {
    const ok = secret(ID1, '2026-10-01T10:00:00.000Z');
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...ok, id: 'nope' }]),
      JSON.stringify([{ ...ok, text: '  ' }]),
      JSON.stringify([{ ...ok, text: 'x'.repeat(501) }]),
      JSON.stringify([{ ...ok, x: -0.1 }]),
      JSON.stringify([{ ...ok, y: 1.1 }]),
      JSON.stringify([{ ...ok, x: '0.5' }]),
      JSON.stringify([{ ...ok, created: 'never' }]),
      JSON.stringify([ok, ok]),
    ]) {
      expect(() => parseSecrets(raw), raw).toThrow();
    }
  });
});

describe('editing secrets', () => {
  it('upserts by id keeping creation order and removes by id', () => {
    const a = secret(ID1, '2026-10-01T10:00:00.000Z');
    const b = secret(ID2, '2026-10-05T10:00:00.000Z');
    let list = upsertSecret(upsertSecret([], b), a);
    expect(list.map((s) => s.id)).toEqual([ID1, ID2]);
    list = upsertSecret(list, { ...a, text: 'changed' });
    expect(list.map((s) => s.text)).toEqual(['changed', 'a secret']);
    expect(removeSecret(list, ID1).map((s) => s.id)).toEqual([ID2]);
  });
});

describe('parseSecretForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('turns percentages into fractions and tidies the text', () => {
    expect(parseSecretForm(form({ text: ' one\r\ntwo ', x: '25', y: '12,5' }))).toEqual({
      draft: { text: 'one\ntwo', x: '25', y: '12,5' },
      value: { text: 'one\ntwo', x: 0.25, y: 0.125 },
    });
    expect(parseSecretForm(form({ text: 't', x: '33.33333', y: '100' })).value).toEqual({ text: 't', x: 0.3333, y: 1 });
  });

  it('rejects bad text or a missing or impossible spot, keeping what was typed', () => {
    expect(parseSecretForm(form({ text: ' ', x: '5', y: '5' }))).toEqual({ draft: { text: '', x: '5', y: '5' }, error: SECRET_INVALID });
    expect(parseSecretForm(form({ text: 'x'.repeat(501), x: '5', y: '5' })).error).toBe(SECRET_INVALID);
    for (const [x, y] of [['', '5'], ['5', ''], ['-1', '5'], ['5', '101'], ['abc', '5'], ['Infinity', '5']]) {
      expect(parseSecretForm(form({ text: 'ok', x, y })).error, `${x},${y}`).toBe(SPOT_INVALID);
    }
    expect(parseSecretForm(form({ text: '', x: '' })).error).toBe(`${SECRET_INVALID} ${SPOT_INVALID}`);
    expect(EMPTY_SECRET).toEqual({ text: '', x: '', y: '' });
  });
});

describe('tooClose', () => {
  const list = [
    secret(ID1, '2026-10-01T10:00:00.000Z', { x: 0.2, y: 0.2 }),
    secret(ID2, '2026-10-02T10:00:00.000Z', { x: 0.6, y: 0.6 }),
  ];
  const aspect = PAINTING.width / PAINTING.height;

  it('names the secret (by number) whose spot would overlap, measured in painting heights', () => {
    expect(tooClose(list, 0.6, 0.6 + SPOT_SIZE * 0.9)).toBe(2);
    expect(tooClose(list, 0.6, 0.6 + SPOT_SIZE * 1.1)).toBeNull();
    // Across, the same fraction is a longer distance, so it clears sooner.
    expect(tooClose(list, 0.2 + (SPOT_SIZE * 0.9) / aspect, 0.2)).toBe(1);
    expect(tooClose(list, 0.2 + SPOT_SIZE * 0.9, 0.2)).toBeNull();
  });

  it('ignores the secret being moved', () => {
    expect(tooClose(list, 0.2, 0.21, ID1)).toBeNull();
    expect(tooClose(list, 0.6, 0.61, ID1)).toBe(2);
  });
});

describe('found secrets', () => {
  const AT = '2026-10-21T12:02:00.000Z';
  const LATER = '2026-10-22T09:00:00.000Z';

  it('parses, keeps the first time a secret is found, and drops by id', () => {
    expect(parseFound(null)).toEqual([]);
    let found = markFound([], ID1, AT);
    expect(found).toEqual([{ id: ID1, at: AT }]);
    expect(markFound(found, ID1, LATER)).toBe(found);
    found = markFound(found, ID3, LATER);
    expect(parseFound(JSON.stringify(found))).toEqual(found);
    expect(dropFound(found, ID1)).toEqual([{ id: ID3, at: LATER }]);
  });

  it('throws on anything invalid', () => {
    for (const raw of ['garbage', '{}', JSON.stringify([{ id: 'x', at: AT }]), JSON.stringify([{ id: ID1, at: 'never' }])]) {
      expect(() => parseFound(raw), raw).toThrow();
    }
  });
});
