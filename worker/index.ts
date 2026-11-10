import { todayInCopenhagen, noteDay, isValidDate, nextEmptyDate } from './dates';
import {
  parseNotes, selectForReader, upsertNote, removeNote, attachmentKeys, findByMediaKey, MEDIA_KEY,
  type Note, type Attachment,
} from './notes';
import {
  createSession, verifySession, passwordMatches, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, clientKey, type Role,
  createDoor, verifyDoor, doorCookie, closedDoorCookie,
} from './auth';
import { checkFile, newKey, serveMedia, type MediaKind } from './media';
import { gameToDraft, parseGameForm, type GameDraft } from './game';
import { parseMeetings, upsertMeeting, removeMeeting, parseMeetingForm, skyFor, type MeetingDraft } from './meetings';
import { parseReplies, parseReplyForm, setReply, moveReply, dropReply, type Reply } from './replies';
import {
  parseEntries, upsertEntry, removeEntry, entryKeys, parseEntryForm, EMPTY_ENTRY,
  parseEntryReplies, setEntryReply, dropEntryReply, type Entry, type EntryDraft,
} from './after-dark';
import { doorwayPage, roomPage, roomErrorPage, afterDarkAdminPage } from './after-dark-views';
import { checkDrawings } from './equations';
import {
  parseBooks, upsertBook, removeBook, bookKeys, parseBookForm, parsePlayed, markPlayed, dropPlayed,
  EMPTY_BOOK, RECORDING_NEEDED, type Book, type BookDraft,
} from './books';
import { readingRoomPage, readingRoomErrorPage, readingRoomAdminPage, type Keepsakes } from './reading-room-views';
import {
  parseSongs, upsertSong, removeSong, songKeys, parseAlbum, upsertPhoto, removePhoto, movePhoto, albumKeys,
  parseSongForm, parsePhotoForm, parseSeen, albumHasNew, songsUnplayed, EMPTY_SONG, SONG_FILE_NEEDED, PHOTO_FILE_NEEDED,
  type Song, type AlbumPhoto, type SongDraft,
} from './keepsakes';
import {
  parseLog, parseSettings, addCard, editCard, deleteCard, addComment, removeComment, placeCard, markSeen, mergeList,
  parseCardForm, parseCommentForm, parseSettingsForm, LIST_LIMITS, NEW_BOX, type ListLog, type Person,
} from './list';
import { listPage, listErrorPage, listSettingsPage, type ListDraft } from './list-views';
import { readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage } from './views';
import {
  checkEvent, parseStoredEvent, parsePhotos, parsePicks, openDoor, pickDish, toggleCardItem, isOpen, isShowing,
  readerEvent, hasWaiting, openPhotoKeys, photoNamesInUse, EMPTY_PICKS, type SpecialEvent, type EventPhoto, type EventPicks,
} from './event';
import { eventPage, eventErrorPage, eventAdminPage } from './event-views';
import {
  checkGift, parseStoredGift, parseGiftState, emptyGiftState, unwrapGift, pickGiftDay, parseBookingLines, markBooked,
  undoBooked, seeBooked, isGiftShowing, readerGift, giftWaiting, giftPhotoKeys, giftPhotoNames, type Gift, type GiftState,
} from './gift';
import { giftPage, giftErrorPage, giftAdminPage } from './gift-views';
import type { Env, KV, R2 } from './types';

