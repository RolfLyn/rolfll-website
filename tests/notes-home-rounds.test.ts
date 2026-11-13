import { describe, it, expect } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import { parseHomeRounds, archiveRound, roundName, type Home, type HomeGroup, type HomePicture, type HomeRound } from '../worker/home';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-12-01T10:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };
const T0 = '2026-11-30T10:00:00.000Z';
const T1 = '2026-11-30T11:00:00.000Z';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fileOf = (n: number) => `${uuid(n)}.jpg`;
function pic(n: number, group: HomeGroup = 'houses'): HomePicture {
  return { id: `p${n}`, group, title: `Picture ${n}`, tags: ['wood'], credit: `Person ${n} on Pexels`, file: fileOf(n), added: T0 };
}
const s = (score: number) => ({ score, at: T1 });

describe('rounds, the data', () => {
  it('names rounds in words', () => {
    expect(roundName(1)).toBe('Round one');
    expect(roundName(2)).toBe('Round two');
    expect(roundName(10)).toBe('Round ten');
    expect(roundName(11)).toBe('Round 11');
  });

  it('reads no rounds when nothing is stored, and round-trips a valid list', () => {
    expect(parseHomeRounds(null)).toEqual([]);
    const rounds: HomeRound[] = [{ finishedAt: T1, pictures: [pic(1)], scores: { p1: s(8) } }];
    expect(parseHomeRounds(JSON.stringify(rounds))).toEqual(rounds);
    expect(parseHomeRounds(JSON.stringify([{ pictures: [], scores: {} }]))).toEqual([{ pictures: [], scores: {} }]);
  });

  it('throws on a corrupt list', () => {
    expect(() => parseHomeRounds('{')).toThrow();
    expect(() => parseHomeRounds('{}')).toThrow();
    expect(() => parseHomeRounds(JSON.stringify([{ pictures: [{ id: 'x' }], scores: {} }]))).toThrow();
    expect(() => parseHomeRounds(JSON.stringify([{ pictures: [pic(1)], scores: { p1: s(11) } }]))).toThrow();
    expect(() => parseHomeRounds(JSON.stringify([{ finishedAt: 'soon', pictures: [], scores: {} }]))).toThrow();
  });

  it('saves the current pictures and her scores for them as a round, and empties the list with the banner off', () => {
    const home: Home = { on: true, pictures: [pic(1), pic(2, 'rooms')] };
    const out = archiveRound(home, { p1: s(9), p2: s(4), gone: s(10) }, { finishedAt: T1 }, []);
    expect(out).toEqual({
      rounds: [{ finishedAt: T1, pictures: [pic(1), pic(2, 'rooms')], scores: { p1: s(9), p2: s(4) } }],
      home: { on: false, pictures: [] },
    });
  });

  it('adds after earlier rounds and leaves out a missing finish time', () => {
    const earlier: HomeRound = { finishedAt: T0, pictures: [pic(9)], scores: {} };
    const out = archiveRound({ on: true, pictures: [pic(1)] }, {}, {}, [earlier]);
    expect(out?.rounds).toEqual([earlier, { pictures: [pic(1)], scores: {} }]);
  });

  it('refuses when there are no pictures to save', () => {
    expect(archiveRound({ on: true, pictures: [] }, {}, {}, [])).toBeNull();
  });
});

