import { escapeHtml, shell, READER_FONTS, adminShell, errorLine, formatStamp } from './views';
import type { ReaderEvent, ReaderDoor, ReaderDish, EventDish, EventPhoto, EventPicks, SpecialEvent } from './event';

const EVENT_STYLE = `
:root { --paper: #fbf5ea; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; --timber: #4a3324; --plaster: #f4e8d3; --gold: #f2c879; --cream: #f3eadb; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: linear-gradient(#16222f 0%, #24384b 40rem, #34495c 100%) fixed; background-color: #16222f; color: var(--cream); font-family: 'Cormorant Garamond', Georgia, serif; overflow-x: hidden; }
main { max-width: 30rem; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; position: relative; z-index: 1; }
.back { color: #c9b9a3; font-style: italic; font-size: 1.05rem; }
.intro { text-align: center; margin: 1.5rem 0 0; }
.intro h1 { margin: 0 0 0.7rem; font-weight: 400; font-style: italic; font-size: 2.1rem; line-height: 1.15; color: var(--gold); }
.intro p { margin: 0 0 0.6rem; font-size: 1.2rem; line-height: 1.35; }
.flakes { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.flake { position: absolute; top: -10px; width: 4px; height: 4px; border-radius: 50%; background: #fff; opacity: 0.7; animation: fall linear infinite; }
@keyframes fall { to { transform: translateY(110vh); } }
.house { margin: 1.6rem 0 0; }
.roof { position: relative; height: 4.2rem; margin: 0 -0.7rem; background: linear-gradient(#7c3d30, #5c2c23); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.snowcap { position: absolute; left: 0; right: 0; top: 0; height: 1.9rem; background: #fff; clip-path: polygon(50% 0, 68% 56%, 60% 48%, 54% 66%, 46% 50%, 38% 62%, 32% 56%); }
.front { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; padding: 0.6rem; border: 6px solid var(--timber); background: var(--plaster); }
.ground { height: 1.1rem; margin: 0 -1.25rem; background: #fff; border-radius: 0 0 40% 40%; }
.door { position: relative; display: block; height: 8.5rem; perspective: 700px; overflow: hidden; border-radius: 46px 46px 2px 2px; background: #fff3cf; box-shadow: inset 0 0 22px rgba(232, 164, 60, 0.75); color: #5a3f22; text-decoration: none; -webkit-tap-highlight-color: transparent; }
.behind { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.6rem 0.5rem 0.4rem; text-align: center; font-size: 1rem; line-height: 1.1; }
.behind img { width: 100%; height: 4.9rem; object-fit: cover; border-radius: 34px 34px 3px 3px; margin-bottom: 0.3rem; }
.leaf { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 46px 46px 2px 2px; background: linear-gradient(160deg, #38563f, #243b2b); color: #f6e7c6; box-shadow: inset 0 0 0 3px rgba(242, 200, 121, 0.55); transform-origin: left center; transition: transform 0.9s cubic-bezier(.3, .7, .3, 1); backface-visibility: hidden; }
.leaf .n { font-size: 2.6rem; line-height: 1; color: var(--gold); }
.leaf .d { margin-top: 0.2rem; font-size: 1rem; font-style: italic; }
.leaf .w { position: absolute; bottom: 0.45rem; font-size: 0.8rem; opacity: 0.85; }
.door.open .leaf { transform: rotateY(-108deg); }
.door.ready .leaf { animation: glow 2.6s ease-in-out infinite; }
@keyframes glow { 50% { box-shadow: inset 0 0 0 3px var(--gold), 0 0 16px rgba(242, 200, 121, 0.85); } }
.door.locked { background: #6e6355; box-shadow: none; }
.door.locked .leaf { background: linear-gradient(160deg, #6b6a60, #4d4d46); box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.1); color: #d8d3c7; }
.door.locked .leaf .n { color: #d8d3c7; }
.door.wiggle { animation: wiggle 0.4s; }
@keyframes wiggle { 25% { transform: rotate(-1.5deg); } 75% { transform: rotate(1.5deg); } }
.door:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.card-tag { display: block; margin: 1rem 0 0; padding: 0.75rem 1rem; border: 1px solid var(--accent); border-radius: 0.9rem; background: var(--paper); color: var(--ink); text-decoration: none; }
.card-tag strong { display: block; font-weight: 500; font-style: italic; font-size: 1.3rem; color: var(--accent); }
.card-tag span { font-size: 1.05rem; color: var(--muted); }
.card-tag.locked { opacity: 0.8; }
.closing { margin: 1.1rem 0 0; text-align: center; font-style: italic; color: #c9b9a3; font-size: 1.08rem; }
.credits { margin: 2rem 0 0; color: #9c8f80; font-size: 0.9rem; }
.credits summary { cursor: pointer; text-align: center; font-style: italic; }
.credits p { margin: 0.4rem 0 0; overflow-wrap: anywhere; }
.wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0.5rem; background: rgba(12, 16, 22, 0.55); }
.wrap[hidden] { display: none; }
.sheet { width: 100%; max-width: 32rem; max-height: 90vh; overflow-y: auto; padding: 1.3rem 1.15rem calc(1.3rem + env(safe-area-inset-bottom, 0px)); border-radius: 1.2rem 1.2rem 0 0; background: var(--paper); color: var(--ink); animation: up 0.35s ease-out both; }
@keyframes up { from { transform: translateY(100%); } to { transform: none; } }
.sheet h2 { margin: 0; font-weight: 500; font-size: 1.7rem; line-height: 1.15; }
.when { margin: 0.15rem 0 0.9rem; font-style: italic; color: var(--muted); font-size: 1.1rem; }
.sheet form { margin: 0; }
.dish { position: relative; display: block; width: 100%; margin: 0 0 0.85rem; padding: 0; overflow: hidden; border: 2px solid var(--line); border-radius: 0.9rem; background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.dish img { display: block; width: 100%; height: 11rem; object-fit: cover; }
.dish .t { display: block; padding: 0.65rem 0.85rem 0.8rem; }
.dish .h { display: block; font-weight: 600; font-size: 1.35rem; line-height: 1.15; margin-bottom: 0.15rem; }
.dish .p { display: block; font-size: 1.1rem; line-height: 1.25; color: #5d4f45; }
.dish.picked { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.mark { display: none; position: absolute; top: 0.6rem; right: 0.6rem; padding: 0.15rem 0.7rem; border-radius: 999px; background: var(--accent); color: #fff; font-size: 1rem; }
.dish.picked .mark { display: block; }
.minis { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.minis .dish { margin: 0; }
.minis .dish img { height: 7rem; }
.minis .h { font-size: 1.14rem; }
.minis .p { font-size: 1rem; }
.big-line { margin: 1.4rem 0 1.6rem; text-align: center; font-size: 1.7rem; font-style: italic; line-height: 1.25; color: var(--accent); }
.close { display: block; margin: 0.9rem auto 0; text-align: center; font-style: italic; font-size: 1.15rem; color: var(--muted); }
.toast { position: fixed; left: 1rem; right: 1rem; bottom: 1.2rem; z-index: 9; max-width: 28rem; margin: 0 auto; padding: 0.6rem 1rem; border-radius: 0.7rem; background: rgba(30, 24, 20, 0.92); color: #f6e7c6; text-align: center; font-size: 1.1rem; opacity: 0; transition: opacity 0.25s; pointer-events: none; }
.toast.on { opacity: 1; }
.quiet { text-align: center; font-style: italic; font-size: 1.25rem; color: #c9b9a3; }
@media (prefers-reduced-motion: reduce) {
  .flakes { display: none; }
  .leaf, .sheet { transition: none; animation: none; }
  .door.ready .leaf, .door.wiggle { animation: none; }
}
`;

