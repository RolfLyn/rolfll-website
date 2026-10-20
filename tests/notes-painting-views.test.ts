import { describe, it, expect } from 'vitest';
import { paintingPage, paintingAdminPage } from '../worker/painting-views';
import { readerPage, formatDate } from '../worker/views';
import type { Secret } from '../worker/painting';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const secrets: Secret[] = [
  { id: ID1, text: 'first <b>secret</b>', x: 0.25, y: 0.125, created: '2026-10-20T19:00:00.000Z' },
  { id: ID2, text: 'second\nsecret', x: 0.5, y: 0.5, created: '2026-10-21T09:00:00.000Z' },
  { id: ID3, text: 'third secret', x: 0.8333, y: 0.9, created: '2026-10-22T09:00:00.000Z' },
];
const found = [{ id: ID2, at: '2026-10-21T12:02:00.000Z' }];
const reply = { action: '/for-you/painting/reply', csrf: 'tok' };
const page = (extra: Partial<Parameters<typeof paintingPage>[0]> = {}) => paintingPage({
  secrets, found, replies: [], back: '/for-you', foundAction: '/for-you/painting/found', reply, ...extra,
});

describe('painting page', () => {
  it('shows the painting with a way back, the count of unfound secrets and the credit', () => {
    const html = page();
    expect(html).toContain(ROBOTS);
    expect(html).toContain('<img src="/art/almond-blossom.webp" width="2400" height="1896"');
    expect(html).toContain('href="/for-you">Back to your notes</a>');
    expect(html).toContain('2 secrets hidden here');
    expect(html).toContain('Vincent van Gogh, <em>Almond Blossom</em>, 1890. Van Gogh Museum, Amsterdam.');
  });

  it('counts one, all found, and none', () => {
    expect(page({ found: [...found, { id: ID1, at: found[0].at }] })).toContain('1 secret hidden here');
    expect(page({ found: secrets.map((s) => ({ id: s.id, at: found[0].at })) })).toContain('You found all 3');
    const empty = page({ secrets: [], found: [] });
    expect(empty).not.toContain('hidden here');
    expect(empty).not.toContain('class="spot');
    expect(empty).not.toContain('<script>');
  });

  it('places a spot per secret by position; unfound spots post to found and take turns to twinkle', () => {
    const html = page();
    expect(html).toContain(`<form class="spot" method="post" action="/for-you/painting/found" data-id="${ID1}" style="left:25.00%;top:12.50%;--delay:0s">`);
    expect(html).toContain(`<form class="spot found" method="post" action="/for-you/painting/found" data-id="${ID2}" style="left:50.00%;top:50.00%">`);
    expect(html).toContain(`data-id="${ID3}" style="left:83.33%;top:90.00%;--delay:3s">`);
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
    expect(html).toContain(`<input type="hidden" name="id" value="${ID1}">`);
    expect(html).toContain('aria-label="A hidden secret"');
    expect(html).toContain('aria-label="Secret 2, found"');
    expect(html).toContain('animation: twinkle 6s');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('has a hidden card per secret, escaped, with its date and reply area, and opens the asked one', () => {
    const html = page({ open: ID1, replies: [{ id: ID1, heart: true, text: 'found it', at: found[0].at }] });
    expect(html).toContain(`<div class="card-wrap" id="card-${ID1}">`);
    expect(html).toContain(`<div class="card-wrap" id="card-${ID2}" hidden>`);
    expect(html).toContain('first &lt;b&gt;secret&lt;/b&gt;');
    expect(html).toContain(`Hidden on ${formatDate('2026-10-21')}`);
    expect(html).toContain(`id="secret-${ID1}"`);
    expect(html).toContain('action="/for-you/painting/reply"');
    expect(html).toContain('You sent ♥ “found it”');
    expect(html).toContain('<a class="close" href="/for-you/painting">Close</a>');
    expect(page({ open: 'nonsense' })).not.toMatch(/<div class="card-wrap" id="card-[^"]+">/);
  });

  it('shows a failed reply on its card', () => {
    expect(page({ open: ID2, unsent: ID2 })).toContain('That didn&#39;t send. Try again?');
  });

  it('previews without recording anything: spots open by link-like forms and replies are disabled', () => {
    const html = page({ preview: '/for-you/admin/painting/preview', reply: undefined, foundAction: undefined });
    expect(html).toContain(`<form class="spot" method="get" action="/for-you/admin/painting/preview" data-id="${ID1}"`);
    expect(html).toContain(`<input type="hidden" name="open" value="${ID1}">`);
    expect(html).not.toContain('/painting/found');
    expect(html).toContain('<fieldset disabled>');
    expect(html).toContain('<a class="close" href="/for-you/admin/painting/preview">Close</a>');
  });
});

describe('painting link on the notes page', () => {
  const note = { date: '2026-10-20', text: 'today' };

  it('sits under today\'s note, before the moon link, with a dot while something is unfound', () => {
    const html = readerPage({
      current: note, archive: [], mediaBase: '/m',
      painting: { href: '/for-you/painting', unread: true },
      afterDark: { href: '/for-you/after-dark', newest: ID1 },
    });
    expect(html).toContain('<p class="painting-link"><a href="/for-you/painting" class="unread">');
    expect(html).toContain('A painting for you</a>');
    expect(html.indexOf('<p class="painting-link">')).toBeGreaterThan(html.indexOf('<p class="message">'));
    expect(html.indexOf('<p class="painting-link">')).toBeLessThan(html.indexOf('<p class="after-dark-link">'));
    const quiet = readerPage({ current: note, archive: [], mediaBase: '/m', painting: { href: '/for-you/painting', unread: false } });
    expect(quiet).toContain('<p class="painting-link"><a href="/for-you/painting">');
    expect(readerPage({ current: note, archive: [], mediaBase: '/m' })).not.toContain('painting-link"><a');
  });
});

describe('painting admin', () => {
  const data = {
    base: '/for-you', csrf: 'tok', secrets, found,
    replies: [{ id: ID2, heart: true, text: 'hi', at: found[0].at }],
    draft: { text: '', x: '', y: '' },
  };

  it('shows numbered markers, the write form and the list with found times and replies', () => {
    const html = paintingAdminPage(data);
    expect(html).toContain('href="/for-you/admin">← Notes</a>');
    expect(html).toContain('href="/for-you/admin/painting/preview">Preview</a>');
    expect(html).toContain('<span class="marker" style="left:25.00%;top:12.50%">1</span>');
    expect(html).toContain('<span class="marker found" style="left:50.00%;top:50.00%">2</span>');
    expect(html).toContain('<span class="marker new" hidden></span>');
    expect(html).toContain('<form class="write" method="post" action="/for-you/admin/painting/save">');
    expect(html).toContain('name="x"');
    expect(html).toContain('name="y"');
    expect(html).toContain('Not found yet');
    expect(html).toContain('Found 21 Oct, 14:02');
    expect(html).toContain('first &lt;b&gt;secret&lt;/b&gt;');
    expect(html).toContain('♥ “hi”');
    expect(html).toContain(`href="/for-you/admin/painting?edit=${ID3}">Edit</a>`);
    expect(html).toContain('action="/for-you/admin/painting/delete"');
  });

  it('edits a secret in place: its marker becomes the movable one and the form carries its id', () => {
    const html = paintingAdminPage({ ...data, editing: secrets[0], draft: { text: secrets[0].text, x: '25', y: '12.5' } });
    expect(html).toContain('<h2>Edit secret 1</h2>');
    expect(html).toContain(`<input type="hidden" name="id" value="${ID1}">`);
    expect(html).not.toContain('<span class="marker" style="left:25.00%;top:12.50%">1</span>');
    expect(html).toContain('<span class="marker new" style="left:25%;top:12.5%"></span>');
    expect(html).toContain('value="12.5"');
  });

  it('shows errors and flash messages', () => {
    const html = paintingAdminPage({ ...data, error: 'Too close to secret 2, pick another blossom.', flash: 'Saved.' });
    expect(html).toContain('<p class="error">Too close to secret 2, pick another blossom.</p>');
    expect(html).toContain('<p class="flash">Saved.</p>');
  });
});
