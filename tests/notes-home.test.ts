import { describe, it, expect } from 'vitest';
import {
  parseHome, parseHomeScores, parseHomeProgress, parseTags, parsePictureFields, parseScore, scoreWord,
  addPicture, editPicture, movePicture, removePicture, dropScore, setOn, saveScore, inGroup, groupCounts,
  firstUnscored, bannerHint, homeResults, HOME_LIMITS,
  type Home, type HomeGroup, type HomePicture, type HomeScores,
} from '../worker/home';

const T0 = '2026-11-12T10:00:00.000Z';
const T1 = '2026-11-12T11:00:00.000Z';
const T2 = '2026-11-12T12:00:00.000Z';
const T3 = '2026-11-12T13:00:00.000Z';

function pic(id: string, group: HomeGroup = 'houses', tags: string[] = [], added = T0): HomePicture {
  return { id, group, title: `Picture ${id}`, tags, credit: 'Someone on Unsplash', file: `${id}.jpg`, added };
}
const home = (...pictures: HomePicture[]): Home => ({ on: true, pictures });
const s = (score: number, at = T1) => ({ score, at });

describe('parsing', () => {
  it('reads an empty home when nothing is stored', () => {
    expect(parseHome(null)).toEqual({ on: false, pictures: [] });
  });
  it('throws on corrupt or invalid stored pictures', () => {
    expect(() => parseHome('{')).toThrow();
    expect(() => parseHome(JSON.stringify(home({ ...pic('a'), group: 'kitchens' as HomeGroup })))).toThrow();
  });
  it('round-trips a valid home', () => {
    const h = home(pic('a', 'houses', ['wood']), pic('b', 'gardens'));
    expect(parseHome(JSON.stringify(h))).toEqual(h);
  });
  it('throws on a score out of range', () => {
    expect(() => parseHomeScores('{"a":{"score":11,"at":"2026-11-12T10:00:00.000Z"}}')).toThrow();
    expect(parseHomeScores(null)).toEqual({});
    expect(parseHomeScores(JSON.stringify({ a: s(4) }))).toEqual({ a: s(4) });
  });
  it('reads progress', () => {
    expect(parseHomeProgress(null)).toEqual({});
    expect(parseHomeProgress(JSON.stringify({ finishedAt: T1 }))).toEqual({ finishedAt: T1 });
    expect(() => parseHomeProgress('[')).toThrow();
  });
  it('cleans tags', () => {
    expect(parseTags(' Wood, big Windows,wood,, ')).toEqual(['wood', 'big windows']);
    expect(parseTags('a,b,c,d,e,f,g,h,i')).toHaveLength(HOME_LIMITS.tags);
    expect(parseTags('x'.repeat(40))[0]).toHaveLength(HOME_LIMITS.tag);
  });
  it('checks picture fields', () => {
    const ok = { group: 'rooms', title: ' Oak kitchen ', tags: 'Wood', credit: 'Someone on Pexels' };
    expect(parsePictureFields(ok)).toEqual({ ok: true, value: { group: 'rooms', title: 'Oak kitchen', tags: ['wood'], credit: 'Someone on Pexels' } });
    expect(parsePictureFields({ ...ok, title: '  ' })).toEqual({ ok: false, error: 'Give the picture a title.' });
    expect(parsePictureFields({ ...ok, group: 'kitchens' })).toEqual({ ok: false, error: 'Choose a group.' });
    expect(parsePictureFields({ ...ok, title: 'x'.repeat(81) }).ok).toBe(false);
  });
});

describe('scores', () => {
  it('accepts only whole numbers 1 to 10', () => {
    expect(parseScore('1')).toBe(1);
    expect(parseScore('10')).toBe(10);
    for (const bad of ['0', '11', '5.5', 'abc', '', ' ', '1e1']) expect(parseScore(bad)).toBeNull();
  });
  it('has a word for each score', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(scoreWord)).toEqual([
      'not for me', 'not for me', 'not really', 'not really', "it's nice", "it's nice",
      'really like it', 'really like it', 'love it', 'my dream',
    ]);
  });
});