const NOTES_KEY = 'notes';
const TRASH_KEY = 'trash';
const TRASH_GRACE_MS = 86_400_000;
const MAX_LENGTH = 5000;
const COOKIE: Record<Role, string> = { reader: 'notes_reader', admin: 'notes_admin' };
const MEETINGS_KEY = 'meetings';
const REPLIES_KEY = 'replies';
const ENTRIES_KEY = 'after_dark';
const ENTRY_REPLIES_KEY = 'after_dark_replies';
const DOOR_COOKIE = 'notes_door';
const BOOKS_KEY = 'books';
const PLAYED_KEY = 'books_played';
const BOOK_REPLIES_KEY = 'book_replies';
const SONGS_KEY = 'records';
const SONGS_PLAYED_KEY = 'records_played';
const ALBUM_KEY = 'album';
const ALBUM_SEEN_KEY = 'album_seen';
const LIST_KEY: Record<Person, string> = { reader: 'list_reader', admin: 'list_admin' };
const LIST_SETTINGS_KEY = 'list_settings';
const EVENT_KEY = 'event';
const EVENT_PICKS_KEY = 'event_picks';
const EVENT_PHOTOS_KEY = 'event_photos';
const GIFT_KEY = 'gift';
const GIFT_STATE_KEY = 'gift_state';
const GIFT_PHOTOS_KEY = 'gift_photos';
const FLASH: Record<string, string> = {
  'photos-added': 'Photos added.', 'photo-removed': 'Photo removed.', cleared: 'Her picks are cleared.',
  saved: 'Saved.', deleted: 'Deleted.', 'gift-cleared': 'Her side of the gift is cleared.', booked: 'Marked booked.', unbooked: 'Booking undone. She can pick a day again.', 'meeting-saved': 'Meeting saved.', 'meeting-removed': 'Meeting removed.',
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

async function loadEvent(kv: KV): Promise<SpecialEvent | null> {
  return parseStoredEvent(await kv.get(EVENT_KEY));
}

async function loadEventPhotos(kv: KV): Promise<EventPhoto[]> {
  return parsePhotos(await kv.get(EVENT_PHOTOS_KEY));
}

async function loadEventPicks(kv: KV, eventId: string): Promise<EventPicks> {
  return parsePicks(await kv.get(EVENT_PICKS_KEY), eventId);
}

async function loadGift(kv: KV): Promise<Gift | null> {
  return parseStoredGift(await kv.get(GIFT_KEY));
}

async function loadGiftPhotos(kv: KV): Promise<EventPhoto[]> {
  return parsePhotos(await kv.get(GIFT_PHOTOS_KEY));
}

async function loadGiftState(kv: KV, giftId: string): Promise<GiftState> {
  return parseGiftState(await kv.get(GIFT_STATE_KEY), giftId);
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

async function loadEntries(kv: KV): Promise<Entry[]> {
  return parseEntries(await kv.get(ENTRIES_KEY));
}

async function loadEntryReplies(kv: KV) {
  return parseEntryReplies(await kv.get(ENTRY_REPLIES_KEY));
}

async function loadBooks(kv: KV): Promise<Book[]> {
  return parseBooks(await kv.get(BOOKS_KEY));
}

async function loadSongs(kv: KV): Promise<Song[]> {
  return parseSongs(await kv.get(SONGS_KEY));
}

async function loadSongsPlayed(kv: KV) {
  return parsePlayed(await kv.get(SONGS_PLAYED_KEY));
}

async function loadAlbum(kv: KV): Promise<AlbumPhoto[]> {
  return parseAlbum(await kv.get(ALBUM_KEY));
}

// The sideboard's songs and album for her page; null when either can't be read, so only the sideboard is missing.
async function loadKeepsakes(kv: KV, cfg: Config): Promise<Keepsakes | null> {
  const songs = await tryLoad(() => loadSongs(kv), 'songs');
  const album = await tryLoad(() => loadAlbum(kv), 'album');
  if (!songs || !album) return null;
  return {
    songs, album,
    songsPlayed: (await tryLoad(() => loadSongsPlayed(kv), 'song play times')) ?? [],
    albumSeen: parseSeen(await kv.get(ALBUM_SEEN_KEY)),
    songPlayAction: `${cfg.base}/reading-room/song-played`,
    albumSeenAction: `${cfg.base}/reading-room/album-seen`,
  };
}

async function loadPlayed(kv: KV) {
  return parsePlayed(await kv.get(PLAYED_KEY));
}

// Book replies have the same shape as after dark replies: one per id.
async function loadBookReplies(kv: KV) {
  return parseEntryReplies(await kv.get(BOOK_REPLIES_KEY));
}

async function loadList(kv: KV) {
  const logs: Record<Person, ListLog> = {
    reader: parseLog(await kv.get(LIST_KEY.reader)),
    admin: parseLog(await kv.get(LIST_KEY.admin)),
  };
  return { logs, settings: parseSettings(await kv.get(LIST_SETTINGS_KEY)) };
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

// Keeps replies with their notes (or entries). Best-effort: the notes are already saved when this runs,
// and a missing or unreadable replies value is left exactly as it is.
// Writes only when a reply actually changes: KV reads can be a minute stale across locations,
// so an unneeded write could undo a reply she has just sent.
async function updateStored<T>(kv: KV, key: string, parse: (raw: string) => T[], change: (items: T[]) => T[]): Promise<void> {
  try {
    const raw = await kv.get(key);
    if (raw === null) return;
    const before = parse(raw);
    const after = change(before);
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    await kv.put(key, JSON.stringify(after));
  } catch (error) {
    console.error(`Could not update ${key}`, error);
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

// Files no longer referenced by any note or entry go to a trash list and are deleted a day later.
// The delay protects against a stale KV read putting a reference back; such files are rescued.
// Best-effort: the change is already saved when this runs.
async function retireOrphans(env: Env, before: string[], inUse: string[], now: Date): Promise<void> {
  try {
    const keep = new Set(inUse);
    let trash = parseTrash(await env.NOTES.get(TRASH_KEY)).filter((e) => !keep.has(e.key));
    for (const key of before) {
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

// Every file still referenced. Keys are unique per upload, so if entries or books can't be read
// the other sides still never touch their files: only a side's own old keys are ever retired.
async function keysInUse(kv: KV, notes: Note[], entries?: Entry[], books?: Book[]): Promise<string[]> {
  const others = entries ?? (await tryLoad(() => loadEntries(kv), 'after dark')) ?? [];
  const shelf = books ?? (await tryLoad(() => loadBooks(kv), 'books')) ?? [];
  const photos = (await tryLoad(() => loadEventPhotos(kv), 'event photos')) ?? [];
  const songs = (await tryLoad(() => loadSongs(kv), 'songs')) ?? [];
  const album = (await tryLoad(() => loadAlbum(kv), 'album')) ?? [];
  const giftPhotos = (await tryLoad(() => loadGiftPhotos(kv), 'gift photos')) ?? [];
  return [...giftPhotos.map((p) => p.key),
    ...notes.flatMap(attachmentKeys), ...entryKeys(others), ...bookKeys(shelf), ...photos.map((p) => p.key),
    ...songKeys(songs), ...albumKeys(album),
  ];
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

// The card on her notes page while an event runs; nothing at all if the event can't be read.
async function eventWayIn(kv: KV, cfg: Config, today: string): Promise<{ href: string; title: string; waiting: boolean } | null> {
  const event = await tryLoad(() => loadEvent(kv), 'event');
  if (!event || !isShowing(event, today)) return null;
  const photos = (await tryLoad(() => loadEventPhotos(kv), 'event photos')) ?? [];
  const picks = await tryLoad(() => loadEventPicks(kv, event.id), 'event picks');
  return { href: `${cfg.base}/event`, title: event.title, waiting: Boolean(picks && hasWaiting(readerEvent(event, picks, photos, today))) };
}

async function giftWayIn(kv: KV, cfg: Config, today: string): Promise<{ href: string; title: string; waiting: boolean } | null> {
  const gift = await tryLoad(() => loadGift(kv), 'gift');
  if (!gift || !isGiftShowing(gift, today)) return null;
  const state = await tryLoad(() => loadGiftState(kv, gift.id), 'gift state');
  return state ? { href: `${cfg.base}/gift`, title: gift.title, waiting: giftWaiting(gift, state) } : null;
}

async function showGift(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const today = noteDay(now);
  let gift: Gift | null;
  let photos: EventPhoto[];
  let state: GiftState;
  try {
    gift = await loadGift(kv);
    if (!gift || !isGiftShowing(gift, today)) return notFound();
    photos = await loadGiftPhotos(kv);
    state = await loadGiftState(kv, gift.id);
  } catch (error) {
    console.error(error);
    return html(giftErrorPage(), 500);
  }
  const view = readerGift(gift, state, photos, today);
  // Seeing the booked page is what puts out the dot on her notes page.
  if (view.stage === 'booked' && giftWaiting(gift, state)) {
    await kv.put(GIFT_STATE_KEY, JSON.stringify(seeBooked(state, now.toISOString())));
  }
  return html(giftPage({
    view, home: `${cfg.base}/gift`, mediaBase: `${cfg.base}/media`, saveAction: `${cfg.base}/gift/save`,
    csrf: await csrfToken(session, cfg.secret), back: cfg.base,
  }));
}

async function handleGiftSave(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const today = noteDay(now);
  let gift: Gift | null;
  let state: GiftState;
  try {
    gift = await loadGift(kv);
    if (!gift || !isGiftShowing(gift, today)) return notFound();
    state = await loadGiftState(kv, gift.id);
  } catch (error) {
    console.error(error);
    return html(giftErrorPage(), 500);
  }
  const at = now.toISOString();
  const what = field(form, 'do');
  const next = what === 'unwrap' ? unwrapGift(state, at) : what === 'pick' ? pickGiftDay(state, gift, field(form, 'day'), today, at) : null;
  if (!next) return notFound();
  if (next !== state) await kv.put(GIFT_STATE_KEY, JSON.stringify(next));
  if (field(form, 'quiet') === '1') return quietDone();
  return redirect(`${cfg.base}/gift`);
}

async function showEvent(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const today = todayInCopenhagen(now);
  let event: SpecialEvent | null;
  let photos: EventPhoto[];
  let picks: EventPicks;
  try {
    event = await loadEvent(kv);
    if (!event || !isShowing(event, today)) return notFound();
    photos = await loadEventPhotos(kv);
    picks = await loadEventPicks(kv, event.id);
  } catch (error) {
    console.error(error);
    return html(eventErrorPage(), 500);
  }
  // Without JavaScript her door link is how she opens it, so the link records it.
  const open = url.searchParams.get('open') ?? undefined;
  const door = event.doors.find((d) => d.id === open);
  if (door && isOpen(door.opens, today) && !picks.opened[door.id]) {
    picks = openDoor(picks, door.id, now.toISOString());
    await kv.put(EVENT_PICKS_KEY, JSON.stringify(picks));
  }
  return html(eventPage({
    view: readerEvent(event, picks, photos, today),
    home: `${cfg.base}/event`,
    mediaBase: `${cfg.base}/media`,
    saveAction: `${cfg.base}/event/save`,
    csrf: await csrfToken(session, cfg.secret),
    sheet: open,
    back: cfg.base,
  }));
}

async function handleEventSave(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const today = todayInCopenhagen(now);
  let event: SpecialEvent | null;
  let picks: EventPicks;
  try {
    event = await loadEvent(kv);
    if (!event || !isShowing(event, today)) return notFound();
    picks = await loadEventPicks(kv, event.id);
  } catch (error) {
    console.error(error);
    return html(eventErrorPage(), 500);
  }
  const what = field(form, 'do');
  const doorId = field(form, 'door');
  const dishId = field(form, 'dish');
  const at = now.toISOString();
  let next: EventPicks;
  if (what === 'card') {
    const card = event.card;
    if (!card || !isOpen(card.opens, today) || !card.dishes.some((d) => d.id === dishId)) return notFound();
    const known = { ...picks, card: picks.card.filter((c) => card.dishes.some((d) => d.id === c.dish)).slice(-card.pick) };
    next = toggleCardItem(known, dishId, card.pick, at);
  } else {
    const door = event.doors.find((d) => d.id === doorId);
    if (!door || !isOpen(door.opens, today)) return notFound();
    if (what === 'open') next = openDoor(picks, door.id, at);
    else if (what === 'pick' && door.dishes?.some((d) => d.id === dishId)) next = pickDish(openDoor(picks, door.id, at), door.id, dishId, at);
    else return notFound();
  }
  await kv.put(EVENT_PICKS_KEY, JSON.stringify(next));
  if (field(form, 'quiet') === '1') return quietDone();
  return redirect(`${cfg.base}/event?open=${encodeURIComponent(what === 'card' ? 'card' : doorId)}`);
}

async function keepsakesWaiting(kv: KV, cfg: Config): Promise<boolean> {
  const k = await loadKeepsakes(kv, cfg);
  return Boolean(k && (songsUnplayed(k.songs, k.songsPlayed).length || albumHasNew(k.album, k.albumSeen)));
}

async function showReader(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const today = todayInCopenhagen(now);
  const day = noteDay(now);
  const notes = await loadNotes(kv);
  const meetings = await tryLoad(() => loadMeetings(kv), 'meetings');
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  const books = await tryLoad(() => loadBooks(kv), 'books');
  const played = await tryLoad(() => loadPlayed(kv), 'played books');
  return html(readerPage({
    event: await eventWayIn(kv, cfg, today),
    gift: await giftWayIn(kv, cfg, day),
    reading: {
      href: `${cfg.base}/reading-room`,
      unread: Boolean(books && played && books.some((b) => !played.some((p) => p.id === b.id))) || await keepsakesWaiting(kv, cfg),
    },
    ...selectForReader(notes, day),
    mediaBase: `${cfg.base}/media`,
    sky: meetings && skyFor(notes, meetings, day),
    replies: await tryLoad(() => loadReplies(kv), 'replies'),
    reply: { action: `${cfg.base}/reply`, csrf: await csrfToken(session, cfg.secret) },
    unsent: url.searchParams.get('unsent') ?? undefined,
    afterDark: entries && entries.length ? { href: `${cfg.base}/after-dark`, newest: entries[0].id } : null,
  }));
}

async function handleReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const date = field(form, 'date');
  const today = noteDay(now);
  if (!(await loadNotes(kv)).some((n) => n.date === date && n.date <= today)) return notFound();
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return redirect(`${cfg.base}?unsent=${date}#note-${date}`);
  await kv.put(REPLIES_KEY, JSON.stringify(setReply(await loadReplies(kv), date, answer, now.toISOString())));
  return redirect(`${cfg.base}#note-${date}`);
}

async function showAfterDark(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const csrf = await csrfToken(session, cfg.secret);
  if (!(await doorOpen(request, cfg, now, session))) {
    return html(doorwayPage({ enter: `${cfg.base}/after-dark/enter`, csrf, back: cfg.base }));
  }
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  if (!entries) return html(roomErrorPage(), 500);
  const list = await tryLoad(() => loadList(kv), 'our list');
  const listView = list && mergeList(list.logs, 'reader', list.settings);
  return html(roomPage({
    entries,
    list: listView ? { href: `${cfg.base}/after-dark/list`, count: listView.count, fresh: listView.fresh } : undefined,
    replies: await tryLoad(() => loadEntryReplies(kv), 'after dark replies'),
    mediaBase: `${cfg.base}/media`,
    leave: `${cfg.base}/after-dark/leave`,
    reply: { action: `${cfg.base}/after-dark/reply`, csrf },
    unsent: url.searchParams.get('unsent') ?? undefined,
  }));
}

async function enterAfterDark(request: Request, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const door = await createDoor(session, cfg.secret, now.getTime());
  return redirect(`${cfg.base}/after-dark`, { 'Set-Cookie': doorCookie(door, cfg.base) });
}

// Leaving needs no token: the worst a forged request can do is close the door.
function leaveAfterDark(cfg: Config): Response {
  return redirect(cfg.base, { 'Set-Cookie': closedDoorCookie(cfg.base) });
}

async function handleEntryReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const room = `${cfg.base}/after-dark`;
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  // No door check: posting reveals nothing, and a door that closed while she was writing must not lose her words.
  const id = field(form, 'id');
  if (!(await loadEntries(kv)).some((e) => e.id === id)) return notFound();
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return redirect(`${room}?unsent=${id}#entry-${id}`);
  await kv.put(ENTRY_REPLIES_KEY, JSON.stringify(setEntryReply(await loadEntryReplies(kv), id, answer, now.toISOString())));
  return redirect(`${room}#entry-${id}`);
}

async function showReadingRoom(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return html(readerLoginPage({ action: `${cfg.base}/login` }));
  const books = await tryLoad(() => loadBooks(kv), 'books');
  if (!books) return html(readingRoomErrorPage(), 500);
  let keepsakes = await loadKeepsakes(kv, cfg);
  // Without JavaScript the album's link is how she opens it, so the link records it.
  if (keepsakes && keepsakes.album.length && url.searchParams.get('open') === 'album') {
    await kv.put(ALBUM_SEEN_KEY, now.toISOString());
    keepsakes = { ...keepsakes, albumSeen: now.toISOString() };
  }
  return html(readingRoomPage({
    books,
    keepsakes,
    played: (await tryLoad(() => loadPlayed(kv), 'played books')) ?? [],
    replies: await tryLoad(() => loadBookReplies(kv), 'book replies'),
    back: cfg.base,
    mediaBase: `${cfg.base}/media`,
    playAction: `${cfg.base}/reading-room/played`,
    reply: { action: `${cfg.base}/reading-room/reply`, csrf: await csrfToken(session, cfg.secret) },
    open: url.searchParams.get('open') ?? undefined,
    unsent: url.searchParams.get('unsent') ?? undefined,
  }));
}

// Checks the reader's session and token and that the book exists; returns its id and form, or the response to send.
async function bookRequest(request: Request, kv: KV, cfg: Config, now: Date): Promise<{ id: string; form: FormData } | Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const id = field(form, 'id');
  if (!(await loadBooks(kv)).some((b) => b.id === id)) return notFound();
  return { id, form };
}

const quietDone = () => new Response(null, { status: 204, headers: PAGE_HEADERS });

async function handleSongPlayed(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const id = field(form, 'id');
  if (!(await loadSongs(kv)).some((x) => x.id === id)) return notFound();
  const played = await loadSongsPlayed(kv);
  const next = markPlayed(played, id, now.toISOString());
  if (next !== played) await kv.put(SONGS_PLAYED_KEY, JSON.stringify(next));
  return field(form, 'quiet') === '1' ? quietDone() : redirect(`${cfg.base}/reading-room?open=records`);
}

async function handleAlbumSeen(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await readerSession(request, cfg, now);
  if (!session) return redirect(cfg.base);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  await kv.put(ALBUM_SEEN_KEY, now.toISOString());
  return field(form, 'quiet') === '1' ? quietDone() : redirect(`${cfg.base}/reading-room?open=album`);
}

async function handlePlayed(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const checked = await bookRequest(request, kv, cfg, now);
  if (checked instanceof Response) return checked;
  const played = await loadPlayed(kv);
  const next = markPlayed(played, checked.id, now.toISOString());
  if (next !== played) await kv.put(PLAYED_KEY, JSON.stringify(next));
  return field(checked.form, 'quiet') === '1' ? quietDone() : redirect(`${cfg.base}/reading-room?open=${checked.id}`);
}

// The script sends replies quietly so the reading keeps playing; without it the page reloads on the open book.
async function handleBookReply(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const checked = await bookRequest(request, kv, cfg, now);
  if (checked instanceof Response) return checked;
  const { id, form } = checked;
  const quiet = field(form, 'quiet') === '1';
  const book = `${cfg.base}/reading-room?open=${id}`;
  const answer = parseReplyForm((name) => field(form, name));
  if (!answer) return quiet ? new Response(null, { status: 400, headers: PAGE_HEADERS }) : redirect(`${book}&unsent=${id}#reply-${id}`);
  await kv.put(BOOK_REPLIES_KEY, JSON.stringify(setEntryReply(await loadBookReplies(kv), id, answer, now.toISOString())));
  return quiet ? quietDone() : redirect(`${book}#reply-${id}`);
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
  const today = noteDay(now);
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
  return { date: nextEmptyDate(notes.map((n) => n.date), noteDay(now)), text: '' };
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
  const session = asAdmin ? await adminSession(request, cfg, now) : await readerSession(request, cfg, now);
  if (!session) return notFound();
  const note = findByMediaKey(await loadNotes(env.NOTES), key);
  if (note) {
    if (!asAdmin && note.date > noteDay(now)) return notFound();
    return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
  }
  const keepsake = (await tryLoad(() => loadSongs(env.NOTES), 'songs'))?.some((x) => x.audio.key === key) ||
    (await tryLoad(() => loadAlbum(env.NOTES), 'album'))?.some((x) => x.photo.key === key);
  if (keepsake) return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
  const book = (await tryLoad(() => loadBooks(env.NOTES), 'books'))?.find((b) => b.audio.key === key);
  if (book) return (await serveMedia(env.MEDIA, key, request)) ?? notFound();
  const photos = (await tryLoad(() => loadEventPhotos(env.NOTES), 'event photos')) ?? [];
  if (photos.some((p) => p.key === key)) {
    if (!asAdmin) {
      const today = todayInCopenhagen(now);
      const event = await tryLoad(() => loadEvent(env.NOTES), 'event');
      if (!event || !isShowing(event, today) || !openPhotoKeys(event, photos, today).includes(key)) return notFound();
    }
    return (await serveMedia(env.MEDIA, key, request, 'no-store')) ?? notFound();
  }
  const giftPhotos = (await tryLoad(() => loadGiftPhotos(env.NOTES), 'gift photos')) ?? [];
  if (giftPhotos.some((p) => p.key === key)) {
    if (!asAdmin) {
      const today = noteDay(now);
      const gift = await tryLoad(() => loadGift(env.NOTES), 'gift');
      if (!gift || !isGiftShowing(gift, today) || !giftPhotoKeys(gift, giftPhotos).includes(key)) return notFound();
    }
    return (await serveMedia(env.MEDIA, key, request, 'no-store')) ?? notFound();
  }
  const entry = (await tryLoad(() => loadEntries(env.NOTES), 'after dark'))?.find((e) => e.audio?.key === key);
  if (!entry || (!asAdmin && !(await doorOpen(request, cfg, now, session)))) return notFound();
  return (await serveMedia(env.MEDIA, key, request, 'no-store')) ?? notFound();
}

async function doorOpen(request: Request, cfg: Config, now: Date, session: string): Promise<boolean> {
  return verifyDoor(readCookie(request, DOOR_COOKIE), session, cfg.secret, now.getTime());
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
    await retireOrphans(env, notes.flatMap(attachmentKeys), await keysInUse(env.NOTES, next), now);
    await updateStored(env.NOTES, REPLIES_KEY, parseReplies, (r) => dropReply(r, date));
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
  const drawingError = checkDrawings(text);
  if (drawingError) errors.push(drawingError);
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
  await retireOrphans(env, notes.flatMap(attachmentKeys), await keysInUse(env.NOTES, next), now);
  if (original !== date) await updateStored(env.NOTES, REPLIES_KEY, parseReplies, (r) => moveReply(r, original || undefined, date));
  return redirect(`${adminHome}?msg=saved`);
}

interface AfterDarkView {
  editing?: Entry;
  draft?: EntryDraft;
  flash?: string;
  error?: string;
}

async function renderAfterDarkAdmin(kv: KV, cfg: Config, session: string, view: AfterDarkView, status = 200): Promise<Response> {
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  const replies = await tryLoad(() => loadEntryReplies(kv), 'after dark replies');
  const problems = [entries ? '' : 'Entries could not be read.', replies ? '' : 'Replies could not be read.'];
  return html(afterDarkAdminPage({
    base: cfg.base,
    csrf: await csrfToken(session, cfg.secret),
    entries: entries ?? [],
    replies: replies ?? [],
    draft: view.draft ?? (view.editing ? { title: view.editing.title, text: view.editing.text } : EMPTY_ENTRY),
    editing: view.editing,
    flash: view.flash,
    error: [view.error ?? '', ...problems].filter(Boolean).join(' ') || undefined,
  }), status);
}

async function showAfterDarkAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const editId = url.searchParams.get('edit');
  const editing = editId ? (await tryLoad(() => loadEntries(kv), 'after dark'))?.find((e) => e.id === editId) : undefined;
  const msg = url.searchParams.get('msg') ?? '';
  return renderAfterDarkAdmin(kv, cfg, session, { editing, flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined });
}

async function showAfterDarkPreview(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const entries = await tryLoad(() => loadEntries(kv), 'after dark');
  if (!entries) return html(roomErrorPage(), 500);
  return html(roomPage({
    entries, replies: await tryLoad(() => loadEntryReplies(kv), 'after dark replies'),
    mediaBase: `${cfg.base}/admin/media`, preview: true,
  }));
}

async function afterDarkAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const home = `${cfg.base}/admin/after-dark`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  // Both loads throw on corrupt data, before anything is written.
  const entries = await loadEntries(env.NOTES);
  const notes = await loadNotes(env.NOTES);
  const id = field(form, 'id');
  const existing = entries.find((e) => e.id === id);

  if (action === 'delete') {
    if (!existing) return redirect(`${home}?msg=deleted`);
    const next = removeEntry(entries, id);
    await env.NOTES.put(ENTRIES_KEY, JSON.stringify(next));
    await retireOrphans(env, entryKeys([existing]), await keysInUse(env.NOTES, notes, next), now);
    await updateStored(env.NOTES, ENTRY_REPLIES_KEY, parseEntryReplies, (r) => dropEntryReply(r, id));
    return redirect(`${home}?msg=deleted`);
  }

  if (id && !existing) return notFound();
  const parsed = parseEntryForm((name) => field(form, name));
  const audioFile = uploadedFile(form, 'audio');
  const audioCheck = audioFile ? checkFile('audio', audioFile) : null;
  const errors = [parsed.error ?? '', audioCheck && !audioCheck.ok ? audioCheck.error : ''].filter(Boolean);
  if (errors.length > 0) {
    return renderAfterDarkAdmin(env.NOTES, cfg, session, { editing: existing, draft: parsed.draft, error: errors.join(' ') }, 400);
  }
  const entry: Entry = {
    id: existing?.id ?? crypto.randomUUID(),
    title: parsed.draft.title,
    text: parsed.draft.text,
    created: existing?.created ?? now.toISOString(),
  };
  const audio = await storeUpload(
    env.MEDIA, 'audio', audioFile, audioCheck?.ok ? audioCheck.type : undefined,
    field(form, 'remove_audio') === '1' ? undefined : existing?.audio,
  );
  if (audio) entry.audio = audio;
  const next = upsertEntry(entries, entry);
  await env.NOTES.put(ENTRIES_KEY, JSON.stringify(next));
  await retireOrphans(env, entryKeys(entries), await keysInUse(env.NOTES, notes, next), now);
  return redirect(`${home}?msg=saved`);
}

interface ReadingRoomView {
  editing?: Book;
  draft?: BookDraft;
  editingSong?: Song;
  songDraft?: SongDraft;
  editingPhoto?: AlbumPhoto;
  flash?: string;
  error?: string;
}

async function renderReadingRoomAdmin(kv: KV, cfg: Config, session: string, view: ReadingRoomView, status = 200): Promise<Response> {
  const books = await tryLoad(() => loadBooks(kv), 'books');
  const played = await tryLoad(() => loadPlayed(kv), 'played books');
  const replies = await tryLoad(() => loadBookReplies(kv), 'book replies');
  const songs = await tryLoad(() => loadSongs(kv), 'songs');
  const songsPlayed = await tryLoad(() => loadSongsPlayed(kv), 'song play times');
  const album = await tryLoad(() => loadAlbum(kv), 'album');
  const problems = [
    books ? '' : 'Books could not be read.', played ? '' : 'Play times could not be read.', replies ? '' : 'Replies could not be read.',
    songs ? '' : 'Songs could not be read.', songsPlayed ? '' : 'Song play times could not be read.', album ? '' : 'The album could not be read.',
  ];
  const song = view.editingSong;
  const e = view.editing;
  return html(readingRoomAdminPage({
    base: cfg.base,
    csrf: await csrfToken(session, cfg.secret),
    books: books ?? [],
    played: played ?? [],
    replies: replies ?? [],
    draft: view.draft ?? (e ? { title: e.title, author: e.author, line: e.line } : EMPTY_BOOK),
    editing: e,
    keepsakes: {
      songs: songs ?? [], songsPlayed: songsPlayed ?? [], album: album ?? [],
      songDraft: view.songDraft ?? (song ? { title: song.title, line: song.line } : EMPTY_SONG),
      editingSong: song, editingPhoto: view.editingPhoto,
    },
    flash: view.flash,
    error: [view.error ?? '', ...problems].filter(Boolean).join(' ') || undefined,
  }), status);
}

async function showReadingRoomAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const editId = url.searchParams.get('edit');
  const editing = editId ? (await tryLoad(() => loadBooks(kv), 'books'))?.find((b) => b.id === editId) : undefined;
  const songId = url.searchParams.get('song');
  const editingSong = songId ? (await tryLoad(() => loadSongs(kv), 'songs'))?.find((x) => x.id === songId) : undefined;
  const photoId = url.searchParams.get('photo');
  const editingPhoto = photoId ? (await tryLoad(() => loadAlbum(kv), 'album'))?.find((x) => x.id === photoId) : undefined;
  const msg = url.searchParams.get('msg') ?? '';
  return renderReadingRoomAdmin(kv, cfg, session, { editing, editingSong, editingPhoto, flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined });
}

async function showReadingRoomPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const books = await tryLoad(() => loadBooks(kv), 'books');
  if (!books) return html(readingRoomErrorPage(), 500);
  return html(readingRoomPage({
    books,
    played: (await tryLoad(() => loadPlayed(kv), 'played books')) ?? [],
    replies: await tryLoad(() => loadBookReplies(kv), 'book replies'),
    back: `${cfg.base}/admin/reading-room`,
    mediaBase: `${cfg.base}/admin/media`,
    open: url.searchParams.get('open') ?? undefined,
    preview: `${cfg.base}/admin/reading-room/preview`,
    keepsakes: await loadKeepsakes(kv, cfg),
  }));
}

async function renderEventAdmin(
  kv: KV, cfg: Config, session: string, view: { text?: string; flash?: string; error?: string }, status = 200,
): Promise<Response> {
  const raw = await kv.get(EVENT_KEY);
  const event = await tryLoad(() => loadEvent(kv), 'event');
  const photos = (await tryLoad(() => loadEventPhotos(kv), 'event photos')) ?? [];
  const picks = event ? (await tryLoad(() => loadEventPicks(kv, event.id), 'event picks')) ?? EMPTY_PICKS(event.id) : EMPTY_PICKS('');
  let text = view.text;
  if (text === undefined) {
    try {
      text = raw ? JSON.stringify(JSON.parse(raw), null, 2) : '';
    } catch {
      text = raw ?? '';
    }
  }
  const unreadable = raw !== null && !event ? 'The saved event could not be read. Fix it below and save.' : '';
  return html(eventAdminPage({
    base: cfg.base, csrf: await csrfToken(session, cfg.secret), text, event, picks, photos,
    inUse: event ? photoNamesInUse(event) : [], flash: view.flash,
    error: [view.error ?? '', unreadable].filter(Boolean).join(' ') || undefined,
  }), status);
}

async function renderGiftAdmin(
  kv: KV, cfg: Config, session: string, now: Date, view: { text?: string; flash?: string; error?: string }, status = 200,
): Promise<Response> {
  const raw = await kv.get(GIFT_KEY);
  const gift = await tryLoad(() => loadGift(kv), 'gift');
  const photos = (await tryLoad(() => loadGiftPhotos(kv), 'gift photos')) ?? [];
  const state = gift ? await tryLoad(() => loadGiftState(kv, gift.id), 'gift state') : null;
  let text = view.text;
  if (text === undefined) {
    try {
      text = raw ? JSON.stringify(JSON.parse(raw), null, 2) : '';
    } catch {
      text = raw ?? '';
    }
  }
  const unreadable = raw !== null && !gift ? 'The saved gift could not be read. Fix it below and save.' : undefined;
  return html(giftAdminPage({
    base: cfg.base, csrf: await csrfToken(session, cfg.secret), text, photos, gift, state, today: noteDay(now),
    flash: view.flash, error: [view.error, unreadable].filter(Boolean).join(' ') || undefined,
  }), status);
}

async function showGiftAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const msg = url.searchParams.get('msg') ?? '';
  return renderGiftAdmin(kv, cfg, session, now, { flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined });
}

async function showGiftPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const on = url.searchParams.get('on') ?? '';
  const day = isValidDate(on) ? on : noteDay(now);
  let gift: Gift | null;
  let photos: EventPhoto[];
  try {
    gift = await loadGift(kv);
    photos = await loadGiftPhotos(kv);
  } catch (error) {
    console.error(error);
    return html(giftErrorPage(), 500);
  }
  if (!gift) return notFound();
  const g = gift;
  const state = (await tryLoad(() => loadGiftState(kv, g.id), 'gift state')) ?? emptyGiftState(g.id);
  return html(giftPage({
    view: readerGift(g, state, photos, day), home: `${cfg.base}/admin/gift/preview?on=${day}`,
    mediaBase: `${cfg.base}/admin/media`, back: `${cfg.base}/admin/gift`, preview: true,
  }));
}

