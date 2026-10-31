import { describe, it, expect } from 'vitest';
import { readingRoomPage, readingRoomErrorPage, readingRoomAdminPage, ROOM_SCRIPT } from '../worker/reading-room-views';
import { readerPage, formatDate } from '../worker/views';
import { spineLook, type Book } from '../worker/books';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const KEY1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const KEY2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp3';
const books: Book[] = [
  { id: ID1, title: 'Sonnet <116>', author: 'William Shakespeare', line: 'read this\nwhen you can\'t sleep', created: '2026-11-02T22:00:00.000Z', audio: { key: KEY1, type: 'audio/mp4' } },
  { id: ID2, title: 'Persuasion', author: 'Jane Austen', line: '', created: '2026-11-04T21:00:00.000Z', audio: { key: KEY2, type: 'audio/mpeg' } },
];
const played = [{ id: ID1, at: '2026-11-03T22:10:00.000Z' }];
const page = (extra: Partial<Parameters<typeof readingRoomPage>[0]> = {}) => readingRoomPage({
  books, played, replies: [], back: '/for-you', mediaBase: '/for-you/media',
  playAction: '/for-you/reading-room/played', reply: { action: '/for-you/reading-room/reply', csrf: 'tok' }, ...extra,
});

describe('reading room', () => {
  it('shows the shelf with a way back, spines in order with their own look, and a ribbon on unplayed books', () => {
    const html = page();
    expect(html).toContain(ROBOTS);
    expect(html).toContain('href="/for-you">Back to your notes</a>');
    expect(html).toContain('<h1>The reading room</h1>');
    const look = spineLook(ID1);
    expect(html).toContain(`<a class="book" href="/for-you/reading-room?open=${ID1}" data-id="${ID1}" style="--h:${look.height}%;--w:${look.width}rem;--c:${look.colour}">`);
    expect(html).toContain(`<a class="book new" href="/for-you/reading-room?open=${ID2}" data-id="${ID2}"`);
    expect(html).toContain('<span class="title">Sonnet &lt;116&gt;</span><span class="author">William Shakespeare</span>');
    expect(html.indexOf(`data-id="${ID1}"`)).toBeLessThan(html.indexOf(`data-id="${ID2}"`));
    expect(html).toContain('data-played="/for-you/reading-room/played" data-csrf="tok"');
  });

  it('has a hidden sheet per book with its words, date, player and reply area, and opens the asked one', () => {
    const html = page({ open: ID2, replies: [{ id: ID2, heart: true, text: 'more please', at: played[0].at }] });
    expect(html).toContain(`<div class="sheet-wrap" id="book-${ID1}" hidden>`);
    expect(html).toContain(`<div class="sheet-wrap" id="book-${ID2}">`);
    expect(html).toContain('<h2>Sonnet &lt;116&gt;</h2>');
    expect(html).toContain('<p class="by">by William Shakespeare</p>');
    expect(html).toContain('<p class="line">read this\nwhen you can&#39;t sleep</p>');
    expect(html.match(/<p class="line">/g)).toHaveLength(1);
    expect(html).toContain(`Read on ${formatDate('2026-11-02')}`);
    expect(html).toContain(`<audio controls preload="none" src="/for-you/media/${KEY1}" data-id="${ID1}" data-title="Sonnet &lt;116&gt;" data-author="William Shakespeare"></audio>`);
    expect(html).toContain(`id="reply-${ID2}"`);
    expect(html).toContain('You sent ♥ “more please”');
    expect(html).toContain('action="/for-you/reading-room/reply"');
    expect(html).toContain('<a class="close" href="/for-you/reading-room">Close</a>');
    expect(html).toContain(ROOM_SCRIPT);
    expect(page({ open: 'nonsense' })).not.toMatch(/<div class="sheet-wrap" id="book-[^"]+">/);
  });

  it('shows a failed reply on its sheet', () => {
    expect(page({ open: ID1, unsent: ID1 })).toContain('That didn&#39;t send. Try again?');
  });

  it('shows an empty shelf with a quiet line and no script', () => {
    const html = page({ books: [], played: [] });
    expect(html).toContain('Nothing on the shelf yet.');
    expect(html).toContain('class="shelves"');
    expect(html).not.toContain('<script>');
  });

  it('previews without recording plays or replies', () => {
    const html = page({ preview: '/for-you/admin/reading-room/preview', mediaBase: '/for-you/admin/media', playAction: undefined, reply: undefined });
    expect(html).toContain(`href="/for-you/admin/reading-room/preview?open=${ID1}"`);
    expect(html).toContain(`src="/for-you/admin/media/${KEY1}"`);
    expect(html).not.toContain('data-played="');
    expect(html).toContain('<fieldset disabled>');
    expect(html).toContain('<a class="close" href="/for-you/admin/reading-room/preview">Close</a>');
  });

  it('has an error page', () => {
    expect(readingRoomErrorPage()).toContain('Something went wrong loading this page.');
  });

  it('keeps the script free of anything from the books, and sends replies in the background', () => {
    expect(ROOM_SCRIPT).not.toContain('Persuasion');
    expect(ROOM_SCRIPT).toContain('mediaSession');
    expect(ROOM_SCRIPT).toContain('localStorage');
    expect(ROOM_SCRIPT).toContain('quiet=1');
  });
});

