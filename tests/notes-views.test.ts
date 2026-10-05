import { describe, it, expect } from 'vitest';
import {
  escapeHtml, formatDate, readerLoginPage, readerPage, errorPage, adminLoginPage, adminPage,
} from '../worker/views';

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