async function giftAdminAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'photos' | 'photo-delete' | 'book' | 'unbook' | 'clear',
): Promise<Response> {
  const home = `${cfg.base}/admin/gift`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const kv = env.NOTES;
  const again = (view: { text?: string; error?: string }, status = 400) => renderGiftAdmin(kv, cfg, session, now, view, status);
  if (action === 'clear') {
    const gift = await tryLoad(() => loadGift(kv), 'gift');
    await kv.put(GIFT_STATE_KEY, JSON.stringify(emptyGiftState(gift?.id ?? '')));
    return redirect(`${home}?msg=gift-cleared`);
  }
  if (action === 'book' || action === 'unbook') {
    let gift: Gift | null;
    let state: GiftState;
    try {
      gift = await loadGift(kv);
      if (!gift) return notFound();
      state = await loadGiftState(kv, gift.id);
    } catch (error) {
      console.error(error);
      return again({ error: 'The gift or her side of it could not be read, so nothing was changed.' }, 500);
    }
    if (action === 'unbook') {
      await kv.put(GIFT_STATE_KEY, JSON.stringify(undoBooked(state)));
      return redirect(`${home}?msg=unbooked`);
    }
    const lines = parseBookingLines(field(form, 'lines'));
    if ('error' in lines) return again({ error: lines.error });
    const next = markBooked(state, field(form, 'day'), lines.lines, now.toISOString());
    if (!next) return again({ error: 'Her pick has changed since this page was loaded, so nothing was booked. Look at her pick again.' });
    await kv.put(GIFT_STATE_KEY, JSON.stringify(next));
    return redirect(`${home}?msg=booked`);
  }
  // Throws on corrupt photos before anything is written.
  const photos = await loadGiftPhotos(kv);
  if (action === 'save') {
    const text = field(form, 'gift');
    const old = await tryLoad(() => loadGift(kv), 'gift');
    const state = old ? await tryLoad(() => loadGiftState(kv, old.id), 'gift state') : null;
    if (old && !state) return again({ text, error: 'Her side of the gift could not be read, so the gift was not saved. Clear her pick first.' });
    const checked = checkGift(text, photos, state);
    if (!checked.ok) return again({ text, error: checked.error });
    await kv.put(GIFT_KEY, JSON.stringify(checked.gift));
    return redirect(`${home}?msg=saved`);
  }
  const notes = await loadNotes(kv);
  if (action === 'photo-delete') {
    const photo = photos.find((p) => p.key === field(form, 'key'));
    if (!photo) return redirect(`${home}?msg=photo-removed`);
    const gift = await tryLoad(() => loadGift(kv), 'gift');
    if (gift && giftPhotoNames(gift).includes(photo.name)) return again({ error: `"${photo.name}" is in use by the gift, so it stays.` });
    await kv.put(GIFT_PHOTOS_KEY, JSON.stringify(photos.filter((p) => p.key !== photo.key)));
    await retireOrphans(env, [photo.key], await keysInUse(kv, notes), now);
    return redirect(`${home}?msg=photo-removed`);
  }
  const files = form.getAll('photos').filter((f): f is File => typeof f !== 'string' && f.size > 0);
  if (files.length === 0) return again({ error: 'Choose at least one photo.' });
  const checks = files.map((f) => checkFile('photo', f));
  const failed = checks.find((c) => !c.ok);
  if (failed && !failed.ok) return again({ error: failed.error });
  let next = photos;
  const replaced: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const check = checks[i];
    const stored = await storeUpload(env.MEDIA, 'photo', files[i], check.ok ? check.type : undefined, undefined);
    if (!stored) continue;
    const name = files[i].name.slice(0, 120);
    replaced.push(...next.filter((p) => p.name === name).map((p) => p.key));
    next = [...next.filter((p) => p.name !== name), { key: stored.key, name }];
  }
  await kv.put(GIFT_PHOTOS_KEY, JSON.stringify(next));
  if (replaced.length) await retireOrphans(env, replaced, await keysInUse(kv, notes), now);
  return redirect(`${home}?msg=photos-added`);
}

