import { todayInCopenhagen } from './dates';
import {
  escapeHtml, formatDate, formatStamp, shell, READER_FONTS, adminShell, errorLine, replyArea, replyLine,
  REPLY_STYLE, REPLY_SCRIPT, type ReplyForm,
} from './views';
import { PAINTING, SECRET_MAX, SPOT_SIZE, type Found, type Secret, type SecretDraft } from './painting';
import type { EntryReply } from './after-dark';

const TWINKLE_SECONDS = 3;

const PAINTING_STYLE = `
:root { --paper: #fffaf2; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; --gold: #f2d27a; }
* { box-sizing: border-box; }
body { margin: 0; background: #141b22; color: #f3ead9; font-family: 'Cormorant Garamond', Georgia, serif; }
main { margin: 0; padding: 0; }
.bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2; display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 0.8rem 1rem 1.6rem; background: linear-gradient(rgba(20, 27, 34, 0.75), rgba(20, 27, 34, 0)); font-style: italic; font-size: 1.1rem; pointer-events: none; }
.bar a, .bar span { pointer-events: auto; color: #f3ead9; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); }
.gallery { height: 100vh; height: 100svh; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.painting { position: relative; height: 100%; aspect-ratio: ${PAINTING.width} / ${PAINTING.height}; margin: 0 auto; }
.painting img { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-select: none; }
.spot { position: absolute; width: ${SPOT_SIZE * 100}vh; height: ${SPOT_SIZE * 100}vh; width: ${SPOT_SIZE * 100}svh; height: ${SPOT_SIZE * 100}svh; margin: 0; transform: translate(-50%, -50%); }
.spot button { display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; position: relative; }
.spot button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.glint, .mark { position: absolute; left: 50%; top: 50%; pointer-events: none; }
.glint { width: 60%; height: 60%; margin: -30% 0 0 -30%; opacity: 0; background: radial-gradient(circle, #fffdf3 0%, rgba(255, 246, 214, 0.85) 18%, rgba(255, 240, 200, 0) 62%); }
.glint::before, .glint::after { content: ''; position: absolute; left: 50%; top: 50%; background: linear-gradient(90deg, rgba(255, 250, 230, 0), #fffaf0, rgba(255, 250, 230, 0)); }
.glint::before { width: 130%; height: 2px; margin: -1px 0 0 -65%; }
.glint::after { width: 2px; height: 130%; margin: -65% 0 0 -1px; background: linear-gradient(rgba(255, 250, 230, 0), #fffaf0, rgba(255, 250, 230, 0)); }
.mark { display: none; width: 0.7rem; height: 0.7rem; margin: -0.35rem 0 0 -0.35rem; border-radius: 50%; background: var(--gold); box-shadow: 0 0 8px rgba(242, 210, 122, 0.9), 0 0 0 2px rgba(20, 27, 34, 0.35); opacity: 0.9; }
.spot.found .glint { display: none; }
.spot.found .mark { display: block; }
.credit { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; padding: 1.4rem 1rem 0.6rem; font-size: 0.85rem; font-style: italic; color: rgba(243, 234, 217, 0.85); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7); background: linear-gradient(rgba(20, 27, 34, 0), rgba(20, 27, 34, 0.6)); pointer-events: none; }
.card-wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 1rem; background: rgba(20, 27, 34, 0.45); }
.card-wrap[hidden] { display: none; }
.card { width: 100%; max-width: 30rem; max-height: 85vh; overflow-y: auto; padding: 1.5rem 1.4rem 1.2rem; border-radius: 1rem; background: var(--paper); color: var(--ink); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45); animation: rise 0.5s ease-out both; }
.secret-text { margin: 0; font-size: 1.45rem; line-height: 1.4; white-space: pre-line; overflow-wrap: anywhere; }
.secret-date { margin: 0.6rem 0 0; color: var(--muted); font-style: italic; }
.close { display: inline-block; margin-top: 1rem; color: var(--muted); font-style: italic; }
.error { color: var(--accent); font-style: italic; margin: 0; }
button { font: inherit; }
${REPLY_STYLE}
.reply-form button { font-size: 1rem; padding: 0.3rem 0.9rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: #fffaf2; cursor: pointer; }
@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
`;

