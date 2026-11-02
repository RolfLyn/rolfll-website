import { describe, it, expect } from 'vitest';
import {
  parseLog, parseSettings, addCard, editCard, deleteCard, addComment, removeComment, placeCard, markSeen, mergeList,
  parseCardForm, parseCommentForm, parseSettingsForm, EMPTY_LOG, DEFAULT_SETTINGS, NEW_BOX, CARD_INVALID, COMMENT_INVALID, SETTINGS_INVALID,
  type ListLog, type ListSettings,
} from '../worker/list';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const K = '44444444-4444-4444-8444-444444444444';
const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';
const [BOX1, BOX2] = DEFAULT_SETTINGS.boxes.map((b) => b.id);
const NO_MATCH = DEFAULT_SETTINGS.boxes.find((b) => b.noMatch)!.id;
const card = (id: string, at = T1) => ({ id, title: `title ${id[0]}`, text: `text ${id[0]}`, at });
const logWith = (extra: Partial<ListLog>): ListLog => ({ ...EMPTY_LOG, ...extra });
const merged = (reader: ListLog, admin: ListLog, me: 'reader' | 'admin' = 'reader', settings: ListSettings = DEFAULT_SETTINGS) =>
  mergeList({ reader, admin }, me, settings);
const find = (view: ReturnType<typeof merged>, id: string) => view.boxes.flatMap((b) => b.cards).find((c) => c.id === id)!;

