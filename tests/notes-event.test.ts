import { describe, it, expect } from 'vitest';
import {
  checkEvent, parseStoredEvent, parsePhotos, parsePicks, openDoor, pickDish, toggleCardItem,
  isOpen, isShowing, readerEvent, hasWaiting, openPhotoKeys, photoNamesInUse, EMPTY_PICKS,
  type EventPhoto,
} from '../worker/event';

const photos: EventPhoto[] = [
  { key: '11111111-1111-4111-8111-111111111111.jpg', name: 'one.jpg' },
  { key: '22222222-2222-4222-8222-222222222222.jpg', name: 'two.jpg' },
  { key: '33333333-3333-4333-8333-333333333333.jpg', name: 'three.jpg' },
  { key: '44444444-4444-4444-8444-444444444444.jpg', name: 'spare.jpg' },
];

function sample(): any {
  return {
    id: 'ev1',
    title: 'Placeholder week',
    intro: ['First paragraph', 'Second paragraph'],
    closing: 'A small closing line',
    from: '2026-01-01',
    until: '2026-01-10',
    doors: [
      {
        id: 'd1', label: 'Sat 3 Jan', heading: 'Saturday 3 January', opens: '2026-01-01', opensLabel: 'Thu 1 Jan',
        dishes: [
          { id: 'a', title: 'Dish A', text: 'Line A', photo: 'one.jpg', buy: ['Secret item A'] },
          { id: 'b', title: 'Dish B', text: 'Line B', buy: ['Secret item B'] },
        ],
      },
      {
        id: 'd2', label: 'Sun 4 Jan', heading: 'Sunday 4 January', opens: '2026-01-03', opensLabel: 'Sat 3 Jan',
        line: 'Hidden door line',
        dishes: [{ id: 'c', title: 'Hidden dish', text: 'Hidden text', photo: 'two.jpg', buy: ['Hidden buy'] }],
      },
      {
        id: 'd3', label: 'Fri 9 Jan', heading: 'Friday 9 January', opens: '2026-01-08', opensLabel: 'Thu 8 Jan',
        doorway: 'Taken care of', line: 'A line with no choice',
      },
    ],
    card: {
      title: 'Card', prompt: 'Pick two', pick: 2, opens: '2026-01-01',
      dishes: [
        { id: 'x', title: 'Sweet X', text: 'X', photo: 'three.jpg', buy: ['Secret X'] },
        { id: 'y', title: 'Sweet Y', text: 'Y' },
        { id: 'z', title: 'Sweet Z', text: 'Z' },
      ],
    },
    credits: ['Photo by someone, CC BY 2.0'],
  };
}

const check = (e: any, p = photos) => checkEvent(JSON.stringify(e), p);
const valid = () => {
  const r = check(sample());
  if (!r.ok) throw new Error(r.error);
  return r.event;
};
const AT = '2026-01-02T10:00:00.000Z';

describe('checkEvent', () => {
  it('accepts a valid event and keeps only known fields', () => {
    const e = sample();
    e.extra = 'dropped';
    e.doors[0].dishes[0].extra = 'dropped';
    const r = check(e);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.doors).toHaveLength(3);
    expect(JSON.stringify(r.event)).not.toContain('dropped');
    expect(r.event.doors[0].dishes![0].buy).toEqual(['Secret item A']);
  });

  it('lets card and credits be left out', () => {
    const e = sample();
    delete e.card;
    delete e.credits;
    delete e.closing;
    expect(check(e).ok).toBe(true);
  });

  const refusals: [string, (e: any) => void, RegExp][] = [
    ['bad JSON', () => {}, /JSON/],
    ['a duplicate door id', (e) => { e.doors[1].id = 'd1'; }, /d1/],
    ['a duplicate dish id in a door', (e) => { e.doors[0].dishes[1].id = 'a'; }, /a/],
    ['a door with neither dishes nor a line', (e) => { delete e.doors[2].line; }, /d3/],
    ['an impossible date', (e) => { e.doors[0].opens = '2026-02-31'; }, /d1/],
    ['a missing opensLabel', (e) => { delete e.doors[0].opensLabel; }, /d1/],
    ['a photo that was not uploaded', (e) => { e.doors[0].dishes[0].photo = 'nope.jpg'; }, /nope\.jpg/],
    ['text over its limit', (e) => { e.doors[0].dishes[0].text = 'x'.repeat(301); }, /d1/],
    ['a pick of 0', (e) => { e.card.pick = 0; }, /card/i],
    ['a pick above the card size', (e) => { e.card.pick = 4; }, /card/i],
  ];
  for (const [name, change, where] of refusals) {
    it(`refuses ${name}, naming where`, () => {
      const e = sample();
      change(e);
      const r = name === 'bad JSON' ? checkEvent('{ not json', photos) : check(e);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(where);
    });
  }
});

