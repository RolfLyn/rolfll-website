import { describe, it, expect } from 'vitest';
import { parseGameForm, gameToDraft, EMPTY_DRAFT, GAME_INVALID } from '../worker/game';
import { meetText, catchText, GAME_SCRIPT, GAME_STYLE } from '../worker/game-script';

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

describe('meetText', () => {
  const game = { to: 'Hill', meet: '2026-10-21' };

  it('counts the sleeps until the meet date', () => {
    expect(meetText(game, '2026-10-10')).toBe('Hill, 21 October · 11 more sleeps');
  });

  it('says one sleep, then today, then nothing', () => {
    expect(meetText(game, '2026-10-20')).toBe('Hill, 21 October · 1 more sleep');
    expect(meetText(game, '2026-10-21')).toBe('Hill, 21 October · Today!');
    expect(meetText(game, '2026-10-22')).toBe('');
  });

  it('counts across month ends and is empty without a meet date', () => {
    expect(meetText({ to: 'Hill', meet: '2026-11-02' }, '2026-10-30')).toBe('Hill, 2 November · 3 more sleeps');
    expect(meetText({ to: 'Hill' }, '2026-10-30')).toBe('');
  });
});

describe('GAME_SCRIPT', () => {
  it('is one script element that parses as JavaScript', () => {
    expect(GAME_SCRIPT.startsWith('<script>')).toBe(true);
    expect(GAME_SCRIPT.indexOf('</script>')).toBe(GAME_SCRIPT.length - '</script>'.length);
    expect(() => new Function(GAME_SCRIPT.slice('<script>'.length, -'</script>'.length))).not.toThrow();
  });

  it('carries the tested countdown code and no em dashes', () => {
    expect(GAME_SCRIPT).toContain('more sleeps');
    expect(GAME_SCRIPT).not.toContain('—');
  });
});

describe('catchText', () => {
  it('counts the lights caught', () => {
    expect(catchText(6, 8)).toBe('You caught 6 of 8 lights');
    expect(catchText(0, 8)).toBe('You caught 0 of 8 lights');
    expect(catchText(0, 1)).toBe('You caught 0 of 1 light');
  });

  it('celebrates catching every light, and says nothing without lights', () => {
    expect(catchText(8, 8)).toBe('You caught every light');
    expect(catchText(1, 1)).toBe('You caught every light');
    expect(catchText(0, 0)).toBe('');
  });
});

describe('game polish', () => {
  it('draws no dotted path and embeds the tested catch wording', () => {
    expect(GAME_SCRIPT).not.toContain('setLineDash');
    expect(GAME_SCRIPT).toContain('You caught every light');
  });

  it('keeps each line up for about eight seconds', () => {
    expect(GAME_STYLE).toContain('animation: drift 8s');
  });

  it('keeps the browser helpers free of nested functions, which the bundler would break', () => {
    for (const fn of [meetText, catchText]) expect(fn.toString()).not.toMatch(/=>|function[\s\S]*function/);
  });
});
