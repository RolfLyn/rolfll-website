import { describe, it, expect } from 'vitest';
import { listPage, listErrorPage, listSettingsPage, LIST_SCRIPT } from '../worker/list-views';
import { roomPage, afterDarkAdminPage } from '../worker/after-dark-views';
import { mergeList, DEFAULT_SETTINGS, EMPTY_LOG, type ListLog } from '../worker/list';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const K = '44444444-4444-4444-8444-444444444444';
const J = '55555555-5555-4555-8555-555555555555';
const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const reader: ListLog = {
  ...EMPTY_LOG,
  cards: [{ id: A, title: 'Card <A>', text: 'words\nof A', at: T1 }],
  comments: [{ id: K, card: A, text: 'mine <b>', at: T2 }],
  places: [{ card: A, box: 'yes-please' }],
  seen: T1,
};
const admin: ListLog = {
  ...EMPTY_LOG,
  cards: [{ id: B, title: 'Card B', text: '', at: T2 }],
  comments: [{ id: J, card: A, text: 'theirs', at: T2 }],
  places: [{ card: A, box: 'yes-please' }],
};
const view = mergeList({ reader, admin }, 'reader', DEFAULT_SETTINGS);
const page = (extra: Partial<Parameters<typeof listPage>[0]> = {}) => listPage({
  view, me: 'reader', settings: DEFAULT_SETTINGS, action: '/for-you/after-dark/list/save',
  home: '/for-you/after-dark/list', back: '/for-you/after-dark', csrf: 'tok', ...extra,
});

describe('list page', () => {
  it('shows New open and the other boxes closed with counts, and a way back', () => {
    const html = page();
    expect(html).toContain(ROBOTS);
    expect(html).toContain('<a href="/for-you/after-dark">Back</a><h1>Our list</h1>');
    expect(html).toContain('<details class="box" data-box="new" data-name="New" data-nomatch open><summary><span>New</span><span class="n">1</span>');
    expect(html).toContain('<details class="box" data-box="yes-please" data-name="Yes please"><summary><span>Yes please</span><span class="n">1</span>');
    expect(html).toContain('<details class="box" data-box="not-for-me" data-name="Not for me" data-nomatch><summary>');
    expect(html.indexOf('data-box="have-to"')).toBeLessThan(html.indexOf('data-box="not-for-me"'));
  });

  it('shows a card escaped, with both people\'s boxes, the author, comment count, match and fresh marks', () => {
    const html = page();
    expect(html).toContain(`<li class="card fresh match" data-card="${A}" data-other="yes-please">`);
    expect(html).toContain(`<li class="card fresh" data-card="${B}" data-other="new">`);
    expect(html).toContain('<span class="card-title">Card &lt;A&gt;</span>');
    expect(html).toContain(`<span data-mine="${A}">You: Yes please</span> · Him: Yes please`);
    expect(html).toContain('By You · 2 comments');
    expect(html).toContain('By Him');
    expect(html).toContain(`href="/for-you/after-dark/list?open=${A}"`);
  });

  it('gives each card a Move to control with every box, its own selected', () => {
    const html = page();
    expect(html).toContain('<form class="move" method="post" action="/for-you/after-dark/list/save">');
    expect(html).toContain('<input type="hidden" name="do" value="move">');
    expect(html).toContain('<label>Move to…<select name="box">');
    expect(html).toContain('<option value="yes-please" selected>Yes please</option>');
    expect(html).toContain('<noscript><button type="submit">Move</button></noscript>');
  });

  it('has a hidden sheet per card with text, comments, edit and delete, and opens the asked one in an open box', () => {
    const html = page({ open: A });
    expect(html).toContain(`<div class="sheet-wrap match" id="card-${A}" data-card="${A}"><article`);
    expect(html).toContain(`<div class="sheet-wrap" id="card-${B}" data-card="${B}" hidden>`);
    expect(html).toContain('<p class="full">words\nof A</p>');
    expect(html).toContain('<p>mine &lt;b&gt;</p>');
    expect(html).toContain('<input type="hidden" name="do" value="comment">');
    expect(html).toContain('<input type="hidden" name="do" value="edit">');
    expect(html).toContain('<input type="hidden" name="do" value="delete">');
    expect(html).toContain('data-name="Yes please" data-keep open>');
    expect(html).toContain('<a class="close" href="/for-you/after-dark/list">Close</a>');
  });

  it('lets each person delete only their own comments', () => {
    const html = page();
    expect(html.match(/name="do" value="uncomment"/g)).toHaveLength(1);
    expect(html).toContain(`name="do" value="uncomment"><input type="hidden" name="id" value="${K}">`);
    const other = page({ view: mergeList({ reader, admin }, 'admin', DEFAULT_SETTINGS), me: 'admin' });
    expect(other).toContain(`name="do" value="uncomment"><input type="hidden" name="id" value="${J}">`);
    expect(other).toContain('Her ·');
  });

  it('shows the display names and box names from settings, escaped', () => {
    const settings = { ...DEFAULT_SETTINGS, adminName: 'S<b>', boxes: DEFAULT_SETTINGS.boxes.map((b) => (b.id === 'yes-please' ? { ...b, name: 'Y<es' } : b)) };
    const html = page({ view: mergeList({ reader, admin }, 'reader', settings), settings });
    expect(html).toContain('By S&lt;b&gt;');
    expect(html).toContain('data-name="Y&lt;es"');
  });

  it('keeps what was typed when a save is refused', () => {
    const add = page({ draft: { form: 'add', title: 'kept <t>', text: 'kept text' }, error: 'Nope.' });
    expect(add).toContain('<details class="adder" open>');
    expect(add).toContain('value="kept &lt;t&gt;"');
    expect(add).toContain('>kept text</textarea>');
    expect(add).toContain('<p class="error">Nope.</p>');
    const comment = page({ draft: { form: 'comment', id: B, title: '', text: 'kept comment' }, error: 'Nope.' });
    expect(comment).toContain(`<div class="sheet-wrap" id="card-${B}" data-card="${B}"><article`);
    expect(comment).toContain('>kept comment</textarea>');
    const edit = page({ draft: { form: 'edit', id: B, title: 'new title', text: 'new text' }, error: 'Nope.' });
    expect(edit).toContain('<details class="edit" open>');
    expect(edit).toContain('value="new title"');
  });

  it('marks the page unseen only when something is new, and carries the save address and token', () => {
    expect(page()).toContain('<div class="board" data-action="/for-you/after-dark/list/save" data-csrf="tok" data-unseen>');
    const quiet = mergeList({ reader: { ...reader, seen: '2026-11-09T10:00:00.000Z' }, admin }, 'reader', DEFAULT_SETTINGS);
    expect(page({ view: quiet })).not.toContain('data-unseen>');
  });

  it('has an error page, and a script with nothing from the cards in it', () => {
    expect(listErrorPage('/for-you/after-dark')).toContain('Something went wrong loading this page.');
    expect(LIST_SCRIPT).not.toContain('Card');
    expect(page()).toContain(LIST_SCRIPT);
    expect(LIST_SCRIPT).toContain("passive: false");
  });
});

