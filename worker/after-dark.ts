import { isAttachment, type Attachment } from './notes';
import { REPLY_MAX, type Answer } from './replies';

export const ENTRY_LIMITS = { title: 120, text: 5000 };
export const ENTRY_INVALID =
  `An entry needs text of up to ${ENTRY_LIMITS.text} characters and a title of up to ${ENTRY_LIMITS.title}.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Entry {
  id: string;
  title: string;
  text: string;
  /** ISO timestamp of the first save; kept on edits. */
  created: string;
  audio?: Attachment;
}

/** The admin form's fields as typed, so a rejected save can show them again. */
export interface EntryDraft {
  title: string;
  text: string;
}

export const EMPTY_ENTRY: EntryDraft = { title: '', text: '' };

export interface EntryReply extends Answer {
  id: string;
  at: string;
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === 'string' && UUID.test(e.id) &&
    typeof e.title === 'string' && e.title.length <= ENTRY_LIMITS.title &&
    typeof e.text === 'string' && e.text.trim() !== '' && e.text.length <= ENTRY_LIMITS.text &&
    typeof e.created === 'string' && !Number.isNaN(Date.parse(e.created)) &&
    (e.audio === undefined || isAttachment(e.audio));
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
}

function copyEntry(e: Entry): Entry {
  const entry: Entry = { id: e.id, title: e.title, text: e.text, created: e.created };
  if (e.audio) entry.audio = { key: e.audio.key, type: e.audio.type };
  return entry;
}

export function parseEntries(raw: string | null): Entry[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isEntry)) throw new Error('Stored after dark entries are invalid');
  if (new Set(data.map((e) => e.id)).size !== data.length) throw new Error('Stored after dark entries repeat an id');
  return sortEntries(data.map(copyEntry));
}

export function upsertEntry(entries: Entry[], entry: Entry): Entry[] {
  return sortEntries([...entries.filter((e) => e.id !== entry.id), entry]);
}

export function removeEntry(entries: Entry[], id: string): Entry[] {
  return entries.filter((e) => e.id !== id);
}

export function entryKeys(entries: Entry[]): string[] {
  return entries.flatMap((e) => (e.audio ? [e.audio.key] : []));
}

export function parseEntryForm(get: (name: string) => string): { draft: EntryDraft; error?: string } {
  const draft: EntryDraft = { title: get('title').trim(), text: get('text').replace(/\r\n?/g, '\n').trim() };
  const ok = draft.text !== '' && draft.text.length <= ENTRY_LIMITS.text && draft.title.length <= ENTRY_LIMITS.title;
  return ok ? { draft } : { draft, error: ENTRY_INVALID };
}

function isEntryReply(value: unknown): value is EntryReply {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && UUID.test(r.id) &&
    typeof r.heart === 'boolean' &&
    typeof r.text === 'string' && r.text.length <= REPLY_MAX &&
    (r.heart || r.text !== '') &&
    typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at));
}

export function parseEntryReplies(raw: string | null): EntryReply[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isEntryReply)) throw new Error('Stored after dark replies are invalid');
  return data.map((r) => ({ id: r.id, heart: r.heart, text: r.text, at: r.at }));
}

/** One reply per entry; an empty answer removes it. */
export function setEntryReply(replies: EntryReply[], id: string, answer: Answer, at: string): EntryReply[] {
  const rest = replies.filter((r) => r.id !== id);
  return answer.heart || answer.text !== '' ? [...rest, { id, heart: answer.heart, text: answer.text, at }] : rest;
}

export function dropEntryReply(replies: EntryReply[], id: string): EntryReply[] {
  return replies.filter((r) => r.id !== id);
}