function setup() {
  const kv = memoryKV();
  const media = memoryR2();
  const env: Env = {
    NOTES: kv, MEDIA: media, ASSETS: { fetch: async () => new Response('asset') }, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
  };
  kv.data.set('notes', JSON.stringify([{ date: '2026-12-01', text: 'today' }]));
  const home: Home = { on: true, pictures: [pic(1), pic(2, 'rooms'), pic(3, 'gardens')] };
  kv.data.set('home', JSON.stringify(home));
  kv.data.set('home_scores', JSON.stringify({ p1: s(9), p2: s(8), p3: s(8) }));
  kv.data.set('home_progress', JSON.stringify({ finishedAt: T1 }));
  for (let n = 1; n <= 6; n++) media.objects.set(fileOf(n), { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  return { env, kv, media };
}

const get = (path: string, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP });

async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const path = role === 'reader' ? '/for-you/login' : '/for-you/admin/login';
  const res = await handleRequest(post(path, { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}
async function csrfFrom(env: Env, path: string, cookie: string): Promise<string> {
  const page = await (await handleRequest(get(path, cookie), env, NOW)).text();
  return /name="csrf" value="([^"]+)"/.exec(page)![1];
}
async function newRound(env: Env, admin: string) {
  const csrf = await csrfFrom(env, '/for-you/admin/home', admin);
  return handleRequest(post('/for-you/admin/home/round', { csrf }, admin), env, NOW);
}
/** Round two: two new pictures, banner on. */
function roundTwo(kv: ReturnType<typeof memoryKV>) {
  kv.data.set('home', JSON.stringify({ on: true, pictures: [pic(4), pic(5, 'rooms')] }));
}

describe('starting a new round in admin', () => {
  it('saves round one, empties the pictures and her scores, and turns the banner off', async () => {
    const { env, kv } = setup();
    const admin = await login(env, 'admin');
    const res = await newRound(env, admin);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/for-you/admin/home?msg=home-round');
    expect(JSON.parse(kv.data.get('home_rounds')!)).toEqual([
      { finishedAt: T1, pictures: [pic(1), pic(2, 'rooms'), pic(3, 'gardens')], scores: { p1: s(9), p2: s(8), p3: s(8) } },
    ]);
    expect(JSON.parse(kv.data.get('home')!)).toEqual({ on: false, pictures: [] });
    expect(JSON.parse(kv.data.get('home_scores')!)).toEqual({});
    expect(JSON.parse(kv.data.get('home_progress')!)).toEqual({});
    const page = await (await handleRequest(get('/for-you/admin/home?msg=home-round', admin), env, NOW)).text();
    expect(page).toContain('The round is saved.');
    expect(page).toContain('<h2>Round one</h2>');
  });

  it('refuses a second press with nothing to save, and changes nothing', async () => {
    const { env, kv } = setup();
    const admin = await login(env, 'admin');
    await newRound(env, admin);
    const before = new Map(kv.data);
    const res = await newRound(env, admin);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('There are no pictures to save as a round.');
    expect(new Map(kv.data)).toEqual(before);
  });

  it('changes nothing when her scores or the saved rounds cannot be read', async () => {
    for (const [key, value] of [['home_scores', '{'], ['home_rounds', '[{']] as const) {
      const { env, kv } = setup();
      kv.data.set(key, value);
      const admin = await login(env, 'admin');
      const before = new Map(kv.data);
      const res = await newRound(env, admin);
      expect(res.status).toBe(500);
      expect(new Map(kv.data)).toEqual(before);
    }
  });

  it('needs an admin and a valid form', async () => {
    const { env, kv } = setup();
    const her = await login(env, 'reader');
    await handleRequest(post('/for-you/admin/home/round', { csrf: 'x' }, her), env, NOW);
    const admin = await login(env, 'admin');
    expect((await handleRequest(post('/for-you/admin/home/round', { csrf: 'x' }, admin), env, NOW)).status).toBe(403);
    expect(kv.data.has('home_rounds')).toBe(false);
  });
});

describe('round two for her', () => {
  it('names the round on the banner and the start page, and links back to round one', async () => {
    const { env, kv } = setup();
    await newRound(env, await login(env, 'admin'));
    roundTwo(kv);
    const her = await login(env, 'reader');
    const notes = await (await handleRequest(get('/for-you', her), env, NOW)).text();
    expect(notes).toContain('Our future home · Round two');
    expect(notes).toContain('2 pictures are waiting for you');
    const start = await (await handleRequest(get('/for-you/home', her), env, NOW)).text();
    expect(start).toContain('Round two');
    expect(start).toContain('chosen from what you loved last time');
    expect(start).toContain('href="/for-you/home/love/round-1"');
    expect(start).toContain('Round one: your dream home');
  });

  it('keeps round one exactly as it was, pictures included', async () => {
    const { env, kv } = setup();
    await newRound(env, await login(env, 'admin'));
    roundTwo(kv);
    const her = await login(env, 'reader');
    const old = await handleRequest(get('/for-you/home/love/round-1', her), env, NOW);
    expect(old.status).toBe(200);
    const page = await old.text();
    expect(page).toContain('Round one');
    expect(page).toContain(fileOf(1));
    expect(page).toContain('Picture 2');
    expect(page).not.toContain(fileOf(4));
    expect((await handleRequest(get(`/for-you/media/${fileOf(1)}`, her), env, NOW)).status).toBe(200);
    expect((await handleRequest(get('/for-you/home/love/round-2', her), env, NOW)).status).toBe(404);
    expect((await handleRequest(get('/for-you/home/love/round-0', her), env, NOW)).status).toBe(404);
  });

  it('links to round one from the new results page, and credits every round', async () => {
    const { env, kv } = setup();
    await newRound(env, await login(env, 'admin'));
    roundTwo(kv);
    const her = await login(env, 'reader');
    const love = await (await handleRequest(get('/for-you/home/love', her), env, NOW)).text();
    expect(love).toContain('href="/for-you/home/love/round-1"');
    const credits = await (await handleRequest(get('/for-you/home/credits', her), env, NOW)).text();
    expect(credits).toContain('Person 1 on Pexels');
    expect(credits).toContain('Person 4 on Pexels');
  });

  it('hides old rounds and their pictures while the banner is off', async () => {
    const { env } = setup();
    await newRound(env, await login(env, 'admin'));
    const her = await login(env, 'reader');
    expect((await handleRequest(get('/for-you/home/love/round-1', her), env, NOW)).status).toBe(404);
    expect((await handleRequest(get(`/for-you/media/${fileOf(1)}`, her), env, NOW)).status).toBe(404);
    const admin = await login(env, 'admin');
    expect((await handleRequest(get(`/for-you/admin/media/${fileOf(1)}`, admin), env, NOW)).status).toBe(200);
  });

  it('never retires a round-one picture, even one shown again in round two and then deleted', async () => {
    const { env, kv, media } = setup();
    const admin = await login(env, 'admin');
    await newRound(env, admin);
    kv.data.set('home', JSON.stringify({ on: true, pictures: [{ ...pic(1), id: 'again' }, pic(4)] }));
    const csrf = await csrfFrom(env, '/for-you/admin/home', admin);
    await handleRequest(post('/for-you/admin/home/delete', { csrf, id: 'again' }, admin), env, NOW);
    expect(JSON.parse(kv.data.get('home')!).pictures.map((p: HomePicture) => p.id)).toEqual(['p4']);
    expect(kv.data.get('trash') ?? '[]').not.toContain(fileOf(1));
    expect(media.objects.has(fileOf(1))).toBe(true);
  });

  it('shows the old round to him in admin even while the banner is off', async () => {
    const { env } = setup();
    const admin = await login(env, 'admin');
    const before = await (await handleRequest(get('/for-you/admin/home', admin), env, NOW)).text();
    expect(before).toContain('Start a new round');
    await newRound(env, admin);
    const page = await (await handleRequest(get('/for-you/admin/home', admin), env, NOW)).text();
    expect(page).toContain('<h2>Round one</h2>');
    expect(page).toContain(fileOf(1));
    expect(page).not.toContain('Start a new round');
  });
});
