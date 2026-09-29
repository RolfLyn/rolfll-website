import { todayInCopenhagen, isValidDate, nextEmptyDate } from './dates';
import { parseNotes, selectForReader, upsertNote, removeNote, type Note } from './notes';
import {
  createSession, verifySession, passwordMatches, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, type Role,
} from './auth';
import { readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage } from './views';
import type { Env, KV } from './types';

const NOTES_KEY = 'notes';
const MAX_LENGTH = 5000;
const COOKIE: Record<Role, string> = { reader: 'notes_reader', admin: 'notes_admin' };
const FLASH: Record<string, string> = { saved: 'Saved.', deleted: 'Deleted.' };
const INVALID = `Needs a real date and a message of at most ${MAX_LENGTH} characters.`;

const PAGE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

interface Config {
  base: string;
  readerPassword: string;
  adminPassword: string;
  secret: string;
}

function html(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...PAGE_HEADERS, ...extra },
  });
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: location, ...PAGE_HEADERS, ...extra } });
}

export function normalizeBase(raw: string | undefined): string | null {
  if (!raw) return null;
  let path = raw.trim().replace(/\/+$/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path.length > 1 ? path : null;
}

async function loadNotes(kv: KV): Promise<Note[]> {
  return parseNotes(await kv.get(NOTES_KEY));
}

async function storeNotes(kv: KV, notes: Note[]): Promise<void> {
  await kv.put(NOTES_KEY, JSON.stringify(notes));
}

async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

async function handleLogin(request: Request, kv: KV, cfg: Config, now: Date, role: Role): Promise<Response> {
  const render = (error: string) =>
    role === 'reader'
      ? readerLoginPage({ action: `${cfg.base}/login`, error })
      : adminLoginPage({ action: `${cfg.base}/admin/login`, error });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isLockedOut(kv, ip)) {
    return html(render('Too many tries. Please wait a few minutes and try again.'), 429);
  }
  const password = field(await readForm(request), 'password');
  const expected = role === 'reader' ? cfg.readerPassword : cfg.adminPassword;
  if (!(await passwordMatches(password, expected, cfg.secret))) {
    await recordFailure(kv, ip);
    return html(render(role === 'reader' ? "That's not quite it. Try again?" : 'Wrong password.'), 401);
  }
  const home = role === 'reader' ? cfg.base : `${cfg.base}/admin`;
  const session = await createSession(role, cfg.secret, now.getTime());
  return redirect(home, { 'Set-Cookie': sessionCookie(COOKIE[role], session, home) });
}

async function showReader(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = readCookie(request, COOKIE.reader);
  if (!(await verifySession(session, 'reader', cfg.secret, now.getTime()))) {
    return html(readerLoginPage({ action: `${cfg.base}/login` }));
  }
  return html(readerPage(selectForReader(await loadNotes(kv), todayInCopenhagen(now))));
}

async function renderAdmin(
  notes: Note[], cfg: Config, now: Date, session: string, form: Note, flash?: string, status = 200,
): Promise<Response> {
  const today = todayInCopenhagen(now);
  return html(adminPage({
    base: cfg.base,
    today,
    current: selectForReader(notes, today).current,
    notes,
    form,
    csrf: await csrfToken(session, cfg.secret),
    flash,
  }), status);
}

async function adminSession(request: Request, cfg: Config, now: Date): Promise<string | null> {
  const session = readCookie(request, COOKIE.admin);
  return session && (await verifySession(session, 'admin', cfg.secret, now.getTime())) ? session : null;
}

async function showAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const notes = await loadNotes(kv);
  const editing = notes.find((n) => n.date === url.searchParams.get('edit'));
  const form = editing ?? { date: nextEmptyDate(notes.map((n) => n.date), todayInCopenhagen(now)), text: '' };
  const msg = url.searchParams.get('msg') ?? '';
  return renderAdmin(notes, cfg, now, session, form, Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined);
}

async function adminAction(
  request: Request, kv: KV, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) {
    return html(errorPage('That form expired. Go back, reload, and try again.'), 403);
  }
  const notes = await loadNotes(kv);
  const date = field(form, 'date');
  if (action === 'delete') {
    await storeNotes(kv, removeNote(notes, date));
    return redirect(`${adminHome}?msg=deleted`);
  }
  const text = field(form, 'text').replace(/\r\n?/g, '\n').trim();
  if (!isValidDate(date) || text === '' || text.length > MAX_LENGTH) {
    return renderAdmin(notes, cfg, now, session, { date, text }, INVALID, 400);
  }
  await storeNotes(kv, upsertNote(notes, { date, text }));
  return redirect(`${adminHome}?msg=saved`);
}

export async function handleRequest(request: Request, env: Env, now: Date): Promise<Response> {
  const base = normalizeBase(env.NOTES_PATH);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (!base || (path !== base && !path.startsWith(`${base}/`))) return env.ASSETS.fetch(request);
  if (!env.READER_PASSWORD || !env.ADMIN_PASSWORD || !env.COOKIE_SECRET) {
    return html(errorPage('Not set up yet.'), 503);
  }
  const cfg: Config = {
    base,
    readerPassword: env.READER_PASSWORD,
    adminPassword: env.ADMIN_PASSWORD,
    secret: env.COOKIE_SECRET,
  };
  const kv = env.NOTES;
  try {
    switch (`${request.method} ${path.slice(base.length)}`) {
      case 'GET ': return await showReader(request, kv, cfg, now);
      case 'POST /login': return await handleLogin(request, kv, cfg, now, 'reader');
      case 'GET /admin': return await showAdmin(request, kv, cfg, now, url);
      case 'POST /admin/login': return await handleLogin(request, kv, cfg, now, 'admin');
      case 'POST /admin/save': return await adminAction(request, kv, cfg, now, 'save');
      case 'POST /admin/delete': return await adminAction(request, kv, cfg, now, 'delete');
      default: return html(errorPage('Nothing here.'), 404);
    }
  } catch (error) {
    console.error(error);
    return html(errorPage('Something went wrong loading the notes.'), 500);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, new Date());
  },
};
