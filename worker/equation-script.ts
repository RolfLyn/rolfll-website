import { CURVE_NAMES, CURVE_MATH_JS, fitFor, fourierSeries, FILL_K, FILL_X, BUTTERFLY_TURNS, EQ_W, EQ_H } from './curves';

export const EQUATION_STYLE = `
.equation { margin: 1.75rem 0; }
.eq-math { overflow-x: auto; overflow-y: hidden; color: var(--ink); font-size: clamp(0.8rem, 3.9vw, 1.2rem); padding: 0.2rem 0 0.7rem; scrollbar-width: thin; }
.eq-panel { position: relative; aspect-ratio: 4 / 3; border-radius: 0.9rem; overflow: hidden; background: linear-gradient(180deg, #1f1530, #3b2752); box-shadow: 0 10px 30px rgba(58, 46, 40, 0.18); }
.eq-panel svg, .eq-panel canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.eq-panel svg path { fill: none; stroke: #e8c27a; stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(232, 194, 122, 0.7)); }
.eq-panel.live svg { visibility: hidden; }
.eq-counter { position: absolute; right: 0.8rem; bottom: 0.55rem; color: rgba(255, 243, 214, 0.75); font-style: italic; font-size: 1rem; }
.eq-again { display: block; margin: 0.6rem auto 0; background: none; border: 0; color: var(--muted); font-style: italic; font-size: 1rem; padding: 0.3rem; text-decoration: underline; cursor: pointer; }
.eq-again[hidden] { display: none; }
.equation[data-curve="heart"] .eq-panel.done canvas { animation: eq-breathe 3.2s ease-in-out infinite; }
.archive .equation { max-width: 28rem; }
@keyframes eq-breathe { 50% { transform: scale(1.02); } }
`;

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

// Fixed numbers only: how each curve sits in the panel, and the Fourier terms. Nothing from a note.
function curveData(): string {
  const fits: Record<string, { scale: number; cx: number; cy: number }> = {};
  for (const name of CURVE_NAMES) {
    const f = fitFor(name);
    fits[name] = { scale: round(f.scale), cx: round(f.cx), cy: round(f.cy) };
  }
  const s = fourierSeries();
  return JSON.stringify({
    w: EQ_W, h: EQ_H, fillK: FILL_K, fillX: round(FILL_X), turns: BUTTERFLY_TURNS, fits,
    fourier: {
      center: { x: round(s.center.x), y: round(s.center.y) },
      terms: s.terms.map((t) => ({ n: t.n, re: round(t.re), im: round(t.im) })),
    },
  });
}

let script: string | null = null;

