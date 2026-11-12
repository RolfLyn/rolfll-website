import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import type { Home, HomeGroup, HomePicture } from '../worker/home';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-12-01T10:00:00Z');
const LATER = new Date('2026-12-02T10:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

afterEach(() => { vi.restoreAllMocks(); });

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fileOf = (n: number) => `${uuid(n)}.jpg`;
function pic(n: number, group: HomeGroup = 'houses', added = '2026-11-30T10:00:00.000Z'): HomePicture {
  return { id: `p${n}`, group, title: `Picture ${n}`, tags: ['wood'], credit: 'Someone on Unsplash', file: fileOf(n), added };
}

function setup(on = true) {
  const kv = memoryKV();
  const media = memoryR2();
  const env: Env = {
    NOTES: kv, MEDIA: media, ASSETS: { fetch: async () => new Response('asset') }, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
  };
  kv.data.set('notes', JSON.stringify([{ date: '2026-12-01', text: 'today' }]));
  const home: Home = { on, pictures: [pic(1), pic(2), pic(3, 'rooms')] };
  kv.data.set('home', JSON.stringify(home));
  for (const p of home.pictures) media.objects.set(p.file, { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  return { env, kv, media };
}

const get = (path: string, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP });
const postForm = (path: string, fields: [string, string | File][], cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const file = (name: string) => new File([new Uint8Array(10).fill(7)], name, { type: 'image/jpeg' });

async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const path = role === 'reader' ? '/for-you/login' : '/for-you/admin/login';
  const res = await handleRequest(post(path, { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}
async function csrfFrom(env: Env, path: string, cookie: string, now = NOW): Promise<string> {
  const page = await (await handleRequest(get(path, cookie), env, now)).text();
  return /name="csrf" value="([^"]+)"/.exec(page)![1];
}
const scores = (kv: ReturnType<typeof memoryKV>) => JSON.parse(kv.data.get('home_scores') ?? '{}');
const homeOf = (kv: ReturnType<typeof memoryKV>): Home => JSON.parse(kv.data.get('home')!);

async function score(env: Env, cookie: string, id: string, value: string, extra: Record<string, string> = { quiet: '1' }, now = NOW) {
  const csrf = await csrfFrom(env, '/for-you/home/houses', cookie, now);
  return handleRequest(post('/for-you/home/score', { csrf, id, group: 'houses', score: value, ...extra }, cookie), env, now);
}

describe('banner off', () => {
  it('hides every reader page and picture', async () => {
    const { env } = setup(false);
    const her = await login(env, 'reader');
    for (const path of ['/for-you/home', '/for-you/home/houses', '/for-you/home/love', `/for-you/media/${fileOf(1)}`]) {
      expect((await handleRequest(get(path, her), env, NOW)).status).toBe(404);
    }
    const notes = await (await handleRequest(get('/for-you', her), env, NOW)).text();
    expect(notes).not.toContain('Our future home');
    const admin = await login(env, 'admin');
    expect((await handleRequest(get(`/for-you/admin/media/${fileOf(1)}`, admin), env, NOW)).status).toBe(200);
  });
});

describe('scoring', () => {
  it('shows the banner and the first house', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    const notes = await (await handleRequest(get('/for-you', her), env, NOW)).text();
    expect(notes).toContain('Our future home');
    expect(notes).toContain('3 pictures are waiting for you');
    const start = await (await handleRequest(get('/for-you/home', her), env, NOW)).text();
    expect(start).toContain('0 of 2');
    const page = await (await handleRequest(get('/for-you/home/houses', her), env, NOW)).text();
    expect(page).toContain('Picture 1');
    expect(page).toContain('1 of 2');
    expect(page).toContain(`data-next="/for-you/home/houses?at=p2"`);
    expect((await handleRequest(get(`/for-you/media/${fileOf(1)}`, her), env, NOW)).status).toBe(200);
  });
  it('saves a score quietly', async () => {
    const { env, kv } = setup();
    const her = await login(env, 'reader');
    const res = await score(env, her, 'p1', '8');
    expect(res.status).toBe(204);
    expect(scores(kv).p1.score).toBe(8);
    const notes = await (await handleRequest(get('/for-you', her), env, NOW)).text();
    expect(notes).toContain('2 left to score');
  });
  it('moves on without JavaScript', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    const first = await score(env, her, 'p1', '6', {});
    expect(first.status).toBe(303);
    expect(first.headers.get('Location')).toBe('/for-you/home/houses?at=p2');
    const last = await score(env, her, 'p2', '6', {});
    expect(last.headers.get('Location')).toBe('/for-you/home/houses?done=1');
    const done = await (await handleRequest(get('/for-you/home/houses?done=1', her), env, NOW)).text();
    expect(done).toContain('That&#39;s all the houses');
    expect(done).toContain('href="/for-you/home/rooms">On to rooms');
  });
  it('opens a picture she asked for, with Back and her score', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    await score(env, her, 'p1', '9');
    const page = await (await handleRequest(get('/for-you/home/houses?at=p2', her), env, NOW)).text();
    expect(page).toContain('href="/for-you/home/houses?at=p1">Back</a>');
    const back = await (await handleRequest(get('/for-you/home/houses?at=p1', her), env, NOW)).text();
    expect(back).toContain('value="9"');
    expect((await handleRequest(get('/for-you/home/houses?at=p3', her), env, NOW)).status).toBe(404);
    expect((await handleRequest(get('/for-you/home/kitchens', her), env, NOW)).status).toBe(404);
  });
  it('refuses scores out of range', async () => {
    const { env, kv } = setup();
    const her = await login(env, 'reader');
    for (const bad of ['0', '11', '5.5', 'abc', '']) {
      expect((await score(env, her, 'p1', bad)).status).toBe(400);
    }
    expect(kv.data.has('home_scores')).toBe(false);
  });
  it('refuses a picture that no longer exists', async () => {
    const { env, kv } = setup();
    const her = await login(env, 'reader');
    expect((await score(env, her, 'gone', '5')).status).toBe(404);
    expect(kv.data.has('home_scores')).toBe(false);
  });
  it('needs a fresh form', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    const res = await handleRequest(post('/for-you/home/score', { csrf: 'nope', id: 'p1', score: '5', group: 'houses' }, her), env, NOW);
    expect(res.status).toBe(403);
  });
  it('shows her results and credits', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    await score(env, her, 'p1', '9');
    const love = await (await handleRequest(get('/for-you/home/love', her), env, NOW)).text();
    expect(love).toContain('Your dream home');
    expect(love).toContain('Picture 1');
    const credits = await (await handleRequest(get('/for-you/home/credits', her), env, NOW)).text();
    expect(credits).toContain('Someone on Unsplash');
  });
});

