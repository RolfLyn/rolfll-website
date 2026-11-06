import { escapeHtml } from './html';
import { albumHasNew, songsUnplayed, type Song, type AlbumPhoto } from './keepsakes';
import type { Played } from './books';

const CAVEAT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap">';

const KEEPSAKE_STYLE = `
.sideboard { position: relative; margin: 2.6rem 0 0; }
.sideboard .glow { position: absolute; left: 50%; top: -5rem; width: 20rem; max-width: 100%; height: 10rem; transform: translateX(-50%); background: radial-gradient(ellipse, rgba(255, 196, 120, 0.2), rgba(255, 196, 120, 0) 70%); pointer-events: none; }
.sideboard .board-top { position: relative; display: flex; justify-content: center; align-items: flex-end; gap: 1.2rem; padding: 0 0.6rem; }
.sideboard .wood { height: 0.9rem; background: linear-gradient(#7a5536, #5a3c25); border-radius: 3px; box-shadow: 0 6px 0 #2e1f14; }
.sideboard .cabinet { height: 3.2rem; margin: 0 0.4rem; border-radius: 0 0 4px 4px; background: linear-gradient(90deg, #3b281a 0 49.5%, #2a1c12 49.5% 50.5%, #3b281a 50.5% 100%); }
.keep-item { position: relative; display: block; flex: 0 1 11rem; color: #e6d3b3; text-align: center; text-decoration: none; -webkit-tap-highlight-color: transparent; }
.keep-item .name { display: block; margin-top: 0.5rem; font-style: italic; font-size: 1.1rem; }
.keep-item.new .name::after { content: ''; display: inline-block; width: 0.42rem; height: 0.42rem; margin-left: 0.45rem; border-radius: 50%; background: #f2c879; box-shadow: 0 0 8px #f2c879; vertical-align: middle; }
.keep-item:focus-visible { outline: 2px solid #f0d29a; outline-offset: 4px; }
.deck { position: relative; display: block; width: 100%; aspect-ratio: 1.15; border-radius: 6px; background: linear-gradient(145deg, #8a5f3c, #5e3f27); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.08), 0 4px 10px rgba(0, 0, 0, 0.4); }
.platter { position: absolute; left: 7%; top: 9%; width: 70%; aspect-ratio: 1; border-radius: 50%; background: #111; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
.record { position: absolute; inset: 3%; border-radius: 50%; background: repeating-radial-gradient(circle, #151515 0 2px, #222 2px 3px), #111; }
.record::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 30deg, rgba(255,255,255,0) 0 20%, rgba(255,255,255,0.09) 25%, rgba(255,255,255,0) 30% 70%, rgba(255,255,255,0.06) 75%, rgba(255,255,255,0) 80%); }
.lbl { position: absolute; inset: 33%; display: flex; align-items: center; justify-content: center; padding: 8%; border-radius: 50%; background: radial-gradient(circle, #1c1511 0 5%, #b0645a 6%); color: #fbf5ea; font-size: 0.5rem; line-height: 1.05; text-align: center; overflow: hidden; }
.spinning .record { animation: spin 1.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.arm { position: absolute; right: 8%; top: 10%; width: 5%; height: 62%; transform-origin: 50% 6%; transform: rotate(18deg); transition: transform 1.2s ease-in-out; }
.arm::before { content: ''; position: absolute; left: 35%; top: 0; width: 30%; height: 100%; border-radius: 2px; background: linear-gradient(90deg, #d8d2c6, #9d978c); }
.arm::after { content: ''; position: absolute; left: -10%; bottom: -4%; width: 120%; height: 12%; border-radius: 2px; background: #2a2a2a; }
.arm .pivot { position: absolute; left: -60%; top: -6%; width: 220%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, #ccc, #777); }
.spinning .arm { transform: rotate(38deg); }
.cover { position: relative; width: 82%; margin: 0 auto; aspect-ratio: 0.82; display: flex; align-items: center; justify-content: center; border-radius: 3px 8px 8px 3px; background: linear-gradient(135deg, #6e2b2b, #4a1a1d); box-shadow: inset 6px 0 0 rgba(0, 0, 0, 0.3), inset 0 0 0 3px rgba(242, 200, 121, 0.35), 0 4px 10px rgba(0, 0, 0, 0.5); }
.cover span, .album-sheet h2 { font-family: 'Caveat', cursive; color: #f2c879; }
.cover span { font-size: 1.9rem; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5); }
.keep-wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0.5rem; background: rgba(15, 10, 8, 0.6); }
.keep-wrap[hidden] { display: none; }
.keep-sheet { width: 100%; max-width: 32rem; max-height: 92vh; overflow-y: auto; padding: 1.3rem 1.2rem calc(1.3rem + env(safe-area-inset-bottom, 0px)); border-radius: 1.2rem 1.2rem 0 0; background: #fbf5ea; color: #3a2e28; animation: up 0.35s ease-out both; }
.keep-sheet h2 { margin: 0 0 0.8rem; font-weight: 500; font-size: 1.6rem; }
.keep-close { display: block; margin: 1rem auto 0; text-align: center; font-style: italic; font-size: 1.1rem; color: #8c7b6c; }
.big-deck { display: none; width: 86%; margin: 0 auto 1rem; cursor: pointer; }
.big-deck .lbl { font-size: 0.85rem; }
.player { display: none; }
.js .big-deck, .js .player { display: block; }
.now { margin: 0 0 0.3rem; text-align: center; font-size: 1.35rem; font-style: italic; overflow-wrap: anywhere; }
.bar { height: 4px; margin: 0.4rem 0 0.2rem; border-radius: 2px; background: #e4d8c4; }
.bar i { display: block; width: 0; height: 100%; border-radius: 2px; background: #b0645a; }
.times { display: flex; justify-content: space-between; font-size: 0.95rem; color: #8c7b6c; }
.play { display: block; width: 3.6rem; height: 3.6rem; margin: 0.7rem auto 1rem; border: 0; border-radius: 50%; background: #b0645a; color: #fff; font: inherit; font-size: 1.4rem; cursor: pointer; }
.keep-error { margin: 0 0 0.6rem; text-align: center; font-style: italic; color: #b0645a; }
.keep-error:empty { display: none; }
.sleeves { display: flex; flex-direction: column; gap: 0.55rem; }
.sleeve { padding: 0.55rem; border: 1px solid #e4d8c4; border-radius: 0.7rem; background: #fff; }
.sleeve.on { border-color: #b0645a; box-shadow: 0 0 0 1px #b0645a; }
.pick { display: flex; align-items: center; gap: 0.8rem; width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.art { position: relative; flex: none; width: 3rem; height: 3rem; overflow: hidden; border-radius: 3px; background: linear-gradient(135deg, #b0645a, #6e2b2b); }
.art::after { content: ''; position: absolute; right: -40%; top: 10%; width: 80%; aspect-ratio: 1; border-radius: 50%; background: repeating-radial-gradient(circle, #151515 0 1px, #2a2a2a 1px 2px); }
.pick b { display: block; font-weight: 500; font-size: 1.2rem; overflow-wrap: anywhere; }
.pick small { display: block; color: #8c7b6c; font-size: 1rem; font-style: italic; overflow-wrap: anywhere; }
.sleeve .song { display: block; width: 100%; margin-top: 0.5rem; }
.js .sleeve .song { display: none; }
.sleeve.new .pick b::after { content: ''; display: inline-block; width: 0.4rem; height: 0.4rem; margin-left: 0.4rem; border-radius: 50%; background: #c9963f; vertical-align: middle; }
.album-sheet { background: #3b1d1f; color: #f1e6d2; }
.album-sheet h2 { margin: 0 0 0.8rem; text-align: center; font-weight: 500; font-size: 2rem; }
.page { margin: 0 0 1rem; padding: 1.1rem 1.1rem 0.9rem; border-radius: 4px; background: #f6eedd; color: #3a2e28; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45); transform-origin: left center; touch-action: pan-y; }
.js .page { margin: 0; }
.page[hidden] { display: none; }
.photo { position: relative; padding: 0.55rem; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); transform: rotate(-1.2deg); }
.page img { display: block; width: 100%; height: auto; max-height: 58vh; object-fit: contain; background: #eee; }
.corner { position: absolute; width: 1.4rem; height: 1.4rem; background: #3a2a22; }
.corner.tl { left: -4px; top: -4px; clip-path: polygon(0 0, 100% 0, 0 100%); }
.corner.tr { right: -4px; top: -4px; clip-path: polygon(0 0, 100% 0, 100% 100%); }
.corner.bl { left: -4px; bottom: -4px; clip-path: polygon(0 0, 0 100%, 100% 100%); }
.corner.br { right: -4px; bottom: -4px; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
.caption { margin: 0.8rem 0 0; text-align: center; font-family: 'Caveat', cursive; font-size: 1.6rem; line-height: 1.15; color: #4a3528; overflow-wrap: anywhere; }
.turns { display: none; justify-content: space-between; align-items: center; margin: 0.9rem 0 0; color: #e6d3b3; }
.js .turns { display: flex; }
.turns button { padding: 0.3rem 1.1rem; border: 1px solid rgba(242, 200, 121, 0.5); border-radius: 999px; background: none; color: #f2c879; font: inherit; font-size: 1.2rem; cursor: pointer; }
.turns button:disabled { opacity: 0.3; }
.album-sheet .keep-close { color: #c9b9a3; }
.page.turn-next { animation: turn-next 0.45s ease-in both; }
.page.turn-prev { animation: turn-prev 0.45s ease-in both; }
@keyframes turn-next { to { transform: perspective(900px) rotateY(-80deg); opacity: 0; } }
@keyframes turn-prev { to { transform: perspective(900px) rotateY(80deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .spinning .record, .page.turn-next, .page.turn-prev, .keep-sheet { animation: none; }
  .arm { transition: none; }
}
`;

