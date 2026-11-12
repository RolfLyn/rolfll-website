import { escapeHtml, shell, READER_FONTS, adminShell, errorLine, formatStamp } from './views';
import { scoreWord, homeResults, GROUPS, inGroup, type Home, type HomeGroup, type HomeResults, type HomeScores, type Scored } from './home';

// "Our future home" pages: cream paper like the reading room's letters, one picture at a time, a slider to score.

const HOME_STYLE = `
:root { --paper: #fbf5ea; --ink: #3a2e28; --muted: #8c7b6c; --accent: #b0645a; --line: #e4d8c4; --cream: #f1e6d2; }
* { box-sizing: border-box; }
a, button, input { -webkit-tap-highlight-color: transparent; }
body { margin: 0; min-height: 100vh; background: var(--paper); color: var(--ink); font-family: 'Cormorant Garamond', Georgia, serif; }
.wrap { max-width: 30rem; margin: 0 auto; padding: 0 1rem 3rem; }
.back { display: inline-block; margin: 1rem 0 0.4rem; color: var(--muted); font-size: 1.05rem; text-decoration: none; }
h1 { font-weight: 400; font-style: italic; font-size: 2.1rem; line-height: 1.1; margin: 0.4rem 0 0.3rem; }
.sub { color: var(--muted); font-size: 1.1rem; margin: 0 0 1.2rem; }
p { font-size: 1.15rem; line-height: 1.4; }
.quiet { color: var(--muted); font-style: italic; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.card { display: block; border-radius: 1rem; overflow: hidden; background: #fff; border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
.card .cover { display: block; width: 100%; height: 7.5rem; object-fit: cover; background: var(--cream); }
.card .name { display: block; font-size: 1.3rem; padding: 0.5rem 0.75rem 0; }
.card .count { display: block; font-size: 0.95rem; color: var(--muted); padding: 0 0.75rem 0.6rem; }
.pill { display: inline-block; margin-top: 1.4rem; background: var(--ink); color: var(--paper); border: 0; border-radius: 999px; padding: 0.75rem 1.6rem; font: 500 1.2rem 'Cormorant Garamond', Georgia, serif; text-decoration: none; cursor: pointer; }
.pill.ghost { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
.top { display: flex; justify-content: space-between; font-size: 1rem; color: var(--muted); margin: 0.6rem 0; }
.pic { display: block; }
.pic img { display: block; width: 100%; height: 58vh; max-height: 34rem; object-fit: cover; border-radius: 1rem; background: var(--cream); }
.ptitle { text-align: center; font-style: italic; color: var(--muted); margin: 0.5rem 0 0; font-size: 1.05rem; }
.num { text-align: center; font-size: 3rem; line-height: 1; color: var(--accent); margin: 0.6rem 0 0; }
.word { text-align: center; font-style: italic; color: var(--muted); font-size: 1.15rem; margin: 0.1rem 0 0.6rem; min-height: 1.4rem; }
input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 2.4rem; background: transparent; margin: 0; }
input[type=range]::-webkit-slider-runnable-track { height: 0.4rem; border-radius: 0.2rem; background: var(--line); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 1.9rem; height: 1.9rem; margin-top: -0.75rem; border-radius: 50%; background: #fff; border: 2px solid var(--accent); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); }
input[type=range]::-moz-range-track { height: 0.4rem; border-radius: 0.2rem; background: var(--line); }
input[type=range]::-moz-range-thumb { width: 1.9rem; height: 1.9rem; border-radius: 50%; background: #fff; border: 2px solid var(--accent); }
.ends { display: flex; justify-content: space-between; font-size: 0.9rem; color: var(--muted); }
.go { display: flex; align-items: center; justify-content: center; gap: 1.4rem; margin-top: 0.4rem; }
.go .pill { margin-top: 0.6rem; min-width: 9rem; }
.go a { color: var(--muted); font-size: 1.1rem; }
.oops { text-align: center; color: var(--accent); min-height: 1.4rem; margin: 0.4rem 0 0; }
.done { text-align: center; padding-top: 3rem; }
.done .pill { display: block; margin: 1rem auto 0; max-width: 16rem; }
.dream { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: 8rem 8rem; gap: 0.5rem; margin: 0.6rem 0 1rem; }
.dream .tile:first-child { grid-row: span 2; }
.tile { display: block; border-radius: 0.8rem; overflow: hidden; background: var(--cream); }
.tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
.label { font-size: 0.8rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 1.4rem 0 0.5rem; }
.words { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.words span { background: var(--cream); border-radius: 999px; padding: 0.25rem 0.8rem; font-size: 1.05rem; }
.row { display: flex; align-items: center; gap: 0.7rem; padding: 0.3rem 0; color: var(--ink); text-decoration: none; font-size: 1.1rem; }
.row img { width: 2.75rem; height: 2.1rem; object-fit: cover; border-radius: 0.4rem; flex: 0 0 auto; background: var(--cream); }
.row em { margin-left: auto; font-style: normal; color: var(--accent); }
.credits { font-size: 1rem; color: var(--muted); }
.foot { margin-top: 2rem; font-size: 0.95rem; }
.foot a { color: var(--muted); }
.zoom { position: fixed; inset: 0; z-index: 10; background: rgba(20, 15, 12, 0.94); display: flex; align-items: center; justify-content: center; }
.zoom img { max-width: 100%; max-height: 100%; object-fit: contain; }
@media (prefers-reduced-motion: no-preference) {
  .pic img, .num { transition: opacity 0.25s ease; }
  .zoom { animation: fade 0.2s ease-out; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
}`;

