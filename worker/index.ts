import { todayInCopenhagen, isValidDate, nextEmptyDate } from './dates';
import {
  parseNotes, selectForReader, upsertNote, removeNote, attachmentKeys, findByMediaKey, MEDIA_KEY,
  type Note, type Attachment,
} from './notes';
import {
  createSession, verifySession, passwordMatches, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, clientKey, type Role,
} from './auth';
import { checkFile, newKey, serveMedia, type MediaKind } from './media';
import { gameToDraft, parseGameForm, type GameDraft } from './game';
import { parseMeetings, upsertMeeting, removeMeeting, parseMeetingForm, skyFor, type MeetingDraft } from './meetings';
import { parseReplies, parseReplyForm, setReply, moveReply, dropReply, type Reply } from './replies';
import { readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage } from './views';
import type { Env, KV, R2 } from './types';

const NOTES_KEY = 'notes';
const TRASH_KEY = 'trash';
const TRASH_GRACE_MS = 86_400_000;
const MAX_LENGTH = 5000;
const COOKIE: Record<Role, string> = { reader: 'notes_reader', admin: 'notes_admin' };
const MEETINGS_KEY = 'meetings';
const REPLIES_KEY = 'replies';
const FLASH: Record<string, string> = {
  saved: 'Saved.', deleted: 'Deleted.', 'meeting-saved': 'Meeting saved.', 'meeting-removed': 'Meeting removed.',
};
const EXPIRED = 'That form expired. Go back, reload, and try again.';
const INVALID = `Needs a real date and a message of at most ${MAX_LENGTH} characters.`;
const MEDIA_ROUTE = /^(\/admin)?\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4})$/;

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

function notFound(): Response {
  return html(errorPage('Nothing here.'), 404);
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

async function loadMeetings(kv: KV) {
  return parseMeetings(await kv.get(MEETINGS_KEY));
}

async function loadReplies(kv: KV): Promise<Reply[]> {
  return parseReplies(await kv.get(REPLIES_KEY));
}

// Pages show the notes even when an extra (meetings, replies) cannot be read; that part is left out.
async function tryLoad<T>(load: () => Promise<T>, what: string): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`Could not read ${what}`, error);
    return null;
  }
}

// Keeps replies with their notes. Best-effort: the notes are already saved when this runs,
// and a missing or unreadable replies value is left exactly as it is.
async function updateReplies(kv: KV, change: (replies: Reply[]) => Reply[]): Promise<void> {
  try {
    const raw = await kv.get(REPLIES_KEY);
    if (raw === null) return;
    await kv.put(REPLIES_KEY, JSON.stringify(change(parseReplies(raw))));
  } catch (error) {
    console.error('Could not update replies', error);
  }
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

function uploadedFile(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value !== null && typeof value !== 'string' && value.size > 0 ? value : null;
}

async function storeUpload(
  bucket: R2, kind: MediaKind, file: File | null, type: string | undefined, fallback: Attachment | undefined,
): Promise<Attachment | undefined> {
  if (!file || !type) return fallback;
  const key = newKey(kind, type);
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
  return { key, type };
}

interface TrashEntry {
  key: string;
  at: number;
}

function parseTrash(raw: string | null): TrashEntry[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is TrashEntry =>
      typeof e === 'object' && e !== null && typeof e.key === 'string' && MEDIA_KEY.test(e.key) && typeof e.at === 'number');
  } catch {
    return [];
  }
}

// Files no longer referenced by any note go to a trash list and are deleted a day later.
// The delay protects against a stale KV read putting a reference back; such files are rescued.
// Best-effort: the notes are already saved when this runs.
async function retireOrphans(env: Env, before: Note[], after: Note[], now: Date): Promise<void> {
  try {
    const keep = new Set(after.flatMap(attachmentKeys));
    let trash = parseTrash(await env.NOTES.get(TRASH_KEY)).filter((e) => !keep.has(e.key));
    for (const key of before.flatMap(attachmentKeys)) {
      if (!keep.has(key) && !trash.some((e) => e.key === key)) trash.push({ key, at: now.getTime() });
    }
    const due = trash.filter((e) => now.getTime() - e.at >= TRASH_GRACE_MS);
    if (due.length > 0) {
      await env.MEDIA.delete(due.map((e) => e.key));
      trash = trash.filter((e) => !due.includes(e));
    }
    await env.NOTES.put(TRASH_KEY, JSON.stringify(trash));
  } catch (error) {
    console.error('Could not clean up media', error);
  }
}