// Opens doors in place, saves picks one at a time in the order she tapped them, and puts a pick back
// when a save fails. Without it every door and dish still works as a link or a form.
export const EVENT_SCRIPT = `<script>
(function () {
  var house = document.querySelector('[data-save]');
  var save = house && house.getAttribute('data-save');
  var csrf = house && house.getAttribute('data-csrf');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toast = document.querySelector('.toast');
  var shown = null;
  var queue = [];
  var busy = false;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.className = 'toast on';
    clearTimeout(say.timer);
    say.timer = setTimeout(function () { toast.className = 'toast'; }, 2400);
  }
  function next() {
    if (busy || !queue.length || !save) return;
    busy = true;
    var job = queue.shift();
    var body = ['csrf=' + encodeURIComponent(csrf), 'quiet=1'];
    for (var name in job.fields) if (job.fields.hasOwnProperty(name)) body.push(encodeURIComponent(name) + '=' + encodeURIComponent(job.fields[name]));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', save);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    function done(ok) {
      busy = false;
      if (!ok && job.undo) {
        queue = [];
        job.undo();
        say("That didn't save. Try again?");
      }
      next();
    }
    xhr.onload = function () { done(xhr.status === 204); };
    xhr.onerror = function () { done(false); };
    xhr.send(body.join('&'));
  }
  function send(fields, undo) { queue.push({ fields: fields, undo: undo }); next(); }

  function show(id) {
    hide();
    shown = document.getElementById('sheet-' + id);
    if (!shown) return;
    shown.hidden = false;
    var sheet = shown.querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  function hide() {
    if (shown) shown.hidden = true;
    shown = null;
  }
  var wraps = document.querySelectorAll('.wrap');
  for (var w = 0; w < wraps.length; w++) if (!wraps[w].hidden) shown = wraps[w];

  function snapshot(form, door) {
    var doorway = door && door.querySelector('.behind');
    var tag = document.querySelector('.card-tag span');
    var state = { buttons: form.innerHTML, picked: form.getAttribute('data-picked'), doorway: doorway && doorway.innerHTML, tag: tag && tag.textContent };
    return function () {
      form.innerHTML = state.buttons;
      if (state.picked !== null) form.setAttribute('data-picked', state.picked);
      if (doorway) doorway.innerHTML = state.doorway;
      if (tag) tag.textContent = state.tag;
    };
  }
  function title(button) { var h = button.querySelector('.h'); return h ? h.textContent : ''; }
  function sayList(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function pick(button) {
    var form = button.form;
    var kind = form.querySelector('input[name=do]').value;
    var dish = button.value;
    var buttons = form.querySelectorAll('.dish');
    if (kind === 'pick') {
      var doorId = form.querySelector('input[name=door]').value;
      var door = document.querySelector('.door[data-door="' + doorId + '"]');
      var undo = snapshot(form, door);
      for (var i = 0; i < buttons.length; i++) buttons[i].className = 'dish' + (buttons[i] === button ? ' picked' : '');
      var behind = door && door.querySelector('.behind');
      if (behind) {
        var img = button.querySelector('img');
        behind.innerHTML = (img ? '<img src="' + img.getAttribute('src') + '" alt="">' : '') + '<span></span>';
        behind.querySelector('span').textContent = title(button);
      }
      send({ do: 'pick', door: doorId, dish: dish }, undo);
      return;
    }
    var undoCard = snapshot(form, null);
    var limit = parseInt(form.getAttribute('data-limit'), 10) || 1;
    var picked = (form.getAttribute('data-picked') || '').split(' ').filter(function (x) { return x; });
    var at = picked.indexOf(dish);
    if (at >= 0) picked.splice(at, 1);
    else { picked.push(dish); if (picked.length > limit) picked.shift(); }
    form.setAttribute('data-picked', picked.join(' '));
    var names = [];
    for (var j = 0; j < buttons.length; j++) {
      var on = picked.indexOf(buttons[j].value) >= 0;
      buttons[j].className = 'dish' + (on ? ' picked' : '');
    }
    for (var k = 0; k < picked.length; k++) {
      var b = form.querySelector('.dish[value="' + picked[k] + '"]');
      if (b) names.push(title(b));
    }
    var tag = document.querySelector('.card-tag span');
    if (tag) tag.textContent = names.length ? 'You picked: ' + sayList(names) : tag.getAttribute('data-prompt');
    send({ do: 'card', dish: dish }, undoCard);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    var dish = target.closest ? target.closest('.dish') : null;
    if (dish && dish.form && save) { event.preventDefault(); pick(dish); return; }
    var door = target.closest ? target.closest('.door') : null;
    if (door) {
      event.preventDefault();
      var id = door.getAttribute('data-door');
      if (/\\blocked\\b/.test(door.className)) {
        door.className = 'door locked';
        void door.offsetWidth;
        door.className = 'door locked wiggle';
        say('This door opens ' + door.getAttribute('data-opens') + '.');
        return;
      }
      if (/\\bready\\b/.test(door.className)) {
        door.className = 'door open';
        if (save) send({ do: 'open', door: id }, null);
        setTimeout(function () { show(id); }, still ? 0 : 750);
        return;
      }
      show(id);
      return;
    }
    var tag = target.closest ? target.closest('a.card-tag') : null;
    if (tag) { event.preventDefault(); show('card'); return; }
    var close = target.closest ? target.closest('.close') : null;
    if (close) { event.preventDefault(); hide(); return; }
    if (shown && target === shown) hide();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });

  if (!still) {
    var layer = document.createElement('div');
    layer.className = 'flakes';
    for (var f = 0; f < 22; f++) {
      var flake = document.createElement('div');
      flake.className = 'flake';
      flake.style.left = Math.random() * 100 + '%';
      flake.style.animationDuration = 6 + Math.random() * 8 + 's';
      flake.style.animationDelay = -Math.random() * 12 + 's';
      layer.appendChild(flake);
    }
    document.body.appendChild(layer);
  }
})();
</script>`;