const page = (title: string, body: string) => shell(title, HOME_STYLE, `${body}\n<script>${HOME_SCRIPT}</script>`, READER_FONTS);
const media = (base: string, file: string) => escapeHtml(`${base}/${file}`);
const WORDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(scoreWord);

// ES5 only: her iPhone, and kept simple.
export const HOME_SCRIPT = `(function () {
  var words = ${JSON.stringify(WORDS)};
  var form = document.querySelector('form.score');
  if (form) {
    var range = form.querySelector('input[type=range]');
    var num = document.getElementById('num');
    var word = document.getElementById('word');
    var oops = document.getElementById('oops');
    var button = form.querySelector('button');
    var show = function () { num.textContent = range.value; word.textContent = words[range.value - 1]; };
    range.addEventListener('input', show);
    range.addEventListener('change', show);
    var nextFile = form.getAttribute('data-next-file');
    if (nextFile) { var pre = new Image(); pre.src = nextFile; }
    form.addEventListener('submit', function (e) {
      if (!window.XMLHttpRequest) return;
      e.preventDefault();
      button.disabled = true;
      oops.textContent = '';
      var data = 'quiet=1';
      var fields = form.querySelectorAll('input[name]');
      for (var f = 0; f < fields.length; f++) data += '&' + encodeURIComponent(fields[f].name) + '=' + encodeURIComponent(fields[f].value);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', form.action);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.onload = function () {
        if (xhr.status === 204) { location.href = form.getAttribute('data-next'); return; }
        button.disabled = false;
        oops.textContent = "That didn't save. Try again?";
      };
      xhr.onerror = function () { button.disabled = false; oops.textContent = "That didn't save. Try again?"; };
      xhr.send(data);
    });
  }
  var zooms = document.querySelectorAll('a[data-zoom]');
  for (var i = 0; i < zooms.length; i++) {
    zooms[i].addEventListener('click', function (e) {
      e.preventDefault();
      var layer = document.createElement('div');
      layer.className = 'zoom';
      var img = document.createElement('img');
      img.src = this.getAttribute('href');
      img.alt = '';
      layer.appendChild(img);
      layer.addEventListener('click', function () { document.body.removeChild(layer); });
      document.body.appendChild(layer);
    });
  }
})();`;