async function handleLogin(request: Request, kv: KV, cfg: Config, now: Date, role: Role): Promise<Response> {
  const render = (error: string) =>
    role === 'reader'
      ? readerLoginPage({ action: `${cfg.base}/login`, error })
      : adminLoginPage({ action: `${cfg.base}/admin/login`, error });
  const ip = clientKey(request.headers.get('CF-Connecting-IP') ?? 'unknown');
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

async function readerSession(request: Request, cfg: Config, now: Date): Promise<string | null> {
  const session = readCookie(request, COOKIE.reader);
  return session && (await verifySession(session, 'reader', cfg.secret, now.getTime())) ? session : null;
}

async function showReader(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const today = todayInCopenhagen(now);
  const notes = await loadNotes(kv);
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  return html(readerPage({
    ...selectForReader(notes, today),
    mediaBase: `${cfg.base}/media`,
    sky: meetings && skyFor(notes, meetings, today),
    replies: await tryLoad(() => loadReplies(kv), 'replies'),
    reply: { action: `${cfg.base}/reply`, csrf: await csrfToken(session, cfg.secret) },
    unsent: url.searchParams.get('unsent') ?? undefined,
  }));
}

async function handleReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const date = field(form, 'date');
  const today = todayInCopenhagen(now);
  if (!(await loadNotes(kv)).some((n) => n.date === date && n.date <= today)) return notFound();
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return redirect(`${cfg.base}?unsent=${date}#note-${date}`);
  await kv.put(REPLIES_KEY, JSON.stringify(setReply(await loadReplies(kv), date, answer, now.toISOString())));
  return redirect(`${cfg.base}#note-${date}`);
}

interface AdminView {
  form: Note;
  original?: string;
  flash?: string;
  error?: string;
  game?: GameDraft;
  meetingDraft?: MeetingDraft;
}

async function renderAdmin(
  kv: KV, notes: Note[], cfg: Config, now: Date, session: string, view: AdminView, status = 200,
): Promise<Response> {
  const today = todayInCopenhagen(now);
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  const replies = await tryLoad(() => loadReplies(kv), 'replies');
  const problems = [meetings ? '' : 'Meetings could not be read.', replies ? '' : 'Replies could not be read.'];
  const error = [view.error ?? '', ...problems].filter(Boolean).join(' ') || undefined;
  return html(adminPage({
    base: cfg.base,
    today,
    current: selectForReader(notes, today).current,
    notes,
    ...view,
    error,
    meetings: meetings ?? [],
    replies: replies ?? [],
    csrf: await csrfToken(session, cfg.secret),
  }), status);
}

function freshForm(notes: Note[], now: Date): Note {
  return { date: nextEmptyDate(notes.map((n) => n.date), todayInCopenhagen(now)), text: '' };
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
  const form = editing ?? freshForm(notes, now);
  const msg = url.searchParams.get('msg') ?? '';
  const flash = Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined;
  return renderAdmin(kv, notes, cfg, now, session, { form, original: editing?.date, flash, game: gameToDraft(editing?.game) });
}

async function showPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const notes = await loadNotes(kv);
  const note = notes.find((n) => n.date === url.searchParams.get('date'));
  if (!note) return notFound();
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  return html(readerPage({
    current: note, archive: [], mediaBase: `${cfg.base}/admin/media`, preview: true,
    sky: meetings && skyFor(notes, meetings, note.date),
    replies: await tryLoad(() => loadReplies(kv), 'replies'),
  }));
}

async function showMedia(
  request: Request, env: Env, cfg: Config, now: Date, key: string, asAdmin: boolean,
): Promise<Response> {
  const allowed = asAdmin ? Boolean(await adminSession(request, cfg, now)) : Boolean(await readerSession(request, cfg, now));
  if (!allowed) return notFound();
  const note = findByMediaKey(await loadNotes(env.NOTES), key);
  if (!note || (!asAdmin && note.date > todayInCopenhagen(now))) return notFound();
  return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
}

