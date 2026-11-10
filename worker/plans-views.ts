import { escapeHtml, shell, READER_FONTS } from './views';
import { renderMarkdown, type PickOptions } from './markdown';
import { readyPlans, planStatus, plansWaiting, PLAN_LIMITS, type Plan, type PlanRead, type PlanDraft, type PlanPicks } from './plans';

const CAVEAT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap">';

const DESK_STYLE = `
.desk { position: relative; margin: 3rem 0 0; }
.desk .glow { position: absolute; left: 8%; top: -4.5rem; width: 15rem; max-width: 80%; height: 11rem; background: radial-gradient(ellipse, rgba(255, 196, 120, 0.28), rgba(255, 196, 120, 0) 70%); pointer-events: none; }
.desk-item { position: relative; display: block; max-width: 22rem; margin: 0 auto; color: #e6d3b3; text-align: center; text-decoration: none; -webkit-tap-highlight-color: transparent; }
.desk-item:focus-visible { outline: 2px solid #f0d29a; outline-offset: 4px; }
.desk-top { position: relative; display: block; height: 9.5rem; }
.lamp { position: absolute; left: 1.4rem; bottom: 0; width: 4.4rem; height: 7.5rem; }
.lamp .shade { position: absolute; left: 0; top: 0; width: 4.4rem; height: 2.1rem; background: linear-gradient(#2f5a46, #1f3f31); border-radius: 2.2rem 2.2rem 0.4rem 0.4rem; box-shadow: 0 0.6rem 1.1rem rgba(255, 200, 120, 0.35); }
.lamp .shade::after { content: ''; position: absolute; left: 0.5rem; right: 0.5rem; bottom: -0.25rem; height: 0.3rem; border-radius: 0.2rem; background: #ffe2a8; box-shadow: 0 0 0.9rem #ffd27a; }
.lamp .stem { position: absolute; left: 2.05rem; top: 2.1rem; width: 0.25rem; height: 4.8rem; background: linear-gradient(90deg, #d9b26a, #9c7a3f); }
.lamp .foot { position: absolute; left: 0.9rem; bottom: 0; width: 2.6rem; height: 0.6rem; border-radius: 0.4rem 0.4rem 0.1rem 0.1rem; background: linear-gradient(#d9b26a, #8f6d35); }
.ink { position: absolute; left: 6.9rem; bottom: 0.1rem; width: 1.4rem; height: 1.1rem; border-radius: 0.25rem 0.25rem 0.4rem 0.4rem; background: #1b2633; box-shadow: inset 0 0.2rem 0 #2c3e52; }
.ink::before { content: ''; position: absolute; left: 0.4rem; top: -0.3rem; width: 0.6rem; height: 0.4rem; background: #3a2a1c; border-radius: 0.1rem; }
.pen { position: absolute; left: 6.2rem; bottom: 0.4rem; width: 4rem; height: 0.38rem; border-radius: 0.2rem; background: linear-gradient(90deg, #1b1b1b 0 75%, #d9b26a 75% 80%, #1b1b1b 80%); transform: rotate(-14deg); }
.folder { position: absolute; right: 1rem; bottom: 0.15rem; width: 9.4rem; height: 6.5rem; border-radius: 0.25rem 0.45rem 0.45rem 0.25rem; background: linear-gradient(135deg, #8a5a34, #5c3a20); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.06), inset 0.4rem 0 0 #4a2e18, 0 0.4rem 0.8rem rgba(0, 0, 0, 0.5); transform: rotate(-4deg); }
.folder .stitch { position: absolute; inset: 0.45rem 0.45rem 0.45rem 0.8rem; border: 1px dashed rgba(242, 200, 121, 0.45); border-radius: 0.2rem; }
.folder .ribbon { position: absolute; top: 0; bottom: 0; left: 80%; width: 0.45rem; background: #b0645a; }
.folder .knot { position: absolute; left: calc(80% - 0.55rem); top: 2.6rem; width: 1.55rem; height: 1.1rem; border-radius: 50%; border: 0.25rem solid #b0645a; }
.folder .folder-name { position: absolute; left: 1.1rem; top: 2.1rem; font-family: 'Caveat', cursive; font-size: 1.45rem; color: #f2c879; transform: rotate(-2deg); }
.desk-surface { display: block; height: 0.9rem; background: linear-gradient(#8a6040, #5e3f27); border-radius: 3px; box-shadow: 0 6px 0 #2e1f14; }
.desk-under { position: relative; display: flex; justify-content: space-between; height: 4.4rem; padding: 0 1rem; }
.desk-under i { width: 0.6rem; background: linear-gradient(90deg, #4a3220, #33221a); }
.desk-under .drawer { position: absolute; left: 50%; top: 0.4rem; width: 7.5rem; height: 1.6rem; margin-left: -3.75rem; background: #3b281a; border-radius: 0 0 0.25rem 0.25rem; }
.desk-under .drawer::after { content: ''; position: absolute; left: 50%; top: 0.6rem; width: 0.9rem; height: 0.25rem; margin-left: -0.45rem; border-radius: 0.15rem; background: #d9b26a; }
.desk-item .name { display: block; margin-top: 0.4rem; font-style: italic; font-size: 1.1rem; }
.desk-item.new .name::after { content: ''; display: inline-block; width: 0.42rem; height: 0.42rem; margin-left: 0.45rem; border-radius: 50%; background: #f2c879; box-shadow: 0 0 8px #f2c879; vertical-align: middle; }
.plans-wrap { position: fixed; inset: 0; z-index: 3; display: flex; align-items: flex-end; justify-content: center; padding: 0 0.5rem; background: rgba(15, 10, 8, 0.6); }
.plans-wrap[hidden] { display: none; }
.plans-sheet { width: 100%; max-width: 32rem; max-height: 88vh; overflow-y: auto; padding: 1.3rem 1.2rem calc(1.3rem + env(safe-area-inset-bottom, 0px)); border-radius: 1.2rem 1.2rem 0 0; background: #fbf5ea; color: #3a2e28; }
.plans-sheet h2 { margin: 0; font-weight: 500; font-size: 1.6rem; }
.plans-sheet .lead { margin: 0.2rem 0 1rem; color: #8c7b6c; font-style: italic; }
.letter { position: relative; display: block; margin: 0 0 0.75rem; padding: 0.85rem 0.9rem 0.85rem 1.1rem; background: #fffdf8; border: 1px solid #eadfcb; border-radius: 0.4rem; box-shadow: 0 2px 6px rgba(80, 50, 20, 0.08); color: inherit; text-decoration: none; }
.letter::before { content: ''; position: absolute; left: 0; top: 0.6rem; bottom: 0.6rem; width: 3px; border-radius: 2px; background: #b0645a; }
.letter b { display: block; font-weight: 600; font-size: 1.25rem; }
.letter span { display: block; color: #6d5d50; }
.letter small { display: block; margin-top: 0.35rem; font-size: 0.8rem; letter-spacing: 0.08em; color: #a08f7e; }
.letter.new small, .letter.updated small { color: #b0645a; }
.plans-close { display: block; margin: 1rem auto 0; text-align: center; font-style: italic; font-size: 1.1rem; color: #8c7b6c; }
`;

