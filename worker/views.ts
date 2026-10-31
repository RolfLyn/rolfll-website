import { GAME_LIMITS, type Note } from './notes';
import { EMPTY_DRAFT, type GameDraft } from './game';
import { GAME_SCRIPT, GAME_STYLE } from './game-script';
import { escapeHtml } from './html';
import { skyMarkup, SKY_STYLE } from './sky';
import { EMPTY_MEETING, MEETING_PLACE_MAX, type Meeting, type MeetingDraft, type Sky } from './meetings';
import type { Answer, Reply } from './replies';
import { splitNote, equationFigure, hasDrawings } from './equations';
import { EQUATION_STYLE, equationScript } from './equation-script';

export { escapeHtml };

const LOCALE = 'en-GB';
const ROBOTS = '<meta name="robots" content="noindex, nofollow">';

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export const REPLY_STYLE = `
.reply { margin: 1.25rem 0 0; }
.reply-form { display: block; max-width: none; }
.reply-form fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1.1rem; }
.reply-form fieldset:disabled { opacity: 0.6; }
.reply-heart { position: relative; display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; color: var(--muted); font-style: italic; font-size: 1rem; }
.reply-heart input { position: absolute; opacity: 0; width: 1px; height: 1px; padding: 0; pointer-events: none; }
.reply-heart .glyph { font-size: 1.6rem; line-height: 1; color: var(--line); transition: color 0.3s, transform 0.3s; }
.reply-heart input:checked + .glyph { color: var(--accent); transform: scale(1.15); }
.reply-heart input:focus-visible + .glyph { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.reply details { flex: 1 1 auto; }
.reply summary { cursor: pointer; color: var(--muted); font-style: italic; list-style: none; }
.reply summary::-webkit-details-marker { display: none; }
.reply textarea { display: block; width: 100%; margin: 0.6rem 0; font: inherit; font-size: 1.15rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); resize: vertical; }
.reply-send { font-size: 1rem; padding: 0.3rem 0.8rem; }
.reply-sent { margin: 0 0 0.5rem; color: var(--muted); font-style: italic; white-space: pre-line; overflow-wrap: anywhere; }
.reply .error { margin-top: 0.5rem; }
`;

const READER_STYLE = `
:root { --paper: #f6efe3; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 46rem; margin: 0 auto; padding: 16vh 1.25rem 4rem; }
.date { color: var(--muted); font-style: italic; font-size: 1.05rem; margin: 0 0 1rem; }
.message { font-size: clamp(1.6rem, 5vw, 2.2rem); line-height: 1.35; white-space: pre-line; margin: 0; animation: rise 1.8s ease-out both; }
.photo { display: block; width: 100%; height: auto; border-radius: 0.6rem; margin: 1.75rem 0 0; animation: rise 1.8s ease-out both; }
.sound { display: block; width: 100%; margin: 1.5rem 0 0; }
.heart { color: var(--accent); font-size: 1.4rem; text-align: center; margin: 3.5rem 0 2.5rem; }
.archive h2 { font-weight: 500; font-style: italic; font-size: 1.1rem; color: var(--muted); margin: 0 0 1.5rem; }
.archive article { border-top: 1px solid var(--line); padding: 1.25rem 0; }
.archive .date { font-size: 0.95rem; margin-bottom: 0.4rem; }
.archive p.text { margin: 0; font-size: 1.2rem; line-height: 1.45; white-space: pre-line; }
.archive .photo { max-width: 16rem; margin: 0.75rem 0 0; animation: none; }
.archive .sound { margin-top: 0.75rem; }
.quiet { color: var(--muted); font-style: italic; font-size: 1.4rem; }
form { display: flex; flex-direction: column; gap: 0.9rem; max-width: 20rem; }
input { font: inherit; font-size: 1.2rem; padding: 0.6rem 0.8rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fffaf2; color: var(--ink); }
button { font: inherit; font-size: 1.15rem; padding: 0.55rem 1rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
.error { color: var(--accent); font-style: italic; margin: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .message, .photo { animation: none; } }
${REPLY_STYLE}
.after-dark-link { text-align: center; margin: 2.75rem 0 0; }
.after-dark-link a { color: var(--muted); font-style: italic; text-decoration: none; font-size: 1.05rem; }
.after-dark-link a.unread::after { content: ''; display: inline-block; width: 0.45rem; height: 0.45rem; margin-left: 0.45rem; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); vertical-align: middle; }
`;

