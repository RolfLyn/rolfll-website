import { todayInCopenhagen } from './dates';
import {
  escapeHtml, formatDate, shell, READER_FONTS, adminShell, errorLine, replyArea, replyLine,
  REPLY_STYLE, REPLY_SCRIPT, type ReplyForm,
} from './views';
import { ENTRY_LIMITS, type Entry, type EntryDraft, type EntryReply } from './after-dark';

const AFTER_DARK_STYLE = `
:root { --paper: #1a1220; --ink: #ecdfd0; --muted: #a8949a; --accent: #d9a55b; --line: #3a2a3c; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at top, #2a1b30 0%, #1a1220 65%) fixed; background-color: #1a1220; color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 46rem; margin: 0 auto; padding: 12vh 1.25rem 4rem; }
a { color: var(--muted); }
button { font: inherit; font-size: 1.2rem; padding: 0.55rem 1.6rem; border: 1px solid var(--accent); border-radius: 999px; background: transparent; color: var(--accent); cursor: pointer; }
.door { text-align: center; padding-top: 8vh; }
.door p { font-size: clamp(1.5rem, 5vw, 2rem); font-style: italic; line-height: 1.3; margin: 0 0 2.25rem; animation: glow-in 2.4s ease-out both; }
.door form { display: inline-block; margin: 0; }
.back { display: block; margin-top: 2.5rem; font-style: italic; }
.top { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 2.5rem; }
.top h1 { margin: 0; font-weight: 400; font-style: italic; font-size: 1.7rem; color: var(--accent); }
.top form { margin: 0; }
.top button { border: 0; padding: 0; font-size: 1.05rem; font-style: italic; color: var(--muted); text-decoration: underline; }
.entry { border-top: 1px solid var(--line); padding: 1.75rem 0; animation: glow-in 1.8s ease-out both; }
.entry h2 { margin: 0 0 0.3rem; font-weight: 400; font-style: italic; font-size: 1.6rem; color: var(--accent); }
.entry .date { color: var(--muted); font-style: italic; margin: 0 0 1rem; }
.entry .text { font-size: 1.3rem; line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; margin: 0; }
.entry audio { display: block; width: 100%; margin: 1.25rem 0 0; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.3rem; }
.error { color: var(--accent); font-style: italic; margin: 0; }
${REPLY_STYLE}
.reply textarea { background: #24182a; color: var(--ink); border-color: var(--line); }
.reply-heart .glyph { color: #6b5468; }
.reply-form button { font-size: 1rem; padding: 0.3rem 0.9rem; }
@keyframes glow-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .door p, .entry { animation: none; } }
`;

// Remembers, on her phone only, the newest entry she has seen, so the moon link's dot can go out.
const MARK_SEEN_SCRIPT = `<script>
(function () {
  var mark = document.querySelector('[data-newest]');
  if (!mark) return;
  try { localStorage.setItem('after-dark-seen', mark.getAttribute('data-newest')); } catch (e) {}
})();
</script>`;

function darkShell(body: string): string {
  return shell('after dark', AFTER_DARK_STYLE, body, READER_FONTS);
}

function entryDate(entry: Entry): string {
  return formatDate(todayInCopenhagen(new Date(entry.created)));
}

export function doorwayPage({ enter, csrf, back }: { enter: string; csrf: string; back: string }): string {
  return darkShell(`<div class="door">
<p>This part is just for when you're alone.</p>
<form method="post" action="${escapeHtml(enter)}"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button type="submit">Come in</button></form>
<a class="back" href="${escapeHtml(back)}">Back to your notes</a>
</div>`);
}

export function roomPage({ entries, replies, mediaBase, leave, reply, unsent, preview = false }: {
  entries: Entry[]; replies: EntryReply[] | null; mediaBase: string;
  leave?: string; reply?: ReplyForm; unsent?: string; preview?: boolean;
}): string {
  const form = preview ? undefined : reply;
  const items = entries.map((e) => `<article class="entry">
${e.title ? `<h2>${escapeHtml(e.title)}</h2>\n` : ''}<p class="date">${entryDate(e)}</p>
<p class="text">${escapeHtml(e.text)}</p>
${e.audio ? `<audio controls preload="none" src="${escapeHtml(`${mediaBase}/${e.audio.key}`)}"></audio>\n` : ''}${replies ? replyArea({ field: 'id', value: e.id, anchor: `entry-${e.id}` }, replies.find((r) => r.id === e.id), form, unsent === e.id) : ''}
</article>`).join('\n');
  const leaveButton = leave && !preview
    ? `<form method="post" action="${escapeHtml(leave)}"><button type="submit">Leave</button></form>`
    : '';
  const top = `<div class="top"><h1>after dark</h1>${leaveButton}</div>\n`;
  const seen = entries[0] && !preview ? `\n<div hidden data-newest="${escapeHtml(entries[0].id)}"></div>\n${MARK_SEEN_SCRIPT}` : '';
  const script = replies && form && entries.length ? `\n${REPLY_SCRIPT}` : '';
  return darkShell(top + (items || '<p class="quiet">Nothing here yet.</p>') + seen + script);
}

export function roomErrorPage(): string {
  return darkShell('<p class="quiet">Something went wrong loading this page.</p>');
}

export interface AfterDarkAdminData {
  base: string;
  csrf: string;
  entries: Entry[];
  replies: EntryReply[];
  draft: EntryDraft;
  editing?: Entry;
  flash?: string;
  error?: string;
}

export function afterDarkAdminPage(d: AfterDarkAdminData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const rows = d.entries.map((e) => `<li>
  <div class="meta">
    <span>${entryDate(e)}${e.audio ? '<span class="tag">Sound</span>' : ''}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin/after-dark?edit=${e.id}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/after-dark/delete`)}" onsubmit="return confirm('Delete this entry?')">
        ${csrf}<input type="hidden" name="id" value="${escapeHtml(e.id)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  ${e.title ? `<p class="text"><strong>${escapeHtml(e.title)}</strong></p>` : ''}
  <p class="text">${escapeHtml(e.text)}</p>
  ${replyLine(d.replies.find((r) => r.id === e.id))}
</li>`).join('\n');
  const sound = d.editing?.audio
    ? `<div class="attached"><audio controls preload="none" src="${escapeHtml(`${d.base}/admin/media/${d.editing.audio.key}`)}"></audio><label><input type="checkbox" name="remove_audio" value="1"> Remove sound</label></div>`
    : '';
  return adminShell(`
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>After dark</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<p><a href="${escapeHtml(`${d.base}/admin/after-dark/preview`)}">Preview</a></p>
<h2>${d.editing ? 'Edit entry' : 'Write an entry'}</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${escapeHtml(`${d.base}/admin/after-dark/save`)}">
  ${csrf}
  ${d.editing ? `<input type="hidden" name="id" value="${escapeHtml(d.editing.id)}">` : ''}
  <input name="title" maxlength="${ENTRY_LIMITS.title}" placeholder="Title (optional)" value="${escapeHtml(d.draft.title)}">
  <textarea name="text" maxlength="${ENTRY_LIMITS.text}" required placeholder="Entry">${escapeHtml(d.draft.text)}</textarea>
  <label class="file">Sound (optional)<input type="file" name="audio" accept="audio/*,.m4a"></label>
  ${sound}
  <p class="hint">Sound: M4A, MP3, AAC or WAV, up to 25 MB.</p>
  <button type="submit">Save</button>
</form>
<h2>All entries</h2>
<ul>${rows || '<li>No entries yet.</li>'}</ul>`);
}
