import { describe, it, expect } from 'vitest';
import { planDesk, planPage, plansAdmin, PLAN_SCRIPT, DESK_SCRIPT } from '../worker/plans-views';
import { markPlanRead, type Plan } from '../worker/plans';

const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const plan = (n: number, extra: Partial<Plan> = {}): Plan => ({
  id: id(n), title: `Plan <${n}>`, line: `Line "${n}"`, ready: true, created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z', markdown: '## One\n\nText.', ...extra,
});
const desk = (plans: Plan[], read = [] as ReturnType<typeof markPlanRead>, open = false) =>
  planDesk({ plans, read, home: '/for-you/reading-room', open, docBase: '/for-you/reading-room/plans' });

describe('the desk', () => {
  it('is absent with only drafts', () => {
    expect(desk([plan(1, { ready: false })])).toBe('');
  });
  it('lists only ready documents, in order, escaped, each linking to its page', () => {
    const html = desk([plan(2), plan(1, { ready: false }), plan(3)]);
    expect(html).toContain('href="/for-you/reading-room?open=plans"');
    expect(html.indexOf(`/plans/${id(2)}`)).toBeLessThan(html.indexOf(`/plans/${id(3)}`));
    expect(html).not.toContain(id(1));
    expect(html).toContain('Plan &lt;2&gt;');
    expect(html).toContain('Line &quot;2&quot;');
    expect(html).toContain('<div class="plans-wrap" id="sheet-plans" hidden>');
    expect(desk([plan(2)], [], true)).toContain('<div class="plans-wrap" id="sheet-plans">');
    expect(html).toContain('Things I worked out for us.');
  });
  it('marks new, updated and read, with a dot while something waits', () => {
    const p = plan(1);
    expect(desk([p])).toContain('NEW');
    expect(desk([p])).toContain('class="desk-item new"');
    const read = markPlanRead([], p, '2026-01-02T00:00:00.000Z');
    expect(desk([p], read)).toContain('READ');
    expect(desk([p], read)).toContain('class="desk-item"');
    expect(desk([{ ...p, updated: '2026-01-03T00:00:00.000Z' }], read)).toContain('UPDATED');
  });
  it('uses its own class names, so the bookshelf styles never tip its label on its side', () => {
    const html = desk([plan(1)]);
    expect(html).toContain('class="folder-name"');
    expect(html).not.toMatch(/class="(title|hint)"/);
  });

  it('carries its own script', () => {
    expect(desk([plan(1)])).toContain(DESK_SCRIPT);
  });
});

describe('a document page', () => {
  const page = (p: Plan, preview = false) => planPage({ plan: p, back: '/for-you', preview });
  it('shows the title once, with its letter touches and ways back', () => {
    const html = page(plan(1, { markdown: '# Plan <1>\n\nHello.' }));
    expect(html.match(/Plan &lt;1&gt;/g)!.length).toBeGreaterThanOrEqual(1);
    expect(html).not.toMatch(/<h1[^>]*>Plan &lt;1&gt;<\/h1>[\s\S]*<h1/);
    expect(html).toContain('For you');
    expect(html).toContain('href="/for-you/reading-room?open=plans"');
    expect(html).toContain('‹ Our plans');
    expect(html).toContain('Back to the top');
    expect(html).toContain('class="progress"');
    expect(html).toContain(PLAN_SCRIPT);
    expect(html).toContain(`data-id="${id(1)}"`);
    expect(html).toContain('data-version="2026-01-01T00:00:00.000Z"');
  });
  it('lists the contents only with three or more sections', () => {
    expect(page(plan(1, { markdown: '## A\n\n## B\n\n## C' }))).toContain('In this letter');
    expect(page(plan(1, { markdown: '## A\n\n## B\n\n## C' }))).toContain('href="#c"');
    expect(page(plan(1, { markdown: '## A\n\n## B' }))).not.toContain('In this letter');
  });
  it('goes back to admin from a preview', () => {
    const html = planPage({ plan: plan(1), back: '/for-you/admin/reading-room#plans', preview: true });
    expect(html).toContain('href="/for-you/admin/reading-room#plans"');
    expect(html).not.toContain('<form');
  });
  it('remembers the place per version, safely, and calms down for reduced motion', () => {
    expect(PLAN_SCRIPT).toContain("'plan-at-'");
    expect(PLAN_SCRIPT).toContain('try');
    expect(page(plan(1))).toContain('prefers-reduced-motion');
    expect(page(plan(1))).toContain('Continue where you left off');
  });
});

