import { isAttachment, type Attachment } from './notes';
import type { Played } from './books';

// The reading room's sideboard: songs he recorded for the record player, and photos with a line each for the album.

export const KEEPSAKE_LIMITS = { title: 120, line: 200 };
export const SONG_INVALID = `A song needs a title of up to ${KEEPSAKE_LIMITS.title} characters, and a line of up to ${KEEPSAKE_LIMITS.line}.`;
export const PHOTO_LINE_INVALID = `A photo's line can be up to ${KEEPSAKE_LIMITS.line} characters.`;
export const SONG_FILE_NEEDED = 'A new song needs its recording.';
export const PHOTO_FILE_NEEDED = 'A new page needs its photo.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Song {
  id: string;
  title: string;
  /** His optional line about it; may be empty. */
  line: string;
  /** ISO time of the first save; kept on edits. */
  created: string;
  audio: Attachment;
}

export interface AlbumPhoto {
  id: string;
  line: string;
  created: string;
  photo: Attachment;
}

export interface SongDraft {
  title: string;
  line: string;
}

export const EMPTY_SONG: SongDraft = { title: '', line: '' };

const isTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));
const isLine = (t: unknown): t is string => typeof t === 'string' && t.length <= KEEPSAKE_LIMITS.line;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isSong(v: unknown): v is Song {
  return isRecord(v) && typeof v.id === 'string' && UUID.test(v.id) &&
    typeof v.title === 'string' && v.title.trim() !== '' && v.title.length <= KEEPSAKE_LIMITS.title &&
    isLine(v.line) && isTime(v.created) && isAttachment(v.audio);
}

function isPhoto(v: unknown): v is AlbumPhoto {
  return isRecord(v) && typeof v.id === 'string' && UUID.test(v.id) && isLine(v.line) && isTime(v.created) && isAttachment(v.photo);
}

function readList<T extends { id: string }>(raw: string, check: (v: unknown) => v is T, what: string): T[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(check)) throw new Error(`Stored ${what} are invalid`);
  if (new Set(data.map((x) => x.id)).size !== data.length) throw new Error(`Stored ${what} repeat an id`);
  return data;
}

const newestFirst = (songs: Song[]) => [...songs].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

export function parseSongs(raw: string | null): Song[] {
  if (raw === null) return [];
  return newestFirst(readList(raw, isSong, 'songs').map((s) => ({
    id: s.id, title: s.title, line: s.line, created: s.created, audio: { key: s.audio.key, type: s.audio.type },
  })));
}

export function upsertSong(songs: Song[], song: Song): Song[] {
  return newestFirst([...songs.filter((s) => s.id !== song.id), song]);
}

export function removeSong(songs: Song[], id: string): Song[] {
  return songs.filter((s) => s.id !== id);
}

export function songKeys(songs: Song[]): string[] {
  return songs.map((s) => s.audio.key);
}

export function songsUnplayed(songs: Song[], played: Played[]): string[] {
  return songs.filter((s) => !played.some((p) => p.id === s.id)).map((s) => s.id);
}

export function parseAlbum(raw: string | null): AlbumPhoto[] {
  if (raw === null) return [];
  return readList(raw, isPhoto, 'album photos').map((p) => ({
    id: p.id, line: p.line, created: p.created, photo: { key: p.photo.key, type: p.photo.type },
  }));
}

/** A new photo goes on the last page; an edited one keeps its place. */
export function upsertPhoto(album: AlbumPhoto[], photo: AlbumPhoto): AlbumPhoto[] {
  return album.some((p) => p.id === photo.id) ? album.map((p) => (p.id === photo.id ? photo : p)) : [...album, photo];
}

export function removePhoto(album: AlbumPhoto[], id: string): AlbumPhoto[] {
  return album.filter((p) => p.id !== id);
}

export function movePhoto(album: AlbumPhoto[], id: string, by: -1 | 1): AlbumPhoto[] {
  const at = album.findIndex((p) => p.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= album.length) return album;
  const next = [...album];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export function albumKeys(album: AlbumPhoto[]): string[] {
  return album.map((p) => p.photo.key);
}

export function parseSeen(raw: string | null): string | null {
  return raw !== null && isTime(raw) ? raw : null;
}

/** True while a photo was added after she last opened the album. */
export function albumHasNew(album: AlbumPhoto[], seen: string | null): boolean {
  if (album.length === 0) return false;
  if (seen === null) return true;
  return album.some((p) => Date.parse(p.created) > Date.parse(seen));
}

const oneLine = (v: string) => v.replace(/\s*[\r\n]+\s*/g, ' ').trim();

export function parseSongForm(get: (name: string) => string): { draft: SongDraft; error?: string } {
  const draft = { title: oneLine(get('title') ?? ''), line: oneLine(get('line') ?? '') };
  const ok = draft.title !== '' && draft.title.length <= KEEPSAKE_LIMITS.title && draft.line.length <= KEEPSAKE_LIMITS.line;
  return ok ? { draft } : { draft, error: SONG_INVALID };
}

export function parsePhotoForm(get: (name: string) => string): { line: string; error?: string } {
  const line = oneLine(get('line') ?? '');
  return line.length <= KEEPSAKE_LIMITS.line ? { line } : { line, error: PHOTO_LINE_INVALID };
}
