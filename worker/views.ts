import type { Note } from './notes';

const LOCALE = 'en-GB';
const ROBOTS = '<meta name="robots" content="noindex, nofollow">';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

const READER_STYLE = `
:root { --paper: #f6efe3; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 36rem; margin: 0 auto; padding: 16vh 1.25rem 4rem; }
.date { color: var(--muted); font-style: italic; font-size: 1.05rem; margin: 0 0 1rem; }
.message { font-size: clamp(1.6rem, 5vw, 2.2rem); line-height: 1.35; white-space: pre-line; margin: 0; animation: rise 1.8s ease-out both; }
.heart { color: var(--accent); text-align: center; margin: 3.5rem 0 2.5rem; }
.archive h2 { font-weight: 500; font-style: italic; font-size: 1.1rem; color: var(--muted); margin: 0 0 1.5rem; }
.archive article { border-top: 1px solid var(--line); padding: 1.25rem 0; }
.archive .date { font-size: 0.95rem; margin-bottom: 0.4rem; }
.archive p.text { margin: 0; font-size: 1.2rem; line-height: 1.45; white-space: pre-line; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.4rem; }
form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 20rem; }
input { font: inherit; font-size: 1.2rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); }
button { font: inherit; font-size: 1.15rem; padding: 0.55rem 1rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
.error { color: var(--accent); font-style: italic; margin: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .message { animation: none; } }
`;

const ADMIN_STYLE = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #fafafa; color: #222; }
main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
.box { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem 1rem; white-space: pre-line; }
.flash { background: #e8f5e9; padding: 0.5rem 0.75rem; border-radius: 6px; }
form.write, form.login { display: flex; flex-direction: column; gap: 0.6rem; }
input, textarea, button { font: inherit; font-size: 16px; padding: 0.55rem; border: 1px solid #ccc; border-radius: 6px; }
textarea { min-height: 9rem; resize: vertical; }
button { background: #222; color: #fff; border-color: #222; cursor: pointer; }
ul { list-style: none; padding: 0; }
li { border-top: 1px solid #e5e5e5; padding: 0.75rem 0; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #666; }
.tag { font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eee; margin-left: 0.4rem; }
.text { white-space: pre-line; margin: 0.35rem 0 0; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.actions form { display: inline; margin: 0; }
.actions button { padding: 0.2rem 0.6rem; font-size: 0.85rem; background: #fff; color: #a33; border-color: #dbb; }
.error { color: #a33; }
`;

function shell(title: string, style: string, body: string, fonts = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ROBOTS}
<title>${escapeHtml(title)}</title>
${fonts}
<style>${style}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const READER_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap">`;

function readerShell(body: string): string {
  return shell('For you', READER_STYLE, body, READER_FONTS);
}

function adminShell(body: string): string {
  return shell('Notes admin', ADMIN_STYLE, body);
}

function errorLine(error?: string): string {
  return error ? `<p class="error">${escapeHtml(error)}</p>` : '';
}

export function readerLoginPage({ action, error }: { action: string; error?: string }): string {
  return readerShell(`
<p class="quiet">This little corner is just for you.</p>
<form method="post" action="${escapeHtml(action)}">
  <input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" required autofocus>
  <button type="submit">Open</button>
  ${errorLine(error)}
</form>`);
}

export function readerPage({ current, archive }: { current: Note | null; archive: Note[] }): string {
  const today = current
    ? `<p class="date">${formatDate(current.date)}</p>\n<p class="message">${escapeHtml(current.text)}</p>`
    : '<p class="quiet">Nothing here yet. Check back soon.</p>';
  const past = archive.length
    ? `<div class="heart" aria-hidden="true">&#9825;</div>
<section class="archive"><h2>Earlier notes</h2>
${archive.map((n) => `<article><p class="date">${formatDate(n.date)}</p><p class="text">${escapeHtml(n.text)}</p></article>`).join('\n')}
</section>`
    : '';
  return readerShell(today + past);
}

export function errorPage(message: string): string {
  return readerShell(`<p class="quiet">${escapeHtml(message)}</p>`);
}

export function adminLoginPage({ action, error }: { action: string; error?: string }): string {
  return adminShell(`
<h1>Admin</h1>
<form class="login" method="post" action="${escapeHtml(action)}">
  <input type="password" name="password" aria-label="Admin password" placeholder="Admin password" autocomplete="current-password" required autofocus>
  <button type="submit">Log in</button>
  ${errorLine(error)}
</form>`);
}

export interface AdminPageData {
  base: string;
  today: string;
  current: Note | null;
  notes: Note[];
  form: Note;
  csrf: string;
  flash?: string;
}

export function adminPage(d: AdminPageData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const status = (n: Note) => (n.date === d.current?.date ? 'Showing now' : n.date > d.today ? 'Queued' : 'Past');
  const rows = d.notes.map((n) => `<li>
  <div class="meta">
    <span>${formatDate(n.date)}<span class="tag">${status(n)}</span></span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin?edit=${n.date}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/delete`)}" onsubmit="return confirm('Delete this note?')">
        ${csrf}<input type="hidden" name="date" value="${escapeHtml(n.date)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  <p class="text">${escapeHtml(n.text)}</p>
</li>`).join('\n');

  return adminShell(`
<h1>Notes</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
<h2>Showing today (${formatDate(d.today)})</h2>
<div class="box">${d.current ? escapeHtml(d.current.text) : 'Nothing yet.'}</div>
<h2>Write a note</h2>
<form class="write" method="post" action="${escapeHtml(`${d.base}/admin/save`)}">
  ${csrf}
  <input type="date" name="date" value="${escapeHtml(d.form.date)}" required>
  <textarea name="text" maxlength="5000" required placeholder="Today's note">${escapeHtml(d.form.text)}</textarea>
  <button type="submit">Save</button>
</form>
<h2>All notes</h2>
<ul>${rows || '<li>No notes yet.</li>'}</ul>`);
}
