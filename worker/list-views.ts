import {
  escapeHtml, formatStamp, shell, READER_FONTS, adminShell, errorLine,
} from './views';
import {
  LIST_LIMITS, NEW_BOX, otherPerson, type ListSettings, type ListView, type Person, type ViewBox, type ViewCard, type ViewComment,
} from './list';

const LIST_STYLE = `
:root { --paper: #1a1220; --raised: #261a2e; --sheet: #2a1d32; --ink: #ecdfd0; --muted: #a8949a; --accent: #d9a55b; --line: #3a2a3c; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(ellipse at top, #2a1b30 0%, #1a1220 65%) fixed; background-color: #1a1220; color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
main { max-width: 46rem; margin: 0 auto; padding: 1.25rem 0.9rem 5rem; }
a { color: var(--muted); }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin: 0 0 1.25rem; }
.top a { font-style: italic; font-size: 1.05rem; }
.top h1 { margin: 0; font-weight: 400; font-style: italic; font-size: 1.7rem; color: var(--accent); }
.error { color: var(--accent); font-style: italic; margin: 0 0 1rem; }
input, textarea, select { font: inherit; color: var(--ink); background: #1f1526; border: 1px solid var(--line); border-radius: 0.5rem; }
input, textarea { display: block; width: 100%; margin: 0 0 0.6rem; padding: 0.6rem 0.75rem; font-size: 1.15rem; }
textarea { min-height: 6rem; resize: vertical; }
.go { font: inherit; font-size: 1.05rem; padding: 0.35rem 1.2rem; border: 1px solid var(--accent); border-radius: 999px; background: transparent; color: var(--accent); cursor: pointer; }
.adder { margin: 0 0 1.25rem; }
.adder summary { display: inline-block; cursor: pointer; font-size: 1.15rem; font-style: italic; color: var(--accent); list-style: none; padding: 0.3rem 0; }
.adder summary::-webkit-details-marker { display: none; }
.adder form { margin-top: 0.6rem; }
.box { margin: 0 0 0.6rem; border: 1px solid var(--line); border-radius: 0.7rem; background: rgba(38, 26, 46, 0.55); }
.box > summary { display: flex; justify-content: space-between; align-items: baseline; padding: 0.7rem 0.9rem; cursor: pointer; list-style: none; font-size: 1.25rem; font-style: italic; color: var(--accent); }
.box > summary::-webkit-details-marker { display: none; }
.box .n { font-size: 1rem; font-style: normal; color: var(--muted); }
.cards { list-style: none; margin: 0; padding: 0 0.6rem 0.6rem; min-height: 3rem; }
.card { position: relative; margin: 0 0 0.5rem; border: 1px solid var(--line); border-radius: 0.6rem; background: var(--raised); -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
.card:last-child { margin-bottom: 0; }
.card.match { border-color: var(--accent); }
.card.fresh .card-title::after { content: ''; display: inline-block; width: 0.45rem; height: 0.45rem; margin-left: 0.45rem; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); vertical-align: middle; }
.card.match .card-title::before { content: '\\2726\\00a0'; color: var(--accent); }
.open { display: block; padding: 0.65rem 0.8rem 0.35rem; color: var(--ink); text-decoration: none; -webkit-touch-callout: none; }
.card-title { display: block; font-size: 1.2rem; line-height: 1.25; overflow-wrap: anywhere; }
.card-text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin-top: 0.15rem; color: #cdbfb4; font-size: 1.02rem; line-height: 1.3; }
.places, .meta { display: block; margin-top: 0.3rem; font-size: 0.92rem; font-style: italic; color: var(--muted); }
.move { margin: 0; padding: 0 0.8rem 0.55rem; }
.move label { font-size: 0.92rem; font-style: italic; color: var(--muted); }
.move select { max-width: 11rem; margin-left: 0.3rem; padding: 0.15rem 0.3rem; font-size: 0.95rem; }
.move button { margin-left: 0.3rem; font: inherit; font-size: 0.9rem; }
.slot { margin: 0 0 0.5rem; border: 1px dashed var(--accent); border-radius: 0.6rem; opacity: 0.6; }
.flying { position: fixed; z-index: 5; margin: 0; pointer-events: none; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55); opacity: 0.95; }
.card.dragging { display: none; }
.sheet-wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0.5rem; background: rgba(10, 6, 12, 0.6); }
.sheet-wrap[hidden] { display: none; }
.sheet { width: 100%; max-width: 34rem; max-height: 90vh; overflow-y: auto; padding: 1.3rem 1.2rem calc(1.1rem + env(safe-area-inset-bottom, 0px)); border-radius: 1.1rem 1.1rem 0 0; background: var(--sheet); box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5); animation: up 0.3s ease-out both; }
.sheet h2 { margin: 0; font-weight: 400; font-size: 1.6rem; line-height: 1.2; overflow-wrap: anywhere; }
.sheet-wrap.match h2::before { content: '\\2726\\00a0'; color: var(--accent); }
.full { margin: 0.7rem 0 0; font-size: 1.2rem; line-height: 1.4; white-space: pre-line; overflow-wrap: anywhere; }
.talk { list-style: none; margin: 1rem 0 0; padding: 0; border-top: 1px solid var(--line); }
.talk li { padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
.talk p { margin: 0; font-size: 1.1rem; line-height: 1.35; white-space: pre-line; overflow-wrap: anywhere; }
.talk .said { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-top: 0.2rem; font-size: 0.9rem; font-style: italic; color: var(--muted); }
.talk form { display: inline; margin: 0; }
.quiet-button { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-style: italic; text-decoration: underline; cursor: pointer; }
.say { margin: 0.9rem 0 0; }
.edit { margin: 1rem 0 0; }
.edit summary { cursor: pointer; font-style: italic; color: var(--muted); list-style: none; }
.edit summary::-webkit-details-marker { display: none; }
.edit form { margin-top: 0.6rem; }
.sheet-foot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1rem; font-size: 1.05rem; }
.sheet-foot form { margin: 0; }
.notice { position: fixed; left: 50%; bottom: 1.2rem; z-index: 6; transform: translateX(-50%); margin: 0; padding: 0.45rem 1rem; border-radius: 999px; background: #3a2a3c; color: var(--ink); font-style: italic; }
.notice[hidden] { display: none; }
@keyframes up { from { transform: translateY(100%); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
`;

