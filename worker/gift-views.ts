import { escapeHtml, shell, READER_FONTS, adminShell, errorLine, formatStamp } from './views';
import type { ReaderGift, Gift, GiftState } from './gift';
import type { EventPhoto } from './event';

const GIFT_FONTS = `${READER_FONTS}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap">`;

const GIFT_STYLE = `
:root { --gold: #f2c879; --cream: #f3eadb; --paper: #fbf5ea; --ink: #3a2e28; --muted: #8c7b6c; --rose: #b0645a; --box: #a24646; --lid: #8e3b3b; }
* { box-sizing: border-box; }
button, a { -webkit-tap-highlight-color: transparent; }
.day:focus { outline: none; }
.day:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
body { margin: 0; min-height: 100vh; background: linear-gradient(#16222f 0, #24384b 40rem, #2c4155 100%); background-color: #16222f; color: var(--cream); font-family: 'Cormorant Garamond', Georgia, serif; overflow-x: hidden; }
body::before { content: ''; position: fixed; inset: 0; pointer-events: none; background-image: radial-gradient(1px 1px at 20% 12%, #fff9, transparent), radial-gradient(1px 1px at 70% 6%, #fffa, transparent), radial-gradient(1.5px 1.5px at 86% 26%, #fffb, transparent), radial-gradient(1px 1px at 38% 22%, #fff8, transparent), radial-gradient(1px 1px at 9% 38%, #fff7, transparent), radial-gradient(1px 1px at 58% 44%, #fff6, transparent); }
.back { display: inline-block; margin: 1rem 1rem 0; color: #d8cdbd; font-size: 1.05rem; text-decoration: none; position: relative; }
.gift { position: relative; max-width: 26rem; margin: 0 auto; padding: 0 1.25rem 3rem; }
.screen { min-height: 78vh; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 2.2rem 0 1.5rem; }
.js .screen { display: none; }
.js .screen.on { display: flex; animation: rise 0.45s ease-out; }
@keyframes rise { from { opacity: 0; transform: translateY(0.8rem); } to { opacity: 1; transform: none; } }
.kicker { font-size: 0.8rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); opacity: 0.9; margin: 0; }
h1, h2 { font-weight: 400; font-size: 2.1rem; line-height: 1.1; margin: 0.6rem 0 0.5rem; }
p { font-size: 1.2rem; line-height: 1.4; margin: 0.4rem 0; }
.hand { font-family: 'Caveat', cursive; font-size: 1.6rem; color: var(--gold); }
.btn { margin-top: auto; display: inline-block; min-width: 12rem; background: var(--gold); color: #2a1f14; border: 0; border-radius: 999px; padding: 0.8rem 1.6rem; font: 600 1.2rem 'Cormorant Garamond', Georgia, serif; text-decoration: none; cursor: pointer; }
.btn.ghost { background: transparent; color: var(--gold); border: 1px solid rgba(242, 200, 121, 0.55); }
.btn[disabled] { opacity: 0.5; }
.again { margin-top: 0.9rem; background: none; border: 0; color: #cdbfa9; font: italic 1.05rem 'Cormorant Garamond', Georgia, serif; text-decoration: underline; cursor: pointer; }
form { margin: 0; }
.screen > form { margin-top: auto; }
.box { position: relative; width: 10rem; height: 8rem; margin: 3.2rem auto 1.6rem; }
.box .body { position: absolute; top: 2rem; left: 0; right: 0; bottom: 0; background: var(--box); border-radius: 0 0 0.4rem 0.4rem; box-shadow: 0 0.6rem 1.4rem rgba(0, 0, 0, 0.45); }
.box .rv { position: absolute; left: 50%; top: 2rem; bottom: 0; width: 1rem; margin-left: -0.5rem; background: var(--gold); }
.box .lid { position: absolute; top: 0; left: -0.5rem; right: -0.5rem; height: 2.2rem; background: var(--lid); border-radius: 0.3rem; transition: transform 0.8s ease-in, opacity 0.8s ease-in; transform-origin: 10% 100%; }
.box .lid::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1rem; margin-left: -0.5rem; background: var(--gold); }
.box .lid::after { content: ''; position: absolute; left: 0; right: 0; top: 0.7rem; height: 0.85rem; background: var(--gold); }
.bow { position: absolute; top: -1.7rem; left: 50%; width: 4.4rem; height: 2rem; margin-left: -2.2rem; }
.bow::before, .bow::after { content: ''; position: absolute; top: 0; width: 2rem; height: 1.6rem; border: 0.4rem solid var(--gold); border-radius: 50%; }
.bow::before { left: 0; transform: rotate(-20deg); }
.bow::after { right: 0; transform: rotate(20deg); }
.tag { position: absolute; right: -4.6rem; top: 3rem; background: var(--paper); color: var(--ink); font-family: 'Caveat', cursive; font-size: 1.3rem; padding: 0.2rem 0.7rem; transform: rotate(8deg); border-radius: 0.2rem; box-shadow: 0 0.15rem 0.4rem rgba(0, 0, 0, 0.35); }
.box.open .lid { transform: translate(-1.5rem, -3rem) rotate(-28deg); opacity: 0; }
.photos { position: relative; margin: 1rem 0 0.6rem; }
.photos img { display: block; width: 15rem; max-width: 80vw; aspect-ratio: 3 / 2; object-fit: cover; border: 0.4rem solid #fff; transform: rotate(-2deg); box-shadow: 0 0.5rem 1.2rem rgba(0, 0, 0, 0.5); }
.photos img + img { width: 10rem; margin: -2rem 0 0 6rem; transform: rotate(4deg); }
.days { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; width: 100%; margin-top: 1rem; }
.day { width: 100%; border: 1px solid rgba(242, 200, 121, 0.4); border-radius: 0.8rem; padding: 0.8rem 0.4rem; background: rgba(255, 255, 255, 0.04); color: var(--cream); font: inherit; cursor: pointer; }
.day b { display: block; font-size: 2.1rem; font-weight: 400; }
.day span { font-size: 0.95rem; color: #cdbfa9; letter-spacing: 0.06em; }
.day.on { background: var(--gold); border-color: var(--gold); }
.day.on b, .day.on span { color: #2a1f14; }
.day[disabled] { opacity: 0.35; cursor: default; }
.confirm { margin-top: 1.4rem; }
.opened { position: relative; width: 7rem; height: 4.5rem; margin: 1.2rem auto 0.4rem; }
.opened .body { position: absolute; top: 1rem; left: 0; right: 0; bottom: 0; background: var(--box); border-radius: 0 0 0.4rem 0.4rem; }
.opened .lid { position: absolute; top: -0.4rem; left: -1.8rem; width: 5rem; height: 1.3rem; background: var(--lid); transform: rotate(-24deg); border-radius: 0.3rem; }
.card { width: 100%; margin-top: 1rem; padding: 1rem 1.1rem; background: var(--paper); color: var(--ink); border-radius: 0.6rem; box-shadow: 0 0.5rem 1.2rem rgba(0, 0, 0, 0.4); text-align: left; }
.card h3 { font-weight: 400; font-size: 1.6rem; margin: 0 0 0.3rem; }
.card p { font-size: 1.1rem; margin: 0.2rem 0; }
.card .muted { color: var(--muted); }
.stamp { display: inline-block; margin-top: 0.6rem; border: 2px solid var(--rose); color: var(--rose); font: 600 0.85rem system-ui, sans-serif; letter-spacing: 0.18em; padding: 0.2rem 0.6rem; transform: rotate(-6deg); border-radius: 0.25rem; }
.credits { max-width: 26rem; margin: 0 auto 2rem; padding: 0 1.25rem; color: #b9ad9c; font-size: 0.95rem; position: relative; }
.credits p { font-size: 0.95rem; }
.toast { position: fixed; left: 50%; bottom: 1.5rem; transform: translateX(-50%); background: #2b1f17; color: var(--cream); padding: 0.6rem 1rem; border-radius: 0.6rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.toast.on { opacity: 1; }
.quiet { text-align: center; margin: 4rem 1rem; }
@media (prefers-reduced-motion: reduce) {
  .js .screen.on { animation: none; }
  .box .lid { transition: none; }
}
`;