function link(home: string, open: string): string {
  return `${home}${home.includes('?') ? '&' : '?'}open=${encodeURIComponent(open)}`;
}

function photo(mediaBase: string, d: ReaderDish): string {
  return d.photoKey ? `<img src="${escapeHtml(`${mediaBase}/${d.photoKey}`)}" alt="">` : '';
}

function dishButton(d: ReaderDish, picked: boolean, mediaBase: string, live: boolean): string {
  const inner = `${photo(mediaBase, d)}<span class="mark">♥ Yours</span><span class="t"><span class="h">${escapeHtml(d.title)}</span><span class="p">${escapeHtml(d.text)}</span></span>`;
  const cls = `dish${picked ? ' picked' : ''}`;
  return live
    ? `<button class="${cls}" name="dish" value="${escapeHtml(d.id)}" type="submit">${inner}</button>`
    : `<div class="${cls}">${inner}</div>`;
}

function choices(kind: 'pick' | 'card', dishes: ReaderDish[], picked: string[], mediaBase: string, form: Form | undefined, extra: string, attrs = ''): string {
  const buttons = dishes.map((d) => dishButton(d, picked.includes(d.id), mediaBase, Boolean(form))).join('\n');
  if (!form) return `<div class="choices">${buttons}</div>`;
  return `<form class="choices" method="post" action="${escapeHtml(form.action)}"${attrs}>
<input type="hidden" name="csrf" value="${escapeHtml(form.csrf)}">
<input type="hidden" name="do" value="${kind}">${extra}
${buttons}
</form>`;
}

