import { describe, it, expect } from 'vitest';
import {
  parseSongs, upsertSong, removeSong, songKeys, parseAlbum, upsertPhoto, removePhoto, movePhoto, albumKeys,
  parseSongForm, parsePhotoForm, parseSeen, albumHasNew, songsUnplayed, KEEPSAKE_LIMITS, type Song, type AlbumPhoto,
} from '../worker/keepsakes';

const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const song = (n: number, created: string): Song => ({ id: id(n), title: `Song ${n}`, line: '', created, audio: { key: `${id(n)}.m4a`, type: 'audio/mp4' } });
const photo = (n: number, created: string): AlbumPhoto => ({ id: id(n), line: `Line ${n}`, created, photo: { key: `${id(n)}.jpg`, type: 'image/jpeg' } });

describe('songs', () => {
  it('reads songs newest first and skips nothing valid', () => {
    const raw = JSON.stringify([song(1, '2026-01-01T00:00:00.000Z'), song(2, '2026-01-03T00:00:00.000Z')]);
    expect(parseSongs(raw).map((s) => s.title)).toEqual(['Song 2', 'Song 1']);
    expect(parseSongs(null)).toEqual([]);
  });
  it('throws on corrupt or invalid stored songs', () => {
    expect(() => parseSongs('{ broken')).toThrow();
    expect(() => parseSongs(JSON.stringify([{ id: 'x' }]))).toThrow();
  });
  it('adds, replaces and removes, keeping newest first', () => {
    let songs = upsertSong([], song(1, '2026-01-01T00:00:00.000Z'));
    songs = upsertSong(songs, song(2, '2026-01-02T00:00:00.000Z'));
    songs = upsertSong(songs, { ...song(1, '2026-01-01T00:00:00.000Z'), title: 'Renamed' });
    expect(songs.map((s) => s.title)).toEqual(['Song 2', 'Renamed']);
    expect(songKeys(songs)).toEqual([`${id(2)}.m4a`, `${id(1)}.m4a`]);
    expect(removeSong(songs, id(2)).map((s) => s.id)).toEqual([id(1)]);
  });
  it('lists unplayed songs', () => {
    const songs = [song(1, '2026-01-01T00:00:00.000Z'), song(2, '2026-01-02T00:00:00.000Z')];
    expect(songsUnplayed(songs, [{ id: id(1), at: '2026-01-05T00:00:00.000Z' }])).toEqual([id(2)]);
  });
});

describe('album', () => {
  const a = photo(1, '2026-01-01T00:00:00.000Z');
  const b = photo(2, '2026-01-02T00:00:00.000Z');
  const c = photo(3, '2026-01-03T00:00:00.000Z');

  it('keeps the stored order', () => {
    expect(parseAlbum(JSON.stringify([c, a, b])).map((p) => p.id)).toEqual([id(3), id(1), id(2)]);
    expect(parseAlbum(null)).toEqual([]);
    expect(() => parseAlbum('nope')).toThrow();
  });
  it('adds new photos last and keeps an edited one in place', () => {
    let album = upsertPhoto(upsertPhoto(upsertPhoto([], a), b), c);
    album = upsertPhoto(album, { ...b, line: 'Edited' });
    expect(album.map((p) => p.line)).toEqual(['Line 1', 'Edited', 'Line 3']);
    expect(albumKeys(album)).toEqual([`${id(1)}.jpg`, `${id(2)}.jpg`, `${id(3)}.jpg`]);
    expect(removePhoto(album, id(2)).map((p) => p.id)).toEqual([id(1), id(3)]);
  });
  it('moves photos up and down, and not past the ends', () => {
    const album = [a, b, c];
    expect(movePhoto(album, id(2), -1).map((p) => p.id)).toEqual([id(2), id(1), id(3)]);
    expect(movePhoto(album, id(2), 1).map((p) => p.id)).toEqual([id(1), id(3), id(2)]);
    expect(movePhoto(album, id(1), -1)).toEqual(album);
    expect(movePhoto(album, id(3), 1)).toEqual(album);
    expect(movePhoto(album, 'missing', 1)).toEqual(album);
  });
  it('knows when there are photos she has not seen', () => {
    expect(albumHasNew([], null)).toBe(false);
    expect(albumHasNew([a], null)).toBe(true);
    expect(albumHasNew([a, b], '2026-01-01T12:00:00.000Z')).toBe(true);
    expect(albumHasNew([a, b], '2026-01-02T12:00:00.000Z')).toBe(false);
  });
  it('reads the time she last opened it', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('2026-01-02T12:00:00.000Z')).toBe('2026-01-02T12:00:00.000Z');
    expect(parseSeen('garbage')).toBeNull();
  });
});

describe('forms', () => {
  it('needs a song title, and keeps lines to one line within the limit', () => {
    expect(parseSongForm((n) => ({ title: '  A song ', line: 'one\r\ntwo' } as Record<string, string>)[n]).draft).toEqual({ title: 'A song', line: 'one two' });
    expect(parseSongForm((n) => ({ title: '', line: '' } as Record<string, string>)[n]).error).toBeTruthy();
    expect(parseSongForm((n) => ({ title: 'x'.repeat(KEEPSAKE_LIMITS.title + 1), line: '' } as Record<string, string>)[n]).error).toBeTruthy();
    expect(parseSongForm((n) => ({ title: 'ok', line: 'x'.repeat(KEEPSAKE_LIMITS.line + 1) } as Record<string, string>)[n]).error).toBeTruthy();
  });
  it('lets a photo line be empty, one line, within the limit', () => {
    expect(parsePhotoForm(() => '')).toEqual({ line: '' });
    expect(parsePhotoForm(() => ' a\nb ').line).toBe('a b');
    expect(parsePhotoForm(() => 'x'.repeat(KEEPSAKE_LIMITS.line + 1)).error).toBeTruthy();
  });
});
