import { describe, it, expect, vi } from 'vitest';
import { handleRequest, normalizeBase } from '../worker/index';
import { csrfToken } from '../worker/auth';
import type { Env } from '../worker/types';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-10-01T10:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

function setup(overrides: Partial<Env> = {}) {
  const kv = memoryKV();
  const media = memoryR2();
  const assets = { fetch: vi.fn(async (r: Request) => new Response(`asset:${new URL(r.url).pathname}`)) };
  const env: Env = {
    NOTES: kv, MEDIA: media, ASSETS: assets, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
    ...overrides,
  };
  return { env, kv, assets, media };
}

const get = (path: string, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, {
    method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP,
  });

async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const path = role === 'reader' ? '/for-you/login' : '/for-you/admin/login';
  const res = await handleRequest(post(path, { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}

async function adminCsrf(env: Env, cookie: string): Promise<string> {
  const html = await (await handleRequest(get('/for-you/admin', cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

const postForm = (path: string, fields: Record<string, string | File>, cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size).fill(7)], name, { type });
const LATER = new Date(NOW.getTime() + 25 * 3600 * 1000);
const stored = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('notes')!);

async function adminWith(env: Env) {
  const cookie = await login(env, 'admin');
  const csrf = await adminCsrf(env, cookie);
  const saveAt = (when: Date, fields: Record<string, string | File>) => handleRequest(postForm('/for-you/admin/save', { csrf, ...fields }, cookie), env, when);
  const save = (fields: Record<string, string | File>) => saveAt(NOW, fields);
  return { cookie, csrf, save, saveAt };
}

const seed = (kv: ReturnType<typeof memoryKV>, notes: { date: string; text: string }[]) =>
  kv.data.set('notes', JSON.stringify(notes));

describe('normalizeBase', () => {
  it('normalizes slashes and rejects empty values', () => {
    expect(normalizeBase('/for-you')).toBe('/for-you');
    expect(normalizeBase('for-you/')).toBe('/for-you');
    expect(normalizeBase(' /for-you// ')).toBe('/for-you');
    expect(normalizeBase('/')).toBeNull();
    expect(normalizeBase('')).toBeNull();
    expect(normalizeBase(undefined)).toBeNull();
  });
});

describe('pass-through', () => {
  it('sends the main site and look-alike paths to static assets', async () => {
    const { env, assets } = setup();
    for (const path of ['/', '/works', '/for-youth', '/for-yo']) {
      const res = await handleRequest(get(path), env, NOW);
      expect(await res.text()).toBe(`asset:${path}`);
    }
    expect(assets.fetch).toHaveBeenCalledTimes(4);
  });

  it('serves nothing extra when NOTES_PATH is not set', async () => {
    const { env } = setup({ NOTES_PATH: undefined });
    expect(await (await handleRequest(get('/for-you'), env, NOW)).text()).toBe('asset:/for-you');
  });

  it('fails closed when a secret is missing', async () => {
    const { env } = setup({ COOKIE_SECRET: undefined });
    expect((await handleRequest(get('/for-you'), env, NOW)).status).toBe(503);
  });
});

describe('reader', () => {
  it('shows a noindex login form when logged out', async () => {
    const { env } = setup();
    const res = await handleRequest(get('/for-you'), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('type="password"');
  });

  it('rejects a wrong password and records the failure', async () => {
    const { env, kv } = setup();
    const res = await handleRequest(post('/for-you/login', { password: 'nope' }), env, NOW);
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(kv.data.get('fail:1.2.3.4')).toBe('1');
  });

  it('logs in with the right password and sets a path-scoped cookie', async () => {
    const { env } = setup();
    const res = await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you');
    expect(res.headers.get('Set-Cookie')).toMatch(/^notes_reader=.*Path=\/for-you;/);
  });

  it('locks out after 5 failures, even with the right password', async () => {
    const { env } = setup();
    for (let i = 0; i < 5; i++) await handleRequest(post('/for-you/login', { password: 'x' }), env, NOW);
    const res = await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, NOW);
    expect(res.status).toBe(429);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('counts failures per IPv6 /64, so rotating addresses in one network does not help', async () => {
    const { env } = setup();
    const from = (ip: string, password: string) => new Request('https://rolfll.com/for-you/login', {
      method: 'POST', body: new URLSearchParams({ password }), headers: { 'CF-Connecting-IP': ip },
    });
    for (let i = 1; i <= 5; i++) await handleRequest(from(`2001:db8:1:2::${i}`, 'x'), env, NOW);
    expect((await handleRequest(from('2001:db8:1:2:ffff::9', 'reader-pw'), env, NOW)).status).toBe(429);
    expect((await handleRequest(from('2001:db8:1:3::1', 'reader-pw'), env, NOW)).status).toBe(303);
  });

  it("shows today's note and the archive, never future notes, with or without trailing slash", async () => {
    const { env, kv } = setup();
    seed(kv, [
      { date: '2026-10-02', text: 'SECRET FUTURE' },
      { date: '2026-09-30', text: 'Current one' },
      { date: '2026-09-29', text: 'Older one' },
    ]);
    const cookie = await login(env, 'reader');
    for (const path of ['/for-you', '/for-you/']) {
      const html = await (await handleRequest(get(path, cookie), env, NOW)).text();
      expect(html).toContain('Current one');
      expect(html).toContain('Older one');
      expect(html).not.toContain('SECRET FUTURE');
    }
  });

  it('treats a cookie signed with an old secret as logged out', async () => {
    const { env } = setup();
    const cookie = await login(env, 'reader');
    env.COOKIE_SECRET = 'rotated';
    const res = await handleRequest(get('/for-you', cookie), env, NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('type="password"');
  });

  it('answers HEAD requests like GET', async () => {
    const { env } = setup();
    const res = await handleRequest(new Request('https://rolfll.com/for-you', { method: 'HEAD' }), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('returns a noindex 404 for unknown sub-paths', async () => {
    const { env } = setup();
    const res = await handleRequest(get('/for-you/nope'), env, NOW);
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

describe('admin', () => {
  it('does not accept the reader cookie', async () => {
    const { env } = setup();
    const readerCookie = await login(env, 'reader');
    const html = await (await handleRequest(get('/for-you/admin', readerCookie), env, NOW)).text();
    expect(html).toContain('Admin password');
  });

  it('sets the admin cookie on the admin path', async () => {
    const { env } = setup();
    const res = await handleRequest(post('/for-you/admin/login', { password: 'admin-pw' }), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin');
    expect(res.headers.get('Set-Cookie')).toMatch(/^notes_admin=.*Path=\/for-you\/admin;/);
  });

  it('saves a note that the reader then sees, and works with a trailing slash', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    expect((await handleRequest(get('/for-you/admin/', cookie), env, NOW)).status).toBe(200);
    const csrf = await adminCsrf(env, cookie);
    const res = await handleRequest(
      post('/for-you/admin/save', { csrf, date: '2026-10-01', text: '  You are wonderful\r\nTruly  ' }, cookie), env, NOW,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/admin?msg=saved');
    expect(JSON.parse(kv.data.get('notes')!)).toEqual([{ date: '2026-10-01', text: 'You are wonderful\nTruly' }]);
    const readerHtml = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(readerHtml).toContain('You are wonderful\nTruly');
  });

  it('defaults the form date to the first free day and prefills when editing', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }, { date: '2026-10-02', text: 'tomorrow' }]);
    const cookie = await login(env, 'admin');
    const html = await (await handleRequest(get('/for-you/admin', cookie), env, NOW)).text();
    expect(html).toContain('name="date" value="2026-10-03"');
    const edit = await (await handleRequest(get('/for-you/admin?edit=2026-10-02', cookie), env, NOW)).text();
    expect(edit).toContain('name="date" value="2026-10-02"');
    expect(edit).toContain('>tomorrow</textarea>');
  });

  it('refuses a save without a valid csrf token', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    const res = await handleRequest(post('/for-you/admin/save', { csrf: 'forged', date: '2026-10-01', text: 'x' }, cookie), env, NOW);
    expect(res.status).toBe(403);
    expect(kv.data.has('notes')).toBe(false);
  });

  it('refuses a save when not logged in as admin', async () => {
    const { env, kv } = setup();
    const res = await handleRequest(post('/for-you/admin/save', { date: '2026-10-01', text: 'x' }), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/admin');
    expect(kv.data.has('notes')).toBe(false);
  });

  it('rejects invalid input but keeps what was typed', async () => {
    const { env, kv } = setup();
    const cookie = await login(env, 'admin');
    const csrf = await adminCsrf(env, cookie);
    for (const fields of [
      { csrf, date: '2026-02-30', text: 'kept text' },
      { csrf, date: '2026-10-01', text: '   ' },
      { csrf, date: '2026-10-01', text: 'x'.repeat(5001) },
    ]) {
      const res = await handleRequest(post('/for-you/admin/save', fields, cookie), env, NOW);
      expect(res.status).toBe(400);
    }
    const res = await handleRequest(post('/for-you/admin/save', { csrf, date: 'bad', text: 'kept text' }, cookie), env, NOW);
    expect(await res.text()).toContain('>kept text</textarea>');
    expect(kv.data.has('notes')).toBe(false);
  });

  it('moves a note when its date is changed while editing', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-02', text: 'tomorrow' }]);
    const cookie = await login(env, 'admin');
    const edit = await (await handleRequest(get('/for-you/admin?edit=2026-10-02', cookie), env, NOW)).text();
    expect(edit).toContain('name="original" value="2026-10-02"');
    const csrf = await adminCsrf(env, cookie);
    await handleRequest(
      post('/for-you/admin/save', { csrf, original: '2026-10-02', date: '2026-10-05', text: 'tomorrow' }, cookie), env, NOW,
    );
    expect(JSON.parse(kv.data.get('notes')!)).toEqual([{ date: '2026-10-05', text: 'tomorrow' }]);
  });

  it('shows validation errors as errors, not as success messages', async () => {
    const { env } = setup();
    const cookie = await login(env, 'admin');
    const csrf = await adminCsrf(env, cookie);
    const html = await (await handleRequest(post('/for-you/admin/save', { csrf, date: 'bad', text: 'x' }, cookie), env, NOW)).text();
    expect(html).toContain('<p class="error">Needs a real date');
    expect(html).not.toContain('class="flash"');
  });

  it('deletes a note', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'a' }, { date: '2026-09-01', text: 'b' }]);
    const cookie = await login(env, 'admin');
    const csrf = await adminCsrf(env, cookie);
    const res = await handleRequest(post('/for-you/admin/delete', { csrf, date: '2026-10-01' }, cookie), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin?msg=deleted');
    expect(JSON.parse(kv.data.get('notes')!)).toEqual([{ date: '2026-09-01', text: 'b' }]);
  });
});

describe('corrupt storage', () => {
  it('shows an error and never overwrites the stored value', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const readerRes = await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW);
    expect(readerRes.status).toBe(500);
    const cookie = await login(env, 'admin');
    expect((await handleRequest(get('/for-you/admin', cookie), env, NOW)).status).toBe(500);
    // The admin page failed, so compute the CSRF token the same way the server does.
    const csrf = await csrfToken(cookie.split('=')[1], 'test-secret');
    const saveRes = await handleRequest(post('/for-you/admin/save', { csrf, date: '2026-10-01', text: 'x' }, cookie), env, NOW);
    expect(saveRes.status).toBe(500);
    expect(kv.data.get('notes')).toBe('garbage');
  });
});

describe('media', () => {
  it('saves a photo and a sound with a note, and the reader can load them', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    const res = await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg', 50), audio: file('Recording.m4a', '', 80) });
    expect(res.status).toBe(303);
    const [note] = stored(kv);
    expect(note.photo.type).toBe('image/jpeg');
    expect(note.audio.type).toBe('audio/mp4');
    expect(media.objects.size).toBe(2);
    const reader = await login(env, 'reader');
    const html = await (await handleRequest(get('/for-you', reader), env, NOW)).text();
    expect(html).toContain(`src="/for-you/media/${note.photo.key}"`);
    const img = await handleRequest(get(`/for-you/media/${note.photo.key}`, reader), env, NOW);
    expect(img.status).toBe(200);
    expect(img.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await img.arrayBuffer()).byteLength).toBe(50);
  });

  it('keeps attachments when only the text is edited', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    const before = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'changed' });
    const after = stored(kv)[0];
    expect(after.text).toBe('changed');
    expect(after.photo).toEqual(before.photo);
    expect(after.audio).toEqual(before.audio);
    expect(media.objects.size).toBe(2);
  });

  it('replaces and removes attachments, deleting the old files after a day', async () => {
    const { env, kv, media } = setup();
    const { save, saveAt } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    const before = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'hi', photo: file('new.png', 'image/png'), remove_audio: '1' });
    const after = stored(kv)[0];
    expect(after.photo.key).not.toBe(before.photo.key);
    expect(after.photo.type).toBe('image/png');
    expect(after.audio).toBeUndefined();
    expect(media.objects.has(before.photo.key)).toBe(true);
    const reader = await login(env, 'reader');
    expect((await handleRequest(get(`/for-you/media/${before.photo.key}`, reader), env, NOW)).status).toBe(404);
    await saveAt(LATER, { date: '2026-10-09', text: 'later' });
    expect([...media.objects.keys()]).toEqual([after.photo.key]);
  });

  it('moving a note keeps its attachments', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'hi', photo: file('p.jpg', 'image/jpeg') });
    const key = stored(kv)[0].photo.key;
    await save({ original: '2026-10-02', date: '2026-10-05', text: 'hi' });
    expect(stored(kv)).toEqual([{ date: '2026-10-05', text: 'hi', photo: { key, type: 'image/jpeg' } }]);
    expect(media.objects.has(key)).toBe(true);
  });

  it('moving onto a date that has a note replaces it and deletes its files after a day', async () => {
    const { env, kv, media } = setup();
    const { save, saveAt } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'a', photo: file('p.jpg', 'image/jpeg') });
    await save({ date: '2026-10-05', text: 'b', audio: file('a.mp3', 'audio/mpeg') });
    const photoKey = stored(kv).find((n: { date: string }) => n.date === '2026-10-02').photo.key;
    await save({ original: '2026-10-02', date: '2026-10-05', text: 'a' });
    expect(stored(kv)).toEqual([{ date: '2026-10-05', text: 'a', photo: { key: photoKey, type: 'image/jpeg' } }]);
    await saveAt(LATER, { original: '2026-10-05', date: '2026-10-05', text: 'a' });
    expect([...media.objects.keys()]).toEqual([photoKey]);
  });

  it('deleting a note deletes its files after a day', async () => {
    const { env, kv, media } = setup();
    const { save, saveAt, cookie, csrf } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    await handleRequest(post('/for-you/admin/delete', { csrf, date: '2026-10-01' }, cookie), env, NOW);
    expect(stored(kv)).toEqual([]);
    expect(media.objects.size).toBe(2);
    await saveAt(LATER, { date: '2026-10-09', text: 'later' });
    expect(media.objects.size).toBe(0);
  });

  it('rejects unsupported files, stores nothing, and keeps the typed text', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    for (const photo of [file('IMG_1.HEIC', 'image/heic'), file('x.svg', 'image/svg+xml')]) {
      const res = await save({ date: '2026-10-01', text: 'kept', photo });
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Photo must be JPG, PNG, WebP or GIF.');
      expect(html).toContain('>kept</textarea>');
    }
    expect(kv.data.has('notes')).toBe(false);
    expect(media.objects.size).toBe(0);
  });

  it('only serves media to the right people at the right time', async () => {
    const { env, kv } = setup();
    const { save, cookie: admin } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'future', photo: file('p.jpg', 'image/jpeg') });
    const key = stored(kv)[0].photo.key;
    const reader = await login(env, 'reader');
    expect((await handleRequest(get(`/for-you/media/${key}`, reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${key}`), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, admin), env, NOW)).status).toBe(200);
    expect((await handleRequest(get('/for-you/media/00000000-0000-4000-8000-000000000000.jpg', reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get('/for-you/media/../notes', reader), env, NOW)).status).toBe(404);
  });

  it('serves byte ranges so iPhones can play sound', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', audio: file('a.m4a', 'audio/mp4', 80) });
    const key = stored(kv)[0].audio.key;
    const reader = await login(env, 'reader');
    const res = await handleRequest(new Request(`https://rolfll.com/for-you/media/${key}`, { headers: { Cookie: reader, Range: 'bytes=0-9' } }), env, NOW);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-9/80');
  });

  it('leaves legacy text-only notes untouched when saving another note with media', async () => {
    const { env, kv } = setup();
    const legacy = [
      { date: '2026-09-30', text: 'Line one\nLine two 💛' },
      { date: '2026-09-29', text: 'First "quoted" note' },
    ];
    seed(kv, legacy);
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'new', photo: file('p.jpg', 'image/jpeg') });
    const notes = stored(kv);
    expect(notes.slice(1)).toEqual(legacy);
    expect(JSON.stringify(notes.slice(1))).toBe(JSON.stringify(legacy));
  });

  it('a new note on a date that already has one does not inherit its media', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-08', text: 'old', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    await save({ date: '2026-10-08', text: 'new' });
    expect(stored(kv)).toEqual([{ date: '2026-10-08', text: 'new' }]);
  });

  it('a file that is referenced again before the day is up is not deleted', async () => {
    const { env, kv, media } = setup();
    const { save, saveAt } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg') });
    const note = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'hi', remove_photo: '1' });
    // A stale write (e.g. from an old read) puts the reference back.
    kv.data.set('notes', JSON.stringify([note]));
    await saveAt(LATER, { date: '2026-10-09', text: 'later' });
    expect(media.objects.has(note.photo.key)).toBe(true);
  });

  it('a save still succeeds when the cleanup list is unreadable', async () => {
    const { env, kv } = setup();
    kv.data.set('trash', 'garbage');
    const { save } = await adminWith(env);
    expect((await save({ date: '2026-10-01', text: 'hi' })).status).toBe(303);
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'hi' }]);
  });
});

