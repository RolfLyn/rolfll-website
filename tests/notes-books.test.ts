import { describe, it, expect } from 'vitest';
import {
  parseBooks, upsertBook, removeBook, bookKeys, parseBookForm, parsePlayed, markPlayed, dropPlayed, spineLook,
  BOOK_INVALID, EMPTY_BOOK, SPINE_COLOURS, type Book,
} from '../worker/books';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const KEY2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp3';
const book = (id: string, created: string, extra: Partial<Book> = {}): Book =>
  ({ id, title: 'A title', author: 'An author', line: '', created, audio: { key: KEY1, type: 'audio/mp4' }, ...extra });

describe('parseBooks', () => {
  it('treats a missing key as none, sorts oldest first, and drops extra fields', () => {
    expect(parseBooks(null)).toEqual([]);
    const raw = JSON.stringify([
      { ...book(ID2, '2026-11-05T10:00:00.000Z', { audio: { key: KEY2, type: 'audio/mpeg' } }), extra: 1 },
      book(ID1, '2026-11-01T10:00:00.000Z', { line: 'for you' }),
    ]);
    expect(parseBooks(raw)).toEqual([
      book(ID1, '2026-11-01T10:00:00.000Z', { line: 'for you' }),
      book(ID2, '2026-11-05T10:00:00.000Z', { audio: { key: KEY2, type: 'audio/mpeg' } }),
    ]);
  });

  it('throws on anything invalid', () => {
    const ok = book(ID1, '2026-11-01T10:00:00.000Z');
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...ok, id: 'nope' }]),
      JSON.stringify([{ ...ok, title: ' ' }]),
      JSON.stringify([{ ...ok, title: 'x'.repeat(121) }]),
      JSON.stringify([{ ...ok, author: '' }]),
      JSON.stringify([{ ...ok, line: 'x'.repeat(201) }]),
      JSON.stringify([{ ...ok, created: 'never' }]),
      JSON.stringify([{ ...ok, audio: undefined }]),
      JSON.stringify([{ ...ok, audio: { key: '../x', type: 'audio/mp4' } }]),
      JSON.stringify([ok, ok]),
    ]) {
      expect(() => parseBooks(raw), raw).toThrow();
    }
  });
});

describe('editing books', () => {
  it('upserts by id keeping oldest first, removes by id, and lists recording keys', () => {
    const a = book(ID1, '2026-11-01T10:00:00.000Z');
    const b = book(ID2, '2026-11-05T10:00:00.000Z', { audio: { key: KEY2, type: 'audio/mpeg' } });
    let list = upsertBook(upsertBook([], b), a);
    expect(list.map((x) => x.id)).toEqual([ID1, ID2]);
    list = upsertBook(list, { ...a, title: 'changed' });
    expect(list.map((x) => x.title)).toEqual(['changed', 'A title']);
    expect(bookKeys(list)).toEqual([KEY1, KEY2]);
    expect(removeBook(list, ID1).map((x) => x.id)).toEqual([ID2]);
  });
});

describe('parseBookForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('trims the fields and allows an empty line', () => {
    expect(parseBookForm(form({ title: ' Persuasion ', author: ' Jane Austen ', line: ' one\r\ntwo ' })))
      .toEqual({ draft: { title: 'Persuasion', author: 'Jane Austen', line: 'one\ntwo' } });
    expect(parseBookForm(form({ title: 'T', author: 'A' }))).toEqual({ draft: { title: 'T', author: 'A', line: '' } });
  });

  it('rejects a missing or long title or author, or a long line, keeping what was typed', () => {
    for (const fields of <Record<string, string>[]>[
      { author: 'A' }, { title: 'T' }, { title: 'x'.repeat(121), author: 'A' },
      { title: 'T', author: 'x'.repeat(121) }, { title: 'T', author: 'A', line: 'x'.repeat(201) },
    ]) {
      const result = parseBookForm(form(fields));
      expect(result.error).toBe(BOOK_INVALID);
      expect(result.draft.title).toBe(fields.title ?? '');
    }
    expect(EMPTY_BOOK).toEqual({ title: '', author: '', line: '' });
  });
});

describe('played books', () => {
  const AT = '2026-11-03T22:10:00.000Z';
  const LATER = '2026-11-04T22:10:00.000Z';

  it('keeps the first play, returns the same list when already played, and drops by id', () => {
    expect(parsePlayed(null)).toEqual([]);
    const played = markPlayed([], ID1, AT);
    expect(played).toEqual([{ id: ID1, at: AT }]);
    expect(markPlayed(played, ID1, LATER)).toBe(played);
    const two = markPlayed(played, ID2, LATER);
    expect(parsePlayed(JSON.stringify(two))).toEqual(two);
    expect(dropPlayed(two, ID1)).toEqual([{ id: ID2, at: LATER }]);
  });

  it('throws on anything invalid', () => {
    for (const raw of ['garbage', '{}', JSON.stringify([{ id: 'x', at: AT }]), JSON.stringify([{ id: ID1, at: 'never' }])]) {
      expect(() => parsePlayed(raw), raw).toThrow();
    }
  });
});

describe('spineLook', () => {
  it('gives each book a fixed height, width and colour within bounds', () => {
    const a = spineLook(ID1);
    expect(spineLook(ID1)).toEqual(a);
    const looks = Array.from({ length: 40 }, (_, i) => spineLook(`${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`));
    for (const look of looks) {
      expect(look.height).toBeGreaterThanOrEqual(78);
      expect(look.height).toBeLessThanOrEqual(100);
      expect(look.width).toBeGreaterThanOrEqual(2.4);
      expect(look.width).toBeLessThanOrEqual(3.4);
      expect(SPINE_COLOURS).toContain(look.colour);
    }
    expect(new Set(looks.map((l) => l.colour)).size).toBeGreaterThan(3);
    expect(new Set(looks.map((l) => l.height)).size).toBeGreaterThan(5);
  });
});