// Dragging is written by hand: Safari's built-in drag and drop is not dependable on touch. A long press starts it
// so that an ordinary swipe still scrolls. Moves save in the background, one at a time, in order; a failed move
// goes back. Nothing from the cards is in here; it reads them from the page.
export const LIST_SCRIPT = `<script>
(function () {
  var board = document.querySelector('.board');
  var action = board.getAttribute('data-action');
  var csrf = board.getAttribute('data-csrf');
  var notice = document.querySelector('.notice');
  var queue = [];
  var busy = false;
  function next() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    var body = ['csrf=' + encodeURIComponent(csrf), 'quiet=1'];
    for (var name in job.fields) if (job.fields.hasOwnProperty(name)) body.push(name + '=' + encodeURIComponent(job.fields[name]));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', action);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = function () { busy = false; if (xhr.status !== 204 && job.failed) job.failed(); next(); };
    xhr.onerror = function () { busy = false; if (job.failed) job.failed(); next(); };
    xhr.send(body.join('&'));
  }
  function send(fields, failed) { queue.push({ fields: fields, failed: failed }); next(); }
  function complain() {
    notice.textContent = "That didn't save. Try again?";
    notice.hidden = false;
    setTimeout(function () { notice.hidden = true; }, 4000);
  }
  function refresh() {
    var boxes = document.querySelectorAll('.box');
    for (var i = 0; i < boxes.length; i++) boxes[i].querySelector('.n').textContent = boxes[i].querySelectorAll('.cards > .card').length;
  }
  function settle(card) {
    var box = card.parentNode.parentNode;
    var id = card.getAttribute('data-card');
    var boxId = box.getAttribute('data-box');
    var mine = document.querySelectorAll('[data-mine="' + id + '"]');
    for (var i = 0; i < mine.length; i++) mine[i].textContent = 'You: ' + box.getAttribute('data-name');
    var matched = boxId === card.getAttribute('data-other') && !box.hasAttribute('data-nomatch');
    var both = document.querySelectorAll('[data-card="' + id + '"]');
    for (var j = 0; j < both.length; j++) both[j].classList.toggle('match', matched);
    card.querySelector('select').value = boxId;
    refresh();
  }
  function moved(card, from, before) {
    settle(card);
    var list = card.parentNode;
    var index = 0;
    for (var el = card.previousElementSibling; el; el = el.previousElementSibling) if (el.classList.contains('card')) index++;
    send({ 'do': 'move', id: card.getAttribute('data-card'), box: list.parentNode.getAttribute('data-box'), index: index }, function () {
      from.insertBefore(card, before);
      settle(card);
      complain();
    });
  }

  // Which boxes are open is remembered on this device; a box the server opened on purpose stays open.
  var boxes = document.querySelectorAll('.box');
  function remember() {
    var open = [];
    for (var i = 0; i < boxes.length; i++) if (boxes[i].open) open.push(boxes[i].getAttribute('data-box'));
    try { localStorage.setItem('list-open', JSON.stringify(open)); } catch (e) {}
  }
  try {
    var stored = JSON.parse(localStorage.getItem('list-open'));
    if (stored) for (var b = 0; b < boxes.length; b++) {
      if (!boxes[b].hasAttribute('data-keep')) boxes[b].open = stored.indexOf(boxes[b].getAttribute('data-box')) !== -1;
    }
  } catch (e) {}
  for (var t = 0; t < boxes.length; t++) boxes[t].addEventListener('toggle', remember);

  // Sheets.
  var openSheet = null;
  var justDragged = false;
  function hide() { if (openSheet) { openSheet.hidden = true; openSheet = null; } }
  var links = document.querySelectorAll('.open');
  for (var l = 0; l < links.length; l++) {
    links[l].addEventListener('click', function (event) {
      event.preventDefault();
      if (justDragged) return;
      hide();
      openSheet = document.getElementById('card-' + event.currentTarget.parentNode.getAttribute('data-card'));
      openSheet.hidden = false;
    });
    links[l].addEventListener('dragstart', function (event) { event.preventDefault(); });
  }
  var sheets = document.querySelectorAll('.sheet-wrap');
  for (var s = 0; s < sheets.length; s++) {
    sheets[s].addEventListener('click', function (event) { if (event.target === event.currentTarget) hide(); });
    sheets[s].querySelector('.close').addEventListener('click', function (event) { event.preventDefault(); hide(); });
    if (!sheets[s].hidden) openSheet = sheets[s];
  }
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });

  // Move to...
  var selects = document.querySelectorAll('.move select');
  for (var m = 0; m < selects.length; m++) {
    selects[m].addEventListener('change', function (event) {
      var card = event.target.parentNode.parentNode.parentNode;
      var from = card.parentNode;
      var before = card.nextElementSibling;
      document.querySelector('.box[data-box="' + event.target.value + '"] .cards').appendChild(card);
      moved(card, from, before);
    });
  }

  // Dragging.
  var pending = null;
  var drag = null;
  var HOLD_MS = 350;
  var EDGE = 70;
  function within(target, selector) { return target && target.closest ? target.closest(selector) : null; }
  function place() {
    if (!drag) return;
    var hit = document.elementFromPoint(drag.x, drag.y);
    var box = within(hit, '.box');
    if (box !== drag.hover) {
      clearTimeout(drag.opener);
      drag.hover = box;
      if (box && !box.open) drag.opener = setTimeout(function () { box.open = true; }, 400);
    }
    if (!box || !box.open) return;
    var list = box.querySelector('.cards');
    var others = list.children;
    var before = null;
    for (var i = 0; i < others.length; i++) {
      var el = others[i];
      if (el === drag.slot || el === drag.card) continue;
      var rect = el.getBoundingClientRect();
      if (drag.y < rect.top + rect.height / 2) { before = el; break; }
    }
    if (drag.slot.parentNode !== list || drag.slot.nextElementSibling !== before) list.insertBefore(drag.slot, before);
  }
  function frame() {
    if (!drag) return;
    if (drag.y < EDGE) window.scrollBy(0, -9);
    else if (drag.y > window.innerHeight - EDGE) window.scrollBy(0, 9);
    place();
    requestAnimationFrame(frame);
  }
  function follow(x, y) {
    drag.x = x;
    drag.y = y;
    drag.flying.style.transform = 'translate(' + (x - drag.startX) + 'px,' + (y - drag.startY) + 'px)';
  }
  function begin(card, x, y) {
    var rect = card.getBoundingClientRect();
    var slot = document.createElement('li');
    slot.className = 'slot';
    slot.style.height = rect.height + 'px';
    var flying = card.cloneNode(true);
    flying.classList.add('flying');
    flying.removeAttribute('data-card');
    flying.style.left = rect.left + 'px';
    flying.style.top = rect.top + 'px';
    flying.style.width = rect.width + 'px';
    document.body.appendChild(flying);
    drag = { card: card, slot: slot, flying: flying, from: card.parentNode, before: card.nextElementSibling, startX: x, startY: y, x: x, y: y, hover: null, opener: null };
    card.parentNode.insertBefore(slot, card);
    card.classList.add('dragging');
    requestAnimationFrame(frame);
  }
  function finish(keep) {
    var d = drag;
    drag = null;
    clearTimeout(d.opener);
    d.flying.parentNode.removeChild(d.flying);
    d.card.classList.remove('dragging');
    justDragged = true;
    setTimeout(function () { justDragged = false; }, 400);
    if (keep) d.slot.parentNode.insertBefore(d.card, d.slot);
    d.slot.parentNode.removeChild(d.slot);
    if (keep && (d.card.parentNode !== d.from || d.card.nextElementSibling !== d.before)) moved(d.card, d.from, d.before);
  }
  function drop() { if (pending) { clearTimeout(pending.timer); pending = null; } }
  function grabbable(target) { return within(target, '.move') ? null : within(target, '.cards > .card'); }

  document.addEventListener('touchstart', function (event) {
    drop();
    if (drag || event.touches.length !== 1) return;
    var card = grabbable(event.target);
    if (!card) return;
    var touch = event.touches[0];
    pending = { x: touch.clientX, y: touch.clientY, timer: setTimeout(function () {
      var at = pending;
      pending = null;
      begin(card, at.x, at.y);
    }, HOLD_MS) };
  }, { passive: true });
  // Not passive: once a drag has begun it must be able to stop the page from scrolling.
  document.addEventListener('touchmove', function (event) {
    var touch = event.touches[0];
    if (drag) { event.preventDefault(); follow(touch.clientX, touch.clientY); return; }
    if (pending && Math.abs(touch.clientX - pending.x) + Math.abs(touch.clientY - pending.y) > 10) drop();
  }, { passive: false });
  document.addEventListener('touchend', function () { drop(); if (drag) finish(true); });
  document.addEventListener('touchcancel', function () { drop(); if (drag) finish(false); });
  document.addEventListener('contextmenu', function (event) { if (drag || pending) event.preventDefault(); });

  document.addEventListener('mousedown', function (event) {
    if (event.button !== 0 || drag) return;
    var card = grabbable(event.target);
    if (card) pending = { x: event.clientX, y: event.clientY, card: card, timer: null };
  });
  document.addEventListener('mousemove', function (event) {
    if (drag) { follow(event.clientX, event.clientY); return; }
    if (pending && pending.card && Math.abs(event.clientX - pending.x) + Math.abs(event.clientY - pending.y) > 6) {
      var at = pending;
      pending = null;
      begin(at.card, at.x, at.y);
    }
  });
  document.addEventListener('mouseup', function () { drop(); if (drag) finish(true); });

  if (board.hasAttribute('data-unseen')) send({ 'do': 'seen' });
})();
</script>`;