async function showEventAdmin(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const msg = url.searchParams.get('msg') ?? '';
  return renderEventAdmin(kv, cfg, session, { flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined });
}

async function showEventPreview(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  if (!(await adminSession(request, cfg, now))) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const on = url.searchParams.get('on') ?? '';
  const day = isValidDate(on) ? on : todayInCopenhagen(now);
  let event: SpecialEvent | null;
  let photos: EventPhoto[];
  try {
    event = await loadEvent(kv);
    photos = await loadEventPhotos(kv);
  } catch (error) {
    console.error(error);
    return html(eventErrorPage(), 500);
  }
  if (!event) return notFound();
  const picks = (await tryLoad(() => loadEventPicks(kv, event.id), 'event picks')) ?? EMPTY_PICKS(event.id);
  return html(eventPage({
    view: readerEvent(event, picks, photos, day),
    home: `${cfg.base}/admin/event/preview?on=${day}`,
    mediaBase: `${cfg.base}/admin/media`,
    sheet: url.searchParams.get('open') ?? undefined,
    back: `${cfg.base}/admin/event`,
    preview: true,
  }));
}

async function eventAdminAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'photos' | 'photo-delete' | 'clear',
): Promise<Response> {
  const home = `${cfg.base}/admin/event`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const kv = env.NOTES;
  if (action === 'clear') {
    const event = await loadEvent(kv);
    await kv.put(EVENT_PICKS_KEY, JSON.stringify(EMPTY_PICKS(event?.id ?? '')));
    return redirect(`${home}?msg=cleared`);
  }
  // Throws on corrupt photos before anything is written.
  const photos = await loadEventPhotos(kv);
  if (action === 'save') {
    const text = field(form, 'event');
    const checked = checkEvent(text, photos);
    if (!checked.ok) return renderEventAdmin(kv, cfg, session, { text, error: checked.error }, 400);
    await kv.put(EVENT_KEY, JSON.stringify(checked.event));
    return redirect(`${home}?msg=saved`);
  }
  const notes = await loadNotes(kv);
  if (action === 'photo-delete') {
    const photo = photos.find((p) => p.key === field(form, 'key'));
    if (!photo) return redirect(`${home}?msg=photo-removed`);
    const event = await tryLoad(() => loadEvent(kv), 'event');
    if (event && photoNamesInUse(event).includes(photo.name)) {
      return renderEventAdmin(kv, cfg, session, { error: `"${photo.name}" is in use by the event, so it stays.` }, 400);
    }
    await kv.put(EVENT_PHOTOS_KEY, JSON.stringify(photos.filter((p) => p.key !== photo.key)));
    await retireOrphans(env, [photo.key], await keysInUse(kv, notes), now);
    return redirect(`${home}?msg=photo-removed`);
  }
  const files = form.getAll('photos').filter((f): f is File => typeof f !== 'string' && f.size > 0);
  if (files.length === 0) return renderEventAdmin(kv, cfg, session, { error: 'Choose at least one photo.' }, 400);
  const checks = files.map((f) => checkFile('photo', f));
  const failed = checks.find((c) => !c.ok);
  if (failed && !failed.ok) return renderEventAdmin(kv, cfg, session, { error: failed.error }, 400);
  let next = photos;
  const replaced: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const check = checks[i];
    const stored = await storeUpload(env.MEDIA, 'photo', files[i], check.ok ? check.type : undefined, undefined);
    if (!stored) continue;
    const name = files[i].name.slice(0, 120);
    replaced.push(...next.filter((p) => p.name === name).map((p) => p.key));
    next = [...next.filter((p) => p.name !== name), { key: stored.key, name }];
  }
  await kv.put(EVENT_PHOTOS_KEY, JSON.stringify(next));
  if (replaced.length) await retireOrphans(env, replaced, await keysInUse(kv, notes), now);
  return redirect(`${home}?msg=photos-added`);
}