// Plays his songs on the record player and turns the album's pages. Starting a song pauses every other
// sound on the page, remembers where she stopped (on her phone only), shows the song on the lock screen,
// and tells the server about a first play and about opening the album. Without it, every song is a plain
// player and the album is a list.
export const KEEPSAKE_SCRIPT = `<script>
(function () {
  var board = document.querySelector('.sideboard');
  if (!board) return;
  var playedUrl = board.getAttribute('data-played');
  var seenUrl = board.getAttribute('data-seen');
  var csrf = board.getAttribute('data-csrf');
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shown = null;

  function post(url, fields) {
    if (!url) return;
    var body = ['csrf=' + encodeURIComponent(csrf), 'quiet=1'];
    for (var name in fields) if (fields.hasOwnProperty(name)) body.push(encodeURIComponent(name) + '=' + encodeURIComponent(fields[name]));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send(body.join('&'));
  }
  function unmark(el) { if (el) el.className = el.className.replace(/\\s*\\bnew\\b/, ''); }
  function hide() { if (shown) shown.hidden = true; shown = null; }
  function show(name) {
    hide();
    shown = document.getElementById('sheet-' + name);
    if (!shown) return;
    shown.hidden = false;
    if (name === 'album') {
      var item = board.querySelector('.keep-item.album');
      if (item && /\\bnew\\b/.test(item.className)) { unmark(item); post(seenUrl, {}); }
    }
  }
  var wraps = document.querySelectorAll('.keep-wrap');
  for (var w = 0; w < wraps.length; w++) if (!wraps[w].hidden) shown = wraps[w];
  if (shown && shown.id === 'sheet-album') show('album');

  document.addEventListener('click', function (event) {
    var t = event.target;
    if (!t.closest) return;
    var item = t.closest('.keep-item');
    if (item) { event.preventDefault(); show(item.getAttribute('data-sheet')); return; }
    if (t.closest('.keep-close')) { event.preventDefault(); hide(); return; }
    if (shown && t === shown) hide();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') hide(); });

  var records = document.getElementById('sheet-records');
  if (records) {
    records.className += ' js';
    var sleeves = records.querySelectorAll('.sleeve');
    var decks = document.querySelectorAll('.deck');
    var label = records.querySelector('.big-deck .lbl');
    var smallLabel = board.querySelector('.keep-item .lbl');
    var now = records.querySelector('.now');
    var bar = records.querySelector('.bar i');
    var cur = records.querySelector('.cur');
    var dur = records.querySelector('.dur');
    var button = records.querySelector('.play');
    var note = records.querySelector('.keep-error');
    var current = null;
    function audioOf(sleeve) { return sleeve.querySelector('audio'); }
    function time(s) { if (!isFinite(s) || s < 0) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
    function spin(on) {
      for (var d = 0; d < decks.length; d++) decks[d].className = 'deck' + (on ? ' spinning' : '');
      button.innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
      button.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
    function draw() {
      if (!current) return;
      var a = audioOf(current);
      cur.textContent = time(a.currentTime);
      if (isFinite(a.duration) && a.duration > 0) { dur.textContent = time(a.duration); bar.style.width = (a.currentTime / a.duration * 100) + '%'; }
      else { dur.textContent = ''; bar.style.width = '0'; }
    }
    function choose(sleeve, start) {
      if (current && current !== sleeve) audioOf(current).pause();
      for (var i = 0; i < sleeves.length; i++) sleeves[i].className = sleeves[i].className.replace(/\\s*\\bon\\b/, '') + (sleeves[i] === sleeve ? ' on' : '');
      current = sleeve;
      var title = audioOf(sleeve).getAttribute('data-title');
      label.textContent = now.textContent = title;
      if (smallLabel) smallLabel.textContent = title;
      note.textContent = '';
      draw();
      if (start) audioOf(sleeve).play();
    }
    function listen(sleeve) {
      var audio = audioOf(sleeve);
      var id = audio.getAttribute('data-id');
      var key = 'song-at-' + id;
      var resumed = false;
      var saved = 0;
      function resume() {
        if (resumed || !audio.duration) return;
        resumed = true;
        try {
          var at = parseFloat(localStorage.getItem(key));
          if (at > 0 && at < audio.duration - 5) audio.currentTime = at;
        } catch (e) {}
      }
      function save() {
        if (!resumed) return;
        try {
          if (audio.ended || audio.duration - audio.currentTime < 5) localStorage.removeItem(key);
          else localStorage.setItem(key, String(audio.currentTime));
        } catch (e) {}
      }
      audio.addEventListener('loadedmetadata', resume);
      audio.addEventListener('canplay', resume);
      audio.addEventListener('timeupdate', function () {
        if (sleeve === current) draw();
        var t = new Date().getTime();
        if (t - saved > 5000) { saved = t; save(); }
      });
      audio.addEventListener('play', function () {
        var all = document.querySelectorAll('audio');
        for (var k = 0; k < all.length; k++) if (all[k] !== audio) all[k].pause();
        if (sleeve !== current) choose(sleeve, false);
        spin(true);
        if ('mediaSession' in navigator && window.MediaMetadata) {
          try { navigator.mediaSession.metadata = new MediaMetadata({ title: audio.getAttribute('data-title'), artist: 'Recorded for you', album: 'Our records' }); } catch (e) {}
        }
        if (/\\bnew\\b/.test(sleeve.className)) {
          unmark(sleeve);
          if (!records.querySelector('.sleeve.new')) unmark(board.querySelector('.keep-item.records'));
          post(playedUrl, { id: id });
        }
      });
      audio.addEventListener('pause', function () { if (sleeve === current) spin(false); save(); });
      audio.addEventListener('ended', function () { if (sleeve === current) spin(false); save(); });
      audio.addEventListener('error', function () { if (sleeve === current) { spin(false); note.textContent = "That didn't play. Try again?"; } });
      sleeve.querySelector('.pick').addEventListener('click', function () { choose(sleeve, true); });
    }
    for (var s = 0; s < sleeves.length; s++) listen(sleeves[s]);
    function toggle() {
      if (!current) return;
      var a = audioOf(current);
      if (a.paused) { note.textContent = ''; a.play(); } else a.pause();
    }
    button.addEventListener('click', toggle);
    records.querySelector('.big-deck').addEventListener('click', toggle);
    if (sleeves.length) choose(sleeves[0], false);
  }

  var album = document.getElementById('sheet-album');
  if (album) {
    album.className += ' js';
    var pages = album.querySelectorAll('.page');
    var count = album.querySelector('.count');
    var prev = album.querySelector('.prev');
    var next = album.querySelector('.next');
    var at = 0;
    var turning = false;
    function place() {
      for (var p = 0; p < pages.length; p++) pages[p].hidden = p !== at;
      count.textContent = (at + 1) + ' of ' + pages.length;
      prev.disabled = at === 0;
      next.disabled = at === pages.length - 1;
    }
    function go(to) {
      if (turning || to < 0 || to >= pages.length || to === at) return;
      var page = pages[at];
      var dir = to > at ? 'next' : 'prev';
      if (still) { at = to; place(); return; }
      turning = true;
      page.className = 'page turn-' + dir;
      setTimeout(function () { page.className = 'page'; at = to; place(); turning = false; }, 430);
    }
    prev.addEventListener('click', function () { go(at - 1); });
    next.addEventListener('click', function () { go(at + 1); });
    var startX = null;
    album.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; });
    album.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (dx < -40) go(at + 1);
      else if (dx > 40) go(at - 1);
    });
    place();
  }
})();
</script>`;