/** Draws each figure on a canvas once it is 40% in view; the still SVG stays wherever this can't run. */
export function equationScript(): string {
  if (script) return script;
  script = `<script>
(function () {
  if (!window.requestAnimationFrame || !window.IntersectionObserver) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var D = ${curveData()};
${CURVE_MATH_JS}
  var TAU = Math.PI * 2, FILL_SECONDS = 10, FADE_SECONDS = 1;
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(2 - 2 * p, 2) / 2; }
  function toPanel(p, fit) { return { x: D.w / 2 + (p.x - fit.cx) * fit.scale, y: D.h / 2 - (p.y - fit.cy) * fit.scale }; }
  function sample(f, from, to, steps, fit) {
    var pts = [];
    for (var i = 0; i <= steps; i++) pts.push(toPanel(f(from + (to - from) * i / steps), fit));
    return pts;
  }
  function glow(ctx) {
    ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(232, 194, 122, 0.75)'; ctx.shadowBlur = 8;
  }
  function line(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i].x, pts[i].y); else ctx.moveTo(pts[i].x, pts[i].y); }
    ctx.stroke();
  }
  function tip(ctx, p) {
    ctx.save(); ctx.fillStyle = '#fff3d6'; ctx.shadowColor = '#ffe7a8'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill(); ctx.restore();
  }
  // A curve that traces itself: the finished points, drawn up to the eased progress.
  function tracer(seconds, make) {
    return {
      setup: function () { return { pts: make() }; },
      frame: function (ctx, s, t) {
        var p = Math.min(1, t / seconds), n = Math.max(2, Math.round(ease(p) * (s.pts.length - 1)) + 1);
        glow(ctx); line(ctx, s.pts.slice(0, n));
        if (p < 1) tip(ctx, s.pts[n - 1]);
        return { done: p >= 1, counter: '' };
      }
    };
  }
  var CURVES = {
    'heart': tracer(6, function () { return sample(heartPoint, 0, TAU, 400, D.fits['heart']); }),
    'butterfly': tracer(12, function () { return sample(butterflyPoint, 0, D.turns * TAU, 2400, D.fits['butterfly']); }),
    'filling heart': {
      setup: function () { return {}; },
      frame: function (ctx, s, t) {
        var p = Math.min(1, t / FILL_SECONDS), k = D.fillK * ease(p), fit = D.fits['filling heart'];
        var steps = Math.max(300, Math.ceil(k * 16)), pts = [];
        for (var i = 0; i <= steps; i++) {
          var x = -D.fillX + 2 * D.fillX * i / steps;
          pts.push(toPanel({ x: x, y: fillingHeartY(x, k) }, fit));
        }
        glow(ctx); line(ctx, pts);
        return { done: p >= 1, counter: 'k = ' + k.toFixed(1) };
      }
    },
    'fourier heart': {
      // Round n draws one turn of the n largest circles; the rounds get quicker as circles join.
      setup: function () {
        var ends = [], at = 0;
        for (var n = 0; n < D.fourier.terms.length; n++) { at += 0.15 + 0.85 * Math.pow(0.85, n); ends.push(at); }
        return { ends: ends };
      },
      frame: function (ctx, s, t) {
        var f = D.fourier, fit = D.fits['fourier heart'], ends = s.ends, total = ends[ends.length - 1], round = 0;
        while (round < ends.length - 1 && t >= ends[round]) round++;
        var count = round + 1, from = round ? ends[round - 1] : 0;
        var within = t >= total ? 1 : (t - from) / (ends[round] - from);
        var fade = t >= total ? Math.min(1, (t - total) / FADE_SECONDS) : 0;
        function partial(terms, upto) {
          return sample(function (u) { return fourierPoint(f, terms, u); }, 0, upto * TAU, Math.max(2, Math.round(240 * upto)), fit);
        }
        if (count > 1 && within < 1) { ctx.globalAlpha = 0.3; glow(ctx); line(ctx, partial(count - 1, 1)); ctx.globalAlpha = 1; }
        glow(ctx); line(ctx, partial(count, within));
        if (fade < 1) {
          var angle = within * TAU, x = f.center.x, y = f.center.y;
          ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = 1 - fade;
          ctx.strokeStyle = 'rgba(255, 243, 214, 0.28)'; ctx.lineWidth = 0.8;
          for (var i = 0; i < count; i++) {
            var c = f.terms[i], o = toPanel({ x: x, y: y }, fit);
            ctx.beginPath(); ctx.arc(o.x, o.y, Math.sqrt(c.re * c.re + c.im * c.im) * fit.scale, 0, TAU); ctx.stroke();
            x += c.re * Math.cos(c.n * angle) - c.im * Math.sin(c.n * angle);
            y += c.re * Math.sin(c.n * angle) + c.im * Math.cos(c.n * angle);
            var e = toPanel({ x: x, y: y }, fit);
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.x, e.y); ctx.stroke();
          }
          ctx.restore();
          if (within < 1) tip(ctx, toPanel({ x: x, y: y }, fit));
        }
        return { done: fade >= 1, counter: 'n = ' + count };
      }
    }
  };
  function start(fig) {
    var curve = CURVES[fig.getAttribute('data-curve')];
    var panel = fig.querySelector('.eq-panel'), counter = fig.querySelector('.eq-counter'), again = fig.querySelector('.eq-again');
    var canvas = document.createElement('canvas'), ctx = canvas.getContext && canvas.getContext('2d');
    if (!curve || !ctx) return;
    panel.appendChild(canvas);
    var state = curve.setup(), begun = 0, elapsed = 0, done = false;
    function draw() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(panel.clientWidth * ratio), h = Math.round(w * D.h / D.w);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(w / D.w, 0, 0, w / D.w, 0, 0);
      ctx.clearRect(0, 0, D.w, D.h);
      var out = curve.frame(ctx, state, elapsed);
      counter.textContent = out.counter;
      return out.done;
    }
    function tick(now) {
      if (!begun) begun = now;
      elapsed = (now - begun) / 1000;
      done = draw();
      if (done) { panel.className = 'eq-panel live done'; again.hidden = false; }
      else { panel.className = 'eq-panel live'; requestAnimationFrame(tick); }
    }
    function play() { begun = 0; done = false; again.hidden = true; requestAnimationFrame(tick); }
    again.addEventListener('click', function () { if (done) play(); });
    window.addEventListener('resize', function () { if (done) draw(); });
    play();
  }
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) { io.unobserve(entries[i].target); start(entries[i].target.parentNode); }
    }
  }, { threshold: 0.4 });
  var figures = document.querySelectorAll('figure.equation');
  for (var i = 0; i < figures.length; i++) io.observe(figures[i].querySelector('.eq-panel'));
})();
</script>`;
  return script;
}
