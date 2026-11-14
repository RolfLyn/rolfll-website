import { describe, it, expect } from 'vitest';
import { formatEmphasis } from '../worker/html';
import { roomPage, afterDarkAdminPage } from '../worker/after-dark-views';
import type { Entry } from '../worker/after-dark';
import { readerPage, adminPage } from '../worker/views';

describe('formatEmphasis', () => {
  it('turns **text** into bold', () => {
    expect(formatEmphasis('you are **so** loved')).toBe('you are <strong>so</strong> loved');
  });
  it('turns *text* into italic', () => {
    expect(formatEmphasis('you are *so* loved')).toBe('you are <em>so</em> loved');
  });
  it('handles both in one line, and several words inside', () => {
    expect(formatEmphasis('**all of you** and *every bit*')).toBe('<strong>all of you</strong> and <em>every bit</em>');
  });
  it('escapes everything else, including html inside the stars', () => {
    expect(formatEmphasis('**<b>x</b>** & "y"')).toBe('<strong>&lt;b&gt;x&lt;/b&gt;</strong> &amp; &quot;y&quot;');
  });
  it('leaves lone or spaced stars alone', () => {
    expect(formatEmphasis('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(formatEmphasis('a star * here')).toBe('a star * here');
    expect(formatEmphasis('** not bold **')).toBe('** not bold **');
    expect(formatEmphasis('****')).toBe('****');
  });
  it('does not run across lines', () => {
    expect(formatEmphasis('*one\ntwo*')).toBe('*one\ntwo*');
  });
});

const entry: Entry = { id: '11111111-1111-4111-8111-111111111111', title: '**Title**', text: 'you are **so** *loved*', created: '2026-10-01T22:30:00.000Z' };

describe('after dark shows emphasis', () => {
  it('on her page, in the text but not the title', () => {
    const html = roomPage({ entries: [entry], replies: [], mediaBase: '/m', leave: '/l', reply: { action: '/r', csrf: 't' } });
    expect(html).toContain('<p class="text">you are <strong>so</strong> <em>loved</em></p>');
    expect(html).toContain('<h2>**Title**</h2>');
  });
  it('in the admin list', () => {
    const html = afterDarkAdminPage({ base: '/a', csrf: 't', entries: [entry], replies: [], draft: { title: '', text: '' } });
    expect(html).toContain('<p class="text">you are <strong>so</strong> <em>loved</em></p>');
  });
});

describe('daily notes show emphasis', () => {
  const note = { date: '2026-11-14', text: '**Bold.** and *soft*\n\nnext line' };
  it('on her page and in preview', () => {
    for (const preview of [false, true]) {
      const html = readerPage({ current: note, archive: [], mediaBase: '/m', preview } as Parameters<typeof readerPage>[0]);
      expect(html).toContain('<strong>Bold.</strong> and <em>soft</em>');
      expect(html).not.toContain('**');
    }
  });
  it('in admin, both today and the list', () => {
    const html = adminPage({ base: '/a', today: '2026-11-14', current: note, csrf: 't', notes: [note], form: { date: '2026-11-14', text: '' } } as Parameters<typeof adminPage>[0]);
    expect(html.match(/<strong>Bold\.<\/strong> and <em>soft<\/em>/g)?.length).toBe(2);
  });
});