describe('parsing', () => {
  it('treats missing keys as empty logs and default settings, and round-trips', () => {
    expect(parseLog(null)).toEqual(EMPTY_LOG);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    const log = logWith({
      cards: [card(A)], edits: [{ id: B, title: 't', text: '', at: T2 }], comments: [{ id: K, card: A, text: 'c', at: T2 }],
      gone: [C], places: [{ card: A, box: BOX1 }], seen: T3,
    });
    expect(parseLog(JSON.stringify({ ...log, extra: 1 }))).toEqual(log);
    expect(parseSettings(JSON.stringify(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('throws on anything invalid', () => {
    for (const raw of [
      'garbage', '[]',
      JSON.stringify({ ...EMPTY_LOG, cards: [{ ...card(A), id: 'x' }] }),
      JSON.stringify({ ...EMPTY_LOG, cards: [{ ...card(A), title: ' ' }] }),
      JSON.stringify({ ...EMPTY_LOG, cards: [{ ...card(A), title: 'x'.repeat(101) }] }),
      JSON.stringify({ ...EMPTY_LOG, cards: [{ ...card(A), text: 'x'.repeat(1001) }] }),
      JSON.stringify({ ...EMPTY_LOG, comments: [{ id: K, card: A, text: 'x'.repeat(1001), at: T1 }] }),
      JSON.stringify({ ...EMPTY_LOG, places: [{ card: 'x', box: BOX1 }] }),
      JSON.stringify({ ...EMPTY_LOG, gone: ['x'] }),
    ]) {
      expect(() => parseLog(raw), raw).toThrow();
    }
    for (const raw of ['garbage', '{}', JSON.stringify({ ...DEFAULT_SETTINGS, boxes: [] }), JSON.stringify({ ...DEFAULT_SETTINGS, readerName: '' })]) {
      expect(() => parseSettings(raw), raw).toThrow();
    }
  });
});

describe('changing your own log', () => {
  it('adds and edits, keeping one edit per card', () => {
    let log = addCard(EMPTY_LOG, card(A));
    expect(log.cards).toEqual([card(A)]);
    log = editCard(log, { id: B, title: 'one', text: '', at: T1 });
    log = editCard(log, { id: B, title: 'two', text: '', at: T2 });
    expect(log.edits).toEqual([{ id: B, title: 'two', text: '', at: T2 }]);
  });

  it('deletes by leaving the id behind and dropping everything of its own about that card', () => {
    const log = deleteCard(logWith({
      cards: [card(A), card(B)], edits: [{ id: A, title: 't', text: '', at: T2 }],
      comments: [{ id: K, card: A, text: 'c', at: T2 }], places: [{ card: A, box: BOX1 }, { card: B, box: BOX1 }],
    }), A);
    expect(log).toEqual(logWith({ cards: [card(B)], gone: [A], places: [{ card: B, box: BOX1 }] }));
    expect(deleteCard(log, A).gone).toEqual([A]);
  });

  it('adds and removes comments, reporting whether one was yours', () => {
    const log = addComment(EMPTY_LOG, { id: K, card: A, text: 'c', at: T1 });
    expect(removeComment(log, K).comments).toEqual([]);
    expect(removeComment(log, C)).toBe(log);
  });

  it('places cards at an index within a box, clamps it, and takes them out for New', () => {
    let log = placeCard(EMPTY_LOG, A, BOX1, 0);
    log = placeCard(log, B, BOX1, 0);
    log = placeCard(log, C, BOX1, 99);
    log = placeCard(log, K, BOX2, 0);
    const order = (l: ListLog, box: string) => l.places.filter((p) => p.box === box).map((p) => p.card);
    expect(order(log, BOX1)).toEqual([B, A, C]);
    log = placeCard(log, C, BOX1, 1);
    expect(order(log, BOX1)).toEqual([B, C, A]);
    log = placeCard(log, B, BOX2, 1);
    expect(order(log, BOX1)).toEqual([C, A]);
    expect(order(log, BOX2)).toEqual([K, B]);
    log = placeCard(log, K, NEW_BOX, 0);
    expect(order(log, BOX2)).toEqual([B]);
    expect(log.places.some((p) => p.card === K)).toBe(false);
  });

  it('marks when you last looked', () => {
    expect(markSeen(EMPTY_LOG, T2).seen).toBe(T2);
  });
});

describe('mergeList', () => {
  it('shows new cards in New, newest first, with both people as authors', () => {
    const view = merged(logWith({ cards: [card(A, T1)] }), logWith({ cards: [card(B, T2)] }));
    expect(view.count).toBe(2);
    expect(view.boxes[0].id).toBe(NEW_BOX);
    expect(view.boxes[0].cards.map((c) => [c.id, c.author])).toEqual([[B, 'admin'], [A, 'reader']]);
    expect(view.boxes.map((b) => b.name).slice(1)).toEqual(DEFAULT_SETTINGS.boxes.map((b) => b.name));
  });

  it('sorts by my placements and shows the other person\'s box', () => {
    const reader = logWith({ cards: [card(A), card(B)], places: [{ card: B, box: BOX1 }, { card: A, box: BOX1 }] });
    const admin = logWith({ places: [{ card: A, box: BOX2 }] });
    const mine = merged(reader, admin);
    expect(mine.boxes.find((b) => b.id === BOX1)!.cards.map((c) => c.id)).toEqual([B, A]);
    expect(find(mine, A)).toMatchObject({ mine: BOX1, theirs: BOX2, match: false });
    expect(find(mine, B)).toMatchObject({ mine: BOX1, theirs: NEW_BOX, match: false });
    const theirs = merged(reader, admin, 'admin');
    expect(find(theirs, A)).toMatchObject({ mine: BOX2, theirs: BOX1 });
    expect(find(theirs, B).mine).toBe(NEW_BOX);
  });

  it('matches on the same box, but not in New or a no-match box', () => {
    const places = (box: string) => [{ card: A, box }];
    const view = (box: string) => find(merged(logWith({ cards: [card(A)], places: places(box) }), logWith({ places: places(box) })), A);
    expect(view(BOX1).match).toBe(true);
    expect(view(NO_MATCH).match).toBe(false);
    expect(find(merged(logWith({ cards: [card(A)] }), EMPTY_LOG), A).match).toBe(false);
  });

  it('lets the latest edit win across both logs, whoever wrote the card', () => {
    const reader = logWith({ cards: [card(A)], edits: [{ id: A, title: 'from her', text: 'r', at: T2 }] });
    const admin = logWith({ edits: [{ id: A, title: 'from him', text: 'a', at: T3 }] });
    expect(find(merged(reader, admin), A)).toMatchObject({ title: 'from him', text: 'a', edited: true, author: 'reader' });
    expect(find(merged(logWith({ ...reader, edits: [{ id: A, title: 'later', text: 'r', at: T3 }] }), { ...admin, edits: [{ id: A, title: 'earlier', text: 'a', at: T2 }] }), A).title).toBe('later');
    expect(find(merged(logWith({ cards: [card(A)] }), EMPTY_LOG), A).edited).toBe(false);
  });

  it('keeps a removed card removed, whoever removed it, even if the other log still has it', () => {
    const reader = logWith({ cards: [card(A), card(B)], places: [{ card: A, box: BOX1 }] });
    const view = merged(reader, logWith({ gone: [A], comments: [{ id: K, card: A, text: 'c', at: T2 }] }));
    expect(view.count).toBe(1);
    expect(view.boxes.flatMap((b) => b.cards).map((c) => c.id)).toEqual([B]);
  });

  it('merges comments oldest first with authors', () => {
    const reader = logWith({ cards: [card(A)], comments: [{ id: K, card: A, text: 'second', at: T2 }] });
    const admin = logWith({ comments: [{ id: C, card: A, text: 'first', at: T1 }, { id: B, card: A, text: 'third', at: T3 }] });
    expect(find(merged(reader, admin), A).comments.map((c) => [c.text, c.author])).toEqual([
      ['first', 'admin'], ['second', 'reader'], ['third', 'admin'],
    ]);
  });

  it('returns a card in a removed box to New', () => {
    const settings = { ...DEFAULT_SETTINGS, boxes: DEFAULT_SETTINGS.boxes.filter((b) => b.id !== BOX1) };
    const view = merged(logWith({ cards: [card(A)], places: [{ card: A, box: BOX1 }] }), logWith({ places: [{ card: A, box: BOX1 }] }), 'reader', settings);
    expect(find(view, A)).toMatchObject({ mine: NEW_BOX, theirs: NEW_BOX, match: false });
    expect(view.boxes[0].cards.map((c) => c.id)).toEqual([A]);
  });

  it('marks what the other person did since I last looked, and never my own changes', () => {
    const admin = logWith({ cards: [card(A, T2)] });
    expect(find(merged(logWith({ seen: T1 }), admin), A).fresh).toBe(true);
    expect(merged(logWith({ seen: T1 }), admin).fresh).toBe(true);
    expect(merged(logWith({ seen: T3 }), admin).fresh).toBe(false);
    expect(merged(EMPTY_LOG, admin).fresh).toBe(true);
    expect(merged(logWith({ cards: [card(A, T2)] }), EMPTY_LOG).fresh).toBe(false);
    const commented = logWith({ comments: [{ id: K, card: A, text: 'c', at: T3 }] });
    expect(find(merged(logWith({ cards: [card(A, T1)], seen: T2 }), commented), A).fresh).toBe(true);
    const edited = logWith({ edits: [{ id: A, title: 't', text: '', at: T3 }] });
    expect(find(merged(logWith({ cards: [card(A, T1)], seen: T2 }), edited), A).fresh).toBe(true);
  });
});

describe('forms', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('checks cards, keeping what was typed', () => {
    expect(parseCardForm(form({ title: ' A ', text: ' one\r\ntwo ' }))).toEqual({ draft: { title: 'A', text: 'one\ntwo' } });
    expect(parseCardForm(form({ title: 'A' }))).toEqual({ draft: { title: 'A', text: '' } });
    expect(parseCardForm(form({ text: 'kept' }))).toEqual({ draft: { title: '', text: 'kept' }, error: CARD_INVALID });
    expect(parseCardForm(form({ title: 'x'.repeat(101) })).error).toBe(CARD_INVALID);
    expect(parseCardForm(form({ title: 'A', text: 'x'.repeat(1001) })).error).toBe(CARD_INVALID);
  });

  it('checks comments', () => {
    expect(parseCommentForm(form({ text: ' hi ' }))).toEqual({ text: 'hi' });
    expect(parseCommentForm(form({ text: ' ' }))).toEqual({ text: '', error: COMMENT_INVALID });
    expect(parseCommentForm(form({ text: 'x'.repeat(1001) })).error).toBe(COMMENT_INVALID);
  });

  it('renames, removes and adds boxes before any no-match box, keeping ids', () => {
    const fields: Record<string, string> = { reader_name: ' R ', admin_name: 'S' };
    DEFAULT_SETTINGS.boxes.forEach((b, i) => { fields[`box_${b.id}`] = i === 0 ? ' Renamed ' : i === 1 ? '' : b.name; });
    fields.new_box = 'Added';
    const { settings, error } = parseSettingsForm(form(fields), DEFAULT_SETTINGS, () => K);
    expect(error).toBeUndefined();
    expect(settings!.readerName).toBe('R');
    expect(settings!.boxes[0]).toEqual({ id: BOX1, name: 'Renamed' });
    expect(settings!.boxes.some((b) => b.id === BOX2)).toBe(false);
    expect(settings!.boxes.at(-2)).toEqual({ id: K, name: 'Added' });
    expect(settings!.boxes.at(-1)).toMatchObject({ id: NO_MATCH, noMatch: true });
  });

  it('rejects removing every box, empty names and long names', () => {
    const named = (extra: Record<string, string>) => ({ reader_name: 'R', admin_name: 'S', ...extra });
    expect(parseSettingsForm(form(named({})), DEFAULT_SETTINGS, () => K).error).toBe(SETTINGS_INVALID);
    const keep = Object.fromEntries(DEFAULT_SETTINGS.boxes.map((b) => [`box_${b.id}`, b.name]));
    expect(parseSettingsForm(form({ ...keep, admin_name: 'S' }), DEFAULT_SETTINGS, () => K).error).toBe(SETTINGS_INVALID);
    expect(parseSettingsForm(form(named({ ...keep, new_box: 'x'.repeat(41) })), DEFAULT_SETTINGS, () => K).error).toBe(SETTINGS_INVALID);
    expect(parseSettingsForm(form(named(keep)), DEFAULT_SETTINGS, () => K).settings).toEqual({ ...DEFAULT_SETTINGS, readerName: 'R', adminName: 'S' });
  });
});
