import { describe, it, expect } from 'vitest';
import { parseReplies, parseReplyForm, setReply, moveReply, dropReply, REPLY_MAX } from '../worker/replies';

const AT = '2026-10-11T12:00:00.000Z';
const r = (date: string, heart = true, text = '') => ({ date, heart, text, at: AT });

describe('parseReplies', () => {
  it('treats a missing key as no replies and copies valid ones', () => {
    expect(parseReplies(null)).toEqual([]);
    expect(parseReplies(JSON.stringify([{ ...r('2026-10-01', false, 'hi'), extra: 1 }]))).toEqual([r('2026-10-01', false, 'hi')]);
  });

  it('throws on anything invalid', () => {
    for (const raw of [
      'garbage',
      '{}',
      JSON.stringify([{ ...r('2026-10-01'), heart: 'yes' }]),
      JSON.stringify([r('2026-10-01', true, 'x'.repeat(REPLY_MAX + 1))]),
      JSON.stringify([r('2026-10-01', false, '')]),
      JSON.stringify([{ ...r('2026-10-01'), at: 'never' }]),
      JSON.stringify([r('not-a-date')]),
    ]) {
      expect(() => parseReplies(raw), raw).toThrow();
    }
  });
});

describe('parseReplyForm', () => {
  const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

  it('reads the heart and trims the text, normalizing line endings', () => {
    expect(parseReplyForm(form({ heart: 'on', text: '  hi\r\nthere  ' }))).toEqual({ heart: true, text: 'hi\nthere' });
    expect(parseReplyForm(form({}))).toEqual({ heart: false, text: '' });
  });

  it('allows exactly the limit and refuses longer text', () => {
    expect(parseReplyForm(form({ text: 'x'.repeat(REPLY_MAX) }))?.text).toHaveLength(REPLY_MAX);
    expect(parseReplyForm(form({ text: 'x'.repeat(REPLY_MAX + 1) }))).toBeNull();
  });
});

describe('setReply / moveReply / dropReply', () => {
  it('adds, replaces, and removes a reply that is cleared', () => {
    let list = setReply([], '2026-10-01', { heart: true, text: '' }, AT);
    expect(list).toEqual([r('2026-10-01')]);
    list = setReply(list, '2026-10-01', { heart: false, text: 'hi' }, AT);
    expect(list).toEqual([r('2026-10-01', false, 'hi')]);
    expect(setReply(list, '2026-10-01', { heart: false, text: '' }, AT)).toEqual([]);
  });

  it('moves a reply to a new date, dropping whatever was there', () => {
    const list = [r('2026-10-01', true, 'a'), r('2026-10-02', true, 'b')];
    expect(moveReply(list, '2026-10-01', '2026-10-02')).toEqual([r('2026-10-02', true, 'a')]);
    expect(moveReply(list, undefined, '2026-10-02')).toEqual([r('2026-10-01', true, 'a')]);
    expect(moveReply(list, '2026-10-01', '2026-10-01')).toEqual(list);
  });

  it('drops a reply by date', () => {
    expect(dropReply([r('2026-10-01'), r('2026-10-02')], '2026-10-01')).toEqual([r('2026-10-02')]);
  });
});