export function homeStartPage(d: {
  groups: { id: HomeGroup; name: string; scored: number; total: number; coverKey?: string; href: string }[];
  loveHref?: string; mediaBase: string; back: string;
}): string {
  const cards = d.groups.map((g) => `<a class="card" href="${escapeHtml(g.href)}">${g.coverKey ? `<img class="cover" src="${media(d.mediaBase, g.coverKey)}" alt="">` : '<span class="cover"></span>'}<span class="name">${escapeHtml(g.name)}</span><span class="count">${g.scored} of ${g.total}</span></a>`).join('\n');
  return page('Our future home', `<div class="wrap">
<a class="back" href="${escapeHtml(d.back)}">&larr; Back</a>
<h1>Our future home</h1>
<p class="sub">Slide to say how much you love each one. There are no wrong answers.</p>
<div class="cards">
${cards}
</div>
${d.loveHref ? `<p><a class="pill" href="${escapeHtml(d.loveHref)}">See what you love</a></p>` : ''}
</div>`);
}

export function homeScorePage(d: {
  groupName: string; picture: { id: string; title: string; file: string }; index: number; total: number; score?: number;
  action: string; csrf: string; group: HomeGroup; nextHref: string; nextFile?: string; backHref?: string; mediaBase: string; home: string;
}): string {
  const value = d.score ?? 5;
  const src = media(d.mediaBase, d.picture.file);
  return page(d.groupName, `<div class="wrap">
<a class="back" href="${escapeHtml(d.home)}">&larr; Our future home</a>
<div class="top"><span>${escapeHtml(d.groupName)}</span><span>${d.index} of ${d.total}</span></div>
<a class="pic" href="${src}" data-zoom><img src="${src}" alt="${escapeHtml(d.picture.title)}"></a>
<p class="ptitle">${escapeHtml(d.picture.title)}</p>
<form class="score" method="post" action="${escapeHtml(d.action)}" data-next="${escapeHtml(d.nextHref)}"${d.nextFile ? ` data-next-file="${media(d.mediaBase, d.nextFile)}"` : ''}>
<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">
<input type="hidden" name="id" value="${escapeHtml(d.picture.id)}">
<input type="hidden" name="group" value="${escapeHtml(d.group)}">
<p class="num" id="num">${value}</p>
<p class="word" id="word">${escapeHtml(scoreWord(value))}</p>
<input type="range" name="score" min="1" max="10" step="1" value="${value}" aria-label="How much do you love it?">
<div class="ends"><span>not for me</span><span>my dream</span></div>
<div class="go">${d.backHref ? `<a href="${escapeHtml(d.backHref)}">Back</a>` : ''}<button class="pill" type="submit">Next</button></div>
<p class="oops" id="oops" role="status"></p>
</form>
</div>`);
}