describe('picture changes', () => {
  it('moves within a group, skipping other groups', () => {
    const h = home(pic('a'), pic('g', 'gardens'), pic('b'));
    expect(movePicture(h, 'a', 'down').pictures.map((p) => p.id)).toEqual(['b', 'g', 'a']);
    expect(movePicture(h, 'a', 'up')).toEqual(h);
    expect(movePicture(h, 'b', 'down')).toEqual(h);
  });
  it('removes a picture and its score', () => {
    const h = home(pic('a'), pic('b'));
    expect(removePicture(h, 'a').pictures.map((p) => p.id)).toEqual(['b']);
    expect(dropScore({ a: s(3), b: s(4) }, 'a')).toEqual({ b: s(4) });
  });
  it('refuses a picture over the limit', () => {
    const full = home(...Array.from({ length: HOME_LIMITS.pictures }, (_, i) => pic(`p${i}`)));
    expect(addPicture(full, pic('x'))).toBeNull();
    expect(addPicture(home(), pic('x'))?.pictures).toHaveLength(1);
  });
  it('edits a picture and switches the banner', () => {
    const h = home(pic('a'));
    const edited = editPicture(h, 'a', { group: 'rooms', title: 'New', tags: ['x'], credit: 'c' });
    expect(edited?.pictures[0]).toMatchObject({ id: 'a', group: 'rooms', title: 'New', tags: ['x'], credit: 'c', file: 'a.jpg' });
    expect(editPicture(h, 'zz', { group: 'rooms', title: 'New', tags: [], credit: '' })).toBeNull();
    expect(setOn(h, false).on).toBe(false);
  });
});

describe('saving a score', () => {
  const h = home(pic('a'), pic('b'));
  it('refuses an unknown picture', () => {
    expect(saveScore(h, {}, {}, 'zz', 5, T1)).toBeNull();
  });
  it('marks finished when the last picture is scored', () => {
    const one = saveScore(h, {}, {}, 'a', 7, T1)!;
    expect(one.scores).toEqual({ a: s(7, T1) });
    expect(one.progress).toEqual({});
    const two = saveScore(h, one.scores, one.progress, 'b', 3, T2)!;
    expect(two.progress).toEqual({ finishedAt: T2 });
  });
  it('replaces an earlier score', () => {
    expect(saveScore(h, { a: s(2, T1) }, {}, 'a', 9, T2)!.scores.a).toEqual(s(9, T2));
  });
  it('ignores stale scores when deciding finished', () => {
    const r = saveScore(home(pic('a')), { gone: s(4) }, {}, 'a', 6, T2)!;
    expect(r.progress).toEqual({ finishedAt: T2 });
  });
});

describe('groups', () => {
  const h = home(pic('a'), pic('b'), pic('g', 'gardens'));
  it('counts per group, ignoring stale scores', () => {
    const c = groupCounts(h, { a: s(5), gone: s(5) });
    expect(c.houses).toEqual({ scored: 1, total: 2 });
    expect(c.gardens).toEqual({ scored: 0, total: 1 });
    expect(c.rooms).toEqual({ scored: 0, total: 0 });
  });
  it('finds the first unscored picture', () => {
    expect(inGroup(h, 'houses').map((p) => p.id)).toEqual(['a', 'b']);
    expect(firstUnscored(h, { a: s(5) }, 'houses')?.id).toBe('b');
    expect(firstUnscored(h, { a: s(5), b: s(5) }, 'houses')).toBeUndefined();
  });
});

