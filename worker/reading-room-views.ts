import { todayInCopenhagen } from './dates';
import {
  escapeHtml, formatDate, formatStamp, shell, READER_FONTS, adminShell, errorLine, replyArea, replyLine,
  REPLY_STYLE, type ReplyForm,
} from './views';
import { BOOK_LIMITS, spineLook, type Book, type BookDraft, type Played } from './books';
import type { EntryReply } from './after-dark';

const ROOM_STYLE = `
:root { --paper: #fbf5ea; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; --cream: #f1e6d2; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse 120% 70% at 50% 0%, rgba(255, 190, 115, 0.2), rgba(255, 190, 115, 0) 65%) fixed, #1c1511; background-color: #1c1511; color: var(--cream); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 60rem; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin: 0 0 2.5rem; }
.top a { color: #c9b9a3; font-style: italic; font-size: 1.05rem; }
.top h1 { margin: 0; font-weight: 400; font-style: italic; font-size: 1.6rem; color: #f0d29a; }
.quiet { color: #c9b9a3; font-style: italic; font-size: 1.25rem; text-align: center; margin: 0 0 1.5rem; }
.shelves { --row: 12rem; --board: 1.1rem; display: flex; flex-wrap: wrap; align-items: flex-end; align-content: flex-start; gap: 0 0.2rem; min-height: var(--row); padding: 0 0.75rem; border-radius: 4px;
  background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) calc(var(--row) - var(--board)), #6b4a30 calc(var(--row) - var(--board)), #4a3220 calc(var(--row) - 0.3rem), #2e1f14 calc(var(--row) - 0.3rem), #2e1f14 var(--row)); }
.book { position: relative; display: flex; align-items: flex-end; width: var(--w); height: calc(var(--row) - var(--board)); margin-bottom: var(--board); text-decoration: none; -webkit-tap-highlight-color: transparent; }
.spine { display: flex; flex-direction: column; align-items: center; width: 100%; height: var(--h); padding: 0.7rem 0 0.55rem; border-radius: 3px 3px 1px 1px; color: #33281f; overflow: hidden; transition: transform 0.25s ease-out;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.16) 28%, rgba(255, 255, 255, 0) 55%, rgba(0, 0, 0, 0.22)), var(--c);
  box-shadow: inset 0 0.45rem 0 -0.3rem rgba(120, 90, 50, 0.35), inset 0 -0.45rem 0 -0.3rem rgba(120, 90, 50, 0.35), 0 -1px 6px rgba(0, 0, 0, 0.35); }
.book:active .spine, .book:focus-visible .spine, .book.out .spine { transform: translateY(-0.5rem); }
.book:focus-visible { outline: none; }
.book:focus-visible .spine { outline: 2px solid #f0d29a; outline-offset: 2px; }
.title, .author { writing-mode: vertical-rl; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { flex: 1 1 auto; min-height: 0; font-size: 1.02rem; font-weight: 500; letter-spacing: 0.02em; }
.author { flex: 0 0 auto; max-height: 40%; margin-top: 0.45rem; font-size: 0.72rem; font-style: italic; opacity: 0.8; }
.book.new::after { content: ''; position: absolute; right: 26%; bottom: calc(-1 * var(--board) - 0.35rem); width: 0.36rem; height: calc(var(--board) + 0.9rem); background: linear-gradient(#f1d08a, #c9963f); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%); opacity: 0.9; }
.sheet-wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0.5rem; background: rgba(15, 10, 8, 0.55); }
.sheet-wrap[hidden] { display: none; }
.sheet { width: 100%; max-width: 32rem; max-height: 88vh; overflow-y: auto; padding: 1.4rem 1.3rem calc(1.2rem + env(safe-area-inset-bottom, 0px)); border-radius: 1.1rem 1.1rem 0 0; background: var(--paper); color: var(--ink); box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.45); animation: up 0.35s ease-out both; }
.sheet h2 { margin: 0; font-weight: 500; font-size: 1.7rem; line-height: 1.2; overflow-wrap: anywhere; }
.by { margin: 0.2rem 0 0; font-style: italic; color: var(--muted); font-size: 1.1rem; }
.line { margin: 1rem 0 0; font-size: 1.25rem; line-height: 1.4; white-space: pre-line; overflow-wrap: anywhere; }
.date { margin: 0.9rem 0 0; color: var(--muted); font-style: italic; }
.sheet audio { display: block; width: 100%; margin: 1.1rem 0 0; }
.close { display: inline-block; margin-top: 1rem; color: var(--muted); font-style: italic; font-size: 1.05rem; }
.error { color: var(--accent); font-style: italic; margin: 0; }
button { font: inherit; }
${REPLY_STYLE}
.reply-form button { font-size: 1rem; padding: 0.3rem 0.9rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
@keyframes up { from { transform: translateY(100%); } to { transform: none; } }
@media (min-width: 40rem) { .shelves { --row: 14rem; } .title { font-size: 1.12rem; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } .spine { transition: none; } }
`;

