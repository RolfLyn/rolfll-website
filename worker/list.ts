export const LIST_LIMITS = { title: 100, text: 1000, comment: 1000, name: 40, cardsPerPerson: 200, commentsPerCard: 200 };
export const CARD_INVALID = `A card needs a title of up to ${LIST_LIMITS.title} characters and a description of up to ${LIST_LIMITS.text}.`;
export const COMMENT_INVALID = `A comment needs text of up to ${LIST_LIMITS.comment} characters.`;
export const SETTINGS_INVALID = `Every box and both names need text of up to ${LIST_LIMITS.name} characters, and at least one box must stay.`;

/** The pile a card is in until someone sorts it. It is not stored: a card with no placement is in New. */
export const NEW_BOX = 'new';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BOX_ID = /^[a-z0-9-]{1,40}$/;

export type Person = 'reader' | 'admin';

export interface ListCard {
  id: string;
  title: string;
  text: string;
  at: string;
}

export interface CardEdit {
  id: string;
  title: string;
  text: string;
  at: string;
}

export interface ListComment {
  id: string;
  card: string;
  text: string;
  at: string;
}

export interface Placed {
  card: string;
  box: string;
}

/**
 * Everything one person has done. Each person writes only their own log, so a stale read of one
 * log can never undo the other person's work; pages merge the two.
 */
export interface ListLog {
  cards: ListCard[];
  /** At most one per card: this person's latest edit. */
  edits: CardEdit[];
  comments: ListComment[];
  /** Ids of cards this person deleted. */
  gone: string[];
  /** This person's sorting; the order within a box is the ranking. */
  places: Placed[];
  /** When this person last looked; empty if never. */
  seen: string;
}

export const EMPTY_LOG: ListLog = { cards: [], edits: [], comments: [], gone: [], places: [], seen: '' };

export interface ListBox {
  id: string;
  name: string;
  /** Both choosing this box is not celebrated as a match. */
  noMatch?: boolean;
}

export interface ListSettings {
  boxes: ListBox[];
  readerName: string;
  adminName: string;
}

export const DEFAULT_SETTINGS: ListSettings = {
  boxes: [
    { id: 'have-to', name: 'Have to' },
    { id: 'yes-please', name: 'Yes please' },
    { id: 'curious', name: 'Curious' },
    { id: 'right-mood', name: 'In the right mood' },
    { id: 'just-a-fantasy', name: 'Just a fantasy' },
    { id: 'not-for-me', name: 'Not for me', noMatch: true },
  ],
  readerName: 'Her',
  adminName: 'Him',
};

const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isBoxId = (v: unknown): v is string => typeof v === 'string' && BOX_ID.test(v);
const isName = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= LIST_LIMITS.name;

function hasCardWords(c: Record<string, unknown>): boolean {
  return typeof c.title === 'string' && c.title.trim() !== '' && c.title.length <= LIST_LIMITS.title &&
    typeof c.text === 'string' && c.text.length <= LIST_LIMITS.text;
}

function isCard(value: unknown): value is ListCard {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return isId(c.id) && hasCardWords(c) && isTime(c.at);
}

function isComment(value: unknown): value is ListComment {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return isId(c.id) && isId(c.card) && typeof c.text === 'string' && c.text.trim() !== '' &&
    c.text.length <= LIST_LIMITS.comment && isTime(c.at);
}

function isPlaced(value: unknown): value is Placed {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return isId(p.card) && isBoxId(p.box);
}

export function parseLog(raw: string | null): ListLog {
  if (raw === null) return EMPTY_LOG;
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Stored list is invalid');
  const d = data as Record<string, unknown>;
  const ok = Array.isArray(d.cards) && d.cards.every(isCard) &&
    Array.isArray(d.edits) && d.edits.every(isCard) &&
    Array.isArray(d.comments) && d.comments.every(isComment) &&
    Array.isArray(d.gone) && d.gone.every(isId) &&
    Array.isArray(d.places) && d.places.every(isPlaced) &&
    typeof d.seen === 'string' && (d.seen === '' || isTime(d.seen));
  if (!ok) throw new Error('Stored list is invalid');
  return {
    cards: d.cards as ListCard[], edits: d.edits as CardEdit[], comments: d.comments as ListComment[],
    gone: d.gone as string[], places: d.places as Placed[], seen: d.seen as string,
  };
}

