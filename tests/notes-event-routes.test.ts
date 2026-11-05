import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-10-01T10:00:00Z');
const LATER = new Date('2026-10-02T11:00:00Z');
const AFTER = new Date('2026-10-11T10:00:00Z');
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

const get = (path: string, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP });
const postForm = (path: string, fields: Record<string, string | File>, cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size).fill(7)], name, { type });

async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const path = role === 'reader' ? '/for-you/login' : '/for-you/admin/login';
  const res = await handleRequest(post(path, { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}
async function csrfFrom(env: Env, path: string, cookie: string): Promise<string> {
  const html = await (await handleRequest(get(path, cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

const EVENT = () => ({
  id: 'ev1', title: 'Placeholder week', intro: ['Intro'], from: '2026-09-30', until: '2026-10-10',
  doors: [
    { id: 'd1', label: 'Thu 1 Oct', heading: 'Thursday 1 October', opens: '2026-09-30', opensLabel: 'Wed 30 Sep',
      dishes: [{ id: 'a', title: 'Dish A', text: 'A', photo: 'one.jpg', buy: ['Secret A'] }, { id: 'b', title: 'Dish B', text: 'B' }] },
    { id: 'd2', label: 'Sat 3 Oct', heading: 'Saturday 3 October', opens: '2026-10-02', opensLabel: 'Fri 2 Oct',
      dishes: [{ id: 'c', title: 'Hidden dish', text: 'C', photo: 'two.jpg' }] },
  ],
  card: { title: 'Card', prompt: 'Pick two', pick: 2, opens: '2026-09-30', dishes: [{ id: 'x', title: 'X', text: 'x' }, { id: 'y', title: 'Y', text: 'y' }, { id: 'z', title: 'Z', text: 'z' }] },
});

async function withEvent({ save = true } = {}) {
  const ctx = setup();
  const adminCookie = await login(ctx.env, 'admin');
  const adminCsrf = await csrfFrom(ctx.env, '/for-you/admin', adminCookie);
  const adminDo = (path: string, fields: Record<string, string | File>, when = NOW) =>
    handleRequest(postForm(`/for-you/admin/event${path}`, { csrf: adminCsrf, ...fields }, adminCookie), ctx.env, when);
  const saveNote = (fields: Record<string, string | File>) =>
    handleRequest(postForm('/for-you/admin/save', { csrf: adminCsrf, ...fields }, adminCookie), ctx.env, NOW);
  await adminDo('/photos', { photos: file('one.jpg', 'image/jpeg') });
  await adminDo('/photos', { photos: file('two.jpg', 'image/jpeg') });
  const photos = (): { key: string; name: string }[] => JSON.parse(ctx.kv.data.get('event_photos') ?? '[]');
  const keyOf = (name: string) => photos().find((p) => p.name === name)!.key;
  const saved = save ? await adminDo('/save', { event: JSON.stringify(EVENT()) }) : null;
  const reader = await login(ctx.env, 'reader');
  const csrf = await csrfFrom(ctx.env, '/for-you', reader);
  const her = (fields: Record<string, string>, when = NOW) => handleRequest(post('/for-you/event/save', { csrf, ...fields }, reader), ctx.env, when);
  const picks = () => JSON.parse(ctx.kv.data.get('event_picks') ?? 'null');
  return { ...ctx, adminCookie, adminDo, saveNote, photos, keyOf, saved, reader, her, picks };
}

describe('special event routes', () => {
  it('stores uploaded photos under random keys, keeping their names', async () => {
    const { photos, media } = await withEvent({ save: false });
    expect(photos().map((p) => p.name)).toEqual(['one.jpg', 'two.jpg']);
    for (const p of photos()) {
      expect(p.key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      expect(media.objects.has(p.key)).toBe(true);
    }
  });

  it('refuses a file that is not a photo', async () => {
    const { adminDo, photos } = await withEvent({ save: false });
    const res = await adminDo('/photos', { photos: file('song.m4a', 'audio/mp4') });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Photo must be');
    expect(photos()).toHaveLength(2);
  });

  it('saves a valid event, and keeps the text and the old event when it is invalid', async () => {
    const { saved, adminDo, kv } = await withEvent();
    expect(saved!.status).toBe(303);
    const before = kv.data.get('event');
    expect(JSON.parse(before!).id).toBe('ev1');
    const res = await adminDo('/save', { event: '{ "id": "ev2", broken' });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('valid JSON');
    expect(html).toContain('{ &quot;id&quot;: &quot;ev2&quot;, broken');
    expect(kv.data.get('event')).toBe(before);
  });

  it('a save of the event never touches her picks', async () => {
    const { her, adminDo, kv } = await withEvent();
    await her({ do: 'pick', door: 'd1', dish: 'a' });
    const before = kv.data.get('event_picks');
    await adminDo('/save', { event: JSON.stringify({ ...EVENT(), title: 'New title' }) });
    expect(kv.data.get('event_picks')).toBe(before);
  });

  it('shows the page to her only with a session and while the event runs', async () => {
    const { env, reader, kv } = await withEvent();
    expect(await (await handleRequest(get('/for-you/event'), env, NOW)).text()).toContain('type="password"');
    const page = await handleRequest(get('/for-you/event', reader), env, NOW);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Placeholder week');
    expect(html).toContain('href="/for-you">Back to your notes</a>');
    expect(html).not.toContain('Hidden dish');
    expect(html).not.toContain('Secret A');
    expect((await handleRequest(get('/for-you/event', reader), env, AFTER)).status).toBe(404);
    kv.data.delete('event');
    expect((await handleRequest(get('/for-you/event', reader), env, NOW)).status).toBe(404);
  });

  it('records her opening a door and her picks, quietly or with a redirect', async () => {
    const { her, picks } = await withEvent();
    expect((await her({ do: 'open', door: 'd1', quiet: '1' })).status).toBe(204);
    const res = await her({ do: 'pick', door: 'd1', dish: 'b' });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/event?open=d1');
    expect(picks()).toMatchObject({ event: 'ev1', opened: { d1: NOW.toISOString() }, doors: { d1: { dish: 'b' } } });
    const card = await her({ do: 'card', dish: 'x' });
    expect(card.headers.get('Location')).toBe('/for-you/event?open=card');
  });

  it('opening a door through its link records it too', async () => {
    const { env, reader, picks } = await withEvent();
    const page = await handleRequest(get('/for-you/event?open=d1', reader), env, NOW);
    expect(await page.text()).toContain('<div class="wrap" id="sheet-d1">');
    expect(picks().opened.d1).toBe(NOW.toISOString());
    await handleRequest(get('/for-you/event?open=d2', reader), env, NOW);
    expect(picks().opened.d2).toBeUndefined();
  });

  it('refuses a locked door, an unknown dish and a bad token, storing nothing', async () => {
    const { her, kv, env, reader } = await withEvent();
    expect((await her({ do: 'pick', door: 'd2', dish: 'c' })).status).toBe(404);
    expect((await her({ do: 'open', door: 'd2' })).status).toBe(404);
    expect((await her({ do: 'pick', door: 'd1', dish: 'nope' })).status).toBe(404);
    expect((await her({ do: 'card', dish: 'nope' })).status).toBe(404);
    expect((await her({ do: 'other', door: 'd1' })).status).toBe(404);
    const bad = await handleRequest(post('/for-you/event/save', { csrf: 'wrong', do: 'pick', door: 'd1', dish: 'a' }, reader), env, NOW);
    expect(bad.status).toBe(403);
    expect(kv.data.has('event_picks')).toBe(false);
    expect((await her({ do: 'pick', door: 'd2', dish: 'c' }, LATER)).status).toBe(303);
  });

  it('keeps the card to its limit', async () => {
    const { her, picks } = await withEvent();
    for (const dish of ['x', 'y', 'z']) await her({ do: 'card', dish, quiet: '1' });
    expect(picks().card.map((c: { dish: string }) => c.dish)).toEqual(['y', 'z']);
  });

  it('serves a photo only once its door is open, never cached, and always to admin', async () => {
    const { env, reader, keyOf, adminCookie } = await withEvent();
    const open = await handleRequest(get(`/for-you/media/${keyOf('one.jpg')}`, reader), env, NOW);
    expect(open.status).toBe(200);
    expect(open.headers.get('Cache-Control')).toBe('no-store');
    expect((await handleRequest(get(`/for-you/media/${keyOf('two.jpg')}`, reader), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${keyOf('two.jpg')}`, reader), env, LATER)).status).toBe(200);
    expect((await handleRequest(get(`/for-you/admin/media/${keyOf('two.jpg')}`, adminCookie), env, NOW)).status).toBe(200);
    expect((await handleRequest(get('/for-you/media/99999999-9999-4999-8999-999999999999.jpg', reader), env, NOW)).status).toBe(404);
  });

  it('refuses to remove a photo in use, and retires an unused one', async () => {
    const { adminDo, keyOf, photos, kv } = await withEvent();
    const inUse = await adminDo('/photos/delete', { key: keyOf('one.jpg') });
    expect(inUse.status).toBe(400);
    expect(await inUse.text()).toContain('in use');
    await adminDo('/photos', { photos: file('spare.jpg', 'image/jpeg') });
    const spare = keyOf('spare.jpg');
    expect((await adminDo('/photos/delete', { key: spare })).status).toBe(303);
    expect(photos().map((p) => p.name)).not.toContain('spare.jpg');
    expect(JSON.parse(kv.data.get('trash') ?? '[]').map((t: { key: string }) => t.key)).toContain(spare);
  });

  it('keeps event photos when a note file is replaced', async () => {
    const { saveNote, keyOf, kv } = await withEvent();
    await saveNote({ date: '2026-10-01', text: 'today', photo: file('a.jpg', 'image/jpeg') });
    await saveNote({ date: '2026-10-01', original: '2026-10-01', text: 'today', photo: file('b.jpg', 'image/jpeg') });
    const trashed = JSON.parse(kv.data.get('trash') ?? '[]').map((t: { key: string }) => t.key);
    expect(trashed.length).toBeGreaterThan(0);
    expect(trashed).not.toContain(keyOf('one.jpg'));
    expect(trashed).not.toContain(keyOf('two.jpg'));
  });

  it('clears her picks', async () => {
    const { her, adminDo, picks } = await withEvent();
    await her({ do: 'pick', door: 'd1', dish: 'a' });
    expect((await adminDo('/clear', {})).status).toBe(303);
    expect(picks()).toEqual({ event: 'ev1', opened: {}, doors: {}, card: [] });
  });

  it('previews a chosen day and records nothing', async () => {
    const { env, adminCookie, kv } = await withEvent();
    const html = await (await handleRequest(get('/for-you/admin/event/preview?on=2026-10-02&open=d2', adminCookie), env, NOW)).text();
    expect(html).toContain('Hidden dish');
    expect(html).not.toContain('<form');
    expect(html).toContain('/for-you/admin/media/');
    expect(kv.data.has('event_picks')).toBe(false);
    const today = await (await handleRequest(get('/for-you/admin/event/preview?on=nonsense', adminCookie), env, NOW)).text();
    expect(today).not.toContain('Hidden dish');
    expect(await (await handleRequest(get('/for-you/admin/event/preview'), env, NOW)).text()).toContain('type="password"');
  });

  it('shows admin her picks with their shopping lists', async () => {
    const { her, env, adminCookie } = await withEvent();
    await her({ do: 'open', door: 'd1' });
    await her({ do: 'pick', door: 'd1', dish: 'a' });
    const html = await (await handleRequest(get('/for-you/admin/event', adminCookie), env, NOW)).text();
    expect(html).toContain('<li>Secret A</li>');
    expect(html).toContain('Dish A');
  });

  it('puts the way in on her notes page, marked while a door waits', async () => {
    const { env, reader, her } = await withEvent();
    const html = async (when = NOW) => (await handleRequest(get('/for-you', reader), env, when)).text();
    expect(await html()).toContain('<a class="event-link waiting" href="/for-you/event">');
    await her({ do: 'open', door: 'd1' });
    await her({ do: 'card', dish: 'x' });
    await her({ do: 'card', dish: 'y' });
    expect(await html()).toContain('<a class="event-link" href="/for-you/event">');
    expect(await html(AFTER)).not.toContain('class="event-link');
  });

  it('copes with corrupt stored data without overwriting it', async () => {
    const { env, reader, adminCookie, kv, her } = await withEvent();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.data.set('event', '{ broken');
    const notes = await handleRequest(get('/for-you', reader), env, NOW);
    expect(notes.status).toBe(200);
    expect(await notes.text()).not.toContain('class="event-link');
    const page = await handleRequest(get('/for-you/event', reader), env, NOW);
    expect(page.status).toBe(500);
    expect(await page.text()).toContain('Something went wrong');
    const adminPage = await handleRequest(get('/for-you/admin/event', adminCookie), env, NOW);
    expect(adminPage.status).toBe(200);
    expect(await adminPage.text()).toContain('{ broken');
    expect((await her({ do: 'pick', door: 'd1', dish: 'a' })).status).toBe(500);
    expect(kv.data.get('event')).toBe('{ broken');
    kv.data.set('event', JSON.stringify(EVENT()));
    kv.data.set('event_picks', 'garbage');
    expect((await her({ do: 'pick', door: 'd1', dish: 'a' })).status).toBe(500);
    expect(kv.data.get('event_picks')).toBe('garbage');
  });
});