export const DESK_SCRIPT = `<script>
(function () {
  var wrap = document.getElementById('sheet-plans');
  if (!wrap) return;
  function show(e) { if (e) e.preventDefault(); wrap.hidden = false; }
  function hide(e) { if (e) e.preventDefault(); wrap.hidden = true; }
  var item = document.querySelector('.desk-item');
  if (item) item.addEventListener('click', show);
  var close = wrap.querySelector('.plans-close');
  if (close) close.addEventListener('click', hide);
  wrap.addEventListener('click', function (e) { if (e.target === wrap) hide(e); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wrap.hidden) hide(); });
})();
</script>`;

const MARKER = { new: 'NEW', updated: 'UPDATED', read: 'READ' };

export function planDesk({ plans, read, home, open, docBase }: {
  plans: Plan[]; read: PlanRead[]; home: string; open: boolean; docBase: string;
}): string {
  const ready = readyPlans(plans);
  if (!ready.length) return '';
  const letters = ready.map((p) => {
    const status = planStatus(p, read);
    return `<a class="letter ${status}" href="${escapeHtml(`${docBase}/${p.id}`)}"><b>${escapeHtml(p.title)}</b>${p.line ? `<span>${escapeHtml(p.line)}</span>` : ''}<small>${MARKER[status]}</small></a>`;
  }).join('\n');
  return `${CAVEAT}<style>${DESK_STYLE}</style>
<section class="desk">
<div class="glow"></div>
<a class="desk-item${plansWaiting(plans, read) ? ' new' : ''}" href="${escapeHtml(`${home}?open=plans`)}">
<span class="desk-top"><span class="lamp"><span class="shade"></span><span class="stem"></span><span class="foot"></span></span><span class="ink"></span><span class="pen"></span><span class="folder"><span class="stitch"></span><span class="ribbon"></span><span class="knot"></span><span class="folder-name">Our plans</span></span></span>
<span class="desk-surface"></span>
<span class="desk-under"><i></i><span class="drawer"></span><i></i></span>
<span class="name">Our plans</span>
</a>
</section>
<div class="plans-wrap" id="sheet-plans"${open ? '' : ' hidden'}><article class="plans-sheet" role="dialog" aria-label="Our plans">
<h2>Our plans</h2>
<p class="lead">Things I worked out for us.</p>
${letters}
<a class="plans-close" href="${escapeHtml(home)}">Close</a>
</article></div>
${DESK_SCRIPT}`;
}