describe('reading room link on the notes page', () => {
  const note = { date: '2026-11-02', text: 'today' };

  it('sits under today\'s note, before the moon link, with a dot while a book is unplayed', () => {
    const html = readerPage({
      current: note, archive: [], mediaBase: '/m',
      reading: { href: '/for-you/reading-room', unread: true },
      afterDark: { href: '/for-you/after-dark', newest: ID1 },
    });
    expect(html).toContain('<p class="reading-link"><a href="/for-you/reading-room" class="unread">');
    expect(html).toContain('The reading room</a>');
    expect(html.indexOf('<p class="reading-link">')).toBeGreaterThan(html.indexOf('<p class="message">'));
    expect(html.indexOf('<p class="reading-link">')).toBeLessThan(html.indexOf('<p class="after-dark-link">'));
    const quiet = readerPage({ current: note, archive: [], mediaBase: '/m', reading: { href: '/for-you/reading-room', unread: false } });
    expect(quiet).toContain('<p class="reading-link"><a href="/for-you/reading-room">');
    expect(readerPage({ current: note, archive: [], mediaBase: '/m' })).not.toContain('<p class="reading-link">');
  });
});

describe('reading room admin', () => {
  const data = {
    base: '/for-you', csrf: 'tok', books, played,
    replies: [{ id: ID1, heart: true, text: 'hi', at: played[0].at }],
    draft: { title: '', author: '', line: '' },
  };

  it('shows the form and the list with play times and replies', () => {
    const html = readingRoomAdminPage(data);
    expect(html).toContain('href="/for-you/admin">← Notes</a>');
    expect(html).toContain('href="/for-you/admin/reading-room/preview">Preview</a>');
    expect(html).toContain('<h2>Add a book</h2>');
    expect(html).toContain('<form class="write" method="post" enctype="multipart/form-data" action="/for-you/admin/reading-room/save">');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="author"');
    expect(html).toContain('name="line"');
    expect(html).toContain('<input type="file" name="audio" accept="audio/*,.m4a" required>');
    expect(html).toContain('Listened 3 Nov, 23:10');
    expect(html).toContain('Not played yet');
    expect(html).toContain('<strong>Sonnet &lt;116&gt;</strong> · William Shakespeare');
    expect(html).toContain('♥ “hi”');
    expect(html).toContain(`href="/for-you/admin/reading-room?edit=${ID2}">Edit</a>`);
    expect(html).toContain('action="/for-you/admin/reading-room/delete"');
    expect(html).toContain(`<audio controls preload="none" src="/for-you/admin/media/${KEY1}"></audio>`);
  });

  it('edits a book: carries its id, shows its words and makes the recording optional', () => {
    const html = readingRoomAdminPage({ ...data, editing: books[1], draft: { title: 'Persuasion', author: 'Jane Austen', line: '' } });
    expect(html).toContain('<h2>Edit book</h2>');
    expect(html).toContain(`<input type="hidden" name="id" value="${ID2}">`);
    expect(html).toContain('value="Persuasion"');
    expect(html).toContain('<input type="file" name="audio" accept="audio/*,.m4a">');
    expect(html).toContain('Leave empty to keep the current recording.');
  });

  it('shows errors and flash messages', () => {
    const html = readingRoomAdminPage({ ...data, error: 'A new book needs its recording.', flash: 'Saved.' });
    expect(html).toContain('<p class="error">A new book needs its recording.</p>');
    expect(html).toContain('<p class="flash">Saved.</p>');
  });
});
