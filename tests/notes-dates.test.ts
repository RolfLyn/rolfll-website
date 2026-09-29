import { describe, it, expect } from 'vitest';
import { todayInCopenhagen, isValidDate, addDays, nextEmptyDate } from '../worker/dates';

describe('todayInCopenhagen', () => {
  it('uses summer time (UTC+2) in summer', () => {
    expect(todayInCopenhagen(new Date('2026-10-01T21:59:00Z'))).toBe('2026-10-01');
    expect(todayInCopenhagen(new Date('2026-10-01T22:00:00Z'))).toBe('2026-10-02');
  });

  it('uses winter time (UTC+1) in winter', () => {
    expect(todayInCopenhagen(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
    expect(todayInCopenhagen(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });

  it('handles the DST switch days', () => {
    expect(todayInCopenhagen(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
    expect(todayInCopenhagen(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDate('2026-10-01')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('2026-10-01x')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('nextEmptyDate', () => {
  it('is today when today is free', () => {
    expect(nextEmptyDate([], '2026-10-01')).toBe('2026-10-01');
    expect(nextEmptyDate(['2026-09-01'], '2026-10-01')).toBe('2026-10-01');
  });

  it('skips taken days and fills the first gap', () => {
    expect(nextEmptyDate(['2026-10-01', '2026-10-02'], '2026-10-01')).toBe('2026-10-03');
    expect(nextEmptyDate(['2026-10-01', '2026-10-03'], '2026-10-01')).toBe('2026-10-02');
  });
});
