import { describe, it, expect } from 'vitest';
import { sideboard, keepsakesAdmin, KEEPSAKE_SCRIPT } from '../worker/keepsake-views';
import { readingRoomPage, ROOM_SCRIPT } from '../worker/reading-room-views';
import { KEEP_AWAKE_SCRIPT } from '../worker/views';
import type { Song, AlbumPhoto } from '../worker/keepsakes';

const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const songs: Song[] = [
  { id: id(2), title: 'Newer <song>', line: 'A "line"', created: '2026-01-02T00:00:00.000Z', audio: { key: `${id(2)}.m4a`, type: 'audio/mp4' } },
  { id: id(1), title: 'Older song', line: '', created: '2026-01-01T00:00:00.000Z', audio: { key: `${id(1)}.m4a`, type: 'audio/mp4' } },
];
const album: AlbumPhoto[] = [
  { id: id(3), line: 'First <page>', created: '2026-01-01T00:00:00.000Z', photo: { key: `${id(3)}.jpg`, type: 'image/jpeg' } },
  { id: id(4), line: '', created: '2026-01-03T00:00:00.000Z', photo: { key: `${id(4)}.jpg`, type: 'image/jpeg' } },
];
const CAVEAT = 'family=Caveat';
const board = (extra: Partial<Parameters<typeof sideboard>[0]> = {}) => sideboard({
  songs, songsPlayed: [], album, albumSeen: null, mediaBase: '/for-you/media', home: '/for-you/reading-room',
  songPlayAction: '/for-you/reading-room/song-played', albumSeenAction: '/for-you/reading-room/album-seen', csrf: 'tok', ...extra,
});

describe('the sideboard', () => {
  it('is absent with neither songs nor photos', () => {
    expect(board({ songs: [], album: [] })).toBe('');
  });

  it('shows only what it has', () => {
    const onlySongs = board({ album: [] });
    expect(onlySongs).toContain('<span class="name">Our records</span>');
    expect(onlySongs).not.toContain('<span class="name">Our album</span>');
    expect(onlySongs).not.toContain(CAVEAT);
    const onlyPhotos = board({ songs: [] });
    expect(onlyPhotos).toContain('<span class="name">Our album</span>');
    expect(onlyPhotos).not.toContain('<span class="name">Our records</span>');
    expect(onlyPhotos).toContain(CAVEAT);
  });

  it('links each object to its sheet, open only when asked', () => {
    const html = board({ open: 'album' });
    expect(html).toContain('href="/for-you/reading-room?open=records"');
    expect(html).toContain('<div class="keep-wrap" id="sheet-records" hidden>');
    expect(html).toContain('<div class="keep-wrap" id="sheet-album">');
  });

  it('lists songs newest first as sleeves, escaped, each with its own player', () => {
    const html = board();
    expect(html.indexOf('Newer &lt;song&gt;')).toBeLessThan(html.indexOf('Older song'));
    expect(html).toContain('A &quot;line&quot;');
    expect(html).toContain(`<audio class="song" controls preload="none" src="/for-you/media/${id(2)}.m4a" data-id="${id(2)}" data-title="Newer &lt;song&gt;"></audio>`);
  });

  it('puts a dot on records while a song is unplayed and on the album while a photo is unseen', () => {
    expect(board()).toContain('class="keep-item records new"');
    expect(board()).toContain('class="keep-item album new"');
    const quiet = board({ songsPlayed: songs.map((s) => ({ id: s.id, at: '2026-01-05T00:00:00.000Z' })), albumSeen: '2026-01-05T00:00:00.000Z' });
    expect(quiet).toContain('class="keep-item records"');
    expect(quiet).toContain('class="keep-item album"');
  });

  it('shows the album pages in order with their lines, whole', () => {
    const html = board();
    expect(html.indexOf(`${id(3)}.jpg`)).toBeLessThan(html.indexOf(`${id(4)}.jpg`));
    expect(html).toContain('First &lt;page&gt;');
    expect(html).toMatch(/\.page img \{[^}]*object-fit: contain/);
  });

  it('records nothing in a preview', () => {
    const html = board({ songPlayAction: undefined, albumSeenAction: undefined, csrf: undefined });
    expect(html).not.toContain('data-played=');
    expect(html).not.toContain('data-seen=');
    expect(board()).toContain('data-played="/for-you/reading-room/song-played" data-seen="/for-you/reading-room/album-seen" data-csrf="tok"');
  });

  it('carries its script', () => {
    expect(board()).toContain(KEEPSAKE_SCRIPT);
  });
});