// Unfound spots take turns: each twinkles once in its own slot of a shared cycle.
function twinkleStyle(unfound: number): string {
  const cycle = TWINKLE_SECONDS * Math.max(unfound, 2);
  const slot = 100 / Math.max(unfound, 2);
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  return `<style>
.spot:not(.found) .glint { animation: twinkle ${cycle}s ease-in-out infinite; animation-delay: var(--delay, 0s); }
@keyframes twinkle { 0%, ${pct(slot * 0.9)}, 100% { opacity: 0; transform: scale(0.3); } ${pct(slot * 0.45)} { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .spot:not(.found) .glint { animation: none; opacity: 0.35; transform: none; } .card { animation: none; } }
</style>`;
}

// Opens cards in place. A first opening is recorded with a background POST; without fetch the form posts as usual.
// After a reload with a card open, the painting is scrolled so that its spot is in view.
const PAINTING_SCRIPT = `<script>
(function () {
  var gallery = document.querySelector('.gallery');
  var count = document.querySelector('.count');
  var open = null;
  function hide() { if (open) { open.hidden = true; open = null; } }
  function show(id) {
    hide();
    open = document.getElementById('card-' + id);
    if (open) open.hidden = false;
  }
  function recount() {
    if (!count) return;
    var total = document.querySelectorAll('form.spot').length;
    var left = total - document.querySelectorAll('form.spot.found').length;
    count.textContent = left === 0 ? 'You found all ' + total : left + (left === 1 ? ' secret' : ' secrets') + ' hidden here';
  }
  function centre(spot) {
    gallery.scrollLeft = spot.offsetLeft + spot.offsetParent.offsetLeft - gallery.clientWidth / 2;
  }
  var spots = document.querySelectorAll('form.spot');
  for (var i = 0; i < spots.length; i++) {
    spots[i].addEventListener('submit', function (event) {
      var form = event.currentTarget;
      var id = form.getAttribute('data-id');
      var record = form.method === 'post' && !/\\bfound\\b/.test(form.className);
      if (record) {
        if (!window.fetch || !window.FormData) return;
        var data = new FormData(form);
        data.append('quiet', '1');
        fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' })['catch'](function () {});
        form.className += ' found';
        form.querySelector('button').setAttribute('aria-label', 'A secret, found');
        recount();
      }
      event.preventDefault();
      show(id);
    });
  }
  var cards = document.querySelectorAll('.card-wrap');
  for (var j = 0; j < cards.length; j++) {
    cards[j].addEventListener('click', function (event) { if (event.target === event.currentTarget) hide(); });
    cards[j].querySelector('.close').addEventListener('click', function (event) { event.preventDefault(); hide(); });
    if (!cards[j].hidden) open = cards[j];
  }
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });
  var target = open && document.querySelector('form.spot[data-id="' + open.id.slice(5) + '"]');
  if (target) centre(target);
  else gallery.scrollLeft = (gallery.scrollWidth - gallery.clientWidth) / 2;
})();
</script>`;

const ALT = 'Almond Blossom by Vincent van Gogh, 1890: white blossoms on twisting branches against a blue sky';

const at = (x: number, y: number) => `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%`;

function countLine(total: number, unfound: number): string {
  if (total === 0) return '';
  const text = unfound === 0 ? `You found all ${total}` : `${unfound} ${unfound === 1 ? 'secret' : 'secrets'} hidden here`;
  return `<span class="count">${text}</span>`;
}

function hiddenOn(secret: Secret): string {
  return `Hidden on ${formatDate(todayInCopenhagen(new Date(secret.created)))}`;
}

