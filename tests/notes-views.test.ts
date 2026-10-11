import { describe, it, expect } from 'vitest';
import {
  escapeHtml, formatDate, readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage,
} from '../worker/views';
import { GAME_SCRIPT } from '../worker/game-script';
import type { Sky } from '../worker/meetings';
import type { Reply } from '../worker/replies';

const ROBOTS = '<meta name="robots" content="noindex, nofollow">';
const admin = adminPage({
  base: '/for-you',
  today: '2026-10-01',
  current: { date: '2026-10-01', text: 'today' },
  notes: [{ date: '2026-10-03', text: 'later' }, { date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'before' }],
  form: { date: '2026-10-02', text: '' },
  csrf: 'tok123',
  flash: 'Saved.',
});
const pages = [
  readerLoginPage({ action: '/for-you/login', error: 'nope' }),
  readerPage({ mediaBase: '/for-you/media', current: { date: '2026-10-01', text: 'hi' }, archive: [{ date: '2026-09-30', text: 'yo' }] }),
  readerPage({ mediaBase: '/for-you/media', current: null, archive: [] }),
  errorPage('oops'),
  adminLoginPage({ action: '/for-you/admin/login' }),
  admin,
];

describe('views', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });

  it('formats dates in a readable way', () => {
    const s = formatDate('2026-10-01');
    expect(s).toContain('Thursday');
    expect(s).toContain('1 October 2026');
  });

  it('marks every page noindex and avoids em dashes', () => {
    for (const page of pages) {
      expect(page).toContain(ROBOTS);
      expect(page).not.toContain('—');
    }
  });

  it('shows message text literally, never as markup', () => {
    const page = readerPage({ mediaBase: '/for-you/media', current: { date: '2026-10-01', text: '<b>hi</b> & "you"\nline two 💛' }, archive: [] });
    expect(page).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;\nline two 💛');
    expect(page).not.toContain('<b>hi</b>');
  });

  it('shows current note and archive on the reader page', () => {
    const page = pages[1];
    expect(page).toContain('hi');
    expect(page).toContain('yo');
    expect(page).toContain('Earlier notes');
  });

  it('shows a gentle placeholder when there is nothing yet', () => {
    expect(pages[2]).toContain('Nothing here yet');
  });

  it('reader login has a password field posting to the action, and shows the error', () => {
    expect(pages[0]).toContain('type="password"');
    expect(pages[0]).toContain('action="/for-you/login"');
    expect(pages[0]).toContain('nope');
  });

  it('admin page carries csrf, prefilled date, statuses, and edit/delete controls', () => {
    expect(admin).toContain('name="csrf" value="tok123"');
    expect(admin).toContain('name="date" value="2026-10-02"');
    expect(admin).toContain('Showing now');
    expect(admin).toContain('Queued');
    expect(admin).toContain('Past');
    expect(admin).toContain('href="/for-you/admin?edit=2026-10-03"');
    expect(admin).toContain('action="/for-you/admin/delete"');
    expect(admin).toContain('action="/for-you/admin/save"');
    expect(admin).toContain('Saved.');
  });
});

const PK = '0b6f4a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.jpg';
const AK = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.m4a';

describe('media in views', () => {
  it("shows the photo and then the sound below today's message, and lazy media in the archive", () => {
    const page = readerPage({
      mediaBase: '/for-you/media',
      current: { date: '2026-10-01', text: 'hi', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } },
      archive: [{ date: '2026-09-30', text: 'yo', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } }],
    });
    const photoAt = page.indexOf(`<img class="photo" src="/for-you/media/${PK}"`);
    const textAt = page.indexOf('<p class="message">hi</p>');
    const audioAt = page.indexOf(`<audio class="sound" controls preload="metadata" src="/for-you/media/${AK}"`);
    expect(textAt).toBeGreaterThan(-1);
    expect(photoAt).toBeGreaterThan(textAt);
    expect(audioAt).toBeGreaterThan(photoAt);
    const archive = page.slice(page.indexOf('<section class="archive"'));
    expect(archive.indexOf('<img')).toBeGreaterThan(archive.indexOf('<p class="text">yo</p>'));
    expect(page).toContain('loading="lazy"');
    expect(page).toContain(`preload="none" src="/for-you/media/${AK}"`);
  });

  it('renders text-only notes without media elements', () => {
    const page = readerPage({ mediaBase: '/for-you/media', current: { date: '2026-10-01', text: 'hi' }, archive: [{ date: '2026-09-30', text: 'yo' }] });
    expect(page).not.toContain('<img');
    expect(page).not.toContain('<audio');
  });

  it('admin form uploads files, shows current attachments with remove options, and resizes photos', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, csrf: 't',
      notes: [{ date: '2026-10-01', text: 'x', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } }],
      form: { date: '2026-10-01', text: 'x', photo: { key: PK, type: 'image/jpeg' }, audio: { key: AK, type: 'audio/mp4' } },
      original: '2026-10-01',
    });
    expect(page).toContain('enctype="multipart/form-data"');
    expect(page).toContain('name="photo" accept="image/*"');
    expect(page).toContain('name="audio" accept="audio/*,.m4a"');
    expect(page).toContain('name="remove_photo" value="1"');
    expect(page).toContain('name="remove_audio" value="1"');
    expect(page).toContain(`src="/for-you/admin/media/${PK}"`);
    expect(page).toContain(`src="/for-you/admin/media/${AK}"`);
    expect(page).toContain('createImageBitmap');
    expect(page).not.toContain('—');
  });

  it('admin form without attachments has no remove options', () => {
    const page = adminPage({ base: '/for-you', today: '2026-10-01', current: null, csrf: 't', notes: [], form: { date: '2026-10-01', text: '' } });
    expect(page).not.toContain('remove_photo');
    expect(page).not.toContain('remove_audio');
  });
});

