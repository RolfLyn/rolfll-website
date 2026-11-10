import { describe, it, expect } from 'vitest';
import {
  checkGift, parseStoredGift, parseGiftState, emptyGiftState, unwrapGift, pickGiftDay, parseBookingLines, markBooked,
  undoBooked, seeBooked, isGiftShowing, giftStage, readerGift, giftWaiting, giftPhotoKeys, giftPhotoNames,
  type Gift, type GiftState,
} from '../worker/gift';
import type { EventPhoto } from '../worker/event';

const photos: EventPhoto[] = [{ key: 'k-a.jpg', name: 'a.jpg' }, { key: 'k-b.jpg', name: 'b.jpg' }];
const day = (id: string, name: string) => ({ id, name, heading: `${name} ${id}` });
const base = () => ({
  id: 'g1',
  title: 'A gift',
  from: '2026-11-01',
  until: '2027-01-07',
  box: { kicker: 'A gift', heading: 'Something for later', tag: 'For you' },
  reveals: [{ kicker: 'First', heading: 'The first part', text: 'What happens.', photos: ['a.jpg'], next: 'And then?' }],
  pick: { kicker: 'Your choice', heading: 'Pick our day', text: 'A line.' },
  days: [day('2027-01-04', 'Monday'), day('2027-01-05', 'Tuesday'), day('2027-01-06', 'Wednesday'), day('2027-01-07', 'Thursday')],
  chosenLine: 'I will book it.',
  summary: ['One', 'Two'],
  pendingLine: 'Times later.',
  bookedLine: 'Soon.',
  credits: ['Photo: someone'],
});
const json = (o: unknown) => JSON.stringify(o);
const ok = (o: unknown, state: GiftState | null = null) => {
  const r = checkGift(json(o), photos, state);
  if (!r.ok) throw new Error(r.error);
  return r.gift;
};
const err = (o: unknown, state: GiftState | null = null) => {
  const r = checkGift(typeof o === 'string' ? o : json(o), photos, state);
  if (r.ok) throw new Error('expected a refusal');
  return r.error;
};
const AT = '2026-12-01T10:00:00.000Z';
const gift: Gift = ok(base());
const picked = (d: string) => pickGiftDay(unwrapGift(emptyGiftState('g1'), AT), gift, d, '2027-01-01', AT)!;