export function paintingPage({ secrets, found, replies, back, foundAction, reply, open, unsent, preview }: {
  secrets: Secret[]; found: Found[]; replies: EntryReply[] | null; back: string;
  foundAction?: string; reply?: ReplyForm; open?: string; unsent?: string;
  /** The preview's own address: spots then only open cards and nothing is recorded. */
  preview?: string;
}): string {
  const isFound = (s: Secret) => found.some((f) => f.id === s.id);
  const home = preview ?? `${back}/painting`;
  const csrf = reply ? `<input type="hidden" name="csrf" value="${escapeHtml(reply.csrf)}">` : '';
  let turn = 0;
  const spots = secrets.map((s, i) => {
    const done = isFound(s);
    const style = done ? at(s.x, s.y) : `${at(s.x, s.y)};--delay:${TWINKLE_SECONDS * turn++}s`;
    const how = preview
      ? `method="get" action="${escapeHtml(preview)}"`
      : `method="post" action="${escapeHtml(foundAction ?? '')}"`;
    const fields = preview
      ? `<input type="hidden" name="open" value="${escapeHtml(s.id)}">`
      : `${csrf}<input type="hidden" name="id" value="${escapeHtml(s.id)}">`;
    const label = done ? `Secret ${i + 1}, found` : 'A hidden secret';
    return `<form class="spot${done ? ' found' : ''}" ${how} data-id="${escapeHtml(s.id)}" style="${style}">${fields}<button type="submit" aria-label="${label}"><span class="glint"></span><span class="mark"></span></button></form>`;
  }).join('\n');
  const unfound = secrets.filter((s) => !isFound(s)).length;
  const cards = secrets.map((s) => `<div class="card-wrap" id="card-${escapeHtml(s.id)}"${s.id === open ? '' : ' hidden'}><article class="card" role="dialog" aria-label="A secret">
<p class="secret-text">${escapeHtml(s.text)}</p>
<p class="secret-date">${hiddenOn(s)}</p>
${replies ? replyArea({ field: 'id', value: s.id, anchor: `secret-${s.id}` }, replies.find((r) => r.id === s.id), preview ? undefined : reply, unsent === s.id) : ''}
<a class="close" href="${escapeHtml(home)}">Close</a>
</article></div>`).join('\n');
  const scripts = secrets.length
    ? `\n${twinkleStyle(unfound)}\n${PAINTING_SCRIPT}${replies && reply && !preview ? `\n${REPLY_SCRIPT}` : ''}`
    : '';
  return shell('A painting for you', PAINTING_STYLE, `<div class="bar"><a class="back" href="${escapeHtml(back)}">Back to your notes</a>${countLine(secrets.length, unfound)}</div>
<div class="gallery"><div class="painting">
<img src="${PAINTING.src}" width="${PAINTING.width}" height="${PAINTING.height}" alt="${ALT}" draggable="false">
${spots}
</div></div>
<p class="credit">Vincent van Gogh, <em>Almond Blossom</em>, 1890. Van Gogh Museum, Amsterdam.</p>
${cards}${scripts}`, READER_FONTS);
}

const ADMIN_PAINTING_STYLE = `<style>
.board { position: relative; margin: 0.5rem 0; cursor: crosshair; touch-action: manipulation; }
.board img { display: block; width: 100%; height: auto; border-radius: 6px; }
.marker { position: absolute; transform: translate(-50%, -50%); min-width: 1.5rem; height: 1.5rem; padding: 0 0.3rem; border-radius: 999px; background: #fff7e6; color: #333; font-size: 0.8rem; line-height: 1.5rem; text-align: center; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); pointer-events: none; }
.marker.found { background: #e8b84a; }
.marker.new { width: 1.5rem; background: #b0645a; border: 2px solid #fff; }
.marker[hidden] { display: none; }
.spot-fields { display: flex; gap: 0.6rem; }
.spot-fields label { flex: 1; }
</style>`;

