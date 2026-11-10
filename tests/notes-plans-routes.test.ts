import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleRequest } from '../worker/index';
import type { Env } from '../worker/types';
import { memoryKV, memoryR2 } from './notes-helpers';

const NOW = new Date('2026-10-01T10:00:00Z');
const LATER = new Date('2026-10-02T10:00:00Z');
const IP = { 'CF-Connecting-IP': '1.2.3.4' };

afterEach(() => { vi.restoreAllMocks(); });

function setup() {
  const kv = memoryKV();
  const env: Env = {
    NOTES: kv, MEDIA: memoryR2(), ASSETS: { fetch: async () => new Response('asset') }, NOTES_PATH: '/for-you',
    READER_PASSWORD: 'reader-pw', ADMIN_PASSWORD: 'admin-pw', COOKIE_SECRET: 'test-secret',
  };
  kv.data.set('notes', JSON.stringify([{ date: '2026-10-01', text: 'today' }]));
  return { env, kv };
}
const get = (path: string, cookie?: string) => new Request(`https://rolfll.com${path}`, { headers: cookie ? { Cookie: cookie, ...IP } : IP });
const post = (path: string, fields: Record<string, string>, cookie?: string) =>
  new Request(`https://rolfll.com${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: cookie ? { Cookie: cookie, ...IP } : IP });
const postForm = (path: string, fields: Record<string, string | File>, cookie?: string) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new Request(`https://rolfll.com${path}`, { method: 'POST', body, headers: cookie ? { Cookie: cookie, ...IP } : IP });
};
const md = (text: string, name = 'plan.md') => new File([new TextEncoder().encode(text)], name, { type: '' });
async function login(env: Env, role: 'reader' | 'admin'): Promise<string> {
  const res = await handleRequest(post(role === 'reader' ? '/for-you/login' : '/for-you/admin/login', { password: `${role}-pw` }), env, NOW);
  return res.headers.get('Set-Cookie')!.split(';')[0];
}
async function csrfFrom(env: Env, path: string, cookie: string): Promise<string> {
  const html = await (await handleRequest(get(path, cookie), env, NOW)).text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}

async function desk() {
  const ctx = setup();
  const admin = await login(ctx.env, 'admin');
  const csrf = await csrfFrom(ctx.env, '/for-you/admin', admin);
  const act = (path: string, fields: Record<string, string | File>, when = NOW) =>
    handleRequest(postForm(`/for-you/admin/reading-room/plan${path}`, { csrf, ...fields }, admin), ctx.env, when);
  const reader = await login(ctx.env, 'reader');
  const room = async (when = NOW) => (await handleRequest(get('/for-you/reading-room', reader), ctx.env, when)).text();
  const notes = async () => (await handleRequest(get('/for-you', reader), ctx.env, NOW)).text();
  const plans = (): { id: string; ready: boolean; updated: string; title: string }[] => JSON.parse(ctx.kv.data.get('plans') ?? '[]');
  const open = (id: string, when = NOW) => handleRequest(get(`/for-you/reading-room/plans/${id}`, reader), ctx.env, when);
  return { ...ctx, admin, act, reader, room, notes, plans, open };
}