describe('game', () => {
  const GAME_FIELDS = {
    game_kind: 'distance', game_from: 'Harbour', game_to: 'Hill', game_km: '10.000',
    game_meet: '2026-10-21', game_lines: 'first line\r\n\r\n  second line  \n',
  };
  const GAME = { kind: 'distance', from: 'Harbour', to: 'Hill', km: 10000, lines: ['first line', 'second line'], meet: '2026-10-21' };

  it('saves a game with a note', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    expect((await save({ date: '2026-10-01', text: 'hello', ...GAME_FIELDS })).status).toBe(303);
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'hello', game: GAME }]);
  });

  it('prefills the game when editing, keeps it on a text-only edit, and None removes it', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'hello', game: GAME }]));
    const { cookie, save } = await adminWith(env);
    const form = await (await handleRequest(get('/for-you/admin?edit=2026-10-01', cookie), env, NOW)).text();
    expect(form).toContain('<option value="distance" selected>');
    expect(form).toContain('name="game_from" maxlength="40" value="Harbour"');
    expect(form).toContain('first line\nsecond line</textarea>');

    await save({
      original: '2026-10-01', date: '2026-10-01', text: 'edited', game_kind: 'distance', game_from: 'Harbour',
      game_to: 'Hill', game_km: '10000', game_meet: '2026-10-21', game_lines: 'first line\nsecond line',
    });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'edited', game: GAME }]);

    await save({ original: '2026-10-01', date: '2026-10-01', text: 'edited', game_kind: '' });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'edited' }]);
  });

  it('a new note on a date that has a game note does not inherit the game', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'hello', game: GAME }]));
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'fresh' });
    expect(stored(kv)).toEqual([{ date: '2026-10-01', text: 'fresh' }]);
  });

  it('rejects a bad game, stores nothing, and keeps what was typed', async () => {
    const { env, kv } = setup();
    const { save } = await adminWith(env);
    const res = await save({ date: '2026-10-01', text: 'hello', ...GAME_FIELDS, game_km: 'far' });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('The game needs');
    expect(html).toContain('name="game_km" inputmode="numeric" value="far"');
    expect(html).toContain('value="Harbour"');
    expect(html).toContain('>hello</textarea>');
    expect(kv.data.has('notes')).toBe(false);
  });

  it('lets the admin preview any note, even a future one, as the reader would see it', async () => {
    const { env, kv } = setup();
    kv.data.set('notes', JSON.stringify([{ date: '2026-10-05', text: 'soon', game: GAME }]));
    const admin = await login(env, 'admin');
    const res = await handleRequest(get('/for-you/admin/preview?date=2026-10-05', admin), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const html = await res.text();
    expect(html).toContain('soon');
    expect(html).toContain('data-date="2026-10-05" data-preview>');
    expect((await handleRequest(get('/for-you/admin/preview?date=2026-10-06', admin), env, NOW)).status).toBe(404);
    const reader = await login(env, 'reader');
    const asReader = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-05', reader), env, NOW)).text();
    expect(asReader).toContain('Admin password');
    expect(asReader).not.toContain('soon');
  });
});