// Tapping the painting fills the position fields and moves the new marker; typing in them moves it too.
const PLACE_SCRIPT = `<script>
(function () {
  var board = document.querySelector('.board');
  var marker = document.querySelector('.marker.new');
  var x = document.querySelector('input[name=x]');
  var y = document.querySelector('input[name=y]');
  if (!board || !marker || !x || !y) return;
  function move() {
    var a = parseFloat(x.value.replace(',', '.'));
    var b = parseFloat(y.value.replace(',', '.'));
    if (isNaN(a) || isNaN(b)) return;
    marker.style.left = a + '%';
    marker.style.top = b + '%';
    marker.hidden = false;
  }
  board.addEventListener('click', function (event) {
    var box = board.getBoundingClientRect();
    var clamp = function (n) { return Math.min(100, Math.max(0, n)); };
    x.value = clamp((event.clientX - box.left) / box.width * 100).toFixed(1);
    y.value = clamp((event.clientY - box.top) / box.height * 100).toFixed(1);
    move();
  });
  x.addEventListener('input', move);
  y.addEventListener('input', move);
})();
</script>`;

export interface PaintingAdminData {
  base: string;
  csrf: string;
  secrets: Secret[];
  found: Found[];
  replies: EntryReply[];
  draft: SecretDraft;
  editing?: Secret;
  flash?: string;
  error?: string;
}

// The typed position, if it is a plain number, for placing the new marker.
function draftAt(draft: SecretDraft): string {
  const ok = (v: string) => /^\d+([.,]\d+)?$/.test(v);
  return ok(draft.x) && ok(draft.y) ? ` style="left:${draft.x.replace(',', '.')}%;top:${draft.y.replace(',', '.')}%"` : ' hidden';
}

export function paintingAdminPage(d: PaintingAdminData): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const foundAt = (s: Secret) => d.found.find((f) => f.id === s.id)?.at;
  const markers = d.secrets.map((s, i) => (s.id === d.editing?.id
    ? ''
    : `<span class="marker${foundAt(s) ? ' found' : ''}" style="${at(s.x, s.y)}">${i + 1}</span>`)).filter(Boolean).join('\n');
  const number = d.editing ? d.secrets.findIndex((s) => s.id === d.editing!.id) + 1 : 0;
  const rows = d.secrets.map((s, i) => {
    const when = foundAt(s);
    return `<li>
  <div class="meta">
    <span>Secret ${i + 1} · ${when ? `Found ${escapeHtml(formatStamp(when))}` : 'Not found yet'}</span>
    <span class="actions">
      <a href="${escapeHtml(`${d.base}/admin/painting?edit=${s.id}`)}">Edit</a>
      <form method="post" action="${escapeHtml(`${d.base}/admin/painting/delete`)}" onsubmit="return confirm('Delete this secret?')">
        ${csrf}<input type="hidden" name="id" value="${escapeHtml(s.id)}"><button type="submit">Delete</button>
      </form>
    </span>
  </div>
  <p class="text">${escapeHtml(s.text)}</p>
  ${replyLine(d.replies.find((r) => r.id === s.id))}
</li>`;
  }).join('\n');
  return adminShell(`${ADMIN_PAINTING_STYLE}
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>Painting</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<p><a href="${escapeHtml(`${d.base}/admin/painting/preview`)}">Preview</a></p>
<h2>${d.editing ? `Edit secret ${number}` : 'Hide a secret'}</h2>
<div class="board">
<img src="${PAINTING.src}" width="${PAINTING.width}" height="${PAINTING.height}" alt="">
${markers}
<span class="marker new"${draftAt(d.draft)}></span>
</div>
<p class="hint">Tap the painting where it should hide. Gold markers have been found.</p>
<form class="write" method="post" action="${escapeHtml(`${d.base}/admin/painting/save`)}">
  ${csrf}
  ${d.editing ? `<input type="hidden" name="id" value="${escapeHtml(d.editing.id)}">` : ''}
  <textarea name="text" maxlength="${SECRET_MAX}" required placeholder="The secret">${escapeHtml(d.draft.text)}</textarea>
  <div class="spot-fields">
    <label class="file">Across (%)<input name="x" inputmode="decimal" value="${escapeHtml(d.draft.x)}" required></label>
    <label class="file">Down (%)<input name="y" inputmode="decimal" value="${escapeHtml(d.draft.y)}" required></label>
  </div>
  <button type="submit">Save</button>
</form>
${PLACE_SCRIPT}
<h2>All secrets</h2>
<ul>${rows || '<li>No secrets yet.</li>'}</ul>`);
}