async function keepsakeAction(
  request: Request, env: Env, cfg: Config, now: Date,
  action: 'song-save' | 'song-delete' | 'photo-save' | 'photo-delete' | 'photo-move',
): Promise<Response> {
  const home = `${cfg.base}/admin/reading-room`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const kv = env.NOTES;
  // These loads throw on corrupt data, before anything is written or uploaded.
  const notes = await loadNotes(kv);
  const id = field(form, 'id');
  if (action === 'song-save' || action === 'song-delete') {
    const songs = await loadSongs(kv);
    const existing = songs.find((x) => x.id === id);
    if (action === 'song-delete') {
      if (!existing) return redirect(`${home}?msg=deleted#songs`);
      await kv.put(SONGS_KEY, JSON.stringify(removeSong(songs, id)));
      await retireOrphans(env, [existing.audio.key], await keysInUse(kv, notes), now);
      await updateStored(kv, SONGS_PLAYED_KEY, parsePlayed, (p) => dropPlayed(p, id));
      return redirect(`${home}?msg=deleted#songs`);
    }
    if (id && !existing) return notFound();
    const parsed = parseSongForm((name) => field(form, name));
    const audioFile = uploadedFile(form, 'audio');
    const check = audioFile ? checkFile('audio', audioFile) : null;
    const errors = [parsed.error ?? '', check && !check.ok ? check.error : '', !audioFile && !existing ? SONG_FILE_NEEDED : ''].filter(Boolean);
    if (errors.length) return renderReadingRoomAdmin(kv, cfg, session, { editingSong: existing, songDraft: parsed.draft, error: errors.join(' ') }, 400);
    const audio = await storeUpload(env.MEDIA, 'audio', audioFile, check?.ok ? check.type : undefined, existing?.audio);
    if (!audio) return renderReadingRoomAdmin(kv, cfg, session, { editingSong: existing, songDraft: parsed.draft, error: SONG_FILE_NEEDED }, 400);
    const song: Song = { id: existing?.id ?? crypto.randomUUID(), ...parsed.draft, created: existing?.created ?? now.toISOString(), audio };
    await kv.put(SONGS_KEY, JSON.stringify(upsertSong(songs, song)));
    await retireOrphans(env, songKeys(songs), await keysInUse(kv, notes), now);
    return redirect(`${home}?msg=saved#songs`);
  }
  const album = await loadAlbum(kv);
  const existing = album.find((x) => x.id === id);
  if (action === 'photo-move') {
    const by = field(form, 'by');
    if (existing && (by === '1' || by === '-1')) await kv.put(ALBUM_KEY, JSON.stringify(movePhoto(album, id, by === '1' ? 1 : -1)));
    return redirect(`${home}#album`);
  }
  if (action === 'photo-delete') {
    if (!existing) return redirect(`${home}?msg=deleted#album`);
    await kv.put(ALBUM_KEY, JSON.stringify(removePhoto(album, id)));
    await retireOrphans(env, [existing.photo.key], await keysInUse(kv, notes), now);
    return redirect(`${home}?msg=deleted#album`);
  }
  if (id && !existing) return notFound();
  const parsed = parsePhotoForm((name) => field(form, name));
  const photoFile = uploadedFile(form, 'photo');
  const check = photoFile ? checkFile('photo', photoFile) : null;
  const errors = [parsed.error ?? '', check && !check.ok ? check.error : '', !photoFile && !existing ? PHOTO_FILE_NEEDED : ''].filter(Boolean);
  if (errors.length) return renderReadingRoomAdmin(kv, cfg, session, { editingPhoto: existing, error: errors.join(' ') }, 400);
  const photo = await storeUpload(env.MEDIA, 'photo', photoFile, check?.ok ? check.type : undefined, existing?.photo);
  if (!photo) return renderReadingRoomAdmin(kv, cfg, session, { editingPhoto: existing, error: PHOTO_FILE_NEEDED }, 400);
  const page: AlbumPhoto = { id: existing?.id ?? crypto.randomUUID(), line: parsed.line, created: existing?.created ?? now.toISOString(), photo };
  await kv.put(ALBUM_KEY, JSON.stringify(upsertPhoto(album, page)));
  await retireOrphans(env, albumKeys(album), await keysInUse(kv, notes), now);
  return redirect(`${home}?msg=saved#album`);
}

