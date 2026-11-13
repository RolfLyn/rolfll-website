// "Our future home": she scores pictures of houses, rooms, gardens and furniture from 1 to 10,
// and the site shows her dream home, the words she is drawn to and her favourites.
// His side (the pictures) and her side (scores, progress) live in separate keys so neither overwrites the other.

export type HomeGroup = 'houses' | 'rooms' | 'gardens' | 'furniture';
export const GROUPS: { id: HomeGroup; name: string }[] = [
  { id: 'houses', name: 'Houses' },
  { id: 'rooms', name: 'Rooms' },
  { id: 'gardens', name: 'Gardens' },
  { id: 'furniture', name: 'Furniture' },
];
export const HOME_LIMITS = { pictures: 300, title: 80, tags: 8, tag: 30, credit: 200 };

export interface HomePicture { id: string; group: HomeGroup; title: string; tags: string[]; credit: string; file: string; added: string }
export interface Home { on: boolean; pictures: HomePicture[] }
export type HomeScores = Record<string, { score: number; at: string }>;
export interface HomeProgress { finishedAt?: string }
/** A finished round, kept as it was: its pictures and her scores for them. Never changed after it is saved. */
export interface HomeRound { finishedAt?: string; pictures: HomePicture[]; scores: HomeScores }
export interface Scored extends HomePicture { score: number; at: string }
export interface HomeResults {
  ready: boolean;
  dream: { house?: Scored; room?: Scored; garden?: Scored };
  words: string[];
  favourites: Record<HomeGroup, Scored[]>;
}
export type PictureFields = Pick<HomePicture, 'group' | 'title' | 'tags' | 'credit'>;

const WORDS = ['not for me', 'not for me', 'not really', 'not really', "it's nice", "it's nice", 'really like it', 'really like it', 'love it', 'my dream'];
const LOVED = 8;
const FAVOURITE = 7;
const MIN_LOVED_FOR_WORD = 3;
const MAX_WORDS = 6;

const isTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isGroup = (g: unknown): g is HomeGroup => GROUPS.some((x) => x.id === g);
const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10;

function isPicture(v: unknown): v is HomePicture {
  return isRecord(v) && typeof v.id === 'string' && v.id !== '' && isGroup(v.group) &&
    typeof v.title === 'string' && typeof v.credit === 'string' && typeof v.file === 'string' && v.file !== '' &&
    Array.isArray(v.tags) && v.tags.every((t) => typeof t === 'string') && isTime(v.added);
}

export function parseHome(raw: string | null): Home {
  if (raw === null) return { on: false, pictures: [] };
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || typeof data.on !== 'boolean' || !Array.isArray(data.pictures) || !data.pictures.every(isPicture)) {
    throw new Error('Stored home pictures are invalid');
  }
  if (new Set(data.pictures.map((p) => p.id)).size !== data.pictures.length) throw new Error('Stored home pictures repeat an id');
  return {
    on: data.on,
    pictures: data.pictures.map((p) => ({ id: p.id, group: p.group, title: p.title, tags: [...p.tags], credit: p.credit, file: p.file, added: p.added })),
  };
}

export function parseHomeScores(raw: string | null): HomeScores {
  return raw === null ? {} : checkScores(JSON.parse(raw));
}

function checkScores(data: unknown): HomeScores {
  if (!isRecord(data)) throw new Error('Stored home scores are invalid');
  const out: HomeScores = {};
  for (const [id, v] of Object.entries(data)) {
    if (!isRecord(v) || !isScore(v.score) || !isTime(v.at)) throw new Error('Stored home scores are invalid');
    out[id] = { score: v.score, at: v.at };
  }
  return out;
}