const PAPER = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.8' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .3 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")";

const PAGE_STYLE = `
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #efe6d6; color: #3a2e28; font-family: 'Cormorant Garamond', Georgia, serif; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
.progress { position: fixed; left: 0; top: 0; right: 0; height: 3px; z-index: 2; pointer-events: none; }
.progress i { display: block; width: 0; height: 100%; background: linear-gradient(90deg, #d9b26a, #f2c879); }
.wrap { max-width: 40rem; margin: 0 auto; padding: 1rem 0.75rem 3rem; }
.back { display: inline-block; margin: 0.4rem 0.4rem 0.8rem; color: #8c7b6c; font-style: italic; font-size: 1.1rem; text-decoration: none; }
.paper { padding: 1.6rem 1.35rem 2rem; background: #fbf5ea ${PAPER}; border-radius: 0.3rem; box-shadow: 0 0.4rem 1.2rem rgba(80, 50, 20, 0.18); font-size: 1.2rem; line-height: 1.55; overflow-wrap: break-word; }
.from { margin: 0; font-family: 'Caveat', cursive; font-size: 1.4rem; color: #b0645a; }
.paper > h1.title { margin: 0.1rem 0 0.3rem; font-weight: 500; font-size: 2rem; line-height: 1.15; }
.ornament { margin: 0.4rem 0 1rem; text-align: center; color: #c9a46a; letter-spacing: 0.4em; }
.continue { display: block; margin: 0 auto 1rem; padding: 0.5rem 1.1rem; border: 1px solid #c9a46a; border-radius: 999px; background: #f3e7d1; color: #7a3f34; font: italic 1.05rem 'Cormorant Garamond', Georgia, serif; cursor: pointer; }
.continue[hidden] { display: none; }
.contents { margin: 0 0 1.4rem; padding: 0.8rem 1rem; background: #f6ecdb; border-radius: 0.4rem; }
.contents p { margin: 0 0 0.3rem; font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: #a08f7e; }
.contents ol { margin: 0; padding-left: 1.3rem; }
.contents li::marker { color: #b0645a; }
.contents a { color: #3a2e28; text-decoration: none; }
.doc h1, .doc h2, .doc h3, .doc h4 { scroll-margin-top: 1rem; line-height: 1.2; }
.doc h1 { font-weight: 500; font-size: 1.8rem; margin: 1.6rem 0 0.4rem; }
.doc h2 { font-weight: 600; font-size: 1.45rem; margin: 1.8rem 0 0.4rem; color: #7a3f34; }
.doc h3 { font-weight: 600; font-size: 1.2rem; margin: 1.3rem 0 0.3rem; }
.doc p { margin: 0.55rem 0; }
.doc ul, .doc ol { margin: 0.55rem 0; padding-left: 1.4rem; }
.doc li { margin: 0.25rem 0; }
.doc li::marker { color: #b0645a; }
.doc li:has(> .box), .doc li:has(> p > .box) { list-style: none; margin-left: -1.2rem; }
.box { display: inline-block; width: 0.95rem; height: 0.95rem; margin-right: 0.35rem; border: 1.5px solid #b0645a; border-radius: 0.2rem; vertical-align: -0.1rem; }
.box.done { background: #b0645a; box-shadow: inset 0 0 0 2px #fbf5ea; }
.doc blockquote { margin: 0.9rem 0; padding: 0.6rem 0.9rem; background: #f3e7d1; border-left: 3px solid #c9a46a; border-radius: 0 0.4rem 0.4rem 0; font-style: italic; }
.doc blockquote p { margin: 0.2rem 0; }
.doc hr { border: 0; margin: 1.4rem 0; text-align: center; }
.doc hr::after { content: '\\2726 \\2726 \\2726'; color: #c9a46a; letter-spacing: 0.4em; }
.doc .table { margin: 0.8rem 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.doc table { border-collapse: collapse; min-width: 100%; font-size: 1.05rem; }
.doc th { text-align: left; font-weight: 600; border-bottom: 1.5px solid #c9a46a; padding: 0.3rem 0.5rem; white-space: nowrap; }
.doc td { border-bottom: 1px solid #eadfcb; padding: 0.3rem 0.5rem; vertical-align: top; }
.doc code { padding: 0.05rem 0.3rem; background: #f1e6d3; border-radius: 0.25rem; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.85em; }
.doc pre { padding: 0.7rem 0.9rem; background: #f1e6d3; border-radius: 0.4rem; overflow-x: auto; }
.doc pre code { padding: 0; background: none; }
.doc a { color: #7a3f34; text-decoration-color: #c9a46a; text-underline-offset: 0.15em; }
.doc del { color: #8c7b6c; }
.doc .alt { color: #8c7b6c; font-style: italic; }
.doc .footnotes { margin-top: 2rem; padding-top: 0.6rem; border-top: 1px solid #eadfcb; font-size: 1rem; color: #6d5d50; }
.doc .footnotes h2 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.doc sup a { text-decoration: none; padding: 0 0.1rem; }
.picks { margin: 0.8rem 0 1rem; }
.pick-list { list-style: none; margin: 0; padding: 0; }
.doc .pick-list { padding-left: 0; }
.doc .pick-list li { margin: 0 0 0.6rem; }
.pick { position: relative; display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.75rem 0.85rem; background: #fffdf8; border: 1px solid #eadfcb; border-radius: 0.6rem; box-shadow: 0 2px 6px rgba(80, 50, 20, 0.06); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: border-color 0.2s, box-shadow 0.2s; }
.pick input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pick .heart { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; margin-top: 0.1rem; background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z' fill='none' stroke='%23b0645a' stroke-width='1.6'/%3E%3C/svg%3E"); }
.pick-body p { margin: 0; }
.pick:has(input:checked) { border-color: #d9b26a; box-shadow: 0 0 0 2px rgba(217, 178, 106, 0.55), 0 2px 8px rgba(80, 50, 20, 0.1); background: #fff8ea; }
.pick input:checked ~ .heart { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z' fill='%23b0645a' stroke='%23b0645a' stroke-width='1.6'/%3E%3C/svg%3E"); }
.pick input:focus-visible ~ .heart { outline: 2px solid #d9b26a; outline-offset: 3px; border-radius: 50%; }
.pick input:disabled ~ .heart { opacity: 0.6; }
.pick-send { display: block; margin: 1rem auto 0; padding: 0.65rem 1.6rem; border: 0; border-radius: 999px; background: #b0645a; color: #fbf5ea; font: 600 1.15rem 'Cormorant Garamond', Georgia, serif; cursor: pointer; }
.pick-sent { margin: 0.7rem 0 0; text-align: center; font-family: 'Caveat', cursive; font-size: 1.45rem; color: #b0645a; }
.end { display: flex; justify-content: space-between; gap: 1rem; margin: 1.4rem 0.4rem 0; }
.end a { color: #8c7b6c; font-style: italic; font-size: 1.1rem; text-decoration: none; }
`;