describe('stored data', () => {
  it('reads a stored event, nothing when absent, and throws when corrupt', () => {
    expect(parseStoredEvent(null)).toBeNull();
    expect(parseStoredEvent(JSON.stringify(valid()))?.id).toBe('ev1');
    expect(() => parseStoredEvent('{ broken')).toThrow();
  });

  it('reads photos, and empty picks for another event', () => {
    expect(parsePhotos(JSON.stringify(photos))).toEqual(photos);
    expect(parsePhotos(null)).toEqual([]);
    const picks = pickDish(openDoor(EMPTY_PICKS('old'), 'd1', AT), 'd1', 'a', AT);
    expect(parsePicks(JSON.stringify(picks), 'old').doors.d1.dish).toBe('a');
    expect(parsePicks(JSON.stringify(picks), 'ev1')).toEqual(EMPTY_PICKS('ev1'));
    expect(parsePicks(null, 'ev1')).toEqual(EMPTY_PICKS('ev1'));
  });
});

describe('dates', () => {
  it('opens on its date, not before', () => {
    expect(isOpen('2026-01-03', '2026-01-02')).toBe(false);
    expect(isOpen('2026-01-03', '2026-01-03')).toBe(true);
  });
  it('shows from the first to the last day', () => {
    const e = valid();
    expect(isShowing(e, '2025-12-31')).toBe(false);
    expect(isShowing(e, '2026-01-01')).toBe(true);
    expect(isShowing(e, '2026-01-10')).toBe(true);
    expect(isShowing(e, '2026-01-11')).toBe(false);
  });
});

describe('picks', () => {
  it('a new pick on a door replaces the old one and keeps other doors', () => {
    let p = pickDish(EMPTY_PICKS('ev1'), 'd1', 'a', AT);
    p = pickDish(p, 'd2', 'c', AT);
    p = pickDish(p, 'd1', 'b', AT);
    expect(p.doors.d1.dish).toBe('b');
    expect(p.doors.d2.dish).toBe('c');
  });

  it('the card adds, removes on a second tap, and drops the oldest past the limit', () => {
    let p = toggleCardItem(EMPTY_PICKS('ev1'), 'x', 2, AT);
    p = toggleCardItem(p, 'y', 2, AT);
    expect(p.card.map((c) => c.dish)).toEqual(['x', 'y']);
    p = toggleCardItem(p, 'z', 2, AT);
    expect(p.card.map((c) => c.dish)).toEqual(['y', 'z']);
    p = toggleCardItem(p, 'y', 2, AT);
    expect(p.card.map((c) => c.dish)).toEqual(['z']);
  });
});

describe('readerEvent', () => {
  const TODAY = '2026-01-02';

  it('shows nothing of a locked door but its labels', () => {
    const view = readerEvent(valid(), EMPTY_PICKS('ev1'), photos, TODAY);
    const text = JSON.stringify(view);
    for (const secret of ['Hidden dish', 'Hidden text', 'Hidden door line', photos[1].key, 'two.jpg']) expect(text).not.toContain(secret);
    expect(view.doors[1]).toMatchObject({ id: 'd2', locked: true, opensLabel: 'Sat 3 Jan' });
  });

  it('never carries shopping lists, and gives photo keys rather than names', () => {
    const text = JSON.stringify(readerEvent(valid(), EMPTY_PICKS('ev1'), photos, '2026-01-09'));
    expect(text).not.toMatch(/Secret|Hidden buy/);
    expect(text).toContain(photos[0].key);
    expect(text).not.toContain('one.jpg');
  });

  it('ignores a pick for a dish that is gone, and trims the card to its limit', () => {
    let p = pickDish(openDoor(EMPTY_PICKS('ev1'), 'd1', AT), 'd1', 'gone', AT);
    p = { ...p, card: [{ dish: 'x', at: AT }, { dish: 'gone', at: AT }, { dish: 'y', at: AT }, { dish: 'z', at: AT }] };
    const view = readerEvent(valid(), p, photos, TODAY);
    const door = view.doors[0];
    expect(door.locked).toBe(false);
    if (!door.locked) expect(door.picked).toBeUndefined();
    expect(view.card && !view.card.locked && view.card.picked).toEqual(['y', 'z']);
  });

  it('marks opened doors and picks', () => {
    const p = pickDish(openDoor(EMPTY_PICKS('ev1'), 'd1', AT), 'd1', 'b', AT);
    const door = readerEvent(valid(), p, photos, TODAY).doors[0];
    expect(door).toMatchObject({ locked: false, opened: true, picked: 'b' });
  });
});

describe('hasWaiting', () => {
  const TODAY = '2026-01-02';
  it('is true for an unopened open door', () => {
    expect(hasWaiting(readerEvent(valid(), EMPTY_PICKS('ev1'), photos, TODAY))).toBe(true);
  });
  it('is false once open doors are opened and the card is full', () => {
    let p = openDoor(EMPTY_PICKS('ev1'), 'd1', AT);
    p = toggleCardItem(toggleCardItem(p, 'x', 2, AT), 'y', 2, AT);
    expect(hasWaiting(readerEvent(valid(), p, photos, TODAY))).toBe(false);
  });
});

describe('photos', () => {
  it('only open doors and an open card give their photos to the reader', () => {
    expect(openPhotoKeys(valid(), photos, '2026-01-02').sort()).toEqual([photos[0].key, photos[2].key].sort());
    expect(openPhotoKeys(valid(), photos, '2026-01-03')).toContain(photos[1].key);
    expect(openPhotoKeys(valid(), photos, '2026-01-03')).not.toContain(photos[3].key);
  });
  it('lists the photo names the event uses', () => {
    expect(photoNamesInUse(valid()).sort()).toEqual(['one.jpg', 'three.jpg', 'two.jpg']);
  });
});
