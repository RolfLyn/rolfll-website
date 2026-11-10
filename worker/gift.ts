import { Problem, isObject, text, id as checkId, date, list } from './json-checks';
import type { EventPhoto } from './event';

// A gift: a box she unwraps, a few screens that reveal what is inside, and a day she picks from his list.
// He books it after she picks, and marks it booked in admin. The gift is written as JSON in admin.

export const GIFT_LIMITS = {
  id: 40, title: 120, kicker: 40, heading: 120, text: 600, tag: 30, next: 40, line: 200, name: 20,
  days: 8, reveals: 6, photos: 2, summary: 4, credits: 6, credit: 300, photoName: 120, bookingLines: 4, bookingLine: 160,
};

export interface GiftReveal { kicker: string; heading: string; text: string; photos: string[]; next: string }
export interface GiftDay { id: string; name: string; heading: string }
export interface Gift {
  id: string; title: string; from: string; until: string;
  box: { kicker: string; heading: string; tag: string };
  reveals: GiftReveal[];
  pick: { kicker: string; heading: string; text: string };
  days: GiftDay[];
  chosenLine: string; summary: string[]; pendingLine: string; bookedLine: string;
  credits?: string[];
}
export interface DayPick { day: string; at: string }
export interface GiftState {
  giftId: string;
  unwrapped?: string;
  pick?: DayPick;
  history: DayPick[];
  booked?: { day: string; lines: string[]; at: string };
  bookedSeen?: string;
}
export type GiftStage = 'box' | 'pick' | 'chosen' | 'booked';
export interface ReaderDay extends GiftDay { num: string; weekday: string; month: string; open: boolean }
export interface ReaderGift {
  title: string;
  box: Gift['box'];
  reveals: (Omit<GiftReveal, 'photos'> & { photoKeys: string[] })[];
  pick: Gift['pick'];
  days: ReaderDay[];
  chosenLine: string; summary: string[]; pendingLine: string; bookedLine: string;
  credits: string[];
  stage: GiftStage;
  chosen?: GiftDay;
  booking?: string[];
}

export const emptyGiftState = (giftId: string): GiftState => ({ giftId, history: [] });

const L = GIFT_LIMITS;
const words = (v: unknown, max: number, where: string) => text(v, max, where)!;

function section<T>(v: unknown, where: string, read: (o: Record<string, unknown>) => T): T {
  if (!isObject(v)) throw new Problem(`${where} must be an object.`);
  return read(v);
}

function build(raw: unknown, names: Set<string> | null): Gift {
  if (!isObject(raw)) throw new Problem('The gift must be a JSON object.');
  const reveals = list(raw.reveals, L.reveals, 'The reveals').map((r, i) => section(r, `Reveal ${i + 1}`, (o) => {
    const at = `Reveal ${i + 1}`;
    const photos = list(o.photos ?? [], L.photos, `${at} photos`).map((p, j) => {
      const name = words(p, L.photoName, `${at} photo ${j + 1}`);
      if (names && !names.has(name)) throw new Problem(`${at} uses photo "${name}", which hasn't been uploaded.`);
      return name;
    });
    return {
      kicker: words(o.kicker, L.kicker, `${at} kicker`), heading: words(o.heading, L.heading, `${at} heading`),
      text: words(o.text, L.text, `${at} text`), photos, next: words(o.next, L.next, `${at} "next"`),
    };
  }));
  if (reveals.length === 0) throw new Problem('The gift needs at least one reveal.');
  const seen = new Set<string>();
  const days = list(raw.days, L.days, 'The days').map((d, i) => section(d, `Day ${i + 1}`, (o) => {
    const dayId = date(o.id, `Day ${i + 1} id`);
    if (seen.has(dayId)) throw new Problem(`There are two days with id "${dayId}".`);
    seen.add(dayId);
    return { id: dayId, name: words(o.name, L.name, `Day "${dayId}" name`), heading: words(o.heading, L.heading, `Day "${dayId}" heading`) };
  }));
  if (days.length === 0) throw new Problem('The gift needs at least one day to pick.');
  const gift: Gift = {
    id: checkId(raw.id, 'The gift', L.id),
    title: words(raw.title, L.title, 'The title'),
    from: date(raw.from, '"from"'),
    until: date(raw.until, '"until"'),
    box: section(raw.box, 'The box', (o) => ({
      kicker: words(o.kicker, L.kicker, 'The box kicker'), heading: words(o.heading, L.heading, 'The box heading'),
      tag: words(o.tag, L.tag, 'The box tag'),
    })),
    reveals,
    pick: section(raw.pick, 'The pick', (o) => ({
      kicker: words(o.kicker, L.kicker, 'The pick kicker'), heading: words(o.heading, L.heading, 'The pick heading'),
      text: words(o.text, L.line, 'The pick text'),
    })),
    days,
    chosenLine: words(raw.chosenLine, L.line, 'chosenLine'),
    summary: list(raw.summary, L.summary, 'The summary').map((s, i) => words(s, L.line, `Summary line ${i + 1}`)),
    pendingLine: words(raw.pendingLine, L.line, 'pendingLine'),
    bookedLine: words(raw.bookedLine, L.line, 'bookedLine'),
  };
  if (gift.until < gift.from) throw new Problem('"until" comes before "from".');
  const last = [...days].map((d) => d.id).sort().at(-1)!;
  if (gift.until < last) throw new Problem(`"until" must be on or after the last day (${last}), so the booked page is still there on the day.`);
  if (raw.credits !== undefined) {
    gift.credits = list(raw.credits, L.credits, 'The credits').map((c, i) => words(c, L.credit, `Credit ${i + 1}`));
  }
  return gift;
}