describe('settings page', () => {
  it('lists the names and boxes with a field to add one', () => {
    const html = listSettingsPage({ base: '/for-you', csrf: 'tok', settings: DEFAULT_SETTINGS, flash: 'Saved.', error: 'Nope.' });
    expect(html).toContain('action="/for-you/admin/after-dark/list/settings"');
    expect(html).toContain('name="reader_name"');
    expect(html).toContain('name="box_have-to"');
    expect(html).toContain('value="Have to"');
    expect(html).toContain('name="new_box"');
    expect(html).toContain('<p class="flash">Saved.</p>');
    expect(html).toContain('<p class="error">Nope.</p>');
  });
});

describe('links from after dark', () => {
  it('puts the list card at the top of the room, with count and dot', () => {
    const html = roomPage({ entries: [], replies: [], mediaBase: '/m', list: { href: '/for-you/after-dark/list', count: 3, fresh: true } });
    expect(html).toContain('<a class="list-card fresh" href="/for-you/after-dark/list"><span>Our list</span><span class="list-count">3 cards</span></a>');
    expect(html.indexOf('list-card fresh')).toBeLessThan(html.indexOf('Nothing here yet.'));
    expect(roomPage({ entries: [], replies: [], mediaBase: '/m', list: { href: '/l', count: 1, fresh: false } })).toContain('<a class="list-card" href="/l"><span>Our list</span><span class="list-count">1 card</span></a>');
    expect(roomPage({ entries: [], replies: [], mediaBase: '/m' })).not.toContain('<a class="list-card');
  });

  it('links the list and its settings from the after dark admin', () => {
    const html = afterDarkAdminPage({ base: '/for-you', csrf: 't', entries: [], replies: [], draft: { title: '', text: '' } });
    expect(html).toContain('href="/for-you/admin/after-dark/list"');
    expect(html).toContain('href="/for-you/admin/after-dark/list/settings"');
  });
});