export const GIFT_SCRIPT = `<script>
(function () {
  var root = document.querySelector('.gift');
  if (!root) return;
  var save = root.getAttribute('data-save');
  var csrf = root.getAttribute('data-csrf');
  var home = root.getAttribute('data-home');
  var start = root.getAttribute('data-start');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var screens = root.querySelectorAll('.screen');
  var toast = document.querySelector('.toast');
  var chosenDay = null;
  root.className += ' js';

  function say(text) {
    toast.textContent = text;
    toast.className = 'toast on';
    clearTimeout(say.timer);
    say.timer = setTimeout(function () { toast.className = 'toast'; }, 2600);
  }
  function find(name) {
    for (var i = 0; i < screens.length; i++) if (screens[i].getAttribute('data-screen') === name) return screens[i];
    return null;
  }
  function show(el) {
    if (!el) return;
    for (var i = 0; i < screens.length; i++) screens[i].className = screens[i] === el ? 'screen on' : 'screen';
    window.scrollTo(0, 0);
  }
  function after(el) {
    var next = el.nextElementSibling;
    while (next && !/screen/.test(next.className)) next = next.nextElementSibling;
    // Once she has her day, going through it again skips past the picker to her day.
    if (next && next.getAttribute('data-screen') === 'pick' && (start === 'chosen' || start === 'booked')) return find(start);
    return next;
  }
  function post(fields, done) {
    if (!save) { done(true); return; }
    var body = ['csrf=' + encodeURIComponent(csrf), 'quiet=1'];
    for (var k in fields) if (fields.hasOwnProperty(k)) body.push(encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]));
    var xhr = new XMLHttpRequest();
    var finished = false;
    // A refusal from the server (not a lost connection) means things moved on: her day turned, or he booked.
    function end(ok, refused) { if (!finished) { finished = true; done(ok, refused); } }
    xhr.open('POST', save);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.timeout = 15000;
    xhr.onload = function () { end(xhr.status === 204, xhr.status === 404); };
    xhr.onerror = function () { end(false); };
    xhr.ontimeout = function () { end(false); };
    xhr.send(body.join('&'));
  }

  var unwrap = root.querySelector('[data-unwrap]');
  if (unwrap) {
    var form = unwrap.form;
    var go = function (e) {
      if (e) e.preventDefault();
      var box = root.querySelector('.box');
      if (box) box.className = 'box open';
      // Unwrapping is not lost if this fails: picking a day records it too.
      if (start === 'box') post({ 'do': 'unwrap' }, function () {});
      setTimeout(function () { show(after(find('box'))); }, still ? 0 : 900);
    };
    if (form) form.addEventListener('submit', go); else unwrap.addEventListener('click', go);
  }

  var nexts = root.querySelectorAll('[data-next]');
  for (var n = 0; n < nexts.length; n++) {
    nexts[n].addEventListener('click', function (e) {
      e.preventDefault();
      var el = this;
      while (el && !/screen/.test(el.className)) el = el.parentNode;
      show(after(el));
    });
  }
  var gos = root.querySelectorAll('[data-go]');
  for (var g = 0; g < gos.length; g++) {
    gos[g].addEventListener('click', function (e) {
      e.preventDefault();
      var to = this.getAttribute('data-go');
      if (to === 'box') { var box = root.querySelector('.box'); if (box) box.className = 'box'; }
      show(find(to));
    });
  }

  var confirm = root.querySelector('.confirm');
  var tiles = root.querySelectorAll('.day[data-day]');
  function select(tile) {
    for (var t = 0; t < tiles.length; t++) tiles[t].className = tiles[t] === tile ? 'day on' : 'day';
    chosenDay = tile.getAttribute('data-day');
    confirm.textContent = tile.getAttribute('data-name') + ' it is';
    confirm.disabled = false;
  }
  for (var t = 0; t < tiles.length; t++) {
    var tileForm = tiles[t].form;
    var pickTile = function (tile) { return function (e) { e.preventDefault(); select(tile); }; }(tiles[t]);
    if (tileForm) tileForm.addEventListener('submit', pickTile); else tiles[t].addEventListener('click', pickTile);
    if (/\\bon\\b/.test(tiles[t].className)) select(tiles[t]);
  }
  if (confirm) {
    confirm.hidden = false;
    confirm.addEventListener('click', function () {
      if (!chosenDay) return;
      confirm.disabled = true;
      post({ 'do': 'pick', day: chosenDay }, function (ok, refused) {
        if ((ok || refused) && save) { window.location.replace(home); return; }
        confirm.disabled = false;
        if (!ok) say("That didn't save. Try again?");
      });
    });
  }

  show(find(start) || screens[0]);
})();
</script>`;