describe('game in views', () => {
  it('admin form has game fields, hidden until a game is chosen', () => {
    expect(admin).toContain('<select name="game_kind">');
    expect(admin).toContain('<option value="distance">Close the distance</option>');
    expect(admin).toContain('<div class="game-fields" hidden>');
  });

  it('admin form shows a game being edited', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, notes: [], csrf: 't',
      form: { date: '2026-10-02', text: 'x' },
      game: { kind: 'distance', from: 'Harbour', to: 'Hill', km: '10000', meet: '2026-10-21', lines: 'one\n<two>' },
    });
    expect(page).toContain('<option value="distance" selected>');
    expect(page).toContain('<div class="game-fields">');
    expect(page).toContain('name="game_from" maxlength="40" value="Harbour"');
    expect(page).toContain('name="game_km" inputmode="numeric" value="10000"');
    expect(page).toContain('name="game_meet" value="2026-10-21"');
    expect(page).toContain('one\n&lt;two&gt;</textarea>');
  });

  it('admin list tags game notes and links every note to a preview', () => {
    const page = adminPage({
      base: '/for-you', today: '2026-10-01', current: null, csrf: 't', form: { date: '2026-10-02', text: '' },
      notes: [{ date: '2026-10-03', text: 'later', game: { kind: 'distance', from: 'Harbour', to: 'Hill', km: 5, lines: [] } }],
    });
    expect(page).toContain('<span class="tag">Game</span>');
    expect(page).toContain('href="/for-you/admin/preview?date=2026-10-03"');
  });
});

describe('game on the reader page', () => {
  const GAME = { kind: 'distance' as const, from: 'Harbour', to: 'Hill', km: 10000, lines: ['first', 'a </script><b>x</b> <!--'], meet: '2026-10-21' };
  const gameJson = (page: string, date: string) =>
    JSON.parse(page.match(new RegExp(`class="game-data" data-date="${date}"[^>]*>([^<]*)</script>`))![1]);

  it('a game note keeps its text in the page and carries its settings safely', () => {
    const page = readerPage({ mediaBase: '/m', current: { date: '2026-10-10', text: 'hello', game: GAME }, archive: [] });
    expect(page).toContain('<div class="note" data-game="2026-10-10">');
    expect(page).toContain('<p class="message">hello</p>');
    expect(page).not.toContain('</script><b>');
    expect(page).not.toContain('<!--');
    expect(gameJson(page, '2026-10-10')).toEqual(GAME);
    expect(page).toContain(GAME_SCRIPT);
    expect(page).toContain('class="game-data" data-date="2026-10-10">');
  });

  it('plain notes carry no game code', () => {
    for (const page of [pages[1], pages[2]]) {
      expect(page).not.toContain('game-data');
      expect(page).not.toContain('data-game');
      expect(page).not.toContain('notes-game-played:');
    }
  });

  it('archive game notes get a hook, and a game with no lines or meet date is fine', () => {
    const plain = { kind: 'distance' as const, from: 'Harbour', to: 'Hill', km: 5, lines: [] };
    const page = readerPage({
      mediaBase: '/m', current: { date: '2026-10-10', text: 'today' },
      archive: [{ date: '2026-10-05', text: 'old', game: plain }],
    });
    expect(page).toContain('<article data-game="2026-10-05">');
    expect(page).not.toContain('class="note"');
    expect(gameJson(page, '2026-10-05')).toEqual(plain);
    expect(page.split('notes-game-played:').length).toBe(2);
  });

  it('marks preview pages so the game always plays and remembers nothing', () => {
    const page = readerPage({ mediaBase: '/m', current: { date: '2026-10-10', text: 'hi', game: GAME }, archive: [], preview: true });
    expect(page).toContain('data-date="2026-10-10" data-preview>');
  });
});