/** What the form held when a save was refused, so nothing typed is lost. */
export interface ListDraft {
  form: 'add' | 'edit' | 'comment';
  id?: string;
  title: string;
  text: string;
}

export function listPage({ view, me, settings, action, home, back, csrf, open, draft, error }: {
  view: ListView; me: Person; settings: ListSettings; action: string; home: string; back: string; csrf: string;
  open?: string; draft?: ListDraft; error?: string;
}): string {
  const hidden = `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">`;
  const nameOf = (who: Person) => (who === me ? 'You' : who === 'reader' ? settings.readerName : settings.adminName);
  const boxName = (id: string) => view.boxes.find((b) => b.id === id)?.name ?? 'New';
  const other = nameOf(otherPerson(me));
  const sheetOpen = draft?.id ?? open;
  const places = (c: ViewCard) => `<span data-mine="${escapeHtml(c.id)}">You: ${escapeHtml(boxName(c.mine))}</span> · ${escapeHtml(other)}: ${escapeHtml(boxName(c.theirs))}`;
  const options = (c: ViewCard) => view.boxes
    .map((b) => `<option value="${escapeHtml(b.id)}"${b.id === c.mine ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  const cardRow = (c: ViewCard) => `<li class="card${c.fresh ? ' fresh' : ''}${c.match ? ' match' : ''}" data-card="${escapeHtml(c.id)}" data-other="${escapeHtml(c.theirs)}">
<a class="open" href="${escapeHtml(`${home}?open=${c.id}`)}" draggable="false"><span class="card-title">${escapeHtml(c.title)}</span>${c.text ? `<span class="card-text">${escapeHtml(c.text)}</span>` : ''}<span class="places">${places(c)}</span><span class="meta">By ${escapeHtml(nameOf(c.author))}${c.edited ? ' · edited' : ''}${c.comments.length ? ` · ${count(c.comments.length, 'comment')}` : ''}</span></a>
<form class="move" method="post" action="${escapeHtml(action)}">${hidden}<input type="hidden" name="do" value="move"><input type="hidden" name="id" value="${escapeHtml(c.id)}"><label>Move to…<select name="box">${options(c)}</select></label><noscript><button type="submit">Move</button></noscript></form>
</li>`;

  const boxHtml = (b: ViewBox) => {
    const keep = b.cards.some((c) => c.id === sheetOpen);
    const isOpen = keep || b.id === NEW_BOX;
    return `<details class="box" data-box="${escapeHtml(b.id)}" data-name="${escapeHtml(b.name)}"${b.noMatch ? ' data-nomatch' : ''}${keep ? ' data-keep' : ''}${isOpen ? ' open' : ''}><summary><span>${escapeHtml(b.name)}</span><span class="n">${b.cards.length}</span></summary>
<ul class="cards">${b.cards.map(cardRow).join('\n')}</ul>
</details>`;
  };

  const commentRow = (c: ViewComment) => `<li><p>${escapeHtml(c.text)}</p><div class="said"><span>${escapeHtml(nameOf(c.author))} · ${escapeHtml(formatStamp(c.at))}</span>${c.author === me ? `<form method="post" action="${escapeHtml(action)}">${hidden}<input type="hidden" name="do" value="uncomment"><input type="hidden" name="id" value="${escapeHtml(c.id)}"><button type="submit" class="quiet-button">Delete</button></form>` : ''}</div></li>`;

  const sheet = (c: ViewCard) => {
    const editing = draft?.form === 'edit' && draft.id === c.id ? draft : undefined;
    const saying = draft?.form === 'comment' && draft.id === c.id ? draft.text : '';
    return `<div class="sheet-wrap${c.match ? ' match' : ''}" id="card-${escapeHtml(c.id)}" data-card="${escapeHtml(c.id)}"${c.id === sheetOpen ? '' : ' hidden'}><article class="sheet" role="dialog" aria-label="${escapeHtml(c.title)}">
${draft?.id === c.id ? errorLine(error) : ''}<h2>${escapeHtml(c.title)}</h2>
${c.text ? `<p class="full">${escapeHtml(c.text)}</p>\n` : ''}<span class="places">${places(c)}</span>
<span class="meta">By ${escapeHtml(nameOf(c.author))}${c.edited ? ' · edited' : ''}</span>
${c.comments.length ? `<ul class="talk">${c.comments.map(commentRow).join('\n')}</ul>\n` : ''}<form class="say" method="post" action="${escapeHtml(action)}">${hidden}<input type="hidden" name="do" value="comment"><input type="hidden" name="id" value="${escapeHtml(c.id)}"><textarea name="text" maxlength="${LIST_LIMITS.comment}" required aria-label="Write a comment" placeholder="Write a comment">${escapeHtml(saying)}</textarea><button type="submit" class="go">Send</button></form>
<details class="edit"${editing ? ' open' : ''}><summary>Edit</summary><form method="post" action="${escapeHtml(action)}">${hidden}<input type="hidden" name="do" value="edit"><input type="hidden" name="id" value="${escapeHtml(c.id)}"><input name="title" maxlength="${LIST_LIMITS.title}" required aria-label="Title" value="${escapeHtml(editing?.title ?? c.title)}"><textarea name="text" maxlength="${LIST_LIMITS.text}" aria-label="Description">${escapeHtml(editing?.text ?? c.text)}</textarea><button type="submit" class="go">Save</button></form></details>
<div class="sheet-foot"><a class="close" href="${escapeHtml(home)}">Close</a><form method="post" action="${escapeHtml(action)}" onsubmit="return confirm('Delete this card and its comments?')">${hidden}<input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="${escapeHtml(c.id)}"><button type="submit" class="quiet-button">Delete card</button></form></div>
</article></div>`;
  };

  const adding = draft?.form === 'add' ? draft : undefined;
  const cards = view.boxes.flatMap((b) => b.cards);
  return shell('Our list', LIST_STYLE, `<div class="top"><a href="${escapeHtml(back)}">Back</a><h1>Our list</h1></div>
${draft?.id ? '' : errorLine(error)}<details class="adder"${adding ? ' open' : ''}><summary>+ Add</summary><form method="post" action="${escapeHtml(action)}">${hidden}<input type="hidden" name="do" value="add"><input name="title" maxlength="${LIST_LIMITS.title}" required aria-label="Title" placeholder="Title" value="${escapeHtml(adding?.title ?? '')}"><textarea name="text" maxlength="${LIST_LIMITS.text}" aria-label="Description" placeholder="A short description">${escapeHtml(adding?.text ?? '')}</textarea><button type="submit" class="go">Add</button></form></details>
<div class="board" data-action="${escapeHtml(action)}" data-csrf="${escapeHtml(csrf)}"${view.fresh ? ' data-unseen' : ''}>
${view.boxes.map(boxHtml).join('\n')}
</div>
${cards.map(sheet).join('\n')}
<p class="notice" role="status" hidden></p>
${LIST_SCRIPT}`, READER_FONTS);
}

export function listErrorPage(back: string): string {
  return shell('Our list', LIST_STYLE, `<div class="top"><a href="${escapeHtml(back)}">Back</a><h1>Our list</h1></div>
<p class="error">Something went wrong loading this page.</p>`, READER_FONTS);
}

export function listSettingsPage({ base, csrf, settings, flash, error }: {
  base: string; csrf: string; settings: ListSettings; flash?: string; error?: string;
}): string {
  const rows = settings.boxes.map((b) => `<label class="file">Box<input name="box_${escapeHtml(b.id)}" maxlength="${LIST_LIMITS.name}" value="${escapeHtml(b.name)}"></label>`).join('\n  ');
  return adminShell(`
<p><a href="${escapeHtml(`${base}/admin/after-dark/list`)}">← Our list</a></p>
<h1>List settings</h1>
${flash ? `<p class="flash">${escapeHtml(flash)}</p>` : ''}
${errorLine(error)}
<form class="write" method="post" action="${escapeHtml(`${base}/admin/after-dark/list/settings`)}">
  <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
  <label class="file">Her name, as you see it<input name="reader_name" maxlength="${LIST_LIMITS.name}" required value="${escapeHtml(settings.readerName)}"></label>
  <label class="file">Your name, as she sees it<input name="admin_name" maxlength="${LIST_LIMITS.name}" required value="${escapeHtml(settings.adminName)}"></label>
  ${rows}
  <label class="file">Add a box<input name="new_box" maxlength="${LIST_LIMITS.name}"></label>
  <p class="hint">Empty a box's name to remove it; its cards go back to New.</p>
  <button type="submit">Save</button>
</form>`);
}