interface Form { action: string; csrf: string }

function doorTag(door: ReaderDoor, n: number, view: ReaderEvent, home: string, mediaBase: string): string {
  const leaf = (extra: string) => `<span class="leaf"><span class="n">${n}</span><span class="d">${escapeHtml(door.label)}</span><span class="w">${extra}</span></span>`;
  if (door.locked) {
    return `<span class="door locked" data-door="${escapeHtml(door.id)}" data-opens="${escapeHtml(door.opensLabel)}">${leaf(`Opens ${escapeHtml(door.opensLabel)}`)}</span>`;
  }
  const chosen = door.dishes.find((d) => d.id === door.picked);
  const behind = chosen
    ? `${photo(mediaBase, chosen)}<span>${escapeHtml(chosen.title)}</span>`
    : `<span>${escapeHtml(door.dishes.length ? 'Pick one' : door.doorway ?? door.label)}</span>`;
  return `<a class="door ${door.opened ? 'open' : 'ready'}" href="${escapeHtml(link(home, door.id))}" data-door="${escapeHtml(door.id)}"><span class="behind">${behind}</span>${leaf('')}</a>`;
}

function wrap(id: string, visible: boolean, label: string, body: string, home: string): string {
  return `<div class="wrap" id="sheet-${escapeHtml(id)}"${visible ? '' : ' hidden'}><article class="sheet" role="dialog" aria-label="${escapeHtml(label)}">
${body}
<a class="close" href="${escapeHtml(home)}">Close</a>
</article></div>`;
}