async function adminAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) {
    return html(errorPage(EXPIRED), 403);
  }
  const notes = await loadNotes(env.NOTES);
  const date = field(form, 'date');
  if (action === 'delete') {
    const next = removeNote(notes, date);
    await storeNotes(env.NOTES, next);
    await retireOrphans(env, notes, next, now);
    await updateReplies(env.NOTES, (r) => dropReply(r, date));
    return redirect(`${adminHome}?msg=deleted`);
  }

  const original = field(form, 'original');
  const text = field(form, 'text').replace(/\r\n?/g, '\n').trim();
  // Only an edited note keeps its media; a fresh form never inherits files it did not show.
  const existing = original ? notes.find((n) => n.date === original) : undefined;
  const photoFile = uploadedFile(form, 'photo');
  const audioFile = uploadedFile(form, 'audio');
  const photoCheck = photoFile ? checkFile('photo', photoFile) : null;
  const audioCheck = audioFile ? checkFile('audio', audioFile) : null;
  const gameForm = parseGameForm((name) => field(form, name));
  const errors: string[] = [];
  if (!isValidDate(date) || text === '' || text.length > MAX_LENGTH) errors.push(INVALID);
  if (photoCheck && !photoCheck.ok) errors.push(photoCheck.error);
  if (audioCheck && !audioCheck.ok) errors.push(audioCheck.error);
  if (gameForm.error) errors.push(gameForm.error);
  if (errors.length > 0) {
    return renderAdmin(env.NOTES, notes, cfg, now, session, {
      form: { ...existing, date, text },
      original: original || undefined,
      error: errors.join(' '),
      game: gameForm.draft,
    }, 400);
  }

  const note: Note = { date, text };
  const photo = await storeUpload(
    env.MEDIA, 'photo', photoFile, photoCheck?.ok ? photoCheck.type : undefined,
    field(form, 'remove_photo') === '1' ? undefined : existing?.photo,
  );
  const audio = await storeUpload(
    env.MEDIA, 'audio', audioFile, audioCheck?.ok ? audioCheck.type : undefined,
    field(form, 'remove_audio') === '1' ? undefined : existing?.audio,
  );
  if (photo) note.photo = photo;
  if (audio) note.audio = audio;
  if (gameForm.game) note.game = gameForm.game;
  const kept = original && original !== date ? removeNote(notes, original) : notes;
  const next = upsertNote(kept, note);
  await storeNotes(env.NOTES, next);
  await retireOrphans(env, notes, next, now);
  if (original !== date) await updateReplies(env.NOTES, (r) => moveReply(r, original || undefined, date));
  return redirect(`${adminHome}?msg=saved`);
}

async function meetingAction(
  request: Request, kv: KV, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const adminHome = `${cfg.base}/admin`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(adminHome);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const meetings = await loadMeetings(kv);
  if (action === 'delete') {
    await kv.put(MEETINGS_KEY, JSON.stringify(removeMeeting(meetings, field(form, 'date'))));
    return redirect(`${adminHome}?msg=meeting-removed`);
  }
  const parsed = parseMeetingForm((name) => field(form, name));
  if (!parsed.meeting) {
    const notes = await loadNotes(kv);
    return renderAdmin(kv, notes, cfg, now, session, { form: freshForm(notes, now), error: parsed.error, meetingDraft: parsed.draft }, 400);
  }
  await kv.put(MEETINGS_KEY, JSON.stringify(upsertMeeting(meetings, parsed.meeting)));
  return redirect(`${adminHome}?msg=meeting-saved`);
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
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const sub = path.slice(base.length);
    const media = MEDIA_ROUTE.exec(sub);
    if (media && method === 'GET') return await showMedia(request, env, cfg, now, media[2], media[1] === '/admin');
    switch (`${method} ${sub}`) {
      case 'GET ': return await showReader(request, kv, cfg, now, url);
      case 'POST /reply': return await handleReply(request, kv, cfg, now);
      case 'POST /admin/meeting/save': return await meetingAction(request, kv, cfg, now, 'save');
      case 'POST /admin/meeting/delete': return await meetingAction(request, kv, cfg, now, 'delete');
      case 'POST /login': return await handleLogin(request, kv, cfg, now, 'reader');
      case 'GET /admin': return await showAdmin(request, kv, cfg, now, url);
      case 'GET /admin/preview': return await showPreview(request, kv, cfg, now, url);
      case 'POST /admin/login': return await handleLogin(request, kv, cfg, now, 'admin');
      case 'POST /admin/save': return await adminAction(request, env, cfg, now, 'save');
      case 'POST /admin/delete': return await adminAction(request, env, cfg, now, 'delete');
      default: return notFound();
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