describe('checking a gift', () => {
  it('accepts a good gift', () => {
    expect(gift.days).toHaveLength(4);
    expect(gift.reveals[0].photos).toEqual(['a.jpg']);
  });
  it('names what is wrong', () => {
    expect(err('{ nope')).toMatch(/valid JSON/);
    expect(err({ ...base(), until: '2027-01-06' })).toMatch(/"until" must be on or after the last day/);
    expect(err({ ...base(), days: [day('2027-01-04', 'Monday'), day('2027-01-04', 'Monday')] })).toMatch(/two days/i);
    expect(err({ ...base(), days: [] })).toMatch(/day/i);
    expect(err({ ...base(), days: Array.from({ length: 9 }, (_, i) => day(`2027-01-0${i + 1}`, 'X')) })).toMatch(/too many/);
    expect(err({ ...base(), reveals: Array.from({ length: 7 }, () => base().reveals[0]) })).toMatch(/too many/);
    expect(err({ ...base(), reveals: [{ ...base().reveals[0], photos: ['a.jpg', 'b.jpg', 'a.jpg'] }] })).toMatch(/too many/);
    expect(err({ ...base(), reveals: [{ ...base().reveals[0], photos: ['zz.jpg'] }] })).toMatch(/hasn't been uploaded/);
    expect(err({ ...base(), days: [day('2027-02-30', 'X')], until: '2027-03-01' })).toMatch(/real date/);
  });
  it('will not drop her picked day or start a new gift while she has a pick', () => {
    const state = picked('2027-01-06');
    expect(err({ ...base(), id: 'g2' }, state)).toMatch(/clear her pick first/);
    expect(err({ ...base(), days: base().days.filter((d) => d.id !== '2027-01-06') }, state)).toMatch(/clear her pick first/);
    expect(ok({ ...base(), title: 'Renamed' }, state).title).toBe('Renamed');
    expect(ok({ ...base(), id: 'g2' }, emptyGiftState('g1')).id).toBe('g2');
  });
  it('reads back what was stored and throws on corrupt text', () => {
    expect(parseStoredGift(null)).toBeNull();
    expect(parseStoredGift(json(gift))).toEqual(gift);
    expect(() => parseStoredGift('{ nope')).toThrow();
  });
});

describe('her side', () => {
  it('starts clean for another gift and throws on corrupt state', () => {
    expect(parseGiftState(json({ ...picked('2027-01-05'), giftId: 'other' }), 'g1')).toEqual(emptyGiftState('g1'));
    expect(parseGiftState(null, 'g1')).toEqual(emptyGiftState('g1'));
    expect(parseGiftState(json(picked('2027-01-05')), 'g1').pick?.day).toBe('2027-01-05');
    expect(() => parseGiftState('{ nope', 'g1')).toThrow();
  });
  it('keeps the first unwrap', () => {
    const once = unwrapGift(emptyGiftState('g1'), AT);
    expect(unwrapGift(once, '2026-12-02T00:00:00.000Z').unwrapped).toBe(AT);
  });
  it('lets her pick only a listed day after today, and not once booked', () => {
    const s = unwrapGift(emptyGiftState('g1'), AT);
    expect(pickGiftDay(s, gift, '2027-01-04', '2027-01-04', AT)).toBeNull();
    expect(pickGiftDay(s, gift, '2027-01-05', '2027-01-04', AT)?.pick).toEqual({ day: '2027-01-05', at: AT });
    expect(pickGiftDay(s, gift, '2027-01-09', '2027-01-01', AT)).toBeNull();
    const booked = markBooked(picked('2027-01-05'), '2027-01-05', ['3pm'], AT)!;
    expect(pickGiftDay(booked, gift, '2027-01-06', '2027-01-01', AT)).toBeNull();
  });
  it('remembers every pick she made', () => {
    const later = '2026-12-02T00:00:00.000Z';
    const s = pickGiftDay(picked('2027-01-05'), gift, '2027-01-06', '2027-01-01', later)!;
    expect(s.pick).toEqual({ day: '2027-01-06', at: later });
    expect(s.history).toEqual([{ day: '2027-01-05', at: AT }, { day: '2027-01-06', at: later }]);
  });
});

describe('booking', () => {
  it('reads booking lines', () => {
    expect(parseBookingLines('3pm\r\n\r\n  dinner after  \n')).toEqual({ lines: ['3pm', 'dinner after'] });
    expect('error' in parseBookingLines('  \n ')).toBe(true);
    expect('error' in parseBookingLines('a\nb\nc\nd\ne')).toBe(true);
    expect('error' in parseBookingLines('x'.repeat(161))).toBe(true);
  });
  it('books only the day she picked', () => {
    expect(markBooked(emptyGiftState('g1'), '2027-01-05', ['3pm'], AT)).toBeNull();
    expect(markBooked(picked('2027-01-06'), '2027-01-05', ['3pm'], AT)).toBeNull();
    expect(markBooked(picked('2027-01-05'), '2027-01-05', ['3pm'], AT)?.booked).toEqual({ day: '2027-01-05', lines: ['3pm'], at: AT });
  });
  it('moves through the stages', () => {
    let s = emptyGiftState('g1');
    expect(giftStage(gift, s)).toBe('box');
    s = unwrapGift(s, AT);
    expect(giftStage(gift, s)).toBe('pick');
    s = pickGiftDay(s, gift, '2027-01-05', '2027-01-01', AT)!;
    expect(giftStage(gift, s)).toBe('chosen');
    s = markBooked(s, '2027-01-05', ['3pm'], AT)!;
    expect(giftStage(gift, s)).toBe('booked');
    expect(giftStage(gift, undoBooked(s))).toBe('chosen');
    const gone = ok({ ...base(), days: base().days.filter((d) => d.id !== '2027-01-05') });
    expect(giftStage(gone, picked('2027-01-05'))).toBe('pick');
  });
  it('waits for her until unwrapped, and again when newly booked', () => {
    let s = emptyGiftState('g1');
    expect(giftWaiting(gift, s)).toBe(true);
    s = picked('2027-01-05');
    expect(giftWaiting(gift, s)).toBe(false);
    s = markBooked(s, '2027-01-05', ['3pm'], '2026-12-03T00:00:00.000Z')!;
    expect(giftWaiting(gift, s)).toBe(true);
    s = seeBooked(s, '2026-12-04T00:00:00.000Z');
    expect(giftWaiting(gift, s)).toBe(false);
    s = markBooked(s, '2027-01-05', ['4pm'], '2026-12-05T00:00:00.000Z')!;
    expect(s.booked?.lines).toEqual(['4pm']);
    expect(s.booked?.at).toBe('2026-12-03T00:00:00.000Z');
    expect(giftWaiting(gift, s)).toBe(false);
  });
});

describe('what she may see', () => {
  it('shows only her view, with photo keys and closed days', () => {
    const view = readerGift(gift, picked('2027-01-05'), photos, '2027-01-05');
    expect(view.reveals[0].photoKeys).toEqual(['k-a.jpg']);
    expect(view.days.map((d) => d.open)).toEqual([false, false, true, true]);
    expect(view.days[0]).toMatchObject({ num: '4', weekday: 'MON', month: 'JAN' });
    expect(view.chosen?.id).toBe('2027-01-05');
    expect(view.stage).toBe('chosen');
    expect(JSON.stringify(view)).not.toContain('history');
  });
  it('carries the booking only when booked', () => {
    const view = readerGift(gift, markBooked(picked('2027-01-05'), '2027-01-05', ['3pm'], AT)!, photos, '2027-01-01');
    expect(view.booking).toEqual(['3pm']);
    expect(readerGift(gift, picked('2027-01-05'), photos, '2027-01-01').booking).toBeUndefined();
  });
  it('shows from the first day to the last, inclusive', () => {
    expect(isGiftShowing(gift, '2026-10-31')).toBe(false);
    expect(isGiftShowing(gift, '2026-11-01')).toBe(true);
    expect(isGiftShowing(gift, '2027-01-07')).toBe(true);
    expect(isGiftShowing(gift, '2027-01-08')).toBe(false);
  });
  it('knows its photos', () => {
    expect(giftPhotoNames(gift)).toEqual(['a.jpg']);
    expect(giftPhotoKeys(gift, photos)).toEqual(['k-a.jpg']);
  });
});