function isBox(value: unknown): value is ListBox {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return isBoxId(b.id) && b.id !== NEW_BOX && isName(b.name) && (b.noMatch === undefined || typeof b.noMatch === 'boolean');
}

export function parseSettings(raw: string | null): ListSettings {
  if (raw === null) return DEFAULT_SETTINGS;
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) throw new Error('Stored list settings are invalid');
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.boxes) || d.boxes.length === 0 || !d.boxes.every(isBox) || !isName(d.readerName) || !isName(d.adminName)) {
    throw new Error('Stored list settings are invalid');
  }
  return { boxes: d.boxes as ListBox[], readerName: d.readerName as string, adminName: d.adminName as string };
}

export function addCard(log: ListLog, card: ListCard): ListLog {
  return { ...log, cards: [...log.cards, card] };
}

export function editCard(log: ListLog, edit: CardEdit): ListLog {
  return { ...log, edits: [...log.edits.filter((e) => e.id !== edit.id), edit] };
}

export function deleteCard(log: ListLog, id: string): ListLog {
  return {
    ...log,
    cards: log.cards.filter((c) => c.id !== id),
    edits: log.edits.filter((e) => e.id !== id),
    comments: log.comments.filter((c) => c.card !== id),
    places: log.places.filter((p) => p.card !== id),
    gone: log.gone.includes(id) ? log.gone : [...log.gone, id],
  };
}

export function addComment(log: ListLog, comment: ListComment): ListLog {
  return { ...log, comments: [...log.comments, comment] };
}

/** Removes one of this person's comments; returns the same log when it is not theirs. */
export function removeComment(log: ListLog, id: string): ListLog {
  return log.comments.some((c) => c.id === id) ? { ...log, comments: log.comments.filter((c) => c.id !== id) } : log;
}

/** Puts a card at `index` among the cards already in `box`; New means no placement. */
export function placeCard(log: ListLog, card: string, box: string, index: number): ListLog {
  const rest = log.places.filter((p) => p.card !== card);
  if (box === NEW_BOX) return { ...log, places: rest };
  const inBox = rest.filter((p) => p.box === box);
  const target = Math.max(0, Math.min(index, inBox.length));
  const at = target < inBox.length ? rest.indexOf(inBox[target]) : rest.length;
  return { ...log, places: [...rest.slice(0, at), { card, box }, ...rest.slice(at)] };
}

export function markSeen(log: ListLog, at: string): ListLog {
  return { ...log, seen: at };
}

export interface ViewComment {
  id: string;
  text: string;
  at: string;
  author: Person;
}

export interface ViewCard {
  id: string;
  title: string;
  text: string;
  author: Person;
  edited: boolean;
  comments: ViewComment[];
  mine: string;
  theirs: string;
  match: boolean;
  /** The other person added, edited or commented on it since I last looked. */
  fresh: boolean;
}

export interface ViewBox {
  id: string;
  name: string;
  noMatch: boolean;
  cards: ViewCard[];
}

export interface ListView {
  boxes: ViewBox[];
  count: number;
  fresh: boolean;
}

export function otherPerson(me: Person): Person {
  return me === 'reader' ? 'admin' : 'reader';
}