describe('sky on the reader page', () => {
  const sky: Sky = { state: 'growing', place: 'Somewhere', date: '2026-10-21', stars: ['2026-10-01'], sleeps: 20 };

  it('shows the sky above the note when there is one', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [], sky });
    expect(html).toContain('class="sky sky-growing"');
    expect(html.indexOf('class="sky ')).toBeLessThan(html.indexOf('hi</p>'));
    expect(html).toContain('@keyframes gather');
  });

  it('leaves the page unchanged without a sky', () => {
    const html = readerPage({ mediaBase: '/m', current: { date: '2026-10-01', text: 'hi' }, archive: [] });
    expect(html).not.toContain('class="sky');
    expect(html).not.toContain('@keyframes gather');
  });
});

describe('replies on the reader page', () => {
  const today = { date: '2026-10-01', text: 'hi' };
  const older = { date: '2026-09-30', text: 'yo' };
  const form = { action: '/for-you/reply', csrf: 'tok' };
  const sent: Reply = { date: '2026-09-30', heart: true, text: 'miss <you>', at: '2026-10-01T08:00:00.000Z' };

  it('adds a reply area under every note, with the reader csrf and the note date', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [], reply: form });
    expect(html).toContain('id="note-2026-10-01"');
    expect(html).toContain('id="note-2026-09-30"');
    expect(html.match(/<form class="reply-form" method="post" action="\/for-you\/reply">/g)).toHaveLength(2);
    expect(html).toContain('<input type="hidden" name="csrf" value="tok">');
    expect(html).toContain('<input type="hidden" name="date" value="2026-09-30">');
    expect(html).toContain('maxlength="280"');
    expect(html).toContain("event.target.form.submit()");
  });

  it('shows and prefills an existing reply, escaped', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [sent], reply: form });
    expect(html).toContain('<p class="reply-sent">You sent ♥ “miss &lt;you&gt;”</p>');
    expect(html).toContain('>miss &lt;you&gt;</textarea>');
    expect(html.match(/name="heart" value="on" checked/g)).toHaveLength(1);
  });

  it('shows the gentle error only under the note that did not send', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], replies: [], reply: form, unsent: '2026-09-30' });
    expect(html.match(/That didn&#39;t send\. Try again\?/g)).toHaveLength(1);
    expect(html.indexOf("That didn&#39;t send")).toBeGreaterThan(html.indexOf('id="note-2026-09-30"'));
  });

  it('disables the reply area in preview and has no script', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [], replies: [], reply: form, preview: true });
    expect(html).toContain('<fieldset disabled>');
    expect(html).not.toContain('action="/for-you/reply"');
    expect(html).not.toContain('event.target.form.submit()');
  });

  it('has no reply area when replies are unavailable', () => {
    const html = readerPage({ mediaBase: '/m', current: today, archive: [older], reply: form });
    expect(html).not.toContain('class="reply');
  });

  it('wraps long unbroken replies instead of widening the page', () => {
    expect(readerPage({ mediaBase: '/m', current: today, archive: [] })).toMatch(/\.reply-sent \{[^}]*overflow-wrap: anywhere/);
  });
});

describe('admin meetings and replies', () => {
  const base = {
    base: '/for-you', today: '2026-10-01', current: null,
    notes: [{ date: '2026-10-01', text: 'today' }, { date: '2026-09-30', text: 'before' }],
    form: { date: '2026-10-02', text: '' }, csrf: 'tok123',
  };

  it('lists meetings with a remove button and has an add form', () => {
    const html = adminPage({ ...base, meetings: [{ date: '2026-10-21', place: 'Some<where>' }] });
    expect(html).toContain('<h2>Meetings</h2>');
    expect(html).toContain('Some&lt;where&gt;');
    expect(html).toContain('action="/for-you/admin/meeting/delete"');
    expect(html).toContain('<input type="hidden" name="date" value="2026-10-21">');
    expect(html).toContain('action="/for-you/admin/meeting/save"');
    expect(html).toContain('name="meet_place" maxlength="40"');
  });

  it('says when there are no meetings and keeps a typed draft', () => {
    const html = adminPage({ ...base, meetings: [], meetingDraft: { date: '2026-13-01', place: 'typed' } });
    expect(html).toContain('No meetings yet.');
    expect(html).toContain('name="meet_date" value="2026-13-01"');
    expect(html).toContain('name="meet_place" maxlength="40" value="typed"');
  });

  it('shows her reply under its note, escaped, with when she sent it', () => {
    const html = adminPage({ ...base, replies: [{ date: '2026-09-30', heart: true, text: '<3 you', at: '2026-10-01T06:05:00.000Z' }] });
    expect(html).toContain('<p class="reply-line">♥ “&lt;3 you”');
    expect(html).toContain('1 Oct, 08:05');
    expect(html.indexOf('class="reply-line"')).toBeGreaterThan(html.indexOf('before</p>'));
    expect(html.match(/class="reply-line"/g)).toHaveLength(1);
  });
});