describe('when something is corrupt', () => {
  it('keeps the notes page and admin working', async () => {
    const { env, kv } = setup();
    kv.data.set('home', '{');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const her = await login(env, 'reader');
    const notes = await handleRequest(get('/for-you', her), env, NOW);
    expect(notes.status).toBe(200);
    expect(await notes.text()).not.toContain('Our future home');
    const start = await handleRequest(get('/for-you/home', her), env, NOW);
    expect(start.status).toBe(500);
    expect(await start.text()).toContain('Something went wrong');
    const admin = await login(env, 'admin');
    const page = await handleRequest(get('/for-you/admin/home', admin), env, NOW);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('The saved pictures could not be read');
  });
  it('writes nothing when her scores cannot be read', async () => {
    const { env, kv } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const her = await login(env, 'reader');
    const csrf = await csrfFrom(env, '/for-you/home/houses', her);
    kv.data.set('home_scores', '{');
    const res = await handleRequest(post('/for-you/home/score', { csrf, id: 'p1', group: 'houses', score: '5', quiet: '1' }, her), env, NOW);
    expect(res.status).toBe(500);
    expect(kv.data.get('home_scores')).toBe('{');
  });
});

describe('admin', () => {
  it('is linked from the admin page', async () => {
    const { env } = setup();
    const admin = await login(env, 'admin');
    const page = await (await handleRequest(get('/for-you/admin', admin), env, NOW)).text();
    expect(page).toContain('href="/for-you/admin/home">Our future home</a>');
  });
  it('switches the banner, adds, edits, moves and deletes', async () => {
    const { env, kv, media } = setup(false);
    const admin = await login(env, 'admin');
    const csrf = await csrfFrom(env, '/for-you/admin/home', admin);
    let res = await handleRequest(post('/for-you/admin/home/toggle', { csrf, on: '1' }, admin), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin/home?msg=home-on');
    expect(homeOf(kv).on).toBe(true);

    res = await handleRequest(postForm('/for-you/admin/home/add', [
      ['csrf', csrf], ['group', 'gardens'], ['title', 'Meadow'], ['tags', 'Wild, Countryside'], ['credit', 'A on Pexels'],
      ['photos', file('a.jpg')], ['photos', file('b.jpg')],
    ], admin), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin/home?msg=home-added');
    const added = homeOf(kv).pictures.filter((p) => p.group === 'gardens');
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ title: 'Meadow', tags: ['wild', 'countryside'], credit: 'A on Pexels', added: NOW.toISOString() });
    expect(media.objects.has(added[0].file)).toBe(true);

    await handleRequest(post('/for-you/admin/home/move', { csrf, id: 'p1', dir: 'down' }, admin), env, NOW);
    expect(homeOf(kv).pictures.slice(0, 2).map((p) => p.id)).toEqual(['p2', 'p1']);

    await handleRequest(post('/for-you/admin/home/edit', { csrf, id: 'p1', group: 'houses', title: 'Renamed', tags: '', credit: '' }, admin), env, NOW);
    expect(homeOf(kv).pictures.find((p) => p.id === 'p1')?.title).toBe('Renamed');

    expect((await handleRequest(post('/for-you/admin/home/toggle', { csrf: 'nope', on: '0' }, admin), env, NOW)).status).toBe(403);
  });
  it('refuses an upload with no pictures', async () => {
    const { env, kv } = setup();
    const admin = await login(env, 'admin');
    const csrf = await csrfFrom(env, '/for-you/admin/home', admin);
    const res = await handleRequest(postForm('/for-you/admin/home/add', [['csrf', csrf], ['group', 'houses'], ['title', 'X']], admin), env, NOW);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Choose at least one photo.');
    expect(homeOf(kv).pictures).toHaveLength(3);
  });
  it('deletes a scored picture with its score and file', async () => {
    const { env, kv } = setup();
    const her = await login(env, 'reader');
    await score(env, her, 'p1', '7');
    const admin = await login(env, 'admin');
    const csrf = await csrfFrom(env, '/for-you/admin/home', admin);
    const res = await handleRequest(post('/for-you/admin/home/delete', { csrf, id: 'p1' }, admin), env, NOW);
    expect(res.headers.get('Location')).toBe('/for-you/admin/home?msg=home-deleted');
    expect(homeOf(kv).pictures.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(scores(kv)).toEqual({});
    const trash = JSON.parse(kv.data.get('trash') ?? '[]').map((t: { key: string }) => t.key);
    expect(trash).toContain(fileOf(1));
  });
  it('shows new pictures after she finished, then waiting after a clear', async () => {
    const { env } = setup();
    const her = await login(env, 'reader');
    await score(env, her, 'p1', '7');
    await score(env, her, 'p2', '7');
    const csrfRoom = await csrfFrom(env, '/for-you/home/rooms', her);
    await handleRequest(post('/for-you/home/score', { csrf: csrfRoom, id: 'p3', group: 'rooms', score: '7', quiet: '1' }, her), env, NOW);
    let notes = await (await handleRequest(get('/for-you', her), env, NOW)).text();
    expect(notes).toContain('See what you love');

    const admin = await login(env, 'admin');
    const csrf = await csrfFrom(env, '/for-you/admin/home', admin, LATER);
    await handleRequest(postForm('/for-you/admin/home/add', [
      ['csrf', csrf], ['group', 'houses'], ['title', 'New'], ['photos', file('a.jpg')], ['photos', file('b.jpg')],
    ], admin), env, LATER);
    notes = await (await handleRequest(get('/for-you', her), env, LATER)).text();
    expect(notes).toContain('2 new pictures');

    await handleRequest(post('/for-you/admin/home/clear', { csrf }, admin), env, LATER);
    notes = await (await handleRequest(get('/for-you', her), env, LATER)).text();
    expect(notes).toContain('5 pictures are waiting for you');
  });
});