// Opens sheets in place, records a book's first play in the background, remembers where she stopped
// (on her phone only), shows the book on the lock screen, and sends hearts and replies without a reload
// so the reading keeps playing. Nothing from the books is in here; it reads them from the page.
export const ROOM_SCRIPT = `<script>
(function () {
  var shelves = document.querySelector('.shelves');
  var playUrl = shelves.getAttribute('data-played');
  var csrf = shelves.getAttribute('data-csrf');
  var open = null;
  function post(url, fields, done) {
    var body = [];
    for (var name in fields) if (fields.hasOwnProperty(name)) body.push(encodeURIComponent(name) + '=' + encodeURIComponent(fields[name]));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = function () { if (done) done(xhr.status === 204); };
    xhr.onerror = function () { if (done) done(false); };
    xhr.send(body.join('&') + '&quiet=1');
  }
  function lift(id, on) {
    var book = document.querySelector('.book[data-id="' + id + '"]');
    if (book) book.className = book.className.replace(/\\s*\\bout\\b/, '') + (on ? ' out' : '');
    return book;
  }
  function hide() {
    if (!open) return;
    open.hidden = true;
    lift(open.id.slice(5), false);
    open = null;
  }
  function show(id) {
    hide();
    open = document.getElementById('book-' + id);
    if (!open) return;
    open.hidden = false;
    lift(id, true);
    open.querySelector('.close').focus();
  }
  var books = document.querySelectorAll('.book');
  for (var i = 0; i < books.length; i++) {
    books[i].addEventListener('click', function (event) {
      event.preventDefault();
      show(event.currentTarget.getAttribute('data-id'));
    });
  }
  var sheets = document.querySelectorAll('.sheet-wrap');
  for (var j = 0; j < sheets.length; j++) {
    sheets[j].addEventListener('click', function (event) { if (event.target === event.currentTarget) hide(); });
    sheets[j].querySelector('.close').addEventListener('click', function (event) { event.preventDefault(); hide(); });
    if (!sheets[j].hidden) { open = sheets[j]; lift(open.id.slice(5), true); }
  }
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });

  var audios = document.querySelectorAll('.sheet audio');
  function listen(audio) {
    var id = audio.getAttribute('data-id');
    var key = 'book-at-' + id;
    var resumed = false;
    var saved = 0;
    function resume() {
      if (resumed || !audio.duration) return;
      resumed = true;
      try {
        var at = parseFloat(localStorage.getItem(key));
        if (at > 0 && at < audio.duration - 10) audio.currentTime = at;
      } catch (e) {}
    }
    function save() {
      if (!resumed) return;
      try {
        if (audio.ended || audio.duration - audio.currentTime < 10) localStorage.removeItem(key);
        else localStorage.setItem(key, String(audio.currentTime));
      } catch (e) {}
    }
    audio.addEventListener('loadedmetadata', resume);
    audio.addEventListener('canplay', resume);
    audio.addEventListener('timeupdate', function () {
      var now = new Date().getTime();
      if (now - saved > 5000) { saved = now; save(); }
    });
    audio.addEventListener('pause', save);
    audio.addEventListener('ended', save);
    audio.addEventListener('play', function () {
      for (var k = 0; k < audios.length; k++) if (audios[k] !== audio) audios[k].pause();
      if ('mediaSession' in navigator && window.MediaMetadata) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: audio.getAttribute('data-title'), artist: audio.getAttribute('data-author'), album: 'Read for you',
          });
        } catch (e) {}
      }
      var book = document.querySelector('.book[data-id="' + id + '"]');
      if (playUrl && book && /\\bnew\\b/.test(book.className)) {
        book.className = book.className.replace(/\\s*\\bnew\\b/, '');
        post(playUrl, { csrf: csrf, id: id });
      }
    });
  }
  for (var a = 0; a < audios.length; a++) listen(audios[a]);

  function send(form) {
    var area = form.parentNode;
    var heart = form.querySelector('input[name=heart]').checked;
    var text = form.querySelector('textarea').value.replace(/^\\s+|\\s+$/g, '');
    var error = area.querySelector('.error');
    post(form.action, { csrf: form.querySelector('input[name=csrf]').value, id: form.querySelector('input[name=id]').value, heart: heart ? 'on' : '', text: text }, function (ok) {
      if (!ok) {
        if (!error) { error = document.createElement('p'); error.className = 'error'; area.appendChild(error); }
        error.textContent = "That didn't send. Try again?";
        return;
      }
      if (error) area.removeChild(error);
      var sent = area.querySelector('.reply-sent');
      if (!heart && !text) { if (sent) area.removeChild(sent); return; }
      if (!sent) { sent = document.createElement('p'); sent.className = 'reply-sent'; area.insertBefore(sent, form); }
      sent.textContent = 'You sent ' + [heart ? '\\u2665' : '', text ? '\\u201c' + text + '\\u201d' : ''].join(heart && text ? ' ' : '');
      var details = form.querySelector('details');
      if (details && text) details.open = false;
    });
  }
  var forms = document.querySelectorAll('.reply-form[action]');
  for (var f = 0; f < forms.length; f++) {
    forms[f].addEventListener('submit', function (event) { event.preventDefault(); send(event.currentTarget); });
    forms[f].querySelector('input[name=heart]').addEventListener('change', function (event) { send(event.target.form); });
  }
})();
</script>`;

