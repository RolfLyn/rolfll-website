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
  ])('rejects %s and keeps the draft', (_label, over: Record<string, string>) => {
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