export function checkGift(source: string, photos: EventPhoto[], state: GiftState | null):
  { ok: true; gift: Gift } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    return { ok: false, error: `That isn't valid JSON: ${(e as Error).message}` };
  }
  let gift: Gift;
  try {
    gift = build(raw, new Set(photos.map((p) => p.name)));
  } catch (e) {
    if (e instanceof Problem) return { ok: false, error: e.message };
    throw e;
  }
  const mine = state?.pick ? state : null;
  if (mine && (gift.id !== mine.giftId || !gift.days.some((d) => d.id === mine.pick!.day))) {
    return { ok: false, error: `She has picked ${mine.pick!.day}. This change would lose that, so clear her pick first.` };
  }
  return { ok: true, gift };
}

/** The saved gift, or null when there is none. Throws when the stored text is corrupt. */
export function parseStoredGift(raw: string | null): Gift | null {
  if (raw === null) return null;
  return build(JSON.parse(raw), null);
}

const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isPick = (v: unknown): v is DayPick => isObject(v) && typeof v.day === 'string' && isTime(v.at);

/** Her side of this gift. State saved for another gift starts over. Throws when the text is corrupt. */
export function parseGiftState(raw: string | null, giftId: string): GiftState {
  if (raw === null) return emptyGiftState(giftId);
  const data: unknown = JSON.parse(raw);
  if (!isObject(data)) throw new Error('The gift state is not an object');
  if (data.giftId !== giftId) return emptyGiftState(giftId);
  const state = emptyGiftState(giftId);
  if (isTime(data.unwrapped)) state.unwrapped = data.unwrapped;
  if (isPick(data.pick)) state.pick = { day: data.pick.day, at: data.pick.at };
  if (Array.isArray(data.history)) state.history = data.history.filter(isPick).map((p) => ({ day: p.day, at: p.at }));
  if (isTime(data.bookedSeen)) state.bookedSeen = data.bookedSeen;
  return state;
}

/** His booking, kept in its own record so her saves and his can never overwrite each other. Throws when corrupt. */
export function parseGiftBooking(raw: string | null, giftId: string): GiftState['booked'] {
  if (raw === null) return undefined;
  const b: unknown = JSON.parse(raw);
  if (!isObject(b)) throw new Error('The gift booking is not an object');
  if (b.giftId !== giftId || typeof b.day !== 'string' || !isTime(b.at) || !Array.isArray(b.lines) || !b.lines.every((l) => typeof l === 'string')) return undefined;
  return { day: b.day, lines: [...b.lines], at: b.at };
}

/** What her record holds: everything but his booking. */
export function herSide(s: GiftState): string {
  const { booked: _, ...rest } = s;
  return JSON.stringify(rest);
}