describe('banner hint', () => {
  const three = home(pic('a'), pic('b'), pic('c'));
  it('counts pictures waiting', () => {
    expect(bannerHint(three, {}, {})).toEqual({ text: '3 pictures are waiting for you', waiting: true });
    expect(bannerHint(home(pic('a')), {}, {})).toEqual({ text: '1 picture is waiting for you', waiting: true });
    expect(bannerHint(three, { gone: s(5) }, {})?.text).toBe('3 pictures are waiting for you');
  });
  it('counts what is left', () => {
    expect(bannerHint(three, { a: s(5), b: s(5) }, {})).toEqual({ text: '1 left to score', waiting: true });
  });
  it('says see what you love when done', () => {
    expect(bannerHint(three, { a: s(5), b: s(5), c: s(5) }, { finishedAt: T1 })).toEqual({ text: 'See what you love', waiting: false });
  });
  it('calls pictures added after she finished new', () => {
    const more = home(pic('a'), pic('b', 'houses', [], T2), pic('c', 'houses', [], T3));
    expect(bannerHint(more, { a: s(5) }, { finishedAt: T1 })).toEqual({ text: '2 new pictures', waiting: true });
    expect(bannerHint(home(pic('a'), pic('b', 'houses', [], T2)), { a: s(5) }, { finishedAt: T1 })?.text).toBe('1 new picture');
  });
  it('says left when an older picture is also unscored', () => {
    const mixed = home(pic('a'), pic('b'), pic('c', 'houses', [], T2));
    expect(bannerHint(mixed, { a: s(5) }, { finishedAt: T1 })?.text).toBe('2 left to score');
  });
  it('stays done after a picture is removed', () => {
    expect(bannerHint(home(pic('a')), { a: s(5), b: s(5) }, { finishedAt: T1 })?.text).toBe('See what you love');
  });
  it('is null with no pictures', () => {
    expect(bannerHint(home(), {}, {})).toBeNull();
  });
});

describe('results', () => {
  const houses = [pic('h1'), pic('h2'), pic('h3'), pic('h4')];
  const rooms = [pic('r1', 'rooms'), pic('r2', 'rooms'), pic('r3', 'rooms')];
  const h = home(...houses, ...rooms, pic('f1', 'furniture'));

  it('is not ready until half of each of houses, rooms and gardens is scored', () => {
    expect(homeResults(h, { h1: s(5), r1: s(5), r2: s(5) }).ready).toBe(false);
    expect(homeResults(h, { h1: s(5), h2: s(5), r1: s(5) }).ready).toBe(false);
    expect(homeResults(h, { h1: s(5), h2: s(5), r1: s(5), r2: s(5) }).ready).toBe(true);
  });
  it('picks the top of each group, latest wins a tie', () => {
    const r = homeResults(h, { h1: s(9, T1), h2: s(9, T2), h3: s(4), r1: s(6), r2: s(8) });
    expect(r.dream.house?.id).toBe('h2');
    expect(r.dream.room?.id).toBe('r2');
    expect(r.dream.garden).toBeUndefined();
  });
  it('lists favourites of 7 and over, best first, latest wins a tie', () => {
    const r = homeResults(h, { h1: s(7, T3), h2: s(9, T1), h3: s(6), h4: s(7, T1) });
    expect(r.favourites.houses.map((p) => [p.id, p.score])).toEqual([['h2', 9], ['h1', 7], ['h4', 7]]);
    expect(r.favourites.gardens).toEqual([]);
  });
  it('finds the words she is drawn to', () => {
    const t = home(
      pic('w1', 'houses', ['wood']), pic('w2', 'houses', ['wood']), pic('w3', 'rooms', ['wood']), pic('w4', 'rooms', ['wood']),
      pic('l1', 'houses', ['light']), pic('l2', 'rooms', ['light']), pic('l3', 'rooms', ['light']),
      pic('p1', 'houses', ['pink']), pic('p2', 'rooms', ['pink']),
    );
    const r = homeResults(t, { w1: s(8), w2: s(9), w3: s(10), w4: s(2), l1: s(8), l2: s(8), l3: s(8), p1: s(10), p2: s(10) });
    expect(r.words).toEqual(['light', 'wood']);
  });
  it('shows at most 6 words', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const t = home(pic('x1', 'houses', tags), pic('x2', 'houses', tags), pic('x3', 'rooms', tags));
    expect(homeResults(t, { x1: s(9), x2: s(9), x3: s(9) }).words).toHaveLength(6);
  });
  it('ignores scores for removed pictures', () => {
    const r = homeResults(home(pic('a')), { a: s(7), gone: s(10) });
    expect(r.favourites.houses.map((p) => p.id)).toEqual(['a']);
    expect(r.dream.house?.id).toBe('a');
  });
});