describe('Our plans routes', () => {
  it('keeps a draft away from her entirely', async () => {
    const { act, room, notes, plans, open } = await desk();
    expect((await act('/save', { title: 'Draft', line: '', file: md('# Draft\n\nSecret draft text') })).status).toBe(303);
    const id = plans()[0].id;
    expect(plans()[0].ready).toBe(false);
    expect(await room()).not.toContain('Our plans');
    expect((await open(id)).status).toBe(404);
    expect(await notes()).not.toContain('class="unread"');
  });

  it('shows a ready document, records her reading it, and marks it updated after a new file', async () => {
    const { act, room, notes, plans, open, kv } = await desk();
    await act('/save', { title: 'Schools', line: 'For the move', ready: 'on', file: md('## One\n\nHello there.') });
    const id = plans()[0].id;
    const html = await room();
    expect(html).toContain('class="desk-item new"');
    expect(html).toContain(`href="/for-you/reading-room/plans/${id}"`);
    expect(html).toContain('NEW');
    expect(await notes()).toContain('class="unread"');
    const page = await open(id);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Hello there.');
    expect(JSON.parse(kv.data.get('plans_read')!)).toMatchObject([{ id, at: NOW.toISOString() }]);
    expect(await room()).toContain('READ');
    expect(await notes()).not.toContain('class="unread"');
    await act('/save', { id, title: 'Schools', line: '', ready: 'on', file: md('## One\n\nNewer.') }, LATER);
    expect(await room()).toContain('UPDATED');
    expect(await notes()).toContain('class="unread"');
    await act('/save', { id, title: 'Schools renamed', line: '', ready: 'on' }, LATER);
    expect(plans()[0].title).toBe('Schools renamed');
    expect(await (await open(id, LATER)).text()).toContain('Newer.');
  });

  it('hides a document again when it is no longer ready', async () => {
    const { act, room, plans, open } = await desk();
    await act('/save', { title: 'Schools', line: '', ready: 'on', file: md('Text') });
    const id = plans()[0].id;
    await act('/save', { id, title: 'Schools', line: '' });
    expect(plans()[0].ready).toBe(false);
    expect((await open(id)).status).toBe(404);
    expect(await room()).not.toContain('Our plans');
  });

  it('lets admin preview a draft without recording anything', async () => {
    const { act, plans, env, admin, kv } = await desk();
    await act('/save', { title: 'Draft', line: '', file: md('Draft words') });
    const res = await handleRequest(get(`/for-you/admin/reading-room/plan/${plans()[0].id}`, admin), env, NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Draft words');
    expect(kv.data.get('plans_read')).toBeUndefined();
  });

  it('refuses a bad file and keeps what he typed', async () => {
    const { act, kv } = await desk();
    const res = await act('/save', { title: 'Kept title', line: 'Kept line', ready: 'on', file: new File([new Uint8Array([0xff, 0xfe])], 'x.md') });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('isn&#39;t UTF-8 text');
    expect(html).toContain('value="Kept title"');
    expect(html).toContain('value="Kept line"');
    expect(kv.data.get('plans')).toBeUndefined();
    expect((await act('/save', { title: 'No file', line: '' })).status).toBe(400);
  });

  it('moves and deletes, and answers 404 to odd paths', async () => {
    const { act, plans, open, kv } = await desk();
    await act('/save', { title: 'First', line: '', ready: 'on', file: md('a') });
    await act('/save', { title: 'Second', line: '', ready: 'on', file: md('b') });
    expect(plans().map((p) => p.title)).toEqual(['Second', 'First']);
    await act('/move', { id: plans()[1].id, by: '-1' });
    expect(plans().map((p) => p.title)).toEqual(['First', 'Second']);
    const gone = plans()[0].id;
    await open(gone);
    await act('/delete', { id: gone });
    expect(plans().map((p) => p.title)).toEqual(['Second']);
    expect(kv.data.get('plans_read')).not.toContain(gone);
    expect((await open('not-a-uuid')).status).toBe(404);
  });

  it('refuses a bad token', async () => {
    const { env, admin, kv } = await desk();
    const res = await handleRequest(postForm('/for-you/admin/reading-room/plan/save', { csrf: 'nope', title: 'x', file: md('x') }, admin), env, NOW);
    expect(res.status).toBe(403);
    expect(kv.data.get('plans')).toBeUndefined();
  });

  it('copes with corrupt plans', async () => {
    const { kv, room, env, admin, reader } = await desk();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    kv.data.set('plans', '{ broken');
    const html = await room();
    expect(html).toContain('The reading room');
    expect(html).not.toContain('Our plans');
    expect((await handleRequest(get('/for-you', reader), env, NOW)).status).toBe(200);
    expect(await (await handleRequest(get('/for-you/admin/reading-room', admin), env, NOW)).text()).toContain('Our plans could not be read.');
  });
});