async function readerCsrf(env: Env, cookie: string): Promise<string> {
  const html = await (await handleRequest(get('/for-you', cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

const replies = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('replies') ?? '[]');

describe('replies', () => {
  async function reader() {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-02', text: 'future' }, { date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'older' }]);
    const cookie = await login(env, 'reader');
    const csrf = await readerCsrf(env, cookie);
    const reply = (fields: Record<string, string>, c = cookie) => handleRequest(post('/for-you/reply', { csrf, ...fields }, c), env, NOW);
    return { env, kv, cookie, csrf, reply };
  }

  it('saves a heart and a line, shows it back, and returns to the note', async () => {
    const { env, kv, cookie, reply } = await reader();
    const res = await reply({ date: '2026-09-30', heart: 'on', text: '  miss you\r\n ' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you#note-2026-09-30');
    expect(replies(kv)).toEqual([{ date: '2026-09-30', heart: true, text: 'miss you', at: NOW.toISOString() }]);
    const html = await (await handleRequest(get('/for-you', cookie), env, NOW)).text();
    expect(html).toContain('You sent ♥ “miss you”');
  });

  it('updates and clears a reply', async () => {
    const { kv, reply } = await reader();
    await reply({ date: '2026-10-01', heart: 'on' });
    await reply({ date: '2026-10-01', text: 'only words' });
    expect(replies(kv)).toEqual([{ date: '2026-10-01', heart: false, text: 'only words', at: NOW.toISOString() }]);
    await reply({ date: '2026-10-01' });
    expect(replies(kv)).toEqual([]);
  });

  it('sends a too-long reply back with a gentle error and stores nothing', async () => {
    const { env, kv, cookie, reply } = await reader();
    const res = await reply({ date: '2026-10-01', text: 'x'.repeat(281) });
    expect(res.headers.get('Location')).toBe('/for-you?unsent=2026-10-01#note-2026-10-01');
    expect(kv.data.has('replies')).toBe(false);
    const html = await (await handleRequest(get('/for-you?unsent=2026-10-01', cookie), env, NOW)).text();
    expect(html).toContain('That didn&#39;t send. Try again?');
  });

  it('refuses replies without the reader session, with a bad token, or to unseen notes', async () => {
    const { env, kv, reply } = await reader();
    expect((await handleRequest(post('/for-you/reply', { date: '2026-10-01', heart: 'on' }), env, NOW)).status).toBe(303);
    expect((await reply({ date: '2026-10-01', heart: 'on', csrf: 'nope' })).status).toBe(403);
    const admin = await login(env, 'admin');
    expect((await reply({ date: '2026-10-01', heart: 'on' }, admin)).status).toBe(303);
    expect((await reply({ date: '2026-10-02', heart: 'on' })).status).toBe(404);
    expect((await reply({ date: '2026-09-01', heart: 'on' })).status).toBe(404);
    expect(kv.data.has('replies')).toBe(false);
  });

  it('a corrupt replies value never breaks the page and is never overwritten', async () => {
    const { env, kv, cookie, reply } = await reader();
    kv.data.set('replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleRequest(get('/for-you', cookie), env, NOW);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('today');
    expect(html).not.toContain('class="reply');
    expect((await reply({ date: '2026-10-01', heart: 'on' })).status).toBe(500);
    const admin = await login(env, 'admin');
    expect(await (await handleRequest(get('/for-you/admin', admin), env, NOW)).text()).toContain('Replies could not be read.');
    expect(kv.data.get('replies')).toBe('garbage');
  });

  it('deleting a note deletes its reply; moving a note moves it; a new note on its date drops it', async () => {
    const { env, kv, reply } = await reader();
    await reply({ date: '2026-09-30', heart: 'on' });
    await reply({ date: '2026-10-01', text: 'b' });
    const { save, csrf, cookie } = await adminWith(env);
    await save({ original: '2026-09-30', date: '2026-09-28', text: 'older' });
    expect(replies(kv).map((r: { date: string }) => r.date).sort()).toEqual(['2026-09-28', '2026-10-01']);
    await save({ date: '2026-10-01', text: 'fresh note' });
    expect(replies(kv).map((r: { date: string }) => r.date)).toEqual(['2026-09-28']);
    await handleRequest(postForm('/for-you/admin/delete', { csrf, date: '2026-09-28' }, cookie), env, NOW);
    expect(replies(kv)).toEqual([]);
  });

  it('a text-only edit keeps the reply, and saving notes never creates or overwrites the replies key', async () => {
    const { env, kv, reply } = await reader();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-05', text: 'new' });
    expect(kv.data.has('replies')).toBe(false);
    await reply({ date: '2026-10-01', heart: 'on' });
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'edited' });
    expect(replies(kv)).toHaveLength(1);
    kv.data.set('replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await save({ original: '2026-10-01', date: '2026-10-03', text: 'moved' })).status).toBe(303);
    expect(kv.data.get('replies')).toBe('garbage');
  });

  it('shows her reply in admin, and preview shows it with the form turned off', async () => {
    const { env, reply } = await reader();
    await reply({ date: '2026-10-01', heart: 'on', text: 'hi' });
    const admin = await login(env, 'admin');
    expect(await (await handleRequest(get('/for-you/admin', admin), env, NOW)).text()).toContain('<p class="reply-line">♥ “hi”');
    const preview = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-01', admin), env, NOW)).text();
    expect(preview).toContain('You sent ♥ “hi”');
    expect(preview).toContain('<fieldset disabled>');
  });
});

describe('meetings and the sky', () => {
  it('adds, replaces and removes meetings, and the reader sees the sky', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'older' }]);
    const { csrf, cookie } = await adminWith(env);
    const meet = (path: string, fields: Record<string, string>) =>
      handleRequest(postForm(`/for-you/admin/meeting/${path}`, { csrf, ...fields }, cookie), env, NOW);
    expect((await meet('save', { meet_date: '2026-10-21', meet_place: 'Nowhere' })).headers.get('Location')).toBe('/for-you/admin?msg=meeting-saved');
    await meet('save', { meet_date: '2026-10-21', meet_place: 'Somewhere' });
    expect(JSON.parse(kv.data.get('meetings')!)).toEqual([{ date: '2026-10-21', place: 'Somewhere' }]);
    const html = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(html).toContain('A star for every note · Somewhere in 20 sleeps');
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect((await meet('delete', { date: '2026-10-21' })).headers.get('Location')).toBe('/for-you/admin?msg=meeting-removed');
    expect(JSON.parse(kv.data.get('meetings')!)).toEqual([]);
  });

  it('rejects a bad meeting, keeps what was typed, and stores nothing', async () => {
    const { env, kv } = setup();
    const { csrf, cookie } = await adminWith(env);
    const res = await handleRequest(postForm('/for-you/admin/meeting/save', { csrf, meet_date: '2026-10-21', meet_place: '' }, cookie), env, NOW);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('A meeting needs a real date');
    expect(kv.data.has('meetings')).toBe(false);
  });

  it('refuses meeting changes without admin or a valid token', async () => {
    const { env, kv } = setup();
    const reader = await login(env, 'reader');
    expect((await handleRequest(postForm('/for-you/admin/meeting/save', { meet_date: '2026-10-21', meet_place: 'x' }, reader), env, NOW)).status).toBe(303);
    const { cookie } = await adminWith(env);
    expect((await handleRequest(postForm('/for-you/admin/meeting/save', { csrf: 'nope', meet_date: '2026-10-21', meet_place: 'x' }, cookie), env, NOW)).status).toBe(403);
    expect(kv.data.has('meetings')).toBe(false);
  });

  it('previews the arrival heart on the meeting date', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-21', text: 'here' }, { date: '2026-10-01', text: 'today' }]);
    kv.data.set('meetings', JSON.stringify([{ date: '2026-10-21', place: 'Somewhere' }]));
    const admin = await login(env, 'admin');
    const html = await (await handleRequest(get('/for-you/admin/preview?date=2026-10-21', admin), env, NOW)).text();
    expect(html).toContain('sky-arrived');
    expect(html).toContain("0 km · You&#39;re here ♥");
  });

  it('a corrupt meetings value hides the sky but keeps the notes', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }]);
    kv.data.set('meetings', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = await (await handleRequest(get('/for-you', await login(env, 'reader')), env, NOW)).text();
    expect(html).toContain('today');
    expect(html).not.toContain('class="sky');
    expect(kv.data.get('meetings')).toBe('garbage');
  });
});