export function parseHomeRounds(raw: string | null): HomeRound[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored home rounds are invalid');
  return data.map((r: unknown) => {
    if (!isRecord(r) || !Array.isArray(r.pictures) || !r.pictures.every(isPicture) || (r.finishedAt !== undefined && !isTime(r.finishedAt))) {
      throw new Error('Stored home rounds are invalid');
    }
    const round: HomeRound = { pictures: parseHome(JSON.stringify({ on: false, pictures: r.pictures })).pictures, scores: checkScores(r.scores) };
    return r.finishedAt === undefined ? round : { finishedAt: r.finishedAt, ...round };
  });
}

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const roundName = (n: number) => `Round ${NUMBERS[n - 1] ?? n}`;

/** Saves the current pictures and her scores for them as a finished round, and empties the list with the banner off.
 *  Null when there is nothing to save. */
export function archiveRound(home: Home, scores: HomeScores, progress: HomeProgress, rounds: HomeRound[]):
  { rounds: HomeRound[]; home: Home } | null {
  if (home.pictures.length === 0) return null;
  const kept: HomeScores = {};
  for (const p of home.pictures) if (Object.hasOwn(scores, p.id)) kept[p.id] = scores[p.id];
  const round: HomeRound = { pictures: home.pictures, scores: kept };
  return {
    rounds: [...rounds, progress.finishedAt ? { finishedAt: progress.finishedAt, ...round } : round],
    home: { on: false, pictures: [] },
  };
}

export function parseHomeProgress(raw: string | null): HomeProgress {
  if (raw === null) return {};
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || (data.finishedAt !== undefined && !isTime(data.finishedAt))) throw new Error('Stored home progress is invalid');
  return data.finishedAt ? { finishedAt: data.finishedAt as string } : {};
}

export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(',')) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, HOME_LIMITS.tag);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, HOME_LIMITS.tags);
}

export function parsePictureFields(f: { group: string; title: string; tags: string; credit: string }):
  { ok: true; value: PictureFields } | { ok: false; error: string } {
  if (!isGroup(f.group)) return { ok: false, error: 'Choose a group.' };
  const title = f.title.trim();
  if (!title) return { ok: false, error: 'Give the picture a title.' };
  if (title.length > HOME_LIMITS.title) return { ok: false, error: `A title can be up to ${HOME_LIMITS.title} characters.` };
  const credit = f.credit.trim();
  if (credit.length > HOME_LIMITS.credit) return { ok: false, error: `A credit can be up to ${HOME_LIMITS.credit} characters.` };
  return { ok: true, value: { group: f.group, title, tags: parseTags(f.tags), credit } };
}

export function addPicture(home: Home, p: HomePicture): Home | null {
  if (home.pictures.length >= HOME_LIMITS.pictures) return null;
  return { ...home, pictures: [...home.pictures, p] };
}

export function editPicture(home: Home, id: string, v: PictureFields): Home | null {
  if (!home.pictures.some((p) => p.id === id)) return null;
  return { ...home, pictures: home.pictures.map((p) => (p.id === id ? { ...p, ...v, tags: [...v.tags] } : p)) };
}

export function movePicture(home: Home, id: string, dir: 'up' | 'down'): Home {
  const i = home.pictures.findIndex((p) => p.id === id);
  if (i < 0) return home;
  const group = home.pictures[i].group;
  const step = dir === 'up' ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < home.pictures.length && home.pictures[j].group !== group) j += step;
  if (j < 0 || j >= home.pictures.length) return home;
  const pictures = [...home.pictures];
  [pictures[i], pictures[j]] = [pictures[j], pictures[i]];
  return { ...home, pictures };
}

export function removePicture(home: Home, id: string): Home {
  return { ...home, pictures: home.pictures.filter((p) => p.id !== id) };
}

export function dropScore(scores: HomeScores, id: string): HomeScores {
  const out = { ...scores };
  delete out[id];
  return out;
}

export const setOn = (home: Home, on: boolean): Home => ({ ...home, on });

export function scoreWord(score: number): string {
  return WORDS[Math.min(10, Math.max(1, Math.round(score))) - 1];
}

