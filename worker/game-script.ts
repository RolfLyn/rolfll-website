// Shared by the server tests and the browser (embedded via toString), so it must stay self-contained.
export function meetText(game: { to: string; meet?: string }, today: string): string {
  if (!game.meet) return '';
  const days = Math.round((Date.parse(game.meet + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (days < 0) return '';
  const day = new Date(game.meet + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return game.to + ', ' + day + ' · ' + (days === 0 ? 'Today!' : days === 1 ? '1 more sleep' : days + ' more sleeps');
}

export const GAME_STYLE = `
.game-card { margin: 0 0 1rem; }
.game-stage { position: relative; border-radius: 0.9rem; overflow: hidden; box-shadow: 0 10px 30px rgba(58, 46, 40, 0.18); }
.game-stage canvas { display: block; width: 100%; aspect-ratio: 3 / 2; touch-action: none; outline: none; }
@media (max-width: 520px) { .game-stage canvas { aspect-ratio: 4 / 5; } }
.game-line { position: absolute; left: 1rem; right: 1rem; top: 0.9rem; margin: 0; text-align: center; color: #fff7ec; font-style: italic; font-size: clamp(1.05rem, 3.6vw, 1.35rem); line-height: 1.3; opacity: 0; text-shadow: 0 1px 8px rgba(42, 27, 61, 0.6); pointer-events: none; }
.game-line.show { animation: drift 5s ease-out both; }
.game-km { position: absolute; right: 0.9rem; bottom: 0.6rem; margin: 0; color: rgba(255, 247, 236, 0.85); font-size: 0.95rem; font-variant-numeric: tabular-nums; pointer-events: none; }
.game-intro { position: absolute; inset: 0; text-wrap: balance; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.25rem; text-align: center; background: rgba(42, 27, 61, 0.35); }
.game-intro-title { margin: 0; color: #fff7ec; font-style: italic; font-size: clamp(1.45rem, 5.5vw, 1.9rem); line-height: 1.2; text-shadow: 0 1px 8px rgba(42, 27, 61, 0.6); }
.game-intro-hint { margin: 0 0 0.6rem; color: rgba(255, 247, 236, 0.88); font-size: 1.05rem; line-height: 1.3; text-shadow: 0 1px 6px rgba(42, 27, 61, 0.6); }
.game-begin { background: rgba(255, 247, 236, 0.92); color: var(--ink); font-size: 1.3rem; padding: 0.6rem 1.6rem; border-radius: 999px; }
.game-skip { display: block; margin: 0.7rem auto 0; background: none; color: var(--muted); font-style: italic; font-size: 1rem; padding: 0.3rem; text-decoration: underline; }
.replay { display: inline-block; margin: 1rem 0 0; background: none; color: var(--accent); border: 1px solid var(--accent); font-size: 1rem; padding: 0.3rem 0.9rem; border-radius: 999px; }
.meet { color: var(--accent); font-style: italic; font-size: 1.15rem; margin: 0 0 0.6rem; }
.game-reveal { animation: rise 1.8s ease-out both; }
[hidden] { display: none !important; }
@keyframes drift { 0% { opacity: 0; transform: translateY(8px); } 15% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
@media (prefers-reduced-motion: reduce) { .game-line.show { animation: none; opacity: 1; } .game-reveal { animation: none; } }
`;

export const GAME_SCRIPT = `<script>
(function () {
  var PLAYED = 'notes-game-played:';
  var START = 0.84, END = 0.16, GAP = 0.05, SECONDS = 60;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var meetText = ${meetText.toString()};

  function storage(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  function hasPlayed(date) { return storage(function (s) { return s.getItem(PLAYED + date); }) === '1'; }
  function remember(date) { storage(function (s) { s.setItem(PLAYED + date, '1'); }); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function deviceToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function frac(v) { return v - Math.floor(v); }
  function rgb(hex) { var v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
  }

  function createGame(g, before, onDone) {
    var card = el('div', 'game-card');
    var stage = el('div', 'game-stage');
    var canvas = el('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A little light travelling from ' + g.from + ' to ' + g.to);
    var line = el('p', 'game-line');
    line.setAttribute('aria-live', 'polite');
    var km = el('p', 'game-km');
    var intro = el('div', 'game-intro');
    var begin = el('button', 'game-begin', 'Begin');
    var skip = el('button', 'game-skip', 'Skip to the note');
    begin.type = 'button';
    skip.type = 'button';
    intro.appendChild(el('p', 'game-intro-title', 'Fly from ' + g.from + ' to ' + g.to));
    intro.appendChild(el('p', 'game-intro-hint', 'Hold and drag to steer through the little lights'));
    intro.appendChild(begin);
    stage.appendChild(canvas);
    stage.appendChild(line);
    stage.appendChild(km);
    stage.appendChild(intro);
    card.appendChild(stage);
    card.appendChild(skip);

    // Fail before anything is on the page, so the caller can simply show the note instead.
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    before.parentNode.insertBefore(card, before);
    var W = 0, H = 0, p = 0, y = 0.5, targetY = 0.5;
    var running = false, ended = false, last = 0, slowUntil = 0, metAt = 0, raf = 0;
    var count = g.lines.length;
    var lights = g.lines.map(function (text, i) {
      return { at: (i + 1) / (count + 1), y: 0.22 + 0.56 * frac(Math.sin((i + 1) * 12.9898) * 43758.5453), text: text, shown: false, caught: false, t: 0 };
    });
    var clouds = [0, 1, 2, 3].map(function (i) {
      return { x: i / 4, y: 0.15 + Math.random() * 0.7, r: 0.06 + Math.random() * 0.04, v: 0.035 + Math.random() * 0.03 };
    });
    var stars = [];
    for (var i = 0; i < 60; i++) stars.push({ x: Math.random(), y: Math.random() * 0.8, s: 0.4 + Math.random() * 1.1, t: Math.random() * 6 });

    function routeX(at) { return START + (END + GAP - START) * at; }
    function near(x1, y1, x2, y2, r) { var dx = (x1 - x2) * W, dy = (y1 - y2) * H; return dx * dx + dy * dy < r * r * H * H; }
    function showKm() { km.textContent = Math.round(g.km * (1 - p)).toLocaleString('en-GB') + ' km'; }
    function showLine(text) {
      line.textContent = text;
      line.classList.remove('show');
      void line.offsetWidth;
      line.classList.add('show');
    }
    function resize() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function dot(x, y0, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    function glow(x, y0, r, color) {
      var grad = ctx.createRadialGradient(x, y0, 0, x, y0, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255,220,160,0)');
      dot(x, y0, r, grad);
    }
    function label(text, x, y0, alpha) {
      if (alpha <= 0) return;
      ctx.fillStyle = 'rgba(255,247,236,' + alpha + ')';
      ctx.font = 'italic ' + Math.round(H * 0.045) + 'px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y0);
    }

    function draw(t) {
      var warm = metAt ? clamp((t - metAt) / 2000, 0, 1) : 0;
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, mix('#2a1b3d', '#f0b06e', warm));
      sky.addColorStop(0.6, mix('#5b2f4f', '#f6cf9f', warm));
      sky.addColorStop(1, mix('#9c5560', '#fbe6cc', warm));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      stars.forEach(function (s) {
        var a = (reduce ? 0.6 : 0.45 + 0.35 * Math.sin(t / 1300 + s.t)) * (1 - warm);
        dot(s.x * W, s.y * H, s.s, 'rgba(255,244,230,' + a + ')');
      });
      ctx.fillStyle = 'rgba(42,27,61,0.28)';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.bezierCurveTo(W * 0.3, H * 0.86, W * 0.6, H * 0.95, W, H * 0.88);
      ctx.lineTo(W, H);
      ctx.fill();
      lights.forEach(function (l) {
        var lx = routeX(l.at) * W, ly = l.y * H;
        if (!l.shown) {
          var pulse = reduce ? 1 : 1 + 0.15 * Math.sin(t / 400 + l.at * 10);
          glow(lx, ly, H * 0.05 * pulse, 'rgba(255,236,190,0.95)');
        } else if (l.caught && t - l.t < 800) {
          var k = (t - l.t) / 800;
          glow(lx, ly, H * (0.05 + 0.12 * k), 'rgba(255,236,190,' + (0.9 * (1 - k)) + ')');
        }
      });
      clouds.forEach(function (c) {
        [[-0.7, 0.15, 0.7], [0, 0, 1], [0.75, 0.1, 0.75]].forEach(function (b) {
          dot(c.x * W + b[0] * c.r * H, c.y * H + b[1] * c.r * H, b[2] * c.r * H, 'rgba(255,238,232,0.2)');
        });
      });
      var sx = routeX(p) * W, sy = y * H, ex = END * W, ey = 0.5 * H;
      ctx.save();
      ctx.setLineDash([2, 9]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,247,236,' + (0.4 * (1 - warm)) + ')';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
      glow(ex, ey, H * (0.09 + 0.5 * warm), 'rgba(255,224,150,0.9)');
      dot(ex, ey, H * 0.018, '#fff6dc');
      glow(sx, sy, H * 0.1, 'rgba(255,200,120,0.85)');
      dot(sx, sy, H * 0.03, '#ffd98f');
      label(g.to, ex, ey + H * 0.1, 0.85 * (1 - warm));
      label(g.from, sx, sy + H * 0.13, 0.85 * clamp((0.25 - p) / 0.1, 0, 1));
    }

    function frame(t) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      if (running) {
        p = Math.min(1, p + (t < slowUntil ? 0.45 : 1) * dt / SECONDS);
        if (p > 0.92) targetY = 0.5;
        y += (targetY - y) * Math.min(1, dt * 6);
        var sx = routeX(p);
        clouds.forEach(function (c) {
          c.x += c.v * dt;
          if (c.x > 1.2) { c.x = -0.2; c.y = 0.15 + Math.random() * 0.7; }
          if (near(c.x, c.y, sx, y, c.r + 0.03)) slowUntil = t + 900;
        });
        lights.forEach(function (l) {
          if (!l.shown && p >= l.at) {
            l.shown = true;
            l.caught = Math.abs(l.y - y) < 0.09;
            l.t = t;
            showLine(l.text);
          }
        });
        showKm();
        if (p >= 1) { running = false; metAt = t; }
      }
      draw(t);
      if (metAt && t - metAt > 2600) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }

    function aim(e) {
      var r = canvas.getBoundingClientRect();
      targetY = clamp((e.clientY - r.top) / r.height, 0.1, 0.9);
    }
    function onKey(e) {
      if (!running) return;
      if (e.key === 'ArrowUp') targetY = clamp(targetY - 0.1, 0.1, 0.9);
      else if (e.key === 'ArrowDown') targetY = clamp(targetY + 0.1, 0.1, 0.9);
      else return;
      e.preventDefault();
    }
    function onResize() { resize(); draw(last); }
    function finish() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      card.parentNode.removeChild(card);
      onDone();
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      aim(e);
    });
    canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || e.buttons) aim(e); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    begin.addEventListener('click', function () {
      intro.hidden = true;
      running = true;
      try { canvas.focus({ preventScroll: true }); } catch (e) {}
    });
    skip.addEventListener('click', finish);
    resize();
    showKm();
    raf = requestAnimationFrame(frame);
  }

  Array.prototype.forEach.call(document.querySelectorAll('script.game-data'), function (data) {
    var date = data.getAttribute('data-date');
    var note = document.querySelector('[data-game="' + date + '"]');
    var g;
    try { g = JSON.parse(data.textContent); } catch (e) { return; }
    if (!note || !g || !g.lines) return;
    var preview = data.hasAttribute('data-preview');
    var seen = !preview && hasPlayed(date);
    var meet = meetText(g, deviceToday());
    if (meet) note.insertBefore(el('p', 'meet', meet), note.firstChild);
    var button = el('button', 'replay', 'Play again');
    button.type = 'button';
    note.appendChild(button);
    function reveal() {
      note.classList.remove('game-reveal');
      void note.offsetWidth;
      note.classList.add('game-reveal');
      note.hidden = false;
    }
    function play() {
      note.hidden = true;
      try {
        createGame(g, note, function () {
          if (!preview) remember(date);
          button.textContent = 'Play again';
          reveal();
        });
      } catch (e) {
        // If the game cannot start, never leave the note hidden behind a frozen card.
        var stray = note.previousElementSibling;
        if (stray && stray.classList.contains('game-card')) stray.parentNode.removeChild(stray);
        button.hidden = true;
        reveal();
      }
    }
    button.addEventListener('click', play);
    if (!note.classList.contains('note')) return;
    if (!reduce && !seen) play();
    else if (!seen) button.textContent = 'Play';
  });
})();
</script>`;