function roomShell(body: string): string {
  return shell('The reading room', ROOM_STYLE, body, READER_FONTS);
}

function readOn(book: Book): string {
  return `Read on ${formatDate(todayInCopenhagen(new Date(book.created)))}`;
}

export function readingRoomPage({ books, played, replies, back, mediaBase, playAction, reply, open, unsent, preview }: {
  books: Book[]; played: Played[]; replies: EntryReply[] | null; back: string; mediaBase: string;
  playAction?: string; reply?: ReplyForm; open?: string; unsent?: string;
  /** The preview's own address: nothing is recorded and replies are off. */
  preview?: string;
}): string {
  const home = preview ?? `${back}/reading-room`;
  const form = preview ? undefined : reply;
  const spines = books.map((b) => {
    const look = spineLook(b.id);
    const isNew = !played.some((p) => p.id === b.id);
    return `<a class="book${isNew ? ' new' : ''}" href="${escapeHtml(`${home}?open=${b.id}`)}" data-id="${escapeHtml(b.id)}" style="--h:${look.height}%;--w:${look.width}rem;--c:${look.colour}"><span class="spine"><span class="title">${escapeHtml(b.title)}</span><span class="author">${escapeHtml(b.author)}</span></span></a>`;
  }).join('\n');
  const recording = !preview && playAction && reply
    ? ` data-played="${escapeHtml(playAction)}" data-csrf="${escapeHtml(reply.csrf)}"`
    : '';
  const sheets = books.map((b) => `<div class="sheet-wrap" id="book-${escapeHtml(b.id)}"${b.id === open ? '' : ' hidden'}><article class="sheet" role="dialog" aria-label="${escapeHtml(b.title)}">
<h2>${escapeHtml(b.title)}</h2>
<p class="by">by ${escapeHtml(b.author)}</p>
${b.line ? `<p class="line">${escapeHtml(b.line)}</p>\n` : ''}<p class="date">${readOn(b)}</p>
<audio controls preload="none" src="${escapeHtml(`${mediaBase}/${b.audio.key}`)}" data-id="${escapeHtml(b.id)}" data-title="${escapeHtml(b.title)}" data-author="${escapeHtml(b.author)}"></audio>
${replies ? replyArea({ field: 'id', value: b.id, anchor: `reply-${b.id}` }, replies.find((r) => r.id === b.id), form, unsent === b.id) : ''}
<a class="close" href="${escapeHtml(home)}">Close</a>
</article></div>`).join('\n');
  return roomShell(`<div class="top"><a href="${escapeHtml(back)}">Back to your notes</a><h1>The reading room</h1></div>
${books.length ? '' : '<p class="quiet">Nothing on the shelf yet.</p>\n'}<div class="shelves"${recording}>
${spines}
</div>
${sheets}${books.length ? `\n${ROOM_SCRIPT}` : ''}`);
}

