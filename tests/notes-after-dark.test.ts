import { describe, it, expect } from 'vitest';
import {
  parseEntries, upsertEntry, removeEntry, entryKeys, parseEntryForm, ENTRY_INVALID, EMPTY_ENTRY,
  parseEntryReplies, setEntryReply, dropEntryReply,
} from '../worker/after-dark';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const entry = (id: string, created: string, extra = {}) => ({ id, title: '', text: 'words', created, ...extra });

describe('parseEntries', () => {
  it('treats a missing key as no entries, sorts newest first, and drops extra fields', () => {
    expect(parseEntries(null)).toEqual([]);
    const raw = JSON.stringify([
      { ...entry(ID1, '2026-10-01T10:00:00.000Z'), extra: 1 },
      entry(ID2, '2026-10-05T10:00:00.000Z', { title: 'T', audio: { key: KEY, type: 'audio/mp4' } }),
    ]);
    expect(parseEntries(raw)).toEqual([
      entry(ID2, '2026-10-05T10:00:00.000Z', { title: 'T', audio: { key: KEY, type: 'audio/mp4' } }),
      entry(ID1, '2026-10-01T10:00:00.000Z'),
    ]);
  });

  it('throws on anything invalid', () => {
    const ok = entry(ID1, '2026-10-01T10:00:00.000Z');
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...ok, id: 'not-a-uuid' }]),
      JSON.stringify([{ ...ok, text: '   ' }]),
      JSON.stringify([{ ...ok, text: 'x'.repeat(5001) }]),
      JSON.stringify([{ ...ok, title: 'x'.repeat(121) }]),
      JSON.stringify([{ ...ok, created: 'never' }]),
      JSON.stringify([{ ...ok, audio: { key: '../x', type: 'audio/mp4' } }]),
      JSON.stringify([ok, ok]),
    ]) {
      expect(() => parseEntries(raw), raw).toThrow();
    }
  });
});

describe('editing entries', () => {
  it('upserts by id keeping newest first, removes by id, and lists sound keys', () => {
    const a = entry(ID1, '2026-10-01T10:00:00.000Z');
    const b = entry(ID2, '2026-10-05T10:00:00.000Z', { audio: { key: KEY, type: 'audio/mp4' } });
    let list = upsertEntry(upsertEntry([], a), b);
    expect(list.map((e) => e.id)).toEqual([ID2, ID1]);
    list = upsertEntry(list, { ...a, text: 'changed' });
    expect(list).toHaveLength(2);
    expect(list[1].text).toBe('changed');
    expect(entryKeys(list)).toEqual([KEY]);
    expect(removeEntry(list, ID2).map((e) => e.id)).toEqual([ID1]);
  });
});

describe('parseEntryForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('trims, normalizes line endings and allows an empty title', () => {
    expect(parseEntryForm(form({ title: '  A title ', text: ' one\r\ntwo ' }))).toEqual({ draft: { title: 'A title', text: 'one\ntwo' } });
    expect(parseEntryForm(form({ text: 'only text' }))).toEqual({ draft: { title: '', text: 'only text' } });
  });

  it('rejects empty or long text and a long title, keeping what was typed', () => {
    for (const fields of <Record<string, string>[]>[{ text: '  ' }, { text: 'x'.repeat(5001) }, { text: 'ok', title: 'x'.repeat(121) }]) {
      const result = parseEntryForm(form(fields));
      expect(result.error).toBe(ENTRY_INVALID);
      expect(result.draft.text).toBe((fields.text ?? '').trim());
    }
    expect(EMPTY_ENTRY).toEqual({ title: '', text: '' });
  });
});

describe('entry replies', () => {
  const AT = '2026-10-12T20:00:00.000Z';

  it('parses, sets, clears and drops replies by entry id', () => {
    expect(parseEntryReplies(null)).toEqual([]);
    let list = setEntryReply([], ID1, { heart: true, text: 'hi' }, AT);
    expect(parseEntryReplies(JSON.stringify(list))).toEqual([{ id: ID1, heart: true, text: 'hi', at: AT }]);
    list = setEntryReply(list, ID2, { heart: true, text: '' }, AT);
    expect(setEntryReply(list, ID1, { heart: false, text: '' }, AT).map((r) => r.id)).toEqual([ID2]);
    expect(dropEntryReply(list, ID2).map((r) => r.id)).toEqual([ID1]);
  });

  it('throws on invalid stored replies', () => {
    for (const raw of ['garbage', JSON.stringify([{ id: 'x', heart: true, text: '', at: AT }]), JSON.stringify([{ id: ID1, heart: false, text: '', at: AT }])]) {
      expect(() => parseEntryReplies(raw), raw).toThrow();
    }
  });
});