export function homeDonePage(d: { groupName: string; next?: { name: string; href: string }; loveHref: string; home: string }): string {
  return page(d.groupName, `<div class="wrap done">
<h1>${escapeHtml(`That's all the ${d.groupName.toLowerCase()}`)}</h1>
${d.next ? `<a class="pill" href="${escapeHtml(d.next.href)}">${escapeHtml(`On to ${d.next.name.toLowerCase()}`)}</a>` : ''}
<a class="pill${d.next ? ' ghost' : ''}" href="${escapeHtml(d.loveHref)}">See what you love</a>
<p><a class="back" href="${escapeHtml(d.home)}">&larr; Our future home</a></p>
</div>`);
}

function tile(p: Scored | undefined, mediaBase: string): string {
  if (!p) return '<span class="tile"></span>';
  const src = media(mediaBase, p.file);
  return `<a class="tile" href="${src}" data-zoom><img src="${src}" alt="${escapeHtml(p.title)}"></a>`;
}

/** The dream home, the words and the favourites; shared with the admin page. */
export function loveSections(results: HomeResults, mediaBase: string): string {
  const top = results.ready
    ? `<div class="dream">${tile(results.dream.house, mediaBase)}${tile(results.dream.room, mediaBase)}${tile(results.dream.garden, mediaBase)}</div>
${results.words.length ? `<p class="label">${escapeHtml("What you're drawn to")}</p>\n<div class="words">${results.words.map((w) => `<span>${escapeHtml(w)}</span>`).join('')}</div>` : ''}`
    : '<p class="quiet">Score a few more and your dream home starts to appear.</p>';
  const groups: { id: HomeGroup; name: string }[] = [
    { id: 'houses', name: 'Houses' }, { id: 'rooms', name: 'Rooms' }, { id: 'gardens', name: 'Gardens' }, { id: 'furniture', name: 'Furniture' },
  ];
  const lists = groups.map((g) => {
    const list = results.favourites[g.id];
    const rows = list.length
      ? list.map((p) => {
        const src = media(mediaBase, p.file);
        return `<a class="row" href="${src}" data-zoom><img src="${src}" alt="">${escapeHtml(p.title)}<em>${p.score}</em></a>`;
      }).join('\n')
      : '<p class="quiet">Nothing here yet.</p>';
    return `<p class="label">${g.name}</p>\n${rows}`;
  }).join('\n');
  return `${top}\n${lists}`;
}

export function homeLovePage(d: { results: HomeResults; mediaBase: string; creditsHref: string; home: string }): string {
  return page('Your dream home', `<div class="wrap">
<a class="back" href="${escapeHtml(d.home)}">&larr; Our future home</a>
<h1>Your dream home</h1>
<p class="sub">Put together from everything you loved</p>
${loveSections(d.results, d.mediaBase)}
<p class="foot"><a href="${escapeHtml(d.creditsHref)}">Photo credits</a></p>
</div>`);
}

export function homeCreditsPage(d: { credits: { title: string; credit: string }[]; back: string }): string {
  const rows = d.credits.map((c) => `<li>${escapeHtml(c.title)}: ${escapeHtml(c.credit)}</li>`).join('\n');
  return page('Photo credits', `<div class="wrap">
<a class="back" href="${escapeHtml(d.back)}">&larr; Back</a>
<h1>Photo credits</h1>
<ul class="credits">
${rows}
</ul>
</div>`);
}

export function homeErrorPage(): string {
  return page('Our future home', '<div class="wrap"><p class="quiet">Something went wrong loading this page.</p></div>');
}

const ADMIN_EXTRA = `<style>
.pics { list-style: none; padding: 0; }
.pics li { display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.6rem 0; border-bottom: 1px solid #ddd; }
.pics img { width: 6rem; height: 4.5rem; object-fit: cover; border-radius: 0.4rem; flex: 0 0 auto; }
.pics .info { flex: 1; min-width: 0; }
.pics form { display: inline; }
.dream { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: 6rem 6rem; gap: 0.4rem; max-width: 24rem; }
.dream .tile:first-child { grid-row: span 2; }
.tile { display: block; border-radius: 0.5rem; overflow: hidden; background: #eee; }
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.words span { display: inline-block; background: #f1e6d2; border-radius: 999px; padding: 0.15rem 0.7rem; margin: 0 0.3rem 0.3rem 0; }
.row { display: flex; align-items: center; gap: 0.6rem; padding: 0.2rem 0; color: inherit; text-decoration: none; }
.row img { width: 2.75rem; height: 2.1rem; object-fit: cover; border-radius: 0.3rem; }
.row em { font-style: normal; font-weight: 600; }
.label { font-weight: 600; margin: 1rem 0 0.3rem; }
table.scores { border-collapse: collapse; }
table.scores td, table.scores th { text-align: left; padding: 0.2rem 0.8rem 0.2rem 0; }
</style>`;

export function homeAdminPage(d: {
  base: string; csrf: string; home: Home | null; scores: HomeScores | null; flash?: string; error?: string; problem?: string;
}): string {
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const at = (path: string) => escapeHtml(`${d.base}/admin/home${path}`);
  const mediaBase = `${d.base}/admin/media`;
  const options = (current?: HomeGroup) => GROUPS.map((g) => `<option value="${g.id}"${g.id === current ? ' selected' : ''}>${g.name}</option>`).join('');
  const h = d.home;
  const banner = h
    ? `<form method="post" action="${at('/toggle')}">${csrf}<input type="hidden" name="on" value="${h.on ? '0' : '1'}"><button type="submit">${h.on ? 'Switch the banner off' : 'Switch the banner on'}</button> <span class="hint">${h.on ? 'The banner is on' : 'The banner is off'}</span></form>`
    : '';
  const add = `<h2>Add pictures</h2>
<form class="write" method="post" enctype="multipart/form-data" action="${at('/add')}">${csrf}
<label>Group <select name="group">${options()}</select></label>
<label class="file">Pictures<input type="file" name="photos" accept="image/*" multiple required></label>
<label>Title <input name="title" maxlength="80" required></label>
<label>Tags, separated by commas <input name="tags"></label>
<label>Credit <input name="credit" maxlength="200"></label>
<p class="hint">Title, tags and credit are used for every picture in this upload.</p>
<button type="submit">Add</button>
</form>`;
  let list = '';
  if (h) {
    list = GROUPS.map((g) => {
      const pics = inGroup(h, g.id);
      const rows = pics.map((p) => {
        const s = d.scores && Object.hasOwn(d.scores, p.id) ? d.scores[p.id] : undefined;
        const id = `<input type="hidden" name="id" value="${escapeHtml(p.id)}">`;
        return `<li><img src="${escapeHtml(`${mediaBase}/${p.file}`)}" alt="" loading="lazy"><div class="info">
<strong>${escapeHtml(p.title)}</strong><br><span class="hint">${escapeHtml(p.tags.join(', ') || 'no tags')} · ${escapeHtml(p.credit || 'no credit')}</span><br>${s ? `Her score: ${s.score}` : 'not scored'}
<details><summary>Edit</summary><form class="write" method="post" action="${at('/edit')}">${csrf}${id}
<label>Group <select name="group">${options(p.group)}</select></label>
<label>Title <input name="title" maxlength="80" value="${escapeHtml(p.title)}" required></label>
<label>Tags <input name="tags" value="${escapeHtml(p.tags.join(', '))}"></label>
<label>Credit <input name="credit" maxlength="200" value="${escapeHtml(p.credit)}"></label>
<button type="submit">Save</button></form></details>
<form method="post" action="${at('/move')}">${csrf}${id}<input type="hidden" name="dir" value="up"><button type="submit" aria-label="Move up">&uarr;</button></form>
<form method="post" action="${at('/move')}">${csrf}${id}<input type="hidden" name="dir" value="down"><button type="submit" aria-label="Move down">&darr;</button></form>
<form method="post" action="${at('/delete')}" onsubmit="return confirm('Delete this picture and her score for it?')">${csrf}${id}<button type="submit">Delete</button></form>
</div></li>`;
      }).join('\n');
      return `<h3>${g.name} (${pics.length})</h3>\n<ul class="pics">${rows || '<li>None yet.</li>'}</ul>`;
    }).join('\n');
  }
  let hers = '';
  if (h && !d.scores) hers = '<p class="error">Her scores could not be read.</p>';
  else if (h && d.scores) {
    const scores = d.scores;
    const scored = h.pictures
      .filter((p) => Object.hasOwn(scores, p.id))
      .map((p) => ({ p, s: scores[p.id] }))
      .sort((a, b) => Date.parse(b.s.at) - Date.parse(a.s.at));
    const name = (g: HomeGroup) => GROUPS.find((x) => x.id === g)!.name;
    const table = scored.length
      ? `<table class="scores"><tr><th>Picture</th><th>Group</th><th>Score</th><th>When</th></tr>
${scored.map(({ p, s }) => `<tr><td>${escapeHtml(p.title)}</td><td>${name(p.group)}</td><td>${s.score}</td><td>${escapeHtml(formatStamp(s.at))}</td></tr>`).join('\n')}</table>`
      : '<p>She has not scored anything yet.</p>';
    hers = `${loveSections(homeResults(h, scores), mediaBase)}\n<h3>Every score</h3>\n${table}
<form method="post" action="${at('/clear')}" onsubmit="return confirm('Clear all her scores?')">${csrf}<button type="submit">Clear her scores</button></form>`;
  }
  return adminShell(`${ADMIN_EXTRA}
<p><a href="${escapeHtml(`${d.base}/admin`)}">&larr; Notes</a></p>
<h1>Our future home</h1>
${d.flash ? `<p class="flash">${escapeHtml(d.flash)}</p>` : ''}
${errorLine(d.error)}
${d.problem ? `<p class="error">${escapeHtml(d.problem)}</p>` : ''}
${banner}
${add}
${h ? `<h2>Pictures</h2>\n${list}\n<h2>Her results</h2>\n${hers}` : ''}`);
}