async function readingRoomAction(
  request: Request, env: Env, cfg: Config, now: Date, action: 'save' | 'delete',
): Promise<Response> {
  const home = `${cfg.base}/admin/reading-room`;
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  // Both loads throw on corrupt data, before anything is written or uploaded.
  const books = await loadBooks(env.NOTES);
  const notes = await loadNotes(env.NOTES);
  const id = field(form, 'id');
  const existing = books.find((b) => b.id === id);

  if (action === 'delete') {
    if (!existing) return redirect(`${home}?msg=deleted`);
    const next = removeBook(books, id);
    await env.NOTES.put(BOOKS_KEY, JSON.stringify(next));
    await retireOrphans(env, bookKeys([existing]), await keysInUse(env.NOTES, notes, undefined, next), now);
    await updateStored(env.NOTES, PLAYED_KEY, parsePlayed, (p) => dropPlayed(p, id));
    await updateStored(env.NOTES, BOOK_REPLIES_KEY, parseEntryReplies, (r) => dropEntryReply(r, id));
    return redirect(`${home}?msg=deleted`);
  }

  if (id && !existing) return notFound();
  const parsed = parseBookForm((name) => field(form, name));
  const audioFile = uploadedFile(form, 'audio');
  const audioCheck = audioFile ? checkFile('audio', audioFile) : null;
  const errors = [
    parsed.error ?? '',
    audioCheck && !audioCheck.ok ? audioCheck.error : '',
    !audioFile && !existing ? RECORDING_NEEDED : '',
  ].filter(Boolean);
  if (errors.length > 0) {
    return renderReadingRoomAdmin(env.NOTES, cfg, session, { editing: existing, draft: parsed.draft, error: errors.join(' ') }, 400);
  }
  const audio = await storeUpload(env.MEDIA, 'audio', audioFile, audioCheck?.ok ? audioCheck.type : undefined, existing?.audio);
  if (!audio) return renderReadingRoomAdmin(env.NOTES, cfg, session, { editing: existing, draft: parsed.draft, error: RECORDING_NEEDED }, 400);
  const book: Book = {
    id: existing?.id ?? crypto.randomUUID(),
    ...parsed.draft,
    created: existing?.created ?? now.toISOString(),
    audio,
  };
  const next = upsertBook(books, book);
  await env.NOTES.put(BOOKS_KEY, JSON.stringify(next));
  await retireOrphans(env, bookKeys(books), await keysInUse(env.NOTES, notes, undefined, next), now);
  return redirect(`${home}?msg=saved`);
}

