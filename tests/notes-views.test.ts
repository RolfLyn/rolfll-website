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
  readerPage({ current: { date: '2026-10-01', text: 'hi' }, archive: [{ date: '2026-09-30', text: 'yo' }] }),
  readerPage({ current: null, archive: [] }),
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
    const page = readerPage({ current: { date: '2026-10-01', text: '<b>hi</b> & "you"\nline two 💛' }, archive: [] });
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