const ADMIN_STYLE = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #fafafa; color: #222; }
main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 2rem; }
.box { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem 1rem; white-space: pre-line; }
.flash { background: #e8f5e9; padding: 0.5rem 0.75rem; border-radius: 6px; }
form.write, form.login { display: flex; flex-direction: column; gap: 0.6rem; }
input, textarea, button, select { font: inherit; font-size: 16px; padding: 0.55rem; border: 1px solid #ccc; border-radius: 6px; }
textarea { min-height: 9rem; resize: vertical; }
button { background: #222; color: #fff; border-color: #222; cursor: pointer; }
button:disabled { opacity: 0.6; }
label.file { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; color: #444; }
.attached { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; flex-wrap: wrap; }
.attached audio { max-width: 16rem; }
.hint { font-size: 0.8rem; color: #777; margin: 0; }
.thumb { width: 4rem; height: 4rem; object-fit: cover; border-radius: 6px; display: block; }
ul { list-style: none; padding: 0; }
li { border-top: 1px solid #e5e5e5; padding: 0.75rem 0; }
li .thumb { margin-top: 0.4rem; }
.meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #666; }
.tag { white-space: nowrap; font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 999px; background: #eee; margin-left: 0.4rem; }
.text { white-space: pre-line; margin: 0.35rem 0 0; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.actions form { display: inline; margin: 0; }
.actions button { padding: 0.2rem 0.6rem; font-size: 0.85rem; background: #fff; color: #a33; border-color: #dbb; }
.error { color: #a33; }
fieldset.game, .game-fields { display: flex; flex-direction: column; gap: 0.6rem; }
fieldset.game { border: 1px solid #ddd; border-radius: 8px; padding: 0.6rem 0.9rem 0.9rem; margin: 0; }
.game-fields[hidden] { display: none; }
.reply-line { margin: 0.4rem 0 0; color: #8a4a42; white-space: pre-line; overflow-wrap: anywhere; }
.reply-line .hint { display: inline; }
ul.meetings li { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
form.meeting { display: flex; flex-wrap: wrap; gap: 0.5rem; }
form.meeting input[name=meet_place] { flex: 1 1 10rem; }
`;

// Shrinks a chosen photo in the browser before upload (also drops EXIF such as location).
// GIFs are left alone; anything the browser cannot decode is sent as-is for the server to judge.
const RESIZE_SCRIPT = `<script>
(function () {
  var form = document.querySelector('form.write');
  if (!form) return;
  form.addEventListener('submit', async function (event) {
    var input = form.querySelector('input[name=photo]');
    var button = form.querySelector('button[type=submit]');
    if (!input.files.length || input.files[0].type === 'image/gif') return;
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Saving...';
    try {
      var bitmap = await createImageBitmap(input.files[0], { imageOrientation: 'from-image' });
      var scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
      if (blob) {
        var transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        input.files = transfer.files;
      }
    } catch (error) {
      console.warn('Photo not resized, uploading original', error);
    }
    form.submit();
  });
})();
</script>`;

// Shows the game's own fields only when a game is chosen.
const GAME_TOGGLE_SCRIPT = `<script>
(function () {
  var select = document.querySelector('select[name=game_kind]');
  var fields = document.querySelector('.game-fields');
  if (!select || !fields) return;
  select.addEventListener('change', function () { fields.hidden = select.value === ''; });
})();
</script>`;

function gameFields(draft: GameDraft): string {
  const on = draft.kind === 'distance';
  return `<fieldset class="game">
  <label class="file">Game<select name="game_kind">
    <option value="">None</option>
    <option value="distance"${on ? ' selected' : ''}>Close the distance</option>
  </select></label>
  <div class="game-fields"${on ? '' : ' hidden'}>
    <label class="file">From<input name="game_from" maxlength="${GAME_LIMITS.place}" value="${escapeHtml(draft.from)}"></label>
    <label class="file">To<input name="game_to" maxlength="${GAME_LIMITS.place}" value="${escapeHtml(draft.to)}"></label>
    <label class="file">Distance (km)<input name="game_km" inputmode="numeric" value="${escapeHtml(draft.km)}"></label>
    <label class="file">Meet date (optional)<input type="date" name="game_meet" value="${escapeHtml(draft.meet)}"></label>
    <label class="file">Lines along the way (one per row, up to ${GAME_LIMITS.lines})<textarea name="game_lines" rows="6">${escapeHtml(draft.lines)}</textarea></label>
  </div>
</fieldset>`;
}

export function shell(title: string, style: string, body: string, fonts = ''): string {
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

export const READER_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap">`;

function readerShell(body: string): string {
  return shell('For you', READER_STYLE, body, READER_FONTS);
}

export function adminShell(body: string): string {
  return shell('Notes admin', ADMIN_STYLE, body);
}

export function errorLine(error?: string): string {
  return error ? `<p class="error">${escapeHtml(error)}</p>` : '';
}

function photoTag(note: Note, mediaBase: string, lazy: boolean): string {
  if (!note.photo) return '';
  return `<img class="photo" src="${escapeHtml(`${mediaBase}/${note.photo.key}`)}" alt=""${lazy ? ' loading="lazy"' : ''}>`;
}

function soundTag(note: Note, mediaBase: string, lazy: boolean): string {
  if (!note.audio) return '';
  return `<audio class="sound" controls preload="${lazy ? 'none' : 'metadata'}" src="${escapeHtml(`${mediaBase}/${note.audio.key}`)}"></audio>`;
}

export interface ReplyForm {
  action: string;
  csrf: string;
}

/** "♥ “her words”", escaped, for the reader and the admin. */
export function replySummary(reply: Answer): string {
  return [reply.heart ? '♥' : '', reply.text ? `“${escapeHtml(reply.text)}”` : ''].filter(Boolean).join(' ');
}

// Tapping the heart sends it straight away; without JavaScript the Send buttons do it.
export const REPLY_SCRIPT = `<script>
(function () {
  var boxes = document.querySelectorAll('.reply-form input[name=heart]');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].addEventListener('change', function (event) { event.target.form.submit(); });
  }
})();
</script>`;

export interface ReplyTarget {
  field: 'date' | 'id';
  value: string;
  anchor: string;
}

export function replyArea(target: ReplyTarget, reply: Answer | undefined, form: ReplyForm | undefined, unsent: boolean): string {
  const sent = reply ? `<p class="reply-sent">You sent ${replySummary(reply)}</p>\n` : '';
  return `<div class="reply" id="${escapeHtml(target.anchor)}">
${sent}<form class="reply-form" method="post"${form ? ` action="${escapeHtml(form.action)}"` : ''}><fieldset${form ? '' : ' disabled'}>
<input type="hidden" name="csrf" value="${form ? escapeHtml(form.csrf) : ''}"><input type="hidden" name="${target.field}" value="${escapeHtml(target.value)}">
<label class="reply-heart"><input type="checkbox" name="heart" value="on"${reply?.heart ? ' checked' : ''}><span class="glyph" aria-hidden="true">♥</span>Send a heart</label>
<noscript><button type="submit" class="reply-send">Send</button></noscript>
<details><summary>Write something back</summary>
<textarea name="text" maxlength="280" rows="3" aria-label="Write something back">${escapeHtml(reply?.text ?? '')}</textarea>
<button type="submit">Send</button></details>
</fieldset></form>
${unsent ? `<p class="error">${escapeHtml("That didn't send. Try again?")}</p>\n` : ''}</div>`;
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

// Game settings travel as JSON; every "<" is escaped so a line can never close the script tag.
function gameData(note: Note, preview: boolean): string {
  if (!note.game) return '';
  const json = JSON.stringify(note.game).replace(/</g, '\\u003c');
  return `<script type="application/json" class="game-data" data-date="${escapeHtml(note.date)}"${preview ? ' data-preview' : ''}>${json}</script>`;
}

// The note's text as paragraphs, with each drawing in place of its marker.
function noteText(text: string, cls: string): string {
  return splitNote(text)
    .map((piece) => (piece.kind === 'text' ? `<p class="${cls}">${escapeHtml(piece.text)}</p>` : equationFigure(piece.name)))
    .join('\n');
}

// A glowing dot on the moon link until she has opened the newest entry (remembered on her phone only).
// Without storage there is no way to know, so there is no dot.
const UNREAD_SCRIPT = `<script>
(function () {
  var link = document.querySelector('.after-dark-link a');
  if (!link) return;
  try {
    if (localStorage.getItem('after-dark-seen') !== link.getAttribute('data-newest')) link.className = 'unread';
  } catch (e) {}
})();
</script>`;

export function readerPage({ current, archive, mediaBase, preview = false, sky = null, replies = null, reply, unsent, afterDark = null }: {
  current: Note | null; archive: Note[]; mediaBase: string; preview?: boolean; sky?: Sky | null;
  replies?: Reply[] | null; reply?: ReplyForm; unsent?: string; afterDark?: { href: string; newest: string } | null;
}): string {
  const form = preview ? undefined : reply;
  const area = (n: Note) => (replies ? replyArea({ field: 'date', value: n.date, anchor: `note-${n.date}` }, replies.find((r) => r.date === n.date), form, unsent === n.date) : '');
  const body = current
    ? `<p class="date">${formatDate(current.date)}</p>
${noteText(current.text, 'message')}
${photoTag(current, mediaBase, false)}
${soundTag(current, mediaBase, false)}
${area(current)}`
    : '';
  const today = !current
    ? '<p class="quiet">Nothing here yet. Check back soon.</p>'
    : current.game
      ? `<div class="note" data-game="${escapeHtml(current.date)}">\n${body}\n</div>`
      : body;
  const past = archive.length
    ? `<div class="heart" aria-hidden="true">&#9825;</div>
<section class="archive"><h2>Earlier notes</h2>
${archive.map((n) => `<article${n.game ? ` data-game="${escapeHtml(n.date)}"` : ''}><p class="date">${formatDate(n.date)}</p>${noteText(n.text, 'text')}${photoTag(n, mediaBase, true)}${soundTag(n, mediaBase, true)}${area(n)}</article>`).join('\n')}
</section>`
    : '';
  const games = [current, ...archive].filter((n): n is Note => Boolean(n?.game));
  const game = games.length
    ? `\n${games.map((n) => gameData(n, preview)).join('\n')}\n<style>${GAME_STYLE}</style>\n${GAME_SCRIPT}`
    : '';
  const replyScript = replies && form && (current || archive.length) ? `\n${REPLY_SCRIPT}` : '';
  const top = sky ? `<style>${SKY_STYLE}</style>\n${skyMarkup(sky)}\n` : '';
  const door = afterDark
    ? `
<p class="after-dark-link"><a href="${escapeHtml(afterDark.href)}" data-newest="${escapeHtml(afterDark.newest)}">☾ Daily affirmations… after dark</a></p>
${UNREAD_SCRIPT}`
    : '';
  const drawn = [current, ...archive].some((n) => n && hasDrawings(n.text));
  const equations = drawn ? `
<style>${EQUATION_STYLE}</style>
${equationScript()}` : '';
  return readerShell(top + today + door + past + game + replyScript + equations);
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
  /** The game fields as typed or as stored; empty when the note has no game. */
  game?: GameDraft;
  /** Date of the note being edited, so a changed date moves it instead of copying it. */
  original?: string;
  csrf: string;
  flash?: string;
  error?: string;
  meetings?: Meeting[];
  /** The meeting fields as typed, after a rejected add. */
  meetingDraft?: MeetingDraft;
  replies?: Reply[];
}

function formatStamp(at: string): string {
  return new Date(at).toLocaleString(LOCALE, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen',
  });
}

export function replyLine(reply: (Answer & { at: string }) | undefined): string {
  return reply ? `<p class="reply-line">${replySummary(reply)} <span class="hint">${escapeHtml(formatStamp(reply.at))}</span></p>` : '';
}

function meetingsSection(base: string, csrf: string, meetings: Meeting[], draft: MeetingDraft): string {
  const rows = meetings.map((m) => `<li><span>${formatDate(m.date)} · ${escapeHtml(m.place)}</span>
    <span class="actions"><form method="post" action="${escapeHtml(`${base}/admin/meeting/delete`)}" onsubmit="return confirm('Remove this meeting?')">
      ${csrf}<input type="hidden" name="date" value="${escapeHtml(m.date)}"><button type="submit">Remove</button>
    </form></span></li>`).join('\n');
  return `<h2>Meetings</h2>
<p class="hint">The sky on her page fills with a star for every note until the next meeting.</p>
<ul class="meetings">${rows || '<li>No meetings yet.</li>'}</ul>
<form class="meeting" method="post" action="${escapeHtml(`${base}/admin/meeting/save`)}">
  ${csrf}
  <input type="date" name="meet_date" value="${escapeHtml(draft.date)}" required aria-label="Meeting date">
  <input name="meet_place" maxlength="${MEETING_PLACE_MAX}" value="${escapeHtml(draft.place)}" placeholder="Place" required aria-label="Place">
  <button type="submit">Add meeting</button>
</form>`;
}

export function adminPage(d: AdminPageData): string {
  const mediaBase = `${d.base}/admin/media`;
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const status = (n: Note) => (n.date === d.current?.date ? 'Showing now' : n.date > d.today ? 'Queued' : 'Past');
  const rows = d.notes.map((n) => `<li>
  <div class="meta">
    <span>${formatDate(n.date)}<span class="tag">${status(n)}</span>${n.audio ? '<span class="tag">Sound</span>' : ''}${n.game ? '<span class="tag">Game</span>' : ''}${hasDrawings(n.text) ? '<span class="tag">Equation</span>' : ''}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin/preview?date=${n.date}`)}">Preview</a>
      <a href="${escapeHtml(`${d.base}/admin?edit=${n.date}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/delete`)}" onsubmit="return confirm('Delete this note?')">
        ${csrf}<input type="hidden" name="date" value="${escapeHtml(n.date)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  ${n.photo ? `<img class="thumb" src="${escapeHtml(`${mediaBase}/${n.photo.key}`)}" alt="" loading="lazy">` : ''}
  <p class="text">${escapeHtml(n.text)}</p>
  ${replyLine(d.replies?.find((r) => r.date === n.date))}
</li>`).join('\n');

  const currentPhoto = d.form.photo
    ? `<div class="attached"><img class="thumb" src="${escapeHtml(`${mediaBase}/${d.form.photo.key}`)}" alt=""><label><input type="checkbox" name="remove_photo" value="1"> Remove photo</label></div>`
    : '';
  const currentSound = d.form.audio
    ? `<div class="attached"><audio controls preload="none" src="${escapeHtml(`${mediaBase}/${d.form.audio.key}`)}"></audio><label><input type="checkbox" name="remove_audio" value="1"> Remove sound</label></div>`
    : '';

  return adminShell(`
<h1>Notes</h1>
<p><a href="${escapeHtml(`${d.base}/admin/after-dark`)}">After dark ☾</a></p>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<h2>Showing today (${formatDate(d.today)})</h2>
<div class="box">${d.current ? escapeHtml(d.current.text) : 'Nothing yet.'}</div>
${meetingsSection(d.base, csrf, d.meetings ?? [], d.meetingDraft ?? EMPTY_MEETING)}
<h2>Write a note</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${escapeHtml(`${d.base}/admin/save`)}">
  ${csrf}
  ${d.original ? `<input type="hidden" name="original" value="${escapeHtml(d.original)}">` : ''}
  <input type="date" name="date" value="${escapeHtml(d.form.date)}" required>
  <textarea name="text" maxlength="5000" required placeholder="Today's note">${escapeHtml(d.form.text)}</textarea>
  <p class="hint">Drawings: put [[heart]], [[filling heart]], [[butterfly]] or [[fourier heart]] on a line of its own.</p>
  <label class="file">Photo (optional)<input type="file" name="photo" accept="image/*"></label>
  ${currentPhoto}
  <label class="file">Sound (optional)<input type="file" name="audio" accept="audio/*,.m4a"></label>
  ${currentSound}
  <p class="hint">Photos are shrunk before upload. Sound: M4A, MP3, AAC or WAV, up to 25 MB.</p>
  ${gameFields(d.game ?? EMPTY_DRAFT)}
  <button type="submit">Save</button>
</form>
${RESIZE_SCRIPT}
${GAME_TOGGLE_SCRIPT}
<h2>All notes</h2>
<ul>${rows || '<li>No notes yet.</li>'}</ul>`);
}