function listPaths(cfg: Config, me: Person) {
  const home = me === 'reader' ? `${cfg.base}/after-dark/list` : `${cfg.base}/admin/after-dark/list`;
  return { home, action: `${home}/save`, back: me === 'reader' ? `${cfg.base}/after-dark` : `${cfg.base}/admin/after-dark` };
}

async function renderList(
  kv: KV, cfg: Config, me: Person, session: string, view: { open?: string; draft?: ListDraft; error?: string }, status = 200,
): Promise<Response> {
  const paths = listPaths(cfg, me);
  const list = await tryLoad(() => loadList(kv), 'our list');
  if (!list) return html(listErrorPage(paths.back), 500);
  return html(listPage({
    view: mergeList(list.logs, me, list.settings),
    me,
    settings: list.settings,
    ...paths,
    csrf: await csrfToken(session, cfg.secret),
    ...view,
  }), status);
}

async function showList(request: Request, kv: KV, cfg: Config, now: Date, url: URL, me: Person): Promise<Response> {
  const session = me === 'reader' ? await readerSession(request, cfg, now) : await adminSession(request, cfg, now);
  if (!session) return html(me === 'reader' ? readerLoginPage({ action: `${cfg.base}/login` }) : adminLoginPage({ action: `${cfg.base}/admin/login` }));
  if (me === 'reader' && !(await doorOpen(request, cfg, now, session))) return redirect(`${cfg.base}/after-dark`);
  return renderList(kv, cfg, me, session, { open: url.searchParams.get('open') ?? undefined });
}

