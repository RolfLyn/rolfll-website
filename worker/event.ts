import { Problem, isObject, text, id as checkId, date, list } from './json-checks';

// A special event: a house of doors that open on their dates, with dishes to pick behind them,
// and an optional card to pick a few things from. The event is written as JSON in admin.

export const EVENT_LIMITS = {
  id: 40, title: 80, paragraph: 600, line: 300, label: 60, dishTitle: 80, dishText: 300, buy: 120,
  buyItems: 40, doors: 12, dishes: 8, intro: 6, credits: 40, credit: 300, photoName: 120,
};

/** `credit` names the photo's author and licence; it shows only once the dish can be seen. */
export interface EventDish { id: string; title: string; text: string; photo?: string; credit?: string; buy?: string[] }
export interface EventDoor {
  id: string; label: string; heading: string; opens: string; opensLabel: string;
  doorway?: string; line?: string; dishes?: EventDish[];
}
export interface EventCard { title: string; prompt: string; pick: number; opens: string; opensLabel?: string; dishes: EventDish[] }
export interface SpecialEvent {
  id: string; title: string; intro: string[]; closing?: string; from: string; until: string;
  doors: EventDoor[]; card?: EventCard; credits?: string[];
}
export interface EventPhoto { key: string; name: string }
export interface Choice { dish: string; at: string }
export interface EventPicks {
  event: string;
  /** Door id to the time she first opened it. */
  opened: Record<string, string>;
  doors: Record<string, Choice>;
  card: Choice[];
}

export interface ReaderDish { id: string; title: string; text: string; photoKey?: string }
export type ReaderDoor =
  | { id: string; label: string; heading: string; opensLabel: string; locked: true }
  | { id: string; label: string; heading: string; locked: false; opened: boolean; doorway?: string; line?: string; dishes: ReaderDish[]; picked?: string };
export type ReaderCard =
  | { title: string; prompt: string; opensLabel?: string; locked: true }
  | { title: string; prompt: string; pick: number; locked: false; dishes: ReaderDish[]; picked: string[] };
export interface ReaderEvent {
  id: string; title: string; intro: string[]; closing?: string; doors: ReaderDoor[]; card?: ReaderCard; credits: string[];
}

export const EMPTY_PICKS = (eventId: string): EventPicks => ({ event: eventId, opened: {}, doors: {}, card: [] });

const id = (v: unknown, where: string): string => checkId(v, where, EVENT_LIMITS.id);

function dishes(v: unknown, where: string, names: Set<string>): EventDish[] {
  const seen = new Set<string>();
  return list(v, EVENT_LIMITS.dishes, `${where} dishes`).map((raw, i) => {
    if (!isObject(raw)) throw new Problem(`${where} dish ${i + 1} must be an object.`);
    const dishId = id(raw.id, `${where} dish ${i + 1}`);
    const at = `${where} dish "${dishId}"`;
    if (seen.has(dishId)) throw new Problem(`${where} has two dishes with id "${dishId}".`);
    seen.add(dishId);
    const dish: EventDish = {
      id: dishId,
      title: text(raw.title, EVENT_LIMITS.dishTitle, `${at} title`)!,
      text: text(raw.text, EVENT_LIMITS.dishText, `${at} text`)!,
    };
    if (raw.photo !== undefined) {
      const photo = text(raw.photo, EVENT_LIMITS.photoName, `${at} photo`)!;
      if (!names.has(photo)) throw new Problem(`${at} uses photo "${photo}", which hasn't been uploaded.`);
      dish.photo = photo;
    }
    const credit = text(raw.credit, EVENT_LIMITS.credit, `${at} credit`, true);
    if (credit !== undefined) dish.credit = credit;
    if (raw.buy !== undefined) {
      dish.buy = list(raw.buy, EVENT_LIMITS.buyItems, `${at} buy`).map((b, j) => text(b, EVENT_LIMITS.buy, `${at} buy item ${j + 1}`)!);
    }
    return dish;
  });
}