export function readingRoomErrorPage(): string {
  return roomShell('<p class="quiet">Something went wrong loading this page.</p>');
}

export interface ReadingRoomAdminData {
  base: string;
  csrf: string;
  books: Book[];
  played: Played[];
  replies: EntryReply[];
  draft: BookDraft;
  editing?: Book;
  flash?: string;
  error?: string;
}

export function readingRoomAdminPage(d: ReadingRoomAdminData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const rows = d.books.map((b) => {
    const when = d.played.find((p) => p.id === b.id)?.at;
    return `<li>
  <div class="meta">
    <span>${when ? `Listened ${escapeHtml(formatStamp(when))}` : 'Not played yet'}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin/reading-room?edit=${b.id}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/reading-room/delete`)}" onsubmit="return confirm('Delete this book?')">
        ${csrf}<input type="hidden" name="id" value="${escapeHtml(b.id)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  <p class="text"><strong>${escapeHtml(b.title)}</strong> · ${escapeHtml(b.author)}</p>
  ${b.line ? `<p class="text">${escapeHtml(b.line)}</p>` : ''}
  <div class="attached"><audio controls preload="none" src="${escapeHtml(`${d.base}/admin/media/${b.audio.key}`)}"></audio></div>
  ${replyLine(d.replies.find((r) => r.id === b.id))}
</li>`;
  }).join('\n');
  return adminShell(`
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>Reading room</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<p><a href="${escapeHtml(`${d.base}/admin/reading-room/preview`)}">Preview</a></p>
<h2>${d.editing ? 'Edit book' : 'Add a book'}</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${escapeHtml(`${d.base}/admin/reading-room/save`)}">
  ${csrf}
  ${d.editing ? `<input type="hidden" name="id" value="${escapeHtml(d.editing.id)}">` : ''}
  <input name="title" maxlength="${BOOK_LIMITS.title}" required placeholder="Title" value="${escapeHtml(d.draft.title)}">
  <input name="author" maxlength="${BOOK_LIMITS.author}" required placeholder="Author" value="${escapeHtml(d.draft.author)}">
  <textarea name="line" maxlength="${BOOK_LIMITS.line}" placeholder="A line from you (optional)">${escapeHtml(d.draft.line)}</textarea>
  <label class="file">Recording<input type="file" name="audio" accept="audio/*,.m4a"${d.editing ? '' : ' required'}></label>
  <p class="hint">M4A, MP3, AAC or WAV, up to 25 MB (about 25 to 50 minutes).${d.editing ? ' Leave empty to keep the current recording.' : ''}</p>
  <button type="submit">Save</button>
</form>
<h2>The shelf</h2>
<ul>${rows || '<li>No books yet.</li>'}</ul>`);
}
