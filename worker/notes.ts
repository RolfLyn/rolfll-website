import { isValidDate } from './dates';

export interface Attachment {
  key: string;
  type: string;
}

export interface Note {
  date: string;
  text: string;
  photo?: Attachment;
  audio?: Attachment;
}

export interface ReaderView {
  current: Note | null;
  archive: Note[];
}

export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

function isAttachment(value: unknown): value is Attachment {
  if (typeof value !== 'object' || value === null) return false;
  const { key, type } = value as Record<string, unknown>;
  return typeof key === 'string' && MEDIA_KEY.test(key) && typeof type === 'string';
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
      (item.audio !== undefined && !isAttachment(item.audio))
    ) {
      throw new Error('Stored notes contain an invalid entry');
    }
    const note: Note = { date: item.date, text: item.text };
    if (item.photo) note.photo = { key: item.photo.key, type: item.photo.type };
    if (item.audio) note.audio = { key: item.audio.key, type: item.audio.type };
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