function build(raw: unknown, photos: EventPhoto[]): SpecialEvent {
  if (!isObject(raw)) throw new Problem('The event must be a JSON object.');
  const names = new Set(photos.map((p) => p.name));
  const event: SpecialEvent = {
    id: id(raw.id, 'The event'),
    title: text(raw.title, EVENT_LIMITS.title, 'The title')!,
    intro: list(raw.intro, EVENT_LIMITS.intro, 'The intro').map((p, i) => text(p, EVENT_LIMITS.paragraph, `Intro paragraph ${i + 1}`)!),
    from: date(raw.from, '"from"'),
    until: date(raw.until, '"until"'),
    doors: [],
  };
  const closing = text(raw.closing, EVENT_LIMITS.line, 'The closing line', true);
  if (closing !== undefined) event.closing = closing;
  if (event.until < event.from) throw new Problem('"until" comes before "from".');
  const doorIds = new Set<string>();
  const doors = list(raw.doors, EVENT_LIMITS.doors, 'The doors');
  if (doors.length === 0) throw new Problem('The event needs at least one door.');
  event.doors = doors.map((d, i) => {
    if (!isObject(d)) throw new Problem(`Door ${i + 1} must be an object.`);
    const doorId = id(d.id, `Door ${i + 1}`);
    const at = `Door "${doorId}"`;
    if (doorIds.has(doorId)) throw new Problem(`Two doors have id "${doorId}".`);
    doorIds.add(doorId);
    const door: EventDoor = {
      id: doorId,
      label: text(d.label, EVENT_LIMITS.label, `${at} label`)!,
      heading: text(d.heading, EVENT_LIMITS.title, `${at} heading`)!,
      opens: date(d.opens, `${at} "opens"`),
      opensLabel: text(d.opensLabel, EVENT_LIMITS.label, `${at} opensLabel`)!,
    };
    const doorway = text(d.doorway, EVENT_LIMITS.label, `${at} doorway`, true);
    const line = text(d.line, EVENT_LIMITS.line, `${at} line`, true);
    if (doorway !== undefined) door.doorway = doorway;
    if (line !== undefined) door.line = line;
    if (d.dishes !== undefined) door.dishes = dishes(d.dishes, at, names);
    if (!door.line && !door.dishes?.length) throw new Problem(`${at} needs dishes or a line.`);
    return door;
  });
  if (raw.card !== undefined) {
    const c = raw.card;
    if (!isObject(c)) throw new Problem('The card must be an object.');
    const card: EventCard = {
      title: text(c.title, EVENT_LIMITS.title, 'The card title')!,
      prompt: text(c.prompt, EVENT_LIMITS.label, 'The card prompt')!,
      pick: 0,
      opens: date(c.opens, 'The card "opens"'),
      dishes: dishes(c.dishes, 'The card', names),
    };
    const opensLabel = text(c.opensLabel, EVENT_LIMITS.label, 'The card opensLabel', true);
    if (opensLabel !== undefined) card.opensLabel = opensLabel;
    if (typeof c.pick !== 'number' || !Number.isInteger(c.pick) || c.pick < 1 || c.pick > card.dishes.length) {
      throw new Problem(`The card "pick" must be a whole number from 1 to ${card.dishes.length}.`);
    }
    card.pick = c.pick;
    event.card = card;
  }
  if (raw.credits !== undefined) {
    event.credits = list(raw.credits, EVENT_LIMITS.credits, 'The credits').map((c, i) => text(c, EVENT_LIMITS.credit, `Credit ${i + 1}`)!);
  }
  return event;
}

export function checkEvent(source: string, photos: EventPhoto[]): { ok: true; event: SpecialEvent } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    return { ok: false, error: `That isn't valid JSON: ${(e as Error).message}` };
  }
  try {
    return { ok: true, event: build(raw, photos) };
  } catch (e) {
    if (e instanceof Problem) return { ok: false, error: e.message };
    throw e;
  }
}

/** The saved event, or null when there is none. Throws when the stored text is corrupt. */
export function parseStoredEvent(raw: string | null): SpecialEvent | null {
  if (raw === null) return null;
  const data: unknown = JSON.parse(raw);
  return build(data, namesFrom(data));
}

// Stored events were checked on save against the uploaded photos; reading back trusts their photo names.
function namesFrom(raw: unknown): EventPhoto[] {
  const names: EventPhoto[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isObject(v)) {
      if (typeof v.photo === 'string') names.push({ key: '', name: v.photo });
      Object.values(v).forEach(walk);
    }
  };
  walk(raw);
  return names;
}

export function parsePhotos(raw: string | null): EventPhoto[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('event photos are not a list');
  return data.filter((p): p is EventPhoto => isObject(p) && typeof p.key === 'string' && typeof p.name === 'string')
    .map((p) => ({ key: p.key, name: p.name }));
}

const isChoice = (c: unknown): c is Choice => isObject(c) && typeof c.dish === 'string' && typeof c.at === 'string';

/** Her picks for this event. Picks saved for another event start over. Throws when the text is corrupt. */
export function parsePicks(raw: string | null, eventId: string): EventPicks {
  if (raw === null) return EMPTY_PICKS(eventId);
  const data: unknown = JSON.parse(raw);
  if (!isObject(data) || data.event !== eventId) return EMPTY_PICKS(eventId);
  const picks = EMPTY_PICKS(eventId);
  if (isObject(data.opened)) {
    for (const [k, v] of Object.entries(data.opened)) if (typeof v === 'string') picks.opened[k] = v;
  }
  if (isObject(data.doors)) {
    for (const [k, v] of Object.entries(data.doors)) if (isChoice(v)) picks.doors[k] = { dish: v.dish, at: v.at };
  }
  if (Array.isArray(data.card)) picks.card = data.card.filter(isChoice).map((c) => ({ dish: c.dish, at: c.at }));
  return picks;
}

