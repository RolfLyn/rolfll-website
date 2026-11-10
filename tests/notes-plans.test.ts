import { describe, it, expect } from 'vitest';
import {
  parsePlans, parsePlansRead, upsertPlan, removePlan, movePlan, readyPlans, planStatus, plansWaiting, markPlanRead,
  parsePlanForm, readPlanFile, PLAN_LIMITS, sendPicks, parsePlanPicks, picksNew, type Plan,
} from '../worker/plans';

const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const plan = (n: number, ready = true, updated = '2026-01-01T00:00:00.000Z'): Plan => ({
  id: id(n), title: `Plan ${n}`, line: '', ready, created: '2026-01-01T00:00:00.000Z', updated, markdown: `# Plan ${n}\n\nText.`,
});
const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? '';

describe('plans', () => {
  it('reads in stored order and throws on corrupt data', () => {
    expect(parsePlans(JSON.stringify([plan(2), plan(1)])).map((p) => p.id)).toEqual([id(2), id(1)]);
    expect(parsePlans(null)).toEqual([]);
    expect(() => parsePlans('{ nope')).toThrow();
    expect(() => parsePlans(JSON.stringify([{ id: 'x' }]))).toThrow();
  });
  it('puts a new plan on top and keeps an edited one in place', () => {
    let plans = upsertPlan(upsertPlan([], plan(1)), plan(2));
    expect(plans.map((p) => p.id)).toEqual([id(2), id(1)]);
    plans = upsertPlan(plans, { ...plan(1), title: 'Renamed' });
    expect(plans.map((p) => p.title)).toEqual(['Plan 2', 'Renamed']);
    expect(removePlan(plans, id(2)).map((p) => p.id)).toEqual([id(1)]);
  });
  it('moves up and down, not past the ends', () => {
    const plans = [plan(1), plan(2), plan(3)];
    expect(movePlan(plans, id(2), -1).map((p) => p.id)).toEqual([id(2), id(1), id(3)]);
    expect(movePlan(plans, id(2), 1).map((p) => p.id)).toEqual([id(1), id(3), id(2)]);
    expect(movePlan(plans, id(1), -1)).toEqual(plans);
    expect(movePlan(plans, id(3), 1)).toEqual(plans);
  });
  it('shows her only ready plans', () => {
    expect(readyPlans([plan(1, false), plan(2)]).map((p) => p.id)).toEqual([id(2)]);
  });
  it('knows what is new, updated or read', () => {
    const p = plan(1);
    expect(planStatus(p, [])).toBe('new');
    const read = markPlanRead([], p, '2026-01-02T00:00:00.000Z');
    expect(read).toEqual([{ id: id(1), at: '2026-01-02T00:00:00.000Z', version: p.updated }]);
    expect(planStatus(p, read)).toBe('read');
    expect(planStatus({ ...p, updated: '2026-01-03T00:00:00.000Z' }, read)).toBe('updated');
    expect(markPlanRead(read, { ...p, updated: '2026-01-03T00:00:00.000Z' }, '2026-01-04T00:00:00.000Z')).toHaveLength(1);
  });
  it('waits for her only on ready plans', () => {
    expect(plansWaiting([plan(1, false)], [])).toBe(false);
    expect(plansWaiting([plan(1)], [])).toBe(true);
    expect(plansWaiting([plan(1)], markPlanRead([], plan(1), '2026-01-02T00:00:00.000Z'))).toBe(false);
  });
  it('reads what she has read, dropping bad rows', () => {
    expect(parsePlansRead(null)).toEqual([]);
    expect(parsePlansRead(JSON.stringify([{ id: id(1), at: '2026-01-02T00:00:00.000Z', version: '2026-01-01T00:00:00.000Z' }, { id: 3 }]))).toHaveLength(1);
    expect(() => parsePlansRead('{ nope')).toThrow();
  });
});

describe('the form and the file', () => {
  it('needs a title, keeps lines to one line, and reads the ready box', () => {
    expect(parsePlanForm(form({ title: ' A plan ', line: 'one\ntwo', ready: 'on' })).draft).toEqual({ title: 'A plan', line: 'one two', ready: true });
    expect(parsePlanForm(form({ title: 'x' })).draft.ready).toBe(false);
    expect(parsePlanForm(form({ title: '' })).error).toBeTruthy();
    expect(parsePlanForm(form({ title: 'x'.repeat(PLAN_LIMITS.title + 1) })).error).toBeTruthy();
    expect(parsePlanForm(form({ title: 'x', line: 'y'.repeat(PLAN_LIMITS.line + 1) })).error).toBeTruthy();
  });
  it('accepts a Markdown file, dropping a BOM and Windows line ends', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# Hi\r\n\r\nÆble')]);
    const r = await readPlanFile(new File([bytes], 'plan.md', { type: '' }));
    expect(r).toEqual({ ok: true, markdown: '# Hi\n\nÆble' });
  });
  it('refuses big files, files that are not UTF-8 text, and other kinds of file', async () => {
    const big = await readPlanFile(new File([new Uint8Array(PLAN_LIMITS.bytes + 1).fill(65)], 'big.md'));
    expect(big.ok).toBe(false);
    const bad = await readPlanFile(new File([new Uint8Array([0xff, 0xfe, 0xfd])], 'bad.md'));
    expect(bad.ok === false && bad.error).toMatch(/isn't UTF-8 text/);
    expect((await readPlanFile(new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' }))).ok).toBe(false);
    expect((await readPlanFile(new File([new TextEncoder().encode('hi')], 'notes.txt', { type: 'text/plain' }))).ok).toBe(true);
  });
});

describe('her picks', () => {
  const items = [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }, { key: 'c', title: 'C' }];
  it('saves what she ticked, in his order, and ignores anything unknown', () => {
    const all = sendPicks([], id(1), items, ['a', 'b', 'c'], ['c', 'a', 'zzz'], '2026-01-02T00:00:00.000Z');
    expect(all).toEqual([{ planId: id(1), picks: [items[0], items[2]], at: '2026-01-02T00:00:00.000Z', changed: false }]);
  });
  it('keeps picks from a list she did not send, and marks a resend as changed', () => {
    const first = sendPicks([], id(1), items, ['a', 'b', 'c'], ['a', 'c'], '2026-01-02T00:00:00.000Z');
    const second = sendPicks(first, id(1), items, ['b', 'c'], ['b'], '2026-01-03T00:00:00.000Z');
    expect(second[0].picks.map((p) => p.key)).toEqual(['a', 'b']);
    expect(second[0].changed).toBe(true);
  });
  it('reads stored picks, dropping bad rows, and knows when something is new to him', () => {
    expect(parsePlanPicks(null)).toEqual([]);
    expect(parsePlanPicks(JSON.stringify([{ planId: id(1), picks: [{ key: 'a', title: 'A' }], at: '2026-01-02T00:00:00.000Z', changed: false }, { x: 1 }]))).toHaveLength(1);
    expect(() => parsePlanPicks('{ nope')).toThrow();
    const all = sendPicks([], id(1), items, ['a'], ['a'], '2026-01-02T00:00:00.000Z');
    expect(picksNew(all, null)).toBe(true);
    expect(picksNew(all, '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(picksNew(all, '2026-01-02T00:00:00.000Z')).toBe(false);
    expect(picksNew([], null)).toBe(false);
  });
});