describe('admin', () => {
  const admin = (extra: Partial<Parameters<typeof plansAdmin>[0]> = {}) => plansAdmin({
    base: '/for-you', csrf: 'tok', plans: [plan(1), plan(2, { ready: false })],
    read: markPlanRead([], plan(1), '2026-01-02T10:00:00.000Z'), draft: { title: '', line: '', ready: false }, ...extra,
  });
  it('lists documents with ready state, reading, preview, edit, moves and delete', () => {
    const html = admin();
    expect(html).toContain('Ready');
    expect(html).toContain('Not ready');
    expect(html).toContain(`href="/for-you/admin/reading-room/plan/${id(1)}"`);
    expect(html).toContain(`href="/for-you/admin/reading-room?plan=${id(2)}#plans"`);
    expect(html).toContain('action="/for-you/admin/reading-room/plan/delete"');
    expect(html).toContain("confirm('Delete this document?')");
    const rows = html.split('<li>');
    const first = rows.find((r) => r.includes(`plan/${id(1)}"`))!;
    const last = rows.find((r) => r.includes(`plan/${id(2)}"`))!;
    expect(first).not.toContain('value="-1"');
    expect(last).not.toMatch(/name="by" value="1"/);
  });
  it('asks for the file only when adding, and keeps the ready box', () => {
    expect(admin()).toMatch(/name="file" accept="\.md,\.markdown,\.txt,text\/markdown,text\/plain" required/);
    expect(admin()).toContain('Ready for her');
    const editing = admin({ editing: plan(1), draft: { title: 'Plan 1', line: '', ready: true } });
    expect(editing).not.toMatch(/name="file"[^>]*required/);
    expect(editing).toMatch(/name="ready"[^>]*checked/);
    expect(editing).toContain(`<input type="hidden" name="id" value="${id(1)}">`);
  });
  it('shows an error and keeps what he typed', () => {
    const html = admin({ draft: { title: 'Kept <title>', line: 'Kept line', ready: true }, error: 'Bad file' });
    expect(html).toContain('Bad file');
    expect(html).toContain('value="Kept &lt;title&gt;"');
    expect(html).toMatch(/name="ready"[^>]*checked/);
  });
  it('has no em dash anywhere', () => {
    expect(admin() + desk([plan(1)]) + planPage({ plan: plan(1), back: '/for-you' })).not.toContain('—');
  });
});

describe('her picks in admin', () => {
  const doc = plan(1, { markdown: "## What I'll do\n\n- **A** x\n- **B** y", items: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] });
  const admin = (picks: { key: string; title: string }[]) => plansAdmin({
    base: '/for-you', csrf: 'tok', plans: [doc], read: [], draft: { title: '', line: '', ready: false },
    picks: [{ planId: doc.id, picks, at: '2026-01-02T00:00:00.000Z', changed: false }],
  });
  it('counts only picks still in the document', () => {
    const html = admin([{ key: 'a', title: 'A' }, { key: 'gone', title: 'Gone' }]);
    expect(html).toContain('She&#39;d like 1 of 2');
    expect(html).not.toContain('Gone');
  });
  it('uses the items counted at upload instead of reading the document again', () => {
    const html = plansAdmin({
      base: '/for-you', csrf: 'tok', plans: [{ ...doc, markdown: 'nothing here' }], read: [], draft: { title: '', line: '', ready: false }, picks: [],
    });
    expect(html).toContain("hasn't sent her picks yet");
  });
});