export function mergeList(logs: Record<Person, ListLog>, me: Person, settings: ListSettings): ListView {
  const other = otherPerson(me);
  const gone = new Set([...logs.reader.gone, ...logs.admin.gone]);
  const known = new Set(settings.boxes.map((b) => b.id));
  const boxOf = (who: Person, id: string) => {
    const box = logs[who].places.find((p) => p.card === id)?.box;
    return box && known.has(box) ? box : NEW_BOX;
  };
  const noMatch = new Set(settings.boxes.filter((b) => b.noMatch).map((b) => b.id));
  const comments = ([['reader', logs.reader.comments], ['admin', logs.admin.comments]] as const)
    .flatMap(([author, list]) => list.map((c) => ({ ...c, author })))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const edits = [...logs.reader.edits, ...logs.admin.edits].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const seen = logs[me].seen === '' ? -Infinity : Date.parse(logs[me].seen);
  const isNews = (at: string) => Date.parse(at) > seen;

  const cards = ([['reader', logs.reader.cards], ['admin', logs.admin.cards]] as const)
    .flatMap(([author, list]) => list.map((c) => ({ card: c, author })))
    .filter(({ card }) => !gone.has(card.id))
    .sort((a, b) => Date.parse(b.card.at) - Date.parse(a.card.at))
    .map(({ card, author }): ViewCard => {
      const edit = edits.find((e) => e.id === card.id);
      const mine = boxOf(me, card.id);
      const theirs = boxOf(other, card.id);
      const talk = comments.filter((c) => c.card === card.id);
      return {
        id: card.id,
        title: edit?.title ?? card.title,
        text: edit?.text ?? card.text,
        author,
        edited: Boolean(edit),
        comments: talk.map((c) => ({ id: c.id, text: c.text, at: c.at, author: c.author })),
        mine,
        theirs,
        match: mine === theirs && mine !== NEW_BOX && !noMatch.has(mine),
        fresh: (author === other && isNews(card.at)) ||
          logs[other].edits.some((e) => e.id === card.id && isNews(e.at)) ||
          talk.some((c) => c.author === other && isNews(c.at)),
      };
    });

  const rank = new Map(logs[me].places.map((p, i) => [p.card, i]));
  const boxes: ViewBox[] = [
    { id: NEW_BOX, name: 'New', noMatch: true, cards: cards.filter((c) => c.mine === NEW_BOX) },
    ...settings.boxes.map((b) => ({
      id: b.id,
      name: b.name,
      noMatch: Boolean(b.noMatch),
      cards: cards.filter((c) => c.mine === b.id).sort((x, y) => (rank.get(x.id) ?? 0) - (rank.get(y.id) ?? 0)),
    })),
  ];
  return { boxes, count: cards.length, fresh: cards.some((c) => c.fresh) };
}

export interface CardDraft {
  title: string;
  text: string;
}

export function parseCardForm(get: (name: string) => string): { draft: CardDraft; error?: string } {
  const draft: CardDraft = { title: get('title').trim(), text: get('text').replace(/\r\n?/g, '\n').trim() };
  const ok = draft.title !== '' && draft.title.length <= LIST_LIMITS.title && draft.text.length <= LIST_LIMITS.text;
  return ok ? { draft } : { draft, error: CARD_INVALID };
}

export function parseCommentForm(get: (name: string) => string): { text: string; error?: string } {
  const text = get('text').replace(/\r\n?/g, '\n').trim();
  return text !== '' && text.length <= LIST_LIMITS.comment ? { text } : { text, error: COMMENT_INVALID };
}

/** Each existing box has a `box_<id>` field (empty removes it); `new_box` adds one before any no-match box. */
export function parseSettingsForm(
  get: (name: string) => string, current: ListSettings, newId: () => string,
): { settings?: ListSettings; error?: string } {
  const readerName = get('reader_name').trim();
  const adminName = get('admin_name').trim();
  const kept: ListBox[] = current.boxes
    .map((b) => ({ ...b, name: get(`box_${b.id}`).trim() }))
    .filter((b) => b.name !== '');
  const added = get('new_box').trim();
  if (added) {
    const at = kept.findIndex((b) => b.noMatch);
    kept.splice(at === -1 ? kept.length : at, 0, { id: newId(), name: added });
  }
  const ok = kept.length > 0 && kept.every((b) => isName(b.name)) && isName(readerName) && isName(adminName);
  return ok ? { settings: { boxes: kept, readerName, adminName } } : { error: SETTINGS_INVALID };
}