/** What the booking record holds. */
export function bookingRecord(giftId: string, booked: GiftState['booked']): string {
  return JSON.stringify(booked ? { giftId, ...booked } : { giftId });
}

export function unwrapGift(s: GiftState, at: string): GiftState {
  return s.unwrapped ? s : { ...s, unwrapped: at };
}

/** Null when refused: a day not on his list, a day not after today, or a gift already booked. */
export function pickGiftDay(s: GiftState, gift: Gift, day: string, today: string, at: string): GiftState | null {
  if (s.booked || !gift.days.some((d) => d.id === day) || day <= today) return null;
  const pick = { day, at };
  return { ...s, unwrapped: s.unwrapped ?? at, pick, history: [...s.history, pick] };
}

export function parseBookingLines(source: string): { lines: string[] } | { error: string } {
  const lines = source.split(/\r\n?|\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: 'Write at least one line about the booking.' };
  if (lines.length > L.bookingLines) return { error: `At most ${L.bookingLines} lines.` };
  if (lines.some((l) => l.length > L.bookingLine)) return { error: `Each line can be up to ${L.bookingLine} characters.` };
  return { lines };
}

/** Null unless `day` is the day she has picked now, so a stale admin page can never book the wrong day. */
export function markBooked(s: GiftState, day: string, lines: string[], at: string): GiftState | null {
  if (!s.pick || s.pick.day !== day) return null;
  const when = s.booked && s.booked.day === day ? s.booked.at : at;
  return { ...s, booked: { day, lines, at: when } };
}

export function undoBooked(s: GiftState): GiftState {
  const { booked: _, ...rest } = s;
  return rest;
}

export function seeBooked(s: GiftState, at: string): GiftState {
  return { ...s, bookedSeen: at };
}

export const isGiftShowing = (gift: Gift, today: string): boolean => gift.from <= today && today <= gift.until;

const chosenDay = (gift: Gift, s: GiftState) => (s.pick ? gift.days.find((d) => d.id === s.pick!.day) : undefined);
const isBooked = (gift: Gift, s: GiftState) => Boolean(s.booked && chosenDay(gift, s) && s.booked.day === s.pick!.day);

export function giftStage(gift: Gift, s: GiftState): GiftStage {
  if (chosenDay(gift, s)) return isBooked(gift, s) ? 'booked' : 'chosen';
  return s.unwrapped ? 'pick' : 'box';
}

export function giftWaiting(gift: Gift, s: GiftState): boolean {
  if (!s.unwrapped) return true;
  return isBooked(gift, s) && !(s.bookedSeen && s.bookedSeen >= s.booked!.at);
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const keyFor = (name: string, photos: EventPhoto[]) => photos.find((p) => p.name === name)?.key;

/** Everything her page may show, and nothing else: no history, no booking that is not hers yet. */
export function readerGift(gift: Gift, s: GiftState, photos: EventPhoto[], today: string): ReaderGift {
  const view: ReaderGift = {
    title: gift.title, box: gift.box, pick: gift.pick,
    reveals: gift.reveals.map((r) => ({
      kicker: r.kicker, heading: r.heading, text: r.text, next: r.next,
      photoKeys: r.photos.flatMap((n) => { const k = keyFor(n, photos); return k ? [k] : []; }),
    })),
    days: gift.days.map((d) => {
      const at = new Date(`${d.id}T00:00:00Z`);
      return { ...d, num: String(at.getUTCDate()), weekday: WEEKDAYS[at.getUTCDay()], month: MONTHS[at.getUTCMonth()], open: d.id > today };
    }),
    chosenLine: gift.chosenLine, summary: gift.summary, pendingLine: gift.pendingLine, bookedLine: gift.bookedLine,
    credits: gift.credits ?? [],
    stage: giftStage(gift, s),
  };
  const chosen = chosenDay(gift, s);
  if (chosen) view.chosen = chosen;
  if (isBooked(gift, s)) view.booking = s.booked!.lines;
  return view;
}

export function giftPhotoNames(gift: Gift): string[] {
  return [...new Set(gift.reveals.flatMap((r) => r.photos))];
}

export function giftPhotoKeys(gift: Gift, photos: EventPhoto[]): string[] {
  return giftPhotoNames(gift).flatMap((n) => { const k = keyFor(n, photos); return k ? [k] : []; });
}