function link(home: string, open: string): string {
  return `${home}${home.includes('?') ? '&' : '?'}open=${open}`;
}

const DECK = (title: string) => `<span class="platter"><span class="record"><span class="lbl">${escapeHtml(title)}</span></span></span><span class="arm"><span class="pivot"></span></span>`;

/** The lamp-lit sideboard under the shelf, with its two sheets; empty when there is nothing on it. */
export function sideboard({ songs, songsPlayed, album, albumSeen, mediaBase, home, open, songPlayAction, albumSeenAction, csrf }: {
  songs: Song[]; songsPlayed: Played[]; album: AlbumPhoto[]; albumSeen: string | null;
  mediaBase: string; home: string; open?: string;
  songPlayAction?: string; albumSeenAction?: string; csrf?: string;
}): string {
  if (!songs.length && !album.length) return '';
  const unplayed = songsUnplayed(songs, songsPlayed);
  const items: string[] = [];
  const sheets: string[] = [];
  if (songs.length) {
    items.push(`<a class="keep-item records${unplayed.length ? ' new' : ''}" data-sheet="records" href="${escapeHtml(link(home, 'records'))}"><span class="deck">${DECK(songs[0].title)}</span><span class="name">Our records</span></a>`);
    const sleeves = songs.map((s) => `<div class="sleeve${unplayed.includes(s.id) ? ' new' : ''}">
<button class="pick" type="button"><span class="art"></span><span><b>${escapeHtml(s.title)}</b>${s.line ? `<small>${escapeHtml(s.line)}</small>` : ''}</span></button>
<audio class="song" controls preload="none" src="${escapeHtml(`${mediaBase}/${s.audio.key}`)}" data-id="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title)}"></audio>
</div>`).join('\n');
    sheets.push(`<div class="keep-wrap" id="sheet-records"${open === 'records' ? '' : ' hidden'}><article class="keep-sheet" role="dialog" aria-label="Our records">
<h2>Our records</h2>
<div class="big-deck"><span class="deck">${DECK(songs[0].title)}</span></div>
<div class="player"><p class="now">${escapeHtml(songs[0].title)}</p><div class="bar"><i></i></div><div class="times"><span class="cur">0:00</span><span class="dur"></span></div><button class="play" type="button" aria-label="Play">&#9654;</button></div>
<p class="keep-error" role="status"></p>
<div class="sleeves">
${sleeves}
</div>
<a class="keep-close" href="${escapeHtml(home)}">Close</a>
</article></div>`);
  }
  if (album.length) {
    items.push(`<a class="keep-item album${albumHasNew(album, albumSeen) ? ' new' : ''}" data-sheet="album" href="${escapeHtml(link(home, 'album'))}"><span class="cover"><span>Us</span></span><span class="name">Our album</span></a>`);
    const pages = album.map((p) => `<figure class="page"><div class="photo"><img src="${escapeHtml(`${mediaBase}/${p.photo.key}`)}" alt="" loading="lazy"><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>${p.line ? `<figcaption class="caption">${escapeHtml(p.line)}</figcaption>` : ''}</figure>`).join('\n');
    sheets.push(`<div class="keep-wrap" id="sheet-album"${open === 'album' ? '' : ' hidden'}><article class="keep-sheet album-sheet" role="dialog" aria-label="Our album">
<h2>Us</h2>
${pages}
<div class="turns"><button class="prev" type="button" aria-label="Previous page">&#8249;</button><span class="count"></span><button class="next" type="button" aria-label="Next page">&#8250;</button></div>
<a class="keep-close" href="${escapeHtml(home)}">Close</a>
</article></div>`);
  }
  const recording = songPlayAction && albumSeenAction && csrf
    ? ` data-played="${escapeHtml(songPlayAction)}" data-seen="${escapeHtml(albumSeenAction)}" data-csrf="${escapeHtml(csrf)}"`
    : '';
  return `${album.length ? CAVEAT : ''}<style>${KEEPSAKE_STYLE}</style>
<div class="sideboard"${recording}>
<div class="glow"></div>
<div class="board-top">
${items.join('\n')}
</div>
<div class="wood"></div>
<div class="cabinet"></div>
</div>
${sheets.join('\n')}
${KEEPSAKE_SCRIPT}`;
}