describe('replies are only written when a change touches one', () => {
  it('saving, moving and deleting notes without replies leaves the replies key alone', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'older' }]);
    kv.data.set('replies', JSON.stringify([{ date: '2026-10-01', heart: true, text: '', at: NOW.toISOString() }]));
    const { save, csrf, cookie } = await adminWith(env);
    await save({ date: '2026-10-05', text: 'new' });
    await save({ original: '2026-09-30', date: '2026-09-28', text: 'moved' });
    await handleRequest(postForm('/for-you/admin/delete', { csrf, date: '2026-09-28' }, cookie), env, NOW);
    expect(kv.puts.filter((p) => p.key === 'replies')).toEqual([]);
  });
});

describe('after dark', () => {
  const TEXT = 'A placeholder entry';

  async function withEntry(extra: Record<string, string | File> = {}) {
    const ctx = setup();
    seed(ctx.kv, [{ date: '2026-10-01', text: 'today' }]);
    const admin = await adminWith(ctx.env);
    const saveEntry = (fields: Record<string, string | File>, when = NOW) =>
      handleRequest(postForm('/for-you/admin/after-dark/save', { csrf: admin.csrf, ...fields }, admin.cookie), ctx.env, when);
    const res = await saveEntry({ title: 'A title', text: TEXT, ...extra });
    const entries = () => JSON.parse(ctx.kv.data.get('after_dark')!);
    return { ...ctx, admin, res, entries, saveEntry };
  }

  async function comeIn(env: Env) {
    const cookie = await login(env, 'reader');
    const csrf = await readerCsrf(env, cookie);
    const enter = await handleRequest(post('/for-you/after-dark/enter', { csrf }, cookie), env, NOW);
    const door = enter.headers.get('Set-Cookie')!.split(';')[0];
    return { cookie, csrf, enter, inside: `${cookie}; ${door}` };
  }

  it('shows the moon link only once there is an entry', async () => {
    const { env, kv } = setup();
    seed(kv, [{ date: '2026-10-01', text: 'today' }]);
    const reader = await login(env, 'reader');
    expect(await (await handleRequest(get('/for-you', reader), env, NOW)).text()).not.toContain('after dark</a>');
    const w = await withEntry();
    expect(w.res.status).toBe(303);
    expect(w.res.headers.get('Location')).toBe('/for-you/admin/after-dark?msg=saved');
    const html = await (await handleRequest(get('/for-you', await login(w.env, 'reader')), w.env, NOW)).text();
    expect(html).toContain(`data-newest="${w.entries()[0].id}"`);
  });

  it('shows the doorway until she comes in, then the room for 30 minutes', async () => {
    const { env } = await withEntry();
    const { cookie, enter, inside } = await comeIn(env);
    const door = await (await handleRequest(get('/for-you/after-dark', cookie), env, NOW)).text();
    expect(door).toContain("This part is just for when you're alone.");
    expect(door).not.toContain(TEXT);
    expect(enter.status).toBe(303);
    expect(enter.headers.get('Location')).toBe('/for-you/after-dark');
    expect(enter.headers.get('Set-Cookie')).toContain('Max-Age=1800');
    const room = await handleRequest(get('/for-you/after-dark', inside), env, NOW);
    expect(room.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(room.headers.get('Cache-Control')).toBe('no-store');
    expect(await room.text()).toContain(TEXT);
    const later = await (await handleRequest(get('/for-you/after-dark', inside), env, new Date(NOW.getTime() + 31 * 60_000))).text();
    expect(later).toContain("This part is just for when you're alone.");
  });

  it('asks for the password when logged out, and refuses to open without a valid token or session', async () => {
    const { env } = await withEntry();
    const out = await (await handleRequest(get('/for-you/after-dark'), env, NOW)).text();
    expect(out).toContain('name="password"');
    expect(out).not.toContain(TEXT);
    const noSession = await handleRequest(post('/for-you/after-dark/enter', { csrf: 'x' }), env, NOW);
    expect(noSession.headers.get('Set-Cookie')).toBeNull();
    const reader = await login(env, 'reader');
    expect((await handleRequest(post('/for-you/after-dark/enter', { csrf: 'nope' }, reader), env, NOW)).status).toBe(403);
  });

  it('does not open for a different reader session', async () => {
    const { env } = await withEntry();
    const { inside } = await comeIn(env);
    const door = inside.split('; ')[1];
    const other = (await handleRequest(post('/for-you/login', { password: 'reader-pw' }), env, new Date(NOW.getTime() + 1000)))
      .headers.get('Set-Cookie')!.split(';')[0];
    const html = await (await handleRequest(get('/for-you/after-dark', `${other}; ${door}`), env, NOW)).text();
    expect(html).toContain("This part is just for when you're alone.");
  });

  it('leave closes the door and goes back to the notes', async () => {
    const { env } = await withEntry();
    const { inside } = await comeIn(env);
    const res = await handleRequest(post('/for-you/after-dark/leave', {}, inside), env, NOW);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you');
    expect(res.headers.get('Set-Cookie')).toContain('notes_door=;');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('saves her reply to an entry, and refuses it with the door closed or for an unknown entry', async () => {
    const { env, kv, entries } = await withEntry();
    const id = entries()[0].id;
    const { cookie, csrf, inside } = await comeIn(env);
    const reply = (fields: Record<string, string>, c = inside) => handleRequest(post('/for-you/after-dark/reply', { csrf, ...fields }, c), env, NOW);
    const res = await reply({ id, heart: 'on', text: ' yes ' });
    expect(res.headers.get('Location')).toBe(`/for-you/after-dark#entry-${id}`);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)).toEqual([{ id, heart: true, text: 'yes', at: NOW.toISOString() }]);
    expect(await (await handleRequest(get('/for-you/after-dark', inside), env, NOW)).text()).toContain('You sent ♥ “yes”');
    expect((await reply({ id, heart: 'on', text: 'yes' }, 'notes_reader=forged')).headers.get('Location')).toBe('/for-you');
    expect((await reply({ id, heart: 'on', text: 'yes' }, cookie)).headers.get('Location')).toBe(`/for-you/after-dark#entry-${id}`);
    expect((await reply({ id: '99999999-9999-4999-8999-999999999999', heart: 'on' })).status).toBe(404);
    expect((await reply({ id, text: 'x'.repeat(281) })).headers.get('Location')).toBe(`/for-you/after-dark?unsent=${id}#entry-${id}`);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)[0].text).toBe('yes');
  });

  it('edits an entry keeping its id and date, deletes it with its reply, and rejects bad input', async () => {
    const { env, kv, entries, saveEntry, admin } = await withEntry();
    const first = entries()[0];
    await saveEntry({ id: first.id, title: '', text: 'changed' }, LATER);
    expect(entries()).toEqual([{ id: first.id, title: '', text: 'changed', created: first.created }]);
    const bad = await saveEntry({ text: '   ' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('An entry needs text');
    expect(entries()).toHaveLength(1);
    const { csrf, inside } = await comeIn(env);
    await handleRequest(post('/for-you/after-dark/reply', { csrf, id: first.id, heart: 'on' }, inside), env, NOW);
    const del = await handleRequest(postForm('/for-you/admin/after-dark/delete', { csrf: admin.csrf, id: first.id }, admin.cookie), env, NOW);
    expect(del.headers.get('Location')).toBe('/for-you/admin/after-dark?msg=deleted');
    expect(entries()).toEqual([]);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)).toEqual([]);
  });

  it('serves an entry sound only with the door open, and to the admin', async () => {
    const { env, entries, admin } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const key = entries()[0].audio.key;
    const { cookie, inside } = await comeIn(env);
    expect((await handleRequest(get(`/for-you/media/${key}`, cookie), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${key}`, inside), env, NOW)).status).toBe(200);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, admin.cookie), env, NOW)).status).toBe(200);
  });

  it('never lets the browser keep an entry sound, while note media stays cacheable', async () => {
    const { env, entries, admin } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const key = entries()[0].audio.key;
    const { inside } = await comeIn(env);
    expect((await handleRequest(get(`/for-you/media/${key}`, inside), env, NOW)).headers.get('Cache-Control')).toBe('no-store');
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, admin.cookie), env, NOW)).headers.get('Cache-Control')).toBe('no-store');
    await admin.save({ date: '2026-10-01', text: 'today', photo: file('p.jpg', 'image/jpeg') });
    const noteKey = JSON.parse((env.NOTES as ReturnType<typeof memoryKV>).data.get('notes')!)[0].photo.key;
    const reader = await login(env, 'reader');
    expect((await handleRequest(get(`/for-you/media/${noteKey}`, reader), env, NOW)).headers.get('Cache-Control')).toBe('private, max-age=86400');
  });

  it('keeps her reply when the door closed while she was writing', async () => {
    const { env, kv, entries } = await withEntry();
    const id = entries()[0].id;
    const { csrf, inside } = await comeIn(env);
    const res = await handleRequest(post('/for-you/after-dark/reply', { csrf, id, text: 'late words' }, inside), env, new Date(NOW.getTime() + 45 * 60_000));
    expect(res.headers.get('Location')).toBe(`/for-you/after-dark#entry-${id}`);
    expect(JSON.parse(kv.data.get('after_dark_replies')!)[0].text).toBe('late words');
  });

  it('replaces and removes entry sounds, deleting old files after a day', async () => {
    const { media, entries, saveEntry } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const first = entries()[0];
    await saveEntry({ id: first.id, text: TEXT, audio: file('b.mp3', 'audio/mpeg') });
    const second = entries()[0].audio.key;
    expect(media.objects.has(first.audio.key)).toBe(true);
    await saveEntry({ id: first.id, text: TEXT, remove_audio: '1' }, LATER);
    expect(entries()[0].audio).toBeUndefined();
    expect(media.objects.has(first.audio.key)).toBe(false);
    expect(media.objects.has(second)).toBe(true);
  });

  it('notes clean-up never deletes an entry sound, and entry clean-up never deletes a note file', async () => {
    const { env, media, entries, saveEntry, admin } = await withEntry({ audio: file('a.mp3', 'audio/mpeg') });
    const entryKey = entries()[0].audio.key;
    await admin.save({ date: '2026-10-03', text: 'with photo', photo: file('p.jpg', 'image/jpeg') });
    const noteKey = JSON.parse((env.NOTES as ReturnType<typeof memoryKV>).data.get('notes')!).find((n: { date: string }) => n.date === '2026-10-03').photo.key;
    await admin.saveAt(LATER, { date: '2026-10-04', text: 'later' });
    await saveEntry({ text: 'another' }, new Date(LATER.getTime() + 1000));
    expect(media.objects.has(entryKey)).toBe(true);
    expect(media.objects.has(noteKey)).toBe(true);
  });

  it('keeps the notes page working and never overwrites a corrupt value', async () => {
    const { env, kv, saveEntry, admin } = await withEntry();
    kv.data.set('after_dark', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reader = await login(env, 'reader');
    const page = await handleRequest(get('/for-you', reader), env, NOW);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain('after dark</a>');
    const { inside } = await comeIn(env);
    expect((await handleRequest(get('/for-you/after-dark', inside), env, NOW)).status).toBe(500);
    expect(await (await handleRequest(get('/for-you/admin/after-dark', admin.cookie), env, NOW)).text()).toContain('Entries could not be read.');
    expect((await saveEntry({ text: 'x' })).status).toBe(500);
    expect(kv.data.get('after_dark')).toBe('garbage');
  });

  it('shows entries without reply areas when replies are corrupt', async () => {
    const { env, kv } = await withEntry();
    kv.data.set('after_dark_replies', 'garbage');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { inside } = await comeIn(env);
    const html = await (await handleRequest(get('/for-you/after-dark', inside), env, NOW)).text();
    expect(html).toContain(TEXT);
    expect(html).not.toContain('class="reply"');
  });

  it('lets the admin preview the room with replies off, and only the admin', async () => {
    const { env, admin } = await withEntry();
    const html = await (await handleRequest(get('/for-you/admin/after-dark/preview', admin.cookie), env, NOW)).text();
    expect(html).toContain(TEXT);
    expect(html).toContain('<fieldset disabled>');
    const reader = await login(env, 'reader');
    expect(await (await handleRequest(get('/for-you/admin/after-dark/preview', reader), env, NOW)).text()).toContain('Admin password');
    expect(await (await handleRequest(get('/for-you/admin/after-dark', reader), env, NOW)).text()).toContain('Admin password');
  });
});