export function parseScore(v: string): number | null {
  if (!/^(10|[1-9])$/.test(v)) return null;
  return Number(v);
}

const scoreOf = (scores: HomeScores, id: string) => (Object.hasOwn(scores, id) ? scores[id] : undefined);

export function saveScore(home: Home, scores: HomeScores, progress: HomeProgress, id: string, score: number, at: string):
  { scores: HomeScores; progress: HomeProgress } | null {
  if (!isScore(score) || !home.pictures.some((p) => p.id === id)) return null;
  const next = { ...scores, [id]: { score, at } };
  const done = home.pictures.every((p) => scoreOf(next, p.id));
  return { scores: next, progress: done ? { finishedAt: at } : progress };
}

export const inGroup = (home: Home, group: HomeGroup): HomePicture[] => home.pictures.filter((p) => p.group === group);

export function groupCounts(home: Home, scores: HomeScores): Record<HomeGroup, { scored: number; total: number }> {
  const out = {} as Record<HomeGroup, { scored: number; total: number }>;
  for (const g of GROUPS) {
    const list = inGroup(home, g.id);
    out[g.id] = { scored: list.filter((p) => scoreOf(scores, p.id)).length, total: list.length };
  }
  return out;
}

export function firstUnscored(home: Home, scores: HomeScores, group: HomeGroup): HomePicture | undefined {
  return inGroup(home, group).find((p) => !scoreOf(scores, p.id));
}

export function bannerHint(home: Home, scores: HomeScores, progress: HomeProgress): { text: string; waiting: boolean } | null {
  if (home.pictures.length === 0) return null;
  const unscored = home.pictures.filter((p) => !scoreOf(scores, p.id));
  const n = unscored.length;
  if (n === 0) return { text: 'See what you love', waiting: false };
  if (n === home.pictures.length) return { text: n === 1 ? '1 picture is waiting for you' : `${n} pictures are waiting for you`, waiting: true };
  const finished = progress.finishedAt;
  if (finished && unscored.every((p) => Date.parse(p.added) > Date.parse(finished))) {
    return { text: n === 1 ? '1 new picture' : `${n} new pictures`, waiting: true };
  }
  return { text: `${n} left to score`, waiting: true };
}

/** Best first; a tie goes to the one scored most recently. */
const byScore = (a: Scored, b: Scored) => b.score - a.score || Date.parse(b.at) - Date.parse(a.at);

export function homeResults(home: Home, scores: HomeScores): HomeResults {
  const scored: Scored[] = [];
  for (const p of home.pictures) {
    const s = scoreOf(scores, p.id);
    if (s) scored.push({ ...p, score: s.score, at: s.at });
  }
  const counts = groupCounts(home, scores);
  const ready = (['houses', 'rooms', 'gardens'] as HomeGroup[]).every((g) => counts[g].scored >= Math.ceil(counts[g].total / 2));
  const top = (g: HomeGroup) => scored.filter((p) => p.group === g).sort(byScore)[0];

  const tags = new Map<string, { sum: number; count: number; loved: number }>();
  for (const p of scored) {
    for (const t of p.tags) {
      const e = tags.get(t) ?? { sum: 0, count: 0, loved: 0 };
      e.sum += p.score;
      e.count += 1;
      if (p.score >= LOVED) e.loved += 1;
      tags.set(t, e);
    }
  }
  const words = [...tags.entries()]
    .filter(([, e]) => e.loved >= MIN_LOVED_FOR_WORD)
    .sort(([, a], [, b]) => b.sum / b.count - a.sum / a.count || b.loved - a.loved)
    .slice(0, MAX_WORDS)
    .map(([t]) => t);

  const favourites = {} as Record<HomeGroup, Scored[]>;
  for (const g of GROUPS) favourites[g.id] = scored.filter((p) => p.group === g.id && p.score >= FAVOURITE).sort(byScore);

  return { ready, dream: { house: top('houses'), room: top('rooms'), garden: top('gardens') }, words, favourites };
}
