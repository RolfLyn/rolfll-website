import { describe, it, expect } from 'vitest';
import { doorwayPage, roomPage, roomErrorPage, afterDarkAdminPage } from '../worker/after-dark-views';
import type { Entry } from '../worker/after-dark';
import { formatDate } from '../worker/views';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const entries: Entry[] = [
  { id: ID2, title: 'A <b>title</b>', text: 'second\nentry', created: '2026-10-12T19:00:00.000Z', audio: { key: KEY, type: 'audio/mp4' } },
  { id: ID1, title: '', text: 'first entry', created: '2026-10-01T22:30:00.000Z' },
];
const form = { action: '/for-you/after-dark/reply', csrf: 'tok' };

describe('doorway', () => {
  it('asks her to come in with the reader csrf, with a way back', () => {
    const html = doorwayPage({ enter: '/for-you/after-dark/enter', csrf: 'tok', back: '/for-you' });
    expect(html).toContain(ROBOTS);
    expect(html).toContain("This part is just for when you're alone.");
    expect(html).toContain('<form method="post" action="/for-you/after-dark/enter">');
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
    expect(html).toContain('href="/for-you">Back to your notes</a>');
    expect(html).toContain('#1a1220');
  });
});

describe('room', () => {
  it('shows entries newest first, escaped, with date, sound, reply areas and a leave button', () => {
    const html = roomPage({ entries, replies: [], mediaBase: '/for-you/media', leave: '/for-you/after-dark/leave', reply: form });
    expect(html.indexOf('second\nentry')).toBeLessThan(html.indexOf('first entry'));
    expect(html).toContain('<h2>A &lt;b&gt;title&lt;/b&gt;</h2>');
    expect(html.match(/<h2>/g)).toHaveLength(1);
    expect(html).toContain(formatDate('2026-10-12'));
    expect(html).toContain(formatDate('2026-10-02'));
    expect(html).toContain(`<audio controls preload="none" src="/for-you/media/${KEY}"></audio>`);
    expect(html).toContain(`id="entry-${ID1}"`);
    expect(html).toContain(`<input type="hidden" name="id" value="${ID2}">`);
    expect(html).toContain('action="/for-you/after-dark/reply"');
    expect(html).toContain('<form method="post" action="/for-you/after-dark/leave"><button type="submit">Leave</button></form>');
    expect(html).toContain(`data-newest="${ID2}"`);
    expect(html).toContain("localStorage.setItem('after-dark-seen'");
    expect(html).toContain('event.target.form.submit()');
  });

  it('shows her reply and the gentle error under the right entry', () => {
    const html = roomPage({
      entries, replies: [{ id: ID1, heart: true, text: 'yes', at: '2026-10-12T20:00:00.000Z' }],
      mediaBase: '/m', leave: '/l', reply: form, unsent: ID2,
    });
    expect(html).toContain('You sent ♥ “yes”');
    expect(html.match(/That didn&#39;t send/g)).toHaveLength(1);
    expect(html.indexOf("That didn&#39;t send")).toBeLessThan(html.indexOf(`id="entry-${ID1}"`));
  });

  it('turns replies off in preview, does not mark anything read, and has no leave button', () => {
    const html = roomPage({ entries, replies: [], mediaBase: '/m', preview: true });
    expect(html).toContain('<fieldset disabled>');
    expect(html).not.toContain('after-dark-seen');
    expect(html).not.toContain('Leave</button>');
    expect(html).not.toContain('event.target.form.submit()');
  });

  it('leaves reply areas out when replies cannot be read, and says when it is empty', () => {
    expect(roomPage({ entries, replies: null, mediaBase: '/m', leave: '/l', reply: form })).not.toContain('class="reply"');
    expect(roomPage({ entries: [], replies: [], mediaBase: '/m', leave: '/l', reply: form })).toContain('Nothing here yet.');
    expect(roomErrorPage()).toContain('Something went wrong loading this page.');
  });
});

describe('after dark admin', () => {
  const base = { base: '/for-you', csrf: 'tok123', entries, replies: [{ id: ID1, heart: false, text: '<3', at: '2026-10-12T20:05:00.000Z' }], draft: { title: '', text: '' } };

  it('lists entries with edit, delete, sound tag and her reply, plus a preview link', () => {
    const html = afterDarkAdminPage(base);
    expect(html).toContain(ROBOTS);
    expect(html).toContain(`href="/for-you/admin/after-dark?edit=${ID2}"`);
    expect(html).toContain('action="/for-you/admin/after-dark/delete"');
    expect(html).toContain(`<input type="hidden" name="id" value="${ID1}">`);
    expect(html).toContain('<span class="tag">Sound</span>');
    expect(html).toContain('<p class="reply-line">“&lt;3”');
    expect(html).toContain('href="/for-you/admin/after-dark/preview"');
    expect(html).toContain('href="/for-you/admin"');
    expect(html).toContain('enctype="multipart/form-data" action="/for-you/admin/after-dark/save"');
  });

  it('prefills an entry being edited, with its sound and a remove option', () => {
    const html = afterDarkAdminPage({ ...base, editing: entries[0], draft: { title: entries[0].title, text: entries[0].text } });
    expect(html).toContain(`<input type="hidden" name="id" value="${ID2}">`);
    expect(html).toContain('value="A &lt;b&gt;title&lt;/b&gt;"');
    expect(html).toContain('>second\nentry</textarea>');
    expect(html).toContain(`src="/for-you/admin/media/${KEY}"`);
    expect(html).toContain('name="remove_audio" value="1"');
  });

  it('shows errors and flash messages', () => {
    const html = afterDarkAdminPage({ ...base, error: 'Nope.', flash: 'Saved.' });
    expect(html).toContain('<p class="error">Nope.</p>');
    expect(html).toContain('<p class="flash">Saved.</p>');
  });
});
