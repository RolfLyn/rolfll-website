import { describe, it, expect } from 'vitest';
import { daysBetween } from '../worker/dates';
import {
  parseMeetings, upsertMeeting, removeMeeting, parseMeetingForm, skyFor, MEETING_INVALID,
} from '../worker/meetings';

const notes = (...dates: string[]) => dates.map((date) => ({ date, text: 'x' }));

describe('daysBetween', () => {
  it('counts whole days, across months and backwards', () => {
    expect(daysBetween('2026-10-11', '2026-10-21')).toBe(10);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysBetween('2026-10-22', '2026-10-21')).toBe(-1);
  });
});

describe('parseMeetings', () => {
  it('treats a missing key as no meetings', () => {
    expect(parseMeetings(null)).toEqual([]);
  });

  it('copies valid meetings, sorted oldest first, dropping extra fields', () => {
    const raw = JSON.stringify([
      { date: '2026-12-20', place: 'Later', extra: 1 },
      { date: '2026-10-21', place: 'Somewhere' },
    ]);
    expect(parseMeetings(raw)).toEqual([
      { date: '2026-10-21', place: 'Somewhere' },
      { date: '2026-12-20', place: 'Later' },
    ]);
  });

  it('throws on anything invalid', () => {
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ date: '2026-02-30', place: 'x' }]),
      JSON.stringify([{ date: '2026-10-21', place: '  ' }]),
      JSON.stringify([{ date: '2026-10-21', place: 'x'.repeat(41) }]),
      JSON.stringify([{ date: '2026-10-21', place: 'a' }, { date: '2026-10-21', place: 'b' }]),
    ]) {
      expect(() => parseMeetings(raw), raw).toThrow();
    }
  });
});

describe('upsertMeeting / removeMeeting', () => {
  it('adds in date order, replaces the same date, and removes by date', () => {
    let m = upsertMeeting([], { date: '2026-12-20', place: 'B' });
    m = upsertMeeting(m, { date: '2026-10-21', place: 'A' });
    m = upsertMeeting(m, { date: '2026-12-20', place: 'C' });
    expect(m).toEqual([{ date: '2026-10-21', place: 'A' }, { date: '2026-12-20', place: 'C' }]);
    expect(removeMeeting(m, '2026-10-21')).toEqual([{ date: '2026-12-20', place: 'C' }]);
  });
});

describe('parseMeetingForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('accepts a real date and a trimmed place', () => {
    expect(parseMeetingForm(form({ meet_date: '2026-10-21', meet_place: '  Somewhere ' }))).toEqual({
      meeting: { date: '2026-10-21', place: 'Somewhere' },
      draft: { date: '2026-10-21', place: 'Somewhere' },
    });
  });

  it('rejects a bad date, an empty place or a long place, keeping what was typed', () => {
    for (const fields of [
      { meet_date: '2026-13-01', meet_place: 'x' },
      { meet_date: '2026-10-21', meet_place: '' },
      { meet_date: '2026-10-21', meet_place: 'x'.repeat(41) },
    ]) {
      const result = parseMeetingForm(form(fields));
      expect(result.meeting).toBeUndefined();
      expect(result.error).toBe(MEETING_INVALID);
      expect(result.draft.place).toBe(fields.meet_place.trim());
    }
  });
});

describe('skyFor', () => {
  const one = [{ date: '2026-10-21', place: 'Somewhere' }];

  it('shows no sky without meetings', () => {
    expect(skyFor(notes('2026-10-01'), [], '2026-10-11')).toBeNull();
  });

  it('grows with one star per note up to today, counting sleeps', () => {
    expect(skyFor(notes('2026-10-12', '2026-10-11', '2026-10-01'), one, '2026-10-11')).toEqual({
      state: 'growing', place: 'Somewhere', date: '2026-10-21', stars: ['2026-10-01', '2026-10-11'], sleeps: 10,
    });
  });

  it('shows an empty growing sky when there are no notes yet', () => {
    expect(skyFor([], one, '2026-10-11')?.stars).toEqual([]);
  });

  it('arrives on the meeting day, including that day\'s note', () => {
    const sky = skyFor(notes('2026-10-21', '2026-10-20'), one, '2026-10-21');
    expect(sky).toMatchObject({ state: 'arrived', sleeps: 0, stars: ['2026-10-20', '2026-10-21'] });
  });

  it('keeps the last heart after the meeting, ignoring later notes', () => {
    const sky = skyFor(notes('2026-10-25', '2026-10-21', '2026-10-20'), one, '2026-10-25');
    expect(sky).toMatchObject({ state: 'kept', sleeps: 0, stars: ['2026-10-20', '2026-10-21'] });
  });

  it('starts a new sky after the previous meeting, excluding that day', () => {
    const two = [{ date: '2026-12-20', place: 'Next' }, { date: '2026-10-21', place: 'Somewhere' }];
    const sky = skyFor(notes('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-30'), two, '2026-10-30');
    expect(sky).toMatchObject({ state: 'growing', place: 'Next', date: '2026-12-20', stars: ['2026-10-22', '2026-10-30'], sleeps: 51 });
  });
});