describe('in the reading room', () => {
  const base = { books: [], played: [], replies: [], back: '/for-you', mediaBase: '/for-you/media' };
  it('sits under the shelf and keeps the screen awake while a song plays', () => {
    const html = readingRoomPage({ ...base, keepsakes: { songs, songsPlayed: [], album, albumSeen: null } });
    expect(html.indexOf('class="shelves"')).toBeLessThan(html.indexOf('class="sideboard"'));
    expect(html).toContain(KEEP_AWAKE_SCRIPT);
  });
  it('is not there without keepsakes', () => {
    expect(readingRoomPage(base)).not.toContain('class="sideboard"');
  });
  it('a book pauses every other sound on the page, records included', () => {
    expect(ROOM_SCRIPT).toContain("document.querySelectorAll('audio')");
    expect(KEEPSAKE_SCRIPT).toContain("document.querySelectorAll('audio')");
  });
});

describe('admin', () => {
  const admin = (extra: Partial<Parameters<typeof keepsakesAdmin>[0]> = {}) => keepsakesAdmin({
    base: '/for-you', csrf: 'tok', songs, songsPlayed: [{ id: id(1), at: '2026-01-04T10:00:00.000Z' }], album,
    songDraft: { title: '', line: '' }, ...extra,
  });

  it('has a song form that needs a file only when adding', () => {
    const html = admin();
    expect(html).toContain('action="/for-you/admin/reading-room/song/save"');
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toMatch(/name="audio" accept="audio\/\*,\.m4a" required/);
    const editing = admin({ editingSong: songs[0], songDraft: { title: songs[0].title, line: songs[0].line } });
    expect(editing).not.toMatch(/name="audio" accept="audio\/\*,\.m4a" required/);
    expect(editing).toContain(`<input type="hidden" name="id" value="${id(2)}">`);
    expect(editing).toContain('value="Newer &lt;song&gt;"');
  });

  it('lists songs with play status, edit and delete', () => {
    const html = admin();
    expect(html).toContain('Not played yet');
    expect(html).toContain('Listened');
    expect(html).toContain(`href="/for-you/admin/reading-room?song=${id(2)}#songs"`);
    expect(html).toContain('action="/for-you/admin/reading-room/song/delete"');
    expect(html).toContain("confirm('Delete this song?')");
  });

  it('has a photo form and lists pages with their photo, line, moves and delete', () => {
    const html = admin();
    expect(html).toContain('action="/for-you/admin/reading-room/photo/save"');
    expect(html).toMatch(/name="photo" accept="image\/\*" required/);
    expect(html).toContain(`src="/for-you/admin/media/${id(3)}.jpg"`);
    expect(html).toContain('First &lt;page&gt;');
    expect(html).toContain("confirm('Delete this page?')");
    expect(html).toContain(`href="/for-you/admin/reading-room?photo=${id(4)}#album"`);
  });

  it('offers Up only below the first page and Down only above the last', () => {
    const html = admin();
    const rows = html.split('<li>');
    const first = rows.find((r) => r.includes(`${id(3)}.jpg`))!;
    const last = rows.find((r) => r.includes(`${id(4)}.jpg`))!;
    expect(first).not.toContain('value="-1"');
    expect(first).toContain('value="1"');
    expect(last).toContain('value="-1"');
    expect(last).not.toMatch(/name="by" value="1"/);
  });

  it('editing a page keeps the photo optional', () => {
    const html = admin({ editingPhoto: album[0] });
    expect(html).not.toMatch(/name="photo" accept="image\/\*" required/);
    expect(html).toContain('First &lt;page&gt;</textarea>');
  });
});