// Saving needs no open door, so a door that closes mid-sentence loses nothing; only a refused save, which would
// show the page again, checks it. Each person writes only their own log.
async function listAction(request: Request, kv: KV, cfg: Config, now: Date, me: Person): Promise<Response> {
  const session = me === 'reader' ? await readerSession(request, cfg, now) : await adminSession(request, cfg, now);
  if (!session) return redirect(me === 'reader' ? cfg.base : `${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  // Throws on corrupt data, before anything is written.
  const { logs, settings } = await loadList(kv);
  const log = logs[me];
  const store = (next: ListLog) => kv.put(LIST_KEY[me], JSON.stringify(next));
  const { home } = listPaths(cfg, me);
  const at = now.toISOString();
  const id = field(form, 'id');
  const get = (name: string) => field(form, name);
  const cards = mergeList(logs, me, settings).boxes.flatMap((b) => b.cards);
  const card = cards.find((c) => c.id === id);
  const refuse = async (draft: ListDraft, error: string) =>
    (me === 'reader' && !(await doorOpen(request, cfg, now, session))
      ? redirect(`${cfg.base}/after-dark`)
      : renderList(kv, cfg, me, session, { draft, error }, 400));

  switch (field(form, 'do')) {
    case 'add': {
      const { draft, error } = parseCardForm(get);
      const tooMany = log.cards.length >= LIST_LIMITS.cardsPerPerson ? `The list holds ${LIST_LIMITS.cardsPerPerson} cards per person.` : undefined;
      if (error || tooMany) return refuse({ form: 'add', ...draft }, (error ?? tooMany)!);
      await store(addCard(log, { id: crypto.randomUUID(), ...draft, at }));
      return redirect(home);
    }
    case 'edit': {
      if (!card) return notFound();
      const { draft, error } = parseCardForm(get);
      if (error) return refuse({ form: 'edit', id, ...draft }, error);
      await store(editCard(log, { id, ...draft, at }));
      return redirect(`${home}?open=${id}`);
    }
    case 'delete': {
      if (card) await store(deleteCard(log, id));
      return redirect(home);
    }
    case 'comment': {
      if (!card) return notFound();
      const { text, error } = parseCommentForm(get);
      const tooMany = card.comments.length >= LIST_LIMITS.commentsPerCard ? `A card holds ${LIST_LIMITS.commentsPerCard} comments.` : undefined;
      if (error || tooMany) return refuse({ form: 'comment', id, title: '', text }, (error ?? tooMany)!);
      await store(addComment(log, { id: crypto.randomUUID(), card: id, text, at }));
      return redirect(`${home}?open=${id}`);
    }
    case 'uncomment': {
      const comment = log.comments.find((c) => c.id === id);
      if (!comment) return notFound();
      await store(removeComment(log, id));
      return redirect(`${home}?open=${comment.card}`);
    }
    case 'move': {
      const box = field(form, 'box');
      if (!card || (box !== NEW_BOX && !settings.boxes.some((b) => b.id === box))) return notFound();
      const index = Number.parseInt(field(form, 'index'), 10);
      await store(placeCard(log, id, box, Number.isNaN(index) ? Number.MAX_SAFE_INTEGER : index));
      return field(form, 'quiet') === '1' ? new Response(null, { status: 204, headers: PAGE_HEADERS }) : redirect(home);
    }
    case 'seen': {
      await store(markSeen(log, at));
      return field(form, 'quiet') === '1' ? new Response(null, { status: 204, headers: PAGE_HEADERS }) : redirect(home);
    }
    default:
      return notFound();
  }
}

async function showListSettings(request: Request, kv: KV, cfg: Config, now: Date, url: URL): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return html(adminLoginPage({ action: `${cfg.base}/admin/login` }));
  const msg = url.searchParams.get('msg') ?? '';
  const settings = await tryLoad(async () => parseSettings(await kv.get(LIST_SETTINGS_KEY)), 'list settings');
  return html(listSettingsPage({
    base: cfg.base,
    csrf: await csrfToken(session, cfg.secret),
    settings: settings ?? parseSettings(null),
    flash: Object.hasOwn(FLASH, msg) ? FLASH[msg] : undefined,
    error: settings ? undefined : 'Settings could not be read.',
  }));
}

async function listSettingsAction(request: Request, kv: KV, cfg: Config, now: Date): Promise<Response> {
  const session = await adminSession(request, cfg, now);
  if (!session) return redirect(`${cfg.base}/admin`);
  const form = await readForm(request);
  if (!(await verifyCsrf(field(form, 'csrf'), session, cfg.secret))) return html(errorPage(EXPIRED), 403);
  const current = parseSettings(await kv.get(LIST_SETTINGS_KEY));
  const { settings, error } = parseSettingsForm((name) => field(form, name), current, () => crypto.randomUUID());
  if (!settings) {
    return html(listSettingsPage({ base: cfg.base, csrf: await csrfToken(session, cfg.secret), settings: current, error }), 400);
  }
  await kv.put(LIST_SETTINGS_KEY, JSON.stringify(settings));
  return redirect(`${cfg.base}/admin/after-dark/list/settings?msg=saved`);
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
      case 'GET /after-dark': return await showAfterDark(request, kv, cfg, now, url);
      case 'POST /after-dark/enter': return await enterAfterDark(request, cfg, now);
      case 'POST /after-dark/leave': return leaveAfterDark(cfg);
      case 'POST /after-dark/reply': return await handleEntryReply(request, kv, cfg, now);
      case 'GET /admin/after-dark': return await showAfterDarkAdmin(request, kv, cfg, now, url);
      case 'GET /admin/after-dark/preview': return await showAfterDarkPreview(request, kv, cfg, now);
      case 'POST /admin/after-dark/save': return await afterDarkAction(request, env, cfg, now, 'save');
      case 'POST /admin/after-dark/delete': return await afterDarkAction(request, env, cfg, now, 'delete');
      case 'GET /after-dark/list': return await showList(request, kv, cfg, now, url, 'reader');
      case 'POST /after-dark/list/save': return await listAction(request, kv, cfg, now, 'reader');
      case 'GET /admin/after-dark/list': return await showList(request, kv, cfg, now, url, 'admin');
      case 'POST /admin/after-dark/list/save': return await listAction(request, kv, cfg, now, 'admin');
      case 'GET /admin/after-dark/list/settings': return await showListSettings(request, kv, cfg, now, url);
      case 'POST /admin/after-dark/list/settings': return await listSettingsAction(request, kv, cfg, now);
      case 'GET /event': return await showEvent(request, kv, cfg, now, url);
      case 'POST /event/save': return await handleEventSave(request, kv, cfg, now);
      case 'GET /admin/event': return await showEventAdmin(request, kv, cfg, now, url);
      case 'GET /admin/event/preview': return await showEventPreview(request, kv, cfg, now, url);
      case 'POST /admin/event/save': return await eventAdminAction(request, env, cfg, now, 'save');
      case 'POST /admin/event/photos': return await eventAdminAction(request, env, cfg, now, 'photos');
      case 'POST /admin/event/photos/delete': return await eventAdminAction(request, env, cfg, now, 'photo-delete');
      case 'POST /admin/event/clear': return await eventAdminAction(request, env, cfg, now, 'clear');
      case 'GET /gift': return await showGift(request, kv, cfg, now);
      case 'POST /gift/save': return await handleGiftSave(request, kv, cfg, now);
      case 'GET /admin/gift': return await showGiftAdmin(request, kv, cfg, now, url);
      case 'GET /admin/gift/preview': return await showGiftPreview(request, kv, cfg, now, url);
      case 'POST /admin/gift/save': return await giftAdminAction(request, env, cfg, now, 'save');
      case 'POST /admin/gift/photos': return await giftAdminAction(request, env, cfg, now, 'photos');
      case 'POST /admin/gift/photos/delete': return await giftAdminAction(request, env, cfg, now, 'photo-delete');
      case 'POST /admin/gift/book': return await giftAdminAction(request, env, cfg, now, 'book');
      case 'POST /admin/gift/unbook': return await giftAdminAction(request, env, cfg, now, 'unbook');
      case 'POST /admin/gift/clear': return await giftAdminAction(request, env, cfg, now, 'clear');
      case 'GET /reading-room': return await showReadingRoom(request, kv, cfg, now, url);
      case 'POST /reading-room/song-played': return await handleSongPlayed(request, kv, cfg, now);
      case 'POST /reading-room/album-seen': return await handleAlbumSeen(request, kv, cfg, now);
      case 'POST /admin/reading-room/song/save': return await keepsakeAction(request, env, cfg, now, 'song-save');
      case 'POST /admin/reading-room/song/delete': return await keepsakeAction(request, env, cfg, now, 'song-delete');
      case 'POST /admin/reading-room/photo/save': return await keepsakeAction(request, env, cfg, now, 'photo-save');
      case 'POST /admin/reading-room/photo/delete': return await keepsakeAction(request, env, cfg, now, 'photo-delete');
      case 'POST /admin/reading-room/photo/move': return await keepsakeAction(request, env, cfg, now, 'photo-move');
      case 'POST /reading-room/played': return await handlePlayed(request, kv, cfg, now);
      case 'POST /reading-room/reply': return await handleBookReply(request, kv, cfg, now);
      case 'GET /admin/reading-room': return await showReadingRoomAdmin(request, kv, cfg, now, url);
      case 'GET /admin/reading-room/preview': return await showReadingRoomPreview(request, kv, cfg, now, url);
      case 'POST /admin/reading-room/save': return await readingRoomAction(request, env, cfg, now, 'save');
      case 'POST /admin/reading-room/delete': return await readingRoomAction(request, env, cfg, now, 'delete');
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