export function openDoor(picks: EventPicks, doorId: string, at: string): EventPicks {
  if (picks.opened[doorId]) return picks;
  return { ...picks, opened: { ...picks.opened, [doorId]: at } };
}

export function pickDish(picks: EventPicks, doorId: string, dishId: string, at: string): EventPicks {
  return { ...picks, doors: { ...picks.doors, [doorId]: { dish: dishId, at } } };
}

/** A second tap takes it back; going past the limit lets go of her oldest choice. */
export function toggleCardItem(picks: EventPicks, dishId: string, limit: number, at: string): EventPicks {
  if (picks.card.some((c) => c.dish === dishId)) return { ...picks, card: picks.card.filter((c) => c.dish !== dishId) };
  return { ...picks, card: [...picks.card, { dish: dishId, at }].slice(-limit) };
}

export const isOpen = (opens: string, today: string): boolean => opens <= today;
export const isShowing = (event: SpecialEvent, today: string): boolean => event.from <= today && today <= event.until;

function readerDishes(list: EventDish[] | undefined, photos: EventPhoto[]): ReaderDish[] {
  return (list ?? []).map((d) => {
    const dish: ReaderDish = { id: d.id, title: d.title, text: d.text };
    const key = d.photo && photos.find((p) => p.name === d.photo)?.key;
    if (key) dish.photoKey = key;
    return dish;
  });
}

/** Everything the reader page may show, and nothing else: no shopping lists, nothing behind a locked door. */
export function readerEvent(event: SpecialEvent, picks: EventPicks, photos: EventPhoto[], today: string): ReaderEvent {
  const doors = event.doors.map((d): ReaderDoor => {
    if (!isOpen(d.opens, today)) return { id: d.id, label: d.label, heading: d.heading, opensLabel: d.opensLabel, locked: true };
    const door: ReaderDoor = {
      id: d.id, label: d.label, heading: d.heading, locked: false, opened: Boolean(picks.opened[d.id]),
      dishes: readerDishes(d.dishes, photos),
    };
    if (d.doorway) door.doorway = d.doorway;
    if (d.line) door.line = d.line;
    const picked = picks.doors[d.id]?.dish;
    if (picked && door.dishes.some((x) => x.id === picked)) door.picked = picked;
    return door;
  });
  // Credits name the dishes, so a dish's credit waits behind its door like the dish itself.
  const seen = [
    ...event.doors.filter((d) => isOpen(d.opens, today)).flatMap((d) => d.dishes ?? []),
    ...(event.card && isOpen(event.card.opens, today) ? event.card.dishes : []),
  ];
  const credits = [...(event.credits ?? []), ...seen.flatMap((d) => (d.credit ? [d.credit] : []))];
  const view: ReaderEvent = { id: event.id, title: event.title, intro: event.intro, doors, credits };
  if (event.closing) view.closing = event.closing;
  const c = event.card;
  if (c) {
    if (!isOpen(c.opens, today)) {
      view.card = { title: c.title, prompt: c.prompt, locked: true };
      if (c.opensLabel) view.card.opensLabel = c.opensLabel;
    } else {
      const known = picks.card.filter((p) => c.dishes.some((d) => d.id === p.dish)).map((p) => p.dish);
      view.card = { title: c.title, prompt: c.prompt, pick: c.pick, locked: false, dishes: readerDishes(c.dishes, photos), picked: known.slice(-c.pick) };
    }
  }
  return view;
}

export function hasWaiting(view: ReaderEvent): boolean {
  if (view.doors.some((d) => !d.locked && !d.opened)) return true;
  return Boolean(view.card && !view.card.locked && view.card.picked.length < view.card.pick);
}

/** The photos her session may load today. */
export function openPhotoKeys(event: SpecialEvent, photos: EventPhoto[], today: string): string[] {
  const view = readerEvent(event, EMPTY_PICKS(event.id), photos, today);
  const keys = view.doors.flatMap((d) => (d.locked ? [] : d.dishes.flatMap((x) => (x.photoKey ? [x.photoKey] : []))));
  if (view.card && !view.card.locked) keys.push(...view.card.dishes.flatMap((x) => (x.photoKey ? [x.photoKey] : [])));
  return keys;
}

export function allDishes(event: SpecialEvent): EventDish[] {
  return [...event.doors.flatMap((d) => d.dishes ?? []), ...(event.card?.dishes ?? [])];
}

export function photoNamesInUse(event: SpecialEvent): string[] {
  return [...new Set(allDishes(event).flatMap((d) => (d.photo ? [d.photo] : [])))];
}
