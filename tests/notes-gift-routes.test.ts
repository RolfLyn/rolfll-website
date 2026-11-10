import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-12-01T10:00:00Z');
// Her day turns at 4am Singapore (20:00 UTC the day before): until then it is still the 3rd, so the 4th can be picked.
const LAST_MINUTE = new Date('2027-01-03T19:59:00Z');
const TOO_LATE = new Date('2027-01-03T20:00:00Z');
const AFTER = new Date('2027-01-07T20:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

afterEach(() => { vi.restoreAllMocks(); });

function setup() {
  const kv = memoryKV();
  const media = memoryR2();
  const env: Env = {
    NOTES: kv, MEDIA: media, ASSETS: { fetch: async () => new Response('asset') }, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
  };
  kv.data.set('notes', JSON.stringify([{ date: '2026-12-01', text: 'today' }]));
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

const GIFT = () => ({
  id: 'g1', title: 'Placeholder gift', from: '2026-11-30', until: '2027-01-07',
  box: { kicker: 'A gift', heading: 'Something for later', tag: 'For you' },
  reveals: [{ kicker: 'First', heading: 'Part one', text: 'What happens.', photos: ['one.jpg'], next: 'And then?' }],
  pick: { kicker: 'Your choice', heading: 'Pick our day', text: 'A line.' },
  days: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07'].map((id, i) => ({ id, name: `Day${i}`, heading: `Heading ${id}` })),
  chosenLine: 'Booking it.', summary: ['One'], pendingLine: 'Times later.', bookedLine: 'Soon.',
});

async function withGift({ save = true } = {}) {
  const ctx = setup();
  const adminCookie = await login(ctx.env, 'admin');
  const adminCsrf = await csrfFrom(ctx.env, '/for-you/admin', adminCookie);
  const adminDo = (path: string, fields: Record<string, string | File>, when = NOW) =>
    handleRequest(postForm(`/for-you/admin/gift${path}`, { csrf: adminCsrf, ...fields }, adminCookie), ctx.env, when);
  await adminDo('/photos', { photos: file('one.jpg', 'image/jpeg') });
  const photos = (): { key: string; name: string }[] => JSON.parse(ctx.kv.data.get('gift_photos') ?? '[]');
  const keyOf = (name: string) => photos().find((p) => p.name === name)!.key;
  const saved = save ? await adminDo('/save', { gift: JSON.stringify(GIFT()) }) : null;
  const reader = await login(ctx.env, 'reader');
  const csrf = await csrfFrom(ctx.env, '/for-you', reader);
  const her = (fields: Record<string, string>, when = NOW) => handleRequest(post('/for-you/gift/save', { csrf, ...fields }, reader), ctx.env, when);
  const state = () => JSON.parse(ctx.kv.data.get('gift_state') ?? 'null');
  const booking = () => JSON.parse(ctx.kv.data.get('gift_booking') ?? 'null');
  const notesPage = async (when = NOW) => (await handleRequest(get('/for-you', reader), ctx.env, when)).text();
  const giftPage = async (when = NOW) => (await handleRequest(get('/for-you/gift', reader), ctx.env, when)).text();
  return { ...ctx, adminCookie, adminDo, photos, keyOf, saved, reader, her, state, booking, notesPage, giftPage };
}

describe('gift routes', () => {
  it('shows nothing without a gift', async () => {
    const { env, reader, notesPage } = await withGift({ save: false });
    expect((await handleRequest(get('/for-you/gift', reader), env, NOW)).status).toBe(404);
    expect(await notesPage()).not.toContain('gift-link');
  });

  it('saves a gift and puts it on her notes page, waiting', async () => {
    const { saved, notesPage, giftPage } = await withGift();
    expect(saved!.status).toBe(303);
    expect(await notesPage()).toContain('<a class="event-link gift-link waiting" href="/for-you/gift">');
    expect(await notesPage()).toContain('Something is waiting for you');
    expect(await giftPage()).toContain('data-start="box"');
  });

  it('keeps the text and the old gift when a save is invalid', async () => {
    const { adminDo, kv } = await withGift();
    const before = kv.data.get('gift');
    const bad = await adminDo('/save', { gift: '{ nope' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('{ nope');
    expect(kv.data.get('gift')).toBe(before);
  });

  it('records the unwrap quietly or with a redirect', async () => {
    const { her, state, notesPage } = await withGift();
    const quiet = await her({ do: 'unwrap', quiet: '1' });
    expect(quiet.status).toBe(204);
    expect(state().unwrapped).toBe(NOW.toISOString());
    expect((await her({ do: 'unwrap' })).headers.get('Location')).toBe('/for-you/gift');
    expect(await notesPage()).toContain('<a class="event-link gift-link" href="/for-you/gift">');
    expect(await notesPage()).toContain('Open your gift');
  });

  it('lets her pick a day only until 4am Singapore time that day', async () => {
    const { her, state } = await withGift();
    expect((await her({ do: 'pick', day: '2027-01-04', quiet: '1' }, LAST_MINUTE)).status).toBe(204);
    expect(state().pick.day).toBe('2027-01-04');
    expect((await her({ do: 'pick', day: '2027-01-04', quiet: '1' }, TOO_LATE)).status).toBe(404);
    expect((await her({ do: 'pick', day: '2027-01-05', quiet: '1' }, TOO_LATE)).status).toBe(204);
    expect((await her({ do: 'pick', day: '2027-02-01' })).status).toBe(404);
    expect(state().history.map((p: { day: string }) => p.day)).toEqual(['2027-01-04', '2027-01-05']);
  });

  it('refuses a bad token, storing nothing', async () => {
    const { env, reader, kv } = await withGift();
    const res = await handleRequest(post('/for-you/gift/save', { csrf: 'nope', do: 'pick', day: '2027-01-05' }, reader), env, NOW);
    expect(res.status).toBe(403);
    expect(kv.data.get('gift_state')).toBeUndefined();
  });

  it('books only the day she picked, then shows it to her once and stops waiting', async () => {
    const { adminDo, adminCookie, env, her, state, booking, giftPage, notesPage } = await withGift();
    await her({ do: 'pick', day: '2027-01-05' });
    expect(await (await handleRequest(get('/for-you/admin/gift', adminCookie), env, NOW)).text()).toContain('Picked Heading 2027-01-05');
    const stale = await adminDo('/book', { day: '2027-01-06', lines: '3pm' });
    expect(stale.status).toBe(400);
    expect(await stale.text()).toContain('changed');
    expect(booking()).toBeNull();
    expect((await adminDo('/book', { day: '2027-01-05', lines: '3pm\nDinner after' })).status).toBe(303);
    expect(booking().lines).toEqual(['3pm', 'Dinner after']);
    expect(await notesPage()).toContain('gift-link waiting');
    await handleRequest(get('/for-you/admin/gift/preview', adminCookie), env, NOW);
    expect(state().bookedSeen).toBeUndefined();
    const html = await giftPage();
    expect(html).toContain('data-start="booked"');
    expect(html).toContain('Dinner after');
    expect(state().bookedSeen).toBe(NOW.toISOString());
    expect(await notesPage()).not.toContain('gift-link waiting');
  });

  it('keeps her record and the booking apart, so neither write can undo the other', async () => {
    const { adminDo, adminCookie, env, her, kv, giftPage } = await withGift();
    await her({ do: 'pick', day: '2027-01-05' });
    const hers = kv.data.get('gift_state');
    await adminDo('/book', { day: '2027-01-05', lines: '3pm' });
    expect(kv.data.get('gift_state')).toBe(hers);
    expect(JSON.parse(kv.data.get('gift_booking')!)).toMatchObject({ giftId: 'g1', day: '2027-01-05', lines: ['3pm'] });
    const booking = kv.data.get('gift_booking');
    await giftPage();
    expect(kv.data.get('gift_booking')).toBe(booking);
    expect(kv.data.get('gift_state')).not.toContain('lines');
    // A stale read let her move to another day after he booked: she sees her own day, he sees the mismatch.
    kv.data.set('gift_state', JSON.stringify({ ...JSON.parse(kv.data.get('gift_state')!), pick: { day: '2027-01-06', at: NOW.toISOString() } }));
    expect(await giftPage()).toContain('data-start="chosen"');
    const admin = await (await handleRequest(get('/for-you/admin/gift', adminCookie), env, NOW)).text();
    expect(admin).toContain('she has since picked');
  });

  it('refuses her pick once booked, and lets her pick again after undo', async () => {
    const { adminDo, her, state, booking } = await withGift();
    await her({ do: 'pick', day: '2027-01-05' });
    await adminDo('/book', { day: '2027-01-05', lines: '3pm' });
    expect((await her({ do: 'pick', day: '2027-01-06', quiet: '1' })).status).toBe(404);
    expect(booking().day).toBe('2027-01-05');
    expect(state().pick.day).toBe('2027-01-05');
    expect((await adminDo('/unbook', {})).status).toBe(303);
    expect((await her({ do: 'pick', day: '2027-01-06', quiet: '1' })).status).toBe(204);
  });

  it('clears everything, and refuses a gift save that would lose her pick', async () => {
    const { adminDo, her, state, kv } = await withGift();
    await her({ do: 'pick', day: '2027-01-05' });
    await adminDo('/book', { day: '2027-01-05', lines: '3pm' });
    await adminDo('/clear', {});
    await her({ do: 'pick', day: '2027-01-05' });
    const lose = await adminDo('/save', { gift: JSON.stringify({ ...GIFT(), id: 'g2' }) });
    expect(lose.status).toBe(400);
    expect(await lose.text()).toContain('clear her pick first');
    expect((await adminDo('/clear', {})).status).toBe(303);
    expect(state()).toEqual({ giftId: 'g1', history: [] });
    expect(JSON.parse(kv.data.get('gift_booking') ?? 'null')).toEqual({ giftId: 'g1' });
    expect((await adminDo('/save', { gift: JSON.stringify({ ...GIFT(), id: 'g2' }) })).status).toBe(303);
  });

  it('serves its photos only to her while it shows, never cached, and always to admin', async () => {
    const { env, reader, keyOf, adminCookie } = await withGift();
    const key = keyOf('one.jpg');
    const res = await handleRequest(get(`/for-you/media/${key}`, reader), env, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await handleRequest(get(`/for-you/media/${key}`), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${key}`, reader), env, AFTER)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/admin/media/${key}`, adminCookie), env, AFTER)).status).toBe(200);
  });

  it('keeps its photos from the purge and refuses to remove one in use', async () => {
    const { adminDo, keyOf, photos, kv } = await withGift();
    const inUse = await adminDo('/photos/delete', { key: keyOf('one.jpg') });
    expect(inUse.status).toBe(400);
    await adminDo('/photos', { photos: file('spare.jpg', 'image/jpeg') });
    const spare = keyOf('spare.jpg');
    expect((await adminDo('/photos/delete', { key: spare })).status).toBe(303);
    expect(photos().map((p) => p.name)).toEqual(['one.jpg']);
    const trash = JSON.parse(kv.data.get('trash') ?? '[]').map((t: { key: string }) => t.key);
    expect(trash).toContain(spare);
    expect(trash).not.toContain(keyOf('one.jpg'));
  });

  it('previews a chosen day and records nothing', async () => {
    const { env, adminCookie, kv } = await withGift();
    const res = await handleRequest(get('/for-you/admin/gift/preview?on=2027-01-05', adminCookie), env, NOW);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-start="box"');
    expect(html).not.toContain('name="csrf"');
    expect(kv.data.get('gift_state')).toBeUndefined();
  });

  it('copes with corrupt stored data without overwriting it', async () => {
    const { env, reader, adminCookie, kv, her, notesPage } = await withGift();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.data.set('gift_state', '{ broken');
    expect(await notesPage()).not.toContain('gift-link');
    const page = await handleRequest(get('/for-you/gift', reader), env, NOW);
    expect(page.status).toBe(500);
    expect(await page.text()).toContain('Something went wrong');
    const adminPage = await handleRequest(get('/for-you/admin/gift', adminCookie), env, NOW);
    expect(adminPage.status).toBe(200);
    expect(await adminPage.text()).toContain('could not be read');
    expect((await her({ do: 'pick', day: '2027-01-05' })).status).toBe(500);
    expect(kv.data.get('gift_state')).toBe('{ broken');
    kv.data.set('gift_state', JSON.stringify({ giftId: 'g1', history: [] }));
    kv.data.set('gift', '{ broken');
    expect((await handleRequest(get('/for-you', reader), env, NOW)).status).toBe(200);
    expect((await handleRequest(get('/for-you/gift', reader), env, NOW)).status).toBe(500);
    expect(await (await handleRequest(get('/for-you/admin/gift', adminCookie), env, NOW)).text()).toContain('{ broken');
  });
});