function names(dishes: ReaderDish[], ids: string[]): string {
  const list = ids.map((id) => dishes.find((d) => d.id === id)?.title ?? '').filter(Boolean);
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function eventPage({ view, home, mediaBase, saveAction, csrf, sheet, back, preview = false }: {
  view: ReaderEvent; home: string; mediaBase: string; saveAction?: string; csrf?: string;
  /** A door id, or 'card': the sheet to show open, for the flow without JavaScript. */
  sheet?: string; back?: string; preview?: boolean;
}): string {
  const form: Form | undefined = !preview && saveAction && csrf ? { action: saveAction, csrf } : undefined;
  const doors = view.doors.map((d, i) => doorTag(d, i + 1, view, home, mediaBase)).join('\n');
  const sheets = view.doors.filter((d): d is Extract<ReaderDoor, { locked: false }> => !d.locked).map((d) => {
    const body = d.dishes.length
      ? choices('pick', d.dishes, d.picked ? [d.picked] : [], mediaBase, form, `\n<input type="hidden" name="door" value="${escapeHtml(d.id)}">`)
      : '';
    const line = d.line ? `<p class="big-line">${escapeHtml(d.line)}</p>` : '';
    const n = view.doors.indexOf(d) + 1;
    return wrap(d.id, sheet === d.id, d.heading, `<h2>Door ${n}</h2>\n<p class="when">${escapeHtml(d.heading)}</p>\n${line}${body}`, home);
  });
  let cardTag = '';
  const c = view.card;
  if (c?.locked) {
    cardTag = `<span class="card-tag locked"><strong>${escapeHtml(c.title)}</strong><span>${c.opensLabel ? `Opens ${escapeHtml(c.opensLabel)}` : escapeHtml(c.prompt)}</span></span>`;
  } else if (c) {
    const summary = c.picked.length ? `You picked: ${names(c.dishes, c.picked)}` : c.prompt;
    cardTag = `<a class="card-tag" href="${escapeHtml(link(home, 'card'))}"><strong>${escapeHtml(c.title)}</strong><span data-prompt="${escapeHtml(c.prompt)}">${escapeHtml(summary)}</span></a>`;
    const attrs = ` data-limit="${c.pick}" data-picked="${escapeHtml(c.picked.join(' '))}"`;
    const body = choices('card', c.dishes, c.picked, mediaBase, form, '', attrs).replace('class="choices"', 'class="choices minis"');
    sheets.push(wrap('card', sheet === 'card', c.title, `<h2>${escapeHtml(c.title)}</h2>\n<p class="when">${escapeHtml(c.prompt)}</p>\n${body}`, home));
  }
  const live = view.doors.some((d) => !d.locked) || Boolean(c && !c.locked);
  const saving = form ? ` data-save="${escapeHtml(form.action)}" data-csrf="${escapeHtml(form.csrf)}"` : '';
  const credits = view.credits.length
    ? `<details class="credits"><summary>Photo credits</summary>${view.credits.map((x) => `<p>${escapeHtml(x)}</p>`).join('')}</details>`
    : '';
  return shell(view.title, EVENT_STYLE, `${back ? `<a class="back" href="${escapeHtml(back)}">Back to your notes</a>\n` : ''}<div class="intro"><h1>${escapeHtml(view.title)}</h1>
${view.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
</div>
<div class="house"${saving}>
<div class="roof"><div class="snowcap"></div></div>
<div class="front">
${doors}
</div>
<div class="ground"></div>
</div>
${cardTag}
${view.closing ? `<p class="closing">${escapeHtml(view.closing)}</p>` : ''}
${credits}
${sheets.join('\n')}
<div class="toast" role="status"></div>${live ? `\n${EVENT_SCRIPT}` : ''}`, READER_FONTS);
}

export function eventErrorPage(): string {
  return shell('Our calendar', EVENT_STYLE, '<p class="quiet">Something went wrong loading this page.</p>', READER_FONTS);
}

function buyList(dish: EventDish): string {
  return dish.buy?.length ? `<ul class="buy">${dish.buy.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '';
}

function pickRow(heading: string, dish: EventDish | undefined, at: string | undefined, status: string): string {
  const what = dish
    ? `<strong>${escapeHtml(dish.title)}</strong>${at ? ` <span class="hint">picked ${escapeHtml(formatStamp(at))}</span>` : ''}${buyList(dish)}`
    : `<span class="hint">${escapeHtml(status)}</span>`;
  return `<li><p class="text">${escapeHtml(heading)}</p>${what}</li>`;
}

export function eventAdminPage(d: {
  base: string; csrf: string; text: string; event: SpecialEvent | null; picks: EventPicks;
  photos: EventPhoto[]; inUse: string[]; flash?: string; error?: string;
}): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const at = (path: string) => escapeHtml(`${d.base}/admin/event${path}`);
  let picks = '<p>No event yet. Paste one below and save.</p>';
  if (d.event) {
    const rows = d.event.doors.map((door, i) => {
      const choice = d.picks.doors[door.id];
      const dish = door.dishes?.find((x) => x.id === choice?.dish);
      const status = !d.picks.opened[door.id] ? 'Not opened yet' : door.dishes?.length ? 'Opened, nothing picked yet' : 'Opened';
      return pickRow(`Door ${i + 1}: ${door.heading}`, dish, choice?.at, status);
    });
    const card = d.event.card;
    if (card) {
      const chosen = d.picks.card.map((c) => ({ c, dish: card.dishes.find((x) => x.id === c.dish) })).filter((x) => x.dish).slice(-card.pick);
      rows.push(chosen.length
        ? chosen.map(({ c, dish }) => pickRow(card.title, dish, c.at, '')).join('\n')
        : pickRow(card.title, undefined, undefined, 'Nothing picked yet'));
    }
    picks = `<ul>${rows.join('\n')}</ul>`;
  }
  const photoRows = d.photos.map((p) => `<li><span>${escapeHtml(p.name)}</span>${d.inUse.includes(p.name)
    ? ' <span class="tag">In use</span>'
    : ` <form method="post" action="${at('/photos/delete')}">${csrf}<input type="hidden" name="key" value="${escapeHtml(p.key)}"><button type="submit">Remove</button></form>`}</li>`).join('\n');
  return adminShell(`
<p><a href="${escapeHtml(`${d.base}/admin`)}">← Notes</a></p>
<h1>Special event</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
<form method="get" action="${at('/preview')}"><label>Preview as of <input type="date" name="on"></label> <button type="submit">Preview</button></form>
<h2>Her picks</h2>
${picks}
<form method="post" action="${at('/clear')}" onsubmit="return confirm('Clear all her picks?')">${csrf}<button type="submit">Clear her picks</button></form>
<h2>The event</h2>
<form class="write" method="post" action="${at('/save')}">
  ${csrf}
  <textarea name="event" rows="24" spellcheck="false" placeholder="The event as JSON">${escapeHtml(d.text)}</textarea>
  <button type="submit">Save</button>
</form>
<h2>Photos</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${at('/photos')}">
  ${csrf}
  <label class="file">Add photos<input type="file" name="photos" accept="image/*" multiple required></label>
  <p class="hint">Use a photo in the event by its name, like "photo": "name.jpg".</p>
  <button type="submit">Upload</button>
</form>
<ul>${photoRows || '<li>No photos yet.</li>'}</ul>`);
}
