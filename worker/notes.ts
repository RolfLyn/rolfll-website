import { isValidDate } from './dates';

export interface Note {
  date: string;
  text: string;
}

export interface ReaderView {
  current: Note | null;
  archive: Note[];
}

export function parseNotes(raw: string | null): Note[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored notes are not a list');
  for (const item of data) {
    if (
      typeof item !== 'object' || item === null ||
      typeof item.date !== 'string' || !isValidDate(item.date) ||
      typeof item.text !== 'string'
    ) {
      throw new Error('Stored notes contain an invalid entry');
    }
  }
  return data.map((item) => ({ date: item.date, text: item.text }));
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