const BOX = (tag: string) => `<div class="box"><div class="bow"></div><div class="body"></div><div class="rv"></div><div class="lid"></div><div class="tag">${escapeHtml(tag)}</div></div>`;
const OPENED = '<div class="opened"><div class="lid"></div><div class="body"></div></div>';

interface Saving { action: string; csrf: string }

function hidden(form: Saving, what: string): string {
  return `<input type="hidden" name="csrf" value="${escapeHtml(form.csrf)}">\n<input type="hidden" name="do" value="${what}">`;
}

function pickScreen(view: ReaderGift, form?: Saving): string {
  const tiles = view.days.map((d) => {
    const face = `<b>${escapeHtml(d.num)}</b><span>${escapeHtml(d.weekday)} · ${escapeHtml(d.month)}</span>`;
    const on = view.chosen?.id === d.id ? ' on' : '';
    if (!d.open) return `<button class="day" type="button" disabled>${face}</button>`;
    const attrs = `class="day${on}" data-day="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}"`;
    if (!form) return `<button ${attrs} type="button">${face}</button>`;
    return `<form method="post" action="${escapeHtml(form.action)}">${hidden(form, 'pick')}
<button ${attrs} type="submit" name="day" value="${escapeHtml(d.id)}">${face}</button></form>`;
  }).join('\n');
  return `<section class="screen" data-screen="pick" id="pick">
<p class="kicker">${escapeHtml(view.pick.kicker)}</p>
<h2>${escapeHtml(view.pick.heading)}</h2>
<div class="days">
${tiles}
</div>
<p>${escapeHtml(view.pick.text)}</p>
<button class="btn confirm" type="button" disabled hidden>Pick a day</button>
</section>`;
}

