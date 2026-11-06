import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-10-01T10:00:00Z');
const LATER = new Date('2026-10-01T12:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

afterEach(() => { vi.restoreAllMocks(); });

function setup() {
  const kv = memoryKV();
  const media = memoryR2();
  const env: Env = {
    NOTES: kv, MEDIA: media, ASSETS: { fetch: async () => new Response('asset') }, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
  };
  kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'today' }]));
  return { env, kv, media };
}
const get = (path: string, cookie?: string) => new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP });
const postForm = (path: string, fields: Record<string, string | File>, cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size).fill(7)], name, { type });
async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const res = await handleRequest(post(role === 'reader' ? '/for-you/login' : '/for-you/admin/login', { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}
async function csrfFrom(env: Env, path: string, cookie: string): Promise<string> {
  const html = await (await handleRequest(get(path, cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

async function room() {
  const ctx = setup();
  const adminCookie = await login(ctx.env, 'admin');
  const adminCsrf = await csrfFrom(ctx.env, '/for-you/admin', adminCookie);
  const adminDo = (path: string, fields: Record<string, string | File>, when = NOW) =>
    handleRequest(postForm(`/for-you/admin/reading-room${path}`, { csrf: adminCsrf, ...fields }, adminCookie), ctx.env, when);
  const saveNote = (fields: Record<string, string | File>) =>
    handleRequest(postForm('/for-you/admin/save', { csrf: adminCsrf, ...fields }, adminCookie), ctx.env, NOW);
  const songs = () => JSON.parse(ctx.kv.data.get('records') ?? '[]');
  const album = () => JSON.parse(ctx.kv.data.get('album') ?? '[]');
  const trash = () => JSON.parse(ctx.kv.data.get('trash') ?? '[]').map((t: { key: string }) => t.key);
  const reader = await login(ctx.env, 'reader');
  const csrf = await csrfFrom(ctx.env, '/for-you', reader);
  const her = (path: string, fields: Record<string, string>, when = NOW) => handleRequest(post(`/for-you/reading-room${path}`, { csrf, ...fields }, reader), ctx.env, when);
  const page = async (path = '/for-you/reading-room', when = NOW) => (await handleRequest(get(path, reader), ctx.env, when)).text();
  return { ...ctx, adminCookie, adminDo, saveNote, songs, album, trash, reader, her, page };
}

describe('records', () => {
  it('adds a song with its file and shows it in her room', async () => {
    const { adminDo, songs, media, page } = await room();
    const res = await adminDo('/song/save', { title: 'Placeholder song', line: 'a line', audio: file('s.m4a', 'audio/mp4') });
    expect(res.status).toBe(303);
    const [s] = songs();
    expect(s).toMatchObject({ title: 'Placeholder song', line: 'a line', created: NOW.toISOString(), audio: { type: 'audio/mp4' } });
    expect(media.objects.has(s.audio.key)).toBe(true);
    expect(await page()).toContain('Placeholder song');
  });

  it('refuses a missing title, a wrong file and no file, keeping what he typed', async () => {
    const { adminDo, songs } = await room();
    const noTitle = await adminDo('/song/save', { title: '', line: 'kept line', audio: file('s.m4a', 'audio/mp4') });
    expect(noTitle.status).toBe(400);
    expect(await noTitle.text()).toContain('value="kept line"');
    expect((await adminDo('/song/save', { title: 'T', line: '', audio: file('s.txt', 'text/plain') })).status).toBe(400);
    expect((await adminDo('/song/save', { title: 'T', line: '' })).status).toBe(400);
    expect(songs()).toEqual([]);
  });

  it('editing without a file keeps the recording; deleting retires it and its play time', async () => {
    const { adminDo, songs, trash, her, kv } = await room();
    await adminDo('/song/save', { title: 'T', line: '', audio: file('s.m4a', 'audio/mp4') });
    const [s] = songs();
    await adminDo('/song/save', { id: s.id, title: 'Renamed', line: '' });
    expect(songs()[0]).toMatchObject({ title: 'Renamed', audio: s.audio, created: s.created });
    await her('/song-played', { id: s.id, quiet: '1' });
    expect(JSON.parse(kv.data.get('records_played')!)).toHaveLength(1);
    expect((await adminDo('/song/delete', { id: s.id })).status).toBe(303);
    expect(songs()).toEqual([]);
    expect(trash()).toContain(s.audio.key);
    expect(JSON.parse(kv.data.get('records_played')!)).toEqual([]);
  });

  it('records her first play once, quietly or with a redirect', async () => {
    const { adminDo, songs, her, kv } = await room();
    await adminDo('/song/save', { title: 'T', line: '', audio: file('s.m4a', 'audio/mp4') });
    const [s] = songs();
    expect((await her('/song-played', { id: s.id, quiet: '1' })).status).toBe(204);
    const res = await her('/song-played', { id: s.id }, LATER);
    expect(res.headers.get('Location')).toBe('/for-you/reading-room?open=records');
    expect(JSON.parse(kv.data.get('records_played')!)).toEqual([{ id: s.id, at: NOW.toISOString() }]);
    expect((await her('/song-played', { id: 'nope' })).status).toBe(404);
  });
});

describe('album', () => {
  async function withPages() {
    const ctx = await room();
    for (const line of ['One', 'Two', 'Three']) await ctx.adminDo('/photo/save', { line, photo: file(`${line}.jpg`, 'image/jpeg') });
    return ctx;
  }

  it('adds pages in order and moves them', async () => {
    const { album, adminDo } = await withPages();
    expect(album().map((p: { line: string }) => p.line)).toEqual(['One', 'Two', 'Three']);
    await adminDo('/photo/move', { id: album()[2].id, by: '-1' });
    expect(album().map((p: { line: string }) => p.line)).toEqual(['One', 'Three', 'Two']);
    await adminDo('/photo/move', { id: album()[0].id, by: '-1' });
    expect(album().map((p: { line: string }) => p.line)).toEqual(['One', 'Three', 'Two']);
  });

  it('needs a photo for a new page and refuses a wrong file', async () => {
    const { adminDo, album } = await room();
    expect((await adminDo('/photo/save', { line: 'x' })).status).toBe(400);
    expect((await adminDo('/photo/save', { line: 'x', photo: file('a.m4a', 'audio/mp4') })).status).toBe(400);
    expect(album()).toEqual([]);
  });

  it('edits a line in place, and replacing a photo retires the old one and serves the new', async () => {
    const { adminDo, album, trash, env, reader } = await withPages();
    const second = album()[1];
    await adminDo('/photo/save', { id: second.id, line: 'Edited' });
    expect(album()[1]).toMatchObject({ id: second.id, line: 'Edited', photo: second.photo });
    await adminDo('/photo/save', { id: second.id, line: 'Edited', photo: file('new.jpg', 'image/jpeg') });
    const replaced = album()[1];
    expect(replaced.photo.key).not.toBe(second.photo.key);
    expect(replaced.line).toBe('Edited');
    expect(trash()).toContain(second.photo.key);
    expect((await handleRequest(get(`/for-you/media/${replaced.photo.key}`, reader), env, NOW)).status).toBe(200);
  });

  it('deletes a page and retires its photo', async () => {
    const { adminDo, album, trash } = await withPages();
    const first = album()[0];
    expect((await adminDo('/photo/delete', { id: first.id })).status).toBe(303);
    expect(album()).toHaveLength(2);
    expect(trash()).toContain(first.photo.key);
  });

  it('remembers when she opened it, by script or by link', async () => {
    const { her, kv, page } = await withPages();
    expect((await her('/album-seen', { quiet: '1' })).status).toBe(204);
    expect(kv.data.get('album_seen')).toBe(NOW.toISOString());
    await page('/for-you/reading-room?open=album', LATER);
    expect(kv.data.get('album_seen')).toBe(LATER.toISOString());
  });
});

describe('around the room', () => {
  it('serves songs and photos to her session only', async () => {
    const { adminDo, songs, album, env, reader } = await room();
    await adminDo('/song/save', { title: 'T', line: '', audio: file('s.m4a', 'audio/mp4') });
    await adminDo('/photo/save', { line: '', photo: file('p.jpg', 'image/jpeg') });
    for (const key of [songs()[0].audio.key, album()[0].photo.key]) {
      expect((await handleRequest(get(`/for-you/media/${key}`, reader), env, NOW)).status).toBe(200);
      expect((await handleRequest(get(`/for-you/media/${key}`), env, NOW)).status).toBe(404);
    }
  });

  it('keeps their files when a note file is replaced', async () => {
    const { adminDo, saveNote, songs, album, trash } = await room();
    await adminDo('/song/save', { title: 'T', line: '', audio: file('s.m4a', 'audio/mp4') });
    await adminDo('/photo/save', { line: '', photo: file('p.jpg', 'image/jpeg') });
    await saveNote({ date: '2026-10-01', text: 'today', photo: file('a.jpg', 'image/jpeg') });
    await saveNote({ date: '2026-10-01', original: '2026-10-01', text: 'today', photo: file('b.jpg', 'image/jpeg') });
    expect(trash().length).toBeGreaterThan(0);
    expect(trash()).not.toContain(songs()[0].audio.key);
    expect(trash()).not.toContain(album()[0].photo.key);
  });

  it('lights the reading room link for an unplayed song and an unseen photo', async () => {
    const { adminDo, songs, her, page } = await room();
    const link = async () => (await page('/for-you')).includes('class="unread">');
    await adminDo('/song/save', { title: 'T', line: '', audio: file('s.m4a', 'audio/mp4') });
    expect(await link()).toBe(true);
    await her('/song-played', { id: songs()[0].id, quiet: '1' });
    expect(await link()).toBe(false);
    await adminDo('/photo/save', { line: '', photo: file('p.jpg', 'image/jpeg') }, LATER);
    expect(await link()).toBe(true);
    await her('/album-seen', { quiet: '1' }, new Date(LATER.getTime() + 1000));
    expect(await link()).toBe(false);
  });

  it('still shows the books when the records or album are corrupt, and admin says so', async () => {
    const { kv, page, env, adminCookie } = await room();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.data.set('records', '{ broken');
    kv.data.set('album', 'nope');
    const res = await page();
    expect(res).toContain('The reading room');
    expect(res).not.toContain('class="sideboard"');
    const admin = await (await handleRequest(get('/for-you/admin/reading-room', adminCookie), env, NOW)).text();
    expect(admin).toContain('Songs could not be read.');
    expect(admin).toContain('The album could not be read.');
    expect(kv.data.get('records')).toBe('{ broken');
  });

  it('previews the sideboard without recording anything', async () => {
    const { adminDo, env, adminCookie, kv } = await room();
    await adminDo('/photo/save', { line: '', photo: file('p.jpg', 'image/jpeg') });
    const html = await (await handleRequest(get('/for-you/admin/reading-room/preview?open=album', adminCookie), env, NOW)).text();
    expect(html).toContain('class="sideboard"');
    expect(html).not.toContain('data-seen=');
    expect(kv.data.has('album_seen')).toBe(false);
  });

  it('opens a song or page for editing in admin', async () => {
    const { adminDo, songs, album, env, adminCookie } = await room();
    await adminDo('/song/save', { title: 'Editable', line: '', audio: file('s.m4a', 'audio/mp4') });
    await adminDo('/photo/save', { line: 'Page line', photo: file('p.jpg', 'image/jpeg') });
    const a = await (await handleRequest(get(`/for-you/admin/reading-room?song=${songs()[0].id}`, adminCookie), env, NOW)).text();
    expect(a).toContain('Edit song');
    expect(a).toContain('value="Editable"');
    const b = await (await handleRequest(get(`/for-you/admin/reading-room?photo=${album()[0].id}`, adminCookie), env, NOW)).text();
    expect(b).toContain('Edit page');
  });
});
