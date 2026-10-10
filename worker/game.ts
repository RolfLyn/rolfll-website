import { GAME_LIMITS, isGame, type Game } from './notes';

/** The admin form's game fields, as typed (all strings, so a bad value can be shown again). */
export interface GameDraft {
  kind: string;
  from: string;
  to: string;
  km: string;
  meet: string;
  lines: string;
}

export const EMPTY_DRAFT: GameDraft = { kind: '', from: '', to: '', km: '', meet: '', lines: '' };

export const GAME_INVALID =
  `The game needs a start and a destination (up to ${GAME_LIMITS.place} characters each), ` +
  `a distance from 1 to 40,000 km, a real meet date or none, ` +
  `and at most ${GAME_LIMITS.lines} lines of up to ${GAME_LIMITS.line} characters.`;

// Plain digits, or thousands grouped with a space, comma or dot ("10.000", "10,000", "10 000").
const KM_PATTERN = /^(\d+|\d{1,3}([ ,.]\d{3})+)$/;

export function gameToDraft(game: Game | undefined): GameDraft {
  if (!game) return EMPTY_DRAFT;
  return {
    kind: game.kind, from: game.from, to: game.to, km: String(game.km),
    meet: game.meet ?? '', lines: game.lines.join('\n'),
  };
}

export function parseGameForm(get: (name: string) => string): { game?: Game; draft: GameDraft; error?: string } {
  const draft: GameDraft = {
    kind: get('game_kind'),
    from: get('game_from').trim(),
    to: get('game_to').trim(),
    km: get('game_km').trim(),
    meet: get('game_meet').trim(),
    lines: get('game_lines').replace(/\r\n?/g, '\n'),
  };
  if (draft.kind === '') return { draft };
  const km = KM_PATTERN.test(draft.km) ? Number(draft.km.replace(/[ ,.]/g, '')) : NaN;
  const lines = draft.lines.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const game = { kind: draft.kind, from: draft.from, to: draft.to, km, lines } as Game;
  if (draft.meet !== '') game.meet = draft.meet;
  return isGame(game) ? { game, draft } : { draft, error: GAME_INVALID };
}