const again = '<button class="again" type="button" data-go="box">See it again</button>';

export function giftPage({ view, home, mediaBase, saveAction, csrf, back, preview = false }: {
  view: ReaderGift; home: string; mediaBase: string; saveAction?: string; csrf?: string; back?: string; preview?: boolean;
}): string {
  const form: Saving | undefined = !preview && saveAction && csrf ? { action: saveAction, csrf } : undefined;
  const untie = form
    ? `<form method="post" action="${escapeHtml(form.action)}">${hidden(form, 'unwrap')}
<button class="btn" type="submit" data-unwrap>Untie the ribbon</button></form>`
    : '<button class="btn" type="button" data-unwrap>Untie the ribbon</button>';
  const screens = [`<section class="screen" data-screen="box">
<p class="kicker">${escapeHtml(view.box.kicker)}</p>
<h1>${escapeHtml(view.box.heading)}</h1>
${BOX(view.box.tag)}
${untie}
</section>`];
  for (const r of view.reveals) {
    const pics = r.photoKeys.length
      ? `<div class="photos">${r.photoKeys.map((k) => `<img src="${escapeHtml(`${mediaBase}/${k}`)}" alt="">`).join('')}</div>`
      : '';
    screens.push(`<section class="screen" data-screen="reveal">
<p class="kicker">${escapeHtml(r.kicker)}</p>
<h2>${escapeHtml(r.heading)}</h2>
${pics}
<p>${escapeHtml(r.text)}</p>
<a class="btn ghost" href="#pick" data-next>${escapeHtml(r.next)}</a>
</section>`);
  }
  if (view.stage !== 'booked') screens.push(pickScreen(view, form));
  if (view.stage === 'chosen' && view.chosen) {
    screens.push(`<section class="screen" data-screen="chosen">
${OPENED}
<p class="kicker">Ours</p>
<h2>${escapeHtml(view.chosen.heading)}</h2>
<p class="hand">${escapeHtml(view.chosenLine)}</p>
<div class="card">${view.summary.map((s) => `<p>${escapeHtml(s)}</p>`).join('')}<p class="muted">${escapeHtml(view.pendingLine)}</p></div>
<a class="btn ghost" href="#pick" data-go="pick" style="margin-top:1.4rem">Change the day</a>
${again}
</section>`);
  }
  if (view.stage === 'booked' && view.chosen && view.booking) {
    screens.push(`<section class="screen" data-screen="booked">
${OPENED}
<p class="kicker">Ours</p>
<h2>${escapeHtml(view.chosen.heading)}</h2>
<div class="card"><h3>It's booked</h3>${view.booking.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<span class="stamp">BOOKED</span></div>
<p class="hand" style="margin-top:1rem">${escapeHtml(view.bookedLine)}</p>
${again}
</section>`);
  }
  const saving = form ? ` data-save="${escapeHtml(form.action)}" data-csrf="${escapeHtml(form.csrf)}"` : '';
  const credits = view.credits.length
    ? `<details class="credits"><summary>Photo credits</summary>${view.credits.map((c) => `<p>${escapeHtml(c)}</p>`).join('')}</details>`
    : '';
  return shell(view.title, GIFT_STYLE, `${back ? `<a class="back" href="${escapeHtml(back)}">Back to your notes</a>\n` : ''}<main class="gift" data-start="${view.stage}" data-home="${escapeHtml(home)}"${saving}>
${screens.join('\n')}
</main>
${credits}
<div class="toast" role="status"></div>
${GIFT_SCRIPT}`, GIFT_FONTS);
}

export function giftErrorPage(): string {
  return shell('Your gift', GIFT_STYLE, '<p class="quiet">Something went wrong loading this page.</p>', GIFT_FONTS);
}

