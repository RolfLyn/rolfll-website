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
const stored = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('notes')!);

async function adminWith(env: Env) {
  const cookie = await login(env, 'admin');
  const csrf = await adminCsrf(env, cookie);
  const save = (fields: Record<string, string | File>) => handleRequest(postForm('/for-you/admin/save', { csrf, ...fields }, cookie), env, NOW);
  return { cookie, csrf, save };
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

  it('replaces and removes attachments, deleting the old files', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    const before = stored(kv)[0];
    await save({ original: '2026-10-01', date: '2026-10-01', text: 'hi', photo: file('new.png', 'image/png'), remove_audio: '1' });
    const after = stored(kv)[0];
    expect(after.photo.key).not.toBe(before.photo.key);
    expect(after.photo.type).toBe('image/png');
    expect(after.audio).toBeUndefined();
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

  it('moving onto a date that has a note replaces it and deletes its files', async () => {
    const { env, kv, media } = setup();
    const { save } = await adminWith(env);
    await save({ date: '2026-10-02', text: 'a', photo: file('p.jpg', 'image/jpeg') });
    await save({ date: '2026-10-05', text: 'b', audio: file('a.mp3', 'audio/mpeg') });
    const photoKey = stored(kv).find((n: { date: string }) => n.date === '2026-10-02').photo.key;
    await save({ original: '2026-10-02', date: '2026-10-05', text: 'a' });
    expect(stored(kv)).toEqual([{ date: '2026-10-05', text: 'a', photo: { key: photoKey, type: 'image/jpeg' } }]);
    expect([...media.objects.keys()]).toEqual([photoKey]);
  });

  it('deleting a note deletes its files', async () => {
    const { env, kv, media } = setup();
    const { save, cookie, csrf } = await adminWith(env);
    await save({ date: '2026-10-01', text: 'hi', photo: file('p.jpg', 'image/jpeg'), audio: file('a.mp3', 'audio/mpeg') });
    await handleRequest(post('/for-you/admin/delete', { csrf, date: '2026-10-01' }, cookie), env, NOW);
    expect(stored(kv)).toEqual([]);
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
});
