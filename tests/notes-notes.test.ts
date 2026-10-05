import { describe, it, expect } from 'vitest';
import { parseNotes, selectForReader, upsertNote, removeNote, sortNewestFirst, attachmentKeys, findByMediaKey } from '../worker/notes';

const n = (date: string, text = `note ${date}`) => ({ date, text });

describe('selectForReader', () => {
  it('shows the latest note up to today and archives the rest, newest first', () => {
    const view = selectForReader([n('2026-09-28'), n('2026-10-02'), n('2026-09-30')], '2026-10-01');
    expect(view.current).toEqual(n('2026-09-30'));
    expect(view.archive).toEqual([n('2026-09-28')]);
  });

  it('never exposes future notes', () => {
    const view = selectForReader([n('2026-09-28'), n('2026-10-02')], '2026-10-01');
    expect(JSON.stringify(view)).not.toContain('2026-10-02');
  });

  it("shows today's note when there is one", () => {
    expect(selectForReader([n('2026-09-30'), n('2026-10-01')], '2026-10-01').current).toEqual(n('2026-10-01'));
  });

  it('is empty when nothing is visible yet', () => {
    expect(selectForReader([], '2026-10-01')).toEqual({ current: null, archive: [] });
    expect(selectForReader([n('2026-10-05')], '2026-10-01')).toEqual({ current: null, archive: [] });
  });
});

describe('upsertNote / removeNote', () => {
  it('replaces the note for an existing date and keeps newest-first order', () => {
    const notes = upsertNote([n('2026-10-01', 'old'), n('2026-09-01')], n('2026-10-01', 'new'));
    expect(notes).toEqual([n('2026-10-01', 'new'), n('2026-09-01')]);
    expect(upsertNote(notes, n('2026-11-01'))[0]).toEqual(n('2026-11-01'));
  });

  it('removes by date', () => {
    expect(removeNote([n('2026-10-01'), n('2026-09-01')], '2026-10-01')).toEqual([n('2026-09-01')]);
  });

  it('sorts newest first without mutating input', () => {
    const input = [n('2026-01-01'), n('2026-03-01')];
    expect(sortNewestFirst(input).map((x) => x.date)).toEqual(['2026-03-01', '2026-01-01']);
    expect(input[0].date).toBe('2026-01-01');
  });
});

describe('parseNotes', () => {
  it('treats a missing value as no notes', () => {
    expect(parseNotes(null)).toEqual([]);
  });

  it('parses a stored list', () => {
    expect(parseNotes('[{"date":"2026-10-01","text":"hi"}]')).toEqual([n('2026-10-01', 'hi')]);
  });

  it('throws on anything malformed instead of returning an empty list', () => {
    expect(() => parseNotes('garbage')).toThrow();
    expect(() => parseNotes('{"date":"2026-10-01"}')).toThrow();
    expect(() => parseNotes('[{"date":"nope","text":"x"}]')).toThrow();
    expect(() => parseNotes('[{"date":"2026-10-01","text":5}]')).toThrow();
  });
});

const KEY_A = '0b6f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg';
const KEY_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.m4a';
const LEGACY = '[{"date":"2026-10-06","text":"Tomorrow 💛"},{"date":"2026-09-30","text":"Line one\\nLine two"},{"date":"2026-09-29","text":"First \\"quoted\\" note"}]';

describe('attachments', () => {
  it('round-trips legacy text-only notes byte for byte', () => {
    expect(JSON.stringify(parseNotes(LEGACY))).toBe(LEGACY);
  });

  it('parses notes with a photo and a sound', () => {
    const raw = JSON.stringify([{ date: '2026-10-01', text: 'hi', photo: { key: KEY_A, type: 'image/jpeg' }, audio: { key: KEY_B, type: 'audio/mp4' } }]);
    expect(parseNotes(raw)[0]).toEqual({ date: '2026-10-01', text: 'hi', photo: { key: KEY_A, type: 'image/jpeg' }, audio: { key: KEY_B, type: 'audio/mp4' } });
  });

  it('rejects malformed attachments', () => {
    expect(() => parseNotes('[{"date":"2026-10-01","text":"x","photo":{"key":"../../etc","type":"image/jpeg"}}]')).toThrow();
    expect(() => parseNotes(`[{"date":"2026-10-01","text":"x","audio":{"key":"${KEY_B}"}}]`)).toThrow();
    expect(() => parseNotes('[{"date":"2026-10-01","text":"x","photo":"nope"}]')).toThrow();
  });

  it('lists and finds attachment keys', () => {
    const notes = [
      { date: '2026-10-01', text: 'a', photo: { key: KEY_A, type: 'image/jpeg' } },
      { date: '2026-09-01', text: 'b', audio: { key: KEY_B, type: 'audio/mp4' } },
      { date: '2026-08-01', text: 'c' },
    ];
    expect(notes.flatMap(attachmentKeys)).toEqual([KEY_A, KEY_B]);
    expect(findByMediaKey(notes, KEY_B)?.date).toBe('2026-09-01');
    expect(findByMediaKey(notes, 'missing')).toBeUndefined();
  });
});