export function giftAdminPage(d: {
  base: string; csrf: string; text: string; photos: EventPhoto[]; gift: Gift | null; state: GiftState | null;
  today: string; flash?: string; error?: string;
}): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const at = (path: string) => escapeHtml(`${d.base}/admin/gift${path}`);
  const heading = (day: string) => d.gift?.days.find((x) => x.id === day)?.heading ?? `${day} (no longer in the gift)`;
  let status = '<p>No gift yet. Paste one below and save.</p>';
  if (d.gift && !d.state) status = '<p class="error">Her side of the gift could not be read.</p>';
  else if (d.gift && d.state) {
    const s = d.state;
    const rows: string[] = [];
    rows.push(s.unwrapped ? `<li>Unwrapped ${escapeHtml(formatStamp(s.unwrapped))}</li>` : '<li>Not opened yet</li>');
    if (s.pick) rows.push(`<li><strong>Picked ${escapeHtml(heading(s.pick.day))}</strong> <span class="hint">${escapeHtml(formatStamp(s.pick.at))}</span></li>`);
    const earlier = s.history.slice(0, -1);
    if (earlier.length) rows.push(`<li>Earlier: ${earlier.map((p) => `${escapeHtml(heading(p.day))} <span class="hint">${escapeHtml(formatStamp(p.at))}</span>`).join(', ')}</li>`);
    status = `<ul>${rows.join('\n')}</ul>`;
    const bookForm = (lines: string, label: string) => `<form class="write" method="post" action="${at('/book')}">${csrf}
<input type="hidden" name="day" value="${escapeHtml(s.pick!.day)}">
<label>Booking, one line each (up to 4), shown to her<textarea name="lines" rows="4">${escapeHtml(lines)}</textarea></label>
<button type="submit">${label}</button></form>`;
    if (s.pick && s.booked && s.booked.day === s.pick.day) {
      status += `<h2>Booked</h2>
<ul>${s.booked.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
<p class="hint">Marked booked ${escapeHtml(formatStamp(s.booked.at))}${s.bookedSeen && s.bookedSeen >= s.booked.at ? ', and she has seen it' : ', she has not seen it yet'}.</p>
${bookForm(s.booked.lines.join('\n'), 'Save the lines')}
<form method="post" action="${at('/unbook')}" onsubmit="return confirm('Undo booked? She can pick a day again.')">${csrf}<button type="submit">Undo booked</button></form>`;
    } else if (s.pick && d.gift.days.some((x) => x.id === s.pick!.day)) {
      const moved = s.booked
        ? `<p class="error">You marked ${escapeHtml(heading(s.booked.day))} booked, but she has since picked ${escapeHtml(heading(s.pick.day))}. Her page shows her pick, not booked. Book her day below, or undo.</p>
<form method="post" action="${at('/unbook')}" onsubmit="return confirm('Undo booked?')">${csrf}<button type="submit">Undo booked</button></form>`
        : '';
      status += `<h2>Mark as booked</h2>\n${moved}${bookForm('', 'Mark as booked')}`;
    }
  }
  const inUse = d.gift ? new Set(d.gift.reveals.flatMap((r) => r.photos)) : new Set<string>();
  const photoRows = d.photos.map((p) => `<li><span>${escapeHtml(p.name)}</span>${inUse.has(p.name)
    ? ' <span class="tag">In use</span>'
    : ` <form method="post" action="${at('/photos/delete')}">${csrf}<input type="hidden" name="key" value="${escapeHtml(p.key)}"><button type="submit">Remove</button></form>`}</li>`).join('\n');
  return adminShell(`
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>Gift</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<form method="get" action="${at('/preview')}"><label>Preview as of <input type="date" name="on" value="${escapeHtml(d.today)}"></label> <button type="submit">Preview</button></form>
<h2>Her side</h2>
${status}
<form method="post" action="${at('/clear')}" onsubmit="return confirm('Clear everything she has done with this gift?')">${csrf}<button type="submit">Clear her pick</button></form>
<h2>The gift</h2>
<form class="write" method="post" action="${at('/save')}">
  ${csrf}
  <textarea name="gift" rows="24" spellcheck="false" placeholder="The gift as JSON">${escapeHtml(d.text)}</textarea>
  <button type="submit">Save</button>
</form>
<h2>Photos</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${at('/photos')}">
  ${csrf}
  <label class="file">Add photos<input type="file" name="photos" accept="image/*" multiple required></label>
  <p class="hint">Use a photo in a reveal by its name, like "photos": ["name.jpg"].</p>
  <button type="submit">Upload</button>
</form>
<ul>${photoRows || '<li>No photos yet.</li>'}</ul>`);
}
