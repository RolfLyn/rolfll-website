import { isAttachment, type Attachment } from './notes';

export const BOOK_LIMITS = { title: 120, author: 120, line: 200 };
export const BOOK_INVALID =
  `A book needs a title and an author of up to ${BOOK_LIMITS.title} characters each, and a line of up to ${BOOK_LIMITS.line}.`;
export const RECORDING_NEEDED = 'A new book needs its recording.';

/** Calm spine colours: dusty blue, cream, sage, muted rose, pale green, lavender grey. */
export const SPINE_COLOURS = ['#8fa7b5', '#e6dcc4', '#a5b398', '#c49e9b', '#c9d3bd', '#a7a1b5'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Book {
  id: string;
  title: string;
  author: string;
  /** His optional line about it; may be empty. */
  line: string;
  /** ISO timestamp of the first save; kept on edits. Books stand in this order. */
  created: string;
  audio: Attachment;
}

/** The admin form's text fields as typed, so a rejected save can show them again. */
export interface BookDraft {
  title: string;
  author: string;
  line: string;
}

export const EMPTY_BOOK: BookDraft = { title: '', author: '', line: '' };

export interface Played {
  id: string;
  at: string;
}

const isTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));
const isText = (t: unknown, max: number): t is string => typeof t === 'string' && t.trim() !== '' && t.length <= max;

function isBook(value: unknown): value is Book {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return typeof b.id === 'string' && UUID.test(b.id) &&
    isText(b.title, BOOK_LIMITS.title) && isText(b.author, BOOK_LIMITS.author) &&
    typeof b.line === 'string' && b.line.length <= BOOK_LIMITS.line &&
    isTime(b.created) && isAttachment(b.audio);
}

function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
}

export function parseBooks(raw: string | null): Book[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isBook)) throw new Error('Stored books are invalid');
  if (new Set(data.map((b) => b.id)).size !== data.length) throw new Error('Stored books repeat an id');
  return sortBooks(data.map((b) => ({
    id: b.id, title: b.title, author: b.author, line: b.line, created: b.created, audio: { key: b.audio.key, type: b.audio.type },
  })));
}

export function upsertBook(books: Book[], book: Book): Book[] {
  return sortBooks([...books.filter((b) => b.id !== book.id), book]);
}

export function removeBook(books: Book[], id: string): Book[] {
  return books.filter((b) => b.id !== id);
}

export function bookKeys(books: Book[]): string[] {
  return books.map((b) => b.audio.key);
}

export function parseBookForm(get: (name: string) => string): { draft: BookDraft; error?: string } {
  const draft: BookDraft = {
    title: get('title').trim(),
    author: get('author').trim(),
    line: get('line').replace(/\r\n?/g, '\n').trim(),
  };
  const ok = isText(draft.title, BOOK_LIMITS.title) && isText(draft.author, BOOK_LIMITS.author) && draft.line.length <= BOOK_LIMITS.line;
  return ok ? { draft } : { draft, error: BOOK_INVALID };
}

function isPlayed(value: unknown): value is Played {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && UUID.test(p.id) && isTime(p.at);
}

export function parsePlayed(raw: string | null): Played[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isPlayed)) throw new Error('Stored play times are invalid');
  return data.map((p) => ({ id: p.id, at: p.at }));
}

/** Records the first time a book is played; returns the same list when it already was. */
export function markPlayed(played: Played[], id: string, at: string): Played[] {
  return played.some((p) => p.id === id) ? played : [...played, { id, at }];
}

export function dropPlayed(played: Played[], id: string): Played[] {
  return played.filter((p) => p.id !== id);
}

/** A book's spine, fixed by its id: height in % of the shelf, width in rem, and colour. */
export function spineLook(id: string): { height: number; width: number; colour: string } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return {
    height: 78 + (hash % 23),
    width: (24 + ((hash >>> 8) % 11)) / 10,
    colour: SPINE_COLOURS[(hash >>> 16) % SPINE_COLOURS.length],
  };
}
