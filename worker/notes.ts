import { isValidDate } from './dates';

export interface Attachment {
  key: string;
  type: string;
}

export const GAME_LIMITS = { place: 40, km: 40_000, lines: 8, line: 160 };

export interface Game {
  kind: 'distance';
  from: string;
  to: string;
  km: number;
  meet?: string;
  lines: string[];
}

export interface Note {
  date: string;
  text: string;
  photo?: Attachment;
  audio?: Attachment;
  game?: Game;
}

export interface ReaderView {
  current: Note | null;
  archive: Note[];
}

export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

export function isAttachment(value: unknown): value is Attachment {
  if (typeof value !== 'object' || value === null) return false;
  const { key, type } = value as Record<string, unknown>;
  return typeof key === 'string' && MEDIA_KEY.test(key) && typeof type === 'string';
}

function isText(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

export function isGame(value: unknown): value is Game {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return g.kind === 'distance' &&
    isText(g.from, GAME_LIMITS.place) && isText(g.to, GAME_LIMITS.place) &&
    typeof g.km === 'number' && Number.isInteger(g.km) && g.km >= 1 && g.km <= GAME_LIMITS.km &&
    (g.meet === undefined || (typeof g.meet === 'string' && isValidDate(g.meet))) &&
    Array.isArray(g.lines) && g.lines.length <= GAME_LIMITS.lines &&
    g.lines.every((line) => isText(line, GAME_LIMITS.line));
}

function copyGame(g: Game): Game {
  const game: Game = { kind: g.kind, from: g.from, to: g.to, km: g.km, lines: [...g.lines] };
  if (g.meet !== undefined) game.meet = g.meet;
  return game;
}

export function parseNotes(raw: string | null): Note[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored notes are not a list');
  return data.map((item) => {
    if (
      typeof item !== 'object' || item === null ||
      typeof item.date !== 'string' || !isValidDate(item.date) ||
      typeof item.text !== 'string' ||
      (item.photo !== undefined && !isAttachment(item.photo)) ||
      (item.audio !== undefined && !isAttachment(item.audio)) ||
      (item.game !== undefined && !isGame(item.game))
    ) {
      throw new Error('Stored notes contain an invalid entry');
    }
    const note: Note = { date: item.date, text: item.text };
    if (item.photo) note.photo = { key: item.photo.key, type: item.photo.type };
    if (item.audio) note.audio = { key: item.audio.key, type: item.audio.type };
    if (item.game) note.game = copyGame(item.game);
    return note;
  });
}

export function sortNewestFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function selectForReader(notes: Note[], today: string): ReaderView {
  const visible = sortNewestFirst(notes.filter((note) => note.date <= today));
  return { current: visible[0] ?? null, archive: visible.slice(1) };
}

export function upsertNote(notes: Note[], note: Note): Note[] {
  return sortNewestFirst([...notes.filter((n) => n.date !== note.date), note]);
}

export function removeNote(notes: Note[], date: string): Note[] {
  return notes.filter((n) => n.date !== date);
}

export function attachmentKeys(note: Note): string[] {
  return [note.photo?.key, note.audio?.key].filter((key): key is string => Boolean(key));
}

export function findByMediaKey(notes: Note[], key: string): Note | undefined {
  return notes.find((n) => n.photo?.key === key || n.audio?.key === key);
}