export const PLAN_SCRIPT = `<script>
(function () {
  var paper = document.querySelector('.paper');
  var bar = document.querySelector('.progress i');
  var cont = document.querySelector('.continue');
  if (!paper) return;
  var key = 'plan-at-' + paper.getAttribute('data-id') + '-' + paper.getAttribute('data-version');
  var saved = 0;
  try { saved = parseInt(window.localStorage.getItem(key), 10) || 0; } catch (e) {}
  if (cont && saved > window.innerHeight) {
    cont.hidden = false;
    cont.addEventListener('click', function () { window.scrollTo(0, saved); cont.hidden = true; });
  }
  var timer = null;
  function update() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var room = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (room > 0 ? Math.min(100, Math.max(0, y / room * 100)) : 100) + '%';
    if (cont && y > window.innerHeight) cont.hidden = true;
    clearTimeout(timer);
    timer = setTimeout(function () { try { window.localStorage.setItem(key, String(Math.round(y))); } catch (e) {} }, 300);
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
</script>`;

export function planPage({ plan, back, preview = false, picks }: {
  plan: Plan; back: string; preview?: boolean;
  /** Her "What I'll do" form; without it (a preview) the cards show but cannot be sent. */
  picks?: PickOptions;
}): string {
  const { html, headings } = renderMarkdown(plan.markdown, plan.title, picks ?? { chosen: [] });
  const backTo = preview ? back : `${back}/reading-room?open=plans`;
  const contents = headings.length >= 3
    ? `<nav class="contents"><p>In this letter</p><ol>${headings.map((h) => `<li><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>`
    : '';
  return shell(plan.title, PAGE_STYLE, `<div class="progress" aria-hidden="true"><i></i></div>
<div class="wrap" id="top">
<a class="back" href="${escapeHtml(backTo)}">‹ Our plans</a>
<article class="paper" data-id="${escapeHtml(plan.id)}" data-version="${escapeHtml(plan.updated)}">
<p class="from">For you</p>
<h1 class="title">${escapeHtml(plan.title)}</h1>
<div class="ornament" aria-hidden="true">&#10022; &#10022; &#10022;</div>
<button class="continue" type="button" hidden>Continue where you left off</button>
${contents}
<div class="doc">
${html}
</div>
</article>
<div class="end"><a href="#top">Back to the top</a><a href="${escapeHtml(backTo)}">‹ Our plans</a></div>
</div>
${PLAN_SCRIPT}`, `${READER_FONTS}\n${CAVEAT}`);
}

export function plansAdmin(d: {
  base: string; csrf: string; plans: Plan[]; read: PlanRead[]; draft: PlanDraft; editing?: Plan; error?: string;
  picks?: PlanPicks[];
}): string {
  const asked = (p: Plan) => {
    const total = renderMarkdown(p.markdown, p.title).items.length;
    if (!total) return '';
    const sent = d.picks?.find((x) => x.planId === p.id);
    if (!sent) return '<p class="hint">What I\'ll do: she hasn\'t sent her picks yet.</p>';
    const when = new Date(sent.at).toISOString().slice(0, 10);
    return `<p class="text"><strong>${escapeHtml(`She'd like ${sent.picks.length} of ${total}`)}</strong> <span class="hint">sent ${escapeHtml(when)}${sent.changed ? ', changed' : ''}</span></p>
  ${sent.picks.length ? `<ul class="asked">${sent.picks.map((x) => `<li>${escapeHtml(x.title)}</li>`).join('')}</ul>` : ''}`;
  };
  const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(d.csrf)}">`;
  const at = (path: string) => escapeHtml(`${d.base}/admin/reading-room${path}`);
  const idField = (id: string) => `<input type="hidden" name="id" value="${escapeHtml(id)}">`;
  const rows = d.plans.map((p, i) => {
    const r = d.read.find((x) => x.id === p.id);
    const reading = !p.ready ? '' : !r ? ' · Not opened yet' : planStatus(p, d.read) === 'updated'
      ? ` · Read an earlier version ${escapeHtml(new Date(r.at).toISOString().slice(0, 10))}`
      : ` · Read ${escapeHtml(new Date(r.at).toISOString().slice(0, 10))}`;
    return `<li>
  <div class="meta">
    <span><strong>${escapeHtml(p.title)}</strong> · ${p.ready ? 'Ready' : 'Not ready'}${reading}</span>
    <span class="actions">
      <a href="${at(`/plan/${p.id}`)}">Preview</a>
      <a href="${at(`?plan=${p.id}#plans`)}">Edit</a>
      ${i > 0 ? `<form method="post" action="${at('/plan/move')}">${csrf}${idField(p.id)}<input type="hidden" name="by" value="-1"><button type="submit">Up</button></form>` : ''}
      ${i < d.plans.length - 1 ? `<form method="post" action="${at('/plan/move')}">${csrf}${idField(p.id)}<input type="hidden" name="by" value="1"><button type="submit">Down</button></form>` : ''}
      <form method="post" action="${at('/plan/delete')}" onsubmit="return confirm('Delete this document?')">${csrf}${idField(p.id)}<button type="submit">Delete</button></form>
    </span>
  </div>
  ${p.line ? `<p class="text">${escapeHtml(p.line)}</p>` : ''}
  ${asked(p)}
</li>`;
  }).join('\n');
  const e = d.editing;
  return `
<h2 id="plans">${e ? 'Edit document' : 'Add a document to Our plans'}</h2>
${d.error ? `<p class="error">${escapeHtml(d.error)}</p>` : ''}
<form class="write" method="post" enctype="multipart/form-data" action="${at('/plan/save')}">
  ${csrf}
  ${e ? idField(e.id) : ''}
  <input name="title" maxlength="${PLAN_LIMITS.title}" required placeholder="Title" value="${escapeHtml(d.draft.title)}">
  <input name="line" maxlength="${PLAN_LIMITS.line}" placeholder="A line from you (optional)" value="${escapeHtml(d.draft.line)}">
  <label class="file">Markdown file<input type="file" name="file" accept=".md,.markdown,.txt,text/markdown,text/plain"${e ? '' : ' required'}></label>
  <p class="hint">Save from Typora as .md, up to ${PLAN_LIMITS.bytes / 1024} KB.${e ? ' Leave empty to keep the current file.' : ''}</p>
  <label><input type="checkbox" name="ready"${d.draft.ready ? ' checked' : ''}> Ready for her</label>
  <p class="hint">Until this is ticked she can't see it at all.</p>
  <button type="submit">Save</button>
</form>
<h2>Our plans</h2>
<ul>${rows || '<li>No documents yet.</li>'}</ul>`;
}
