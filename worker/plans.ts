// "Our plans": documents he writes in Markdown to help her, kept in a leather folder on the reading room's desk.
// A plan stays hidden from her until he marks it ready.

export const PLAN_LIMITS = { title: 120, line: 200, bytes: 200 * 1024 };
export const PLAN_INVALID = `A document needs a title of up to ${PLAN_LIMITS.title} characters, and a line of up to ${PLAN_LIMITS.line}.`;
export const PLAN_FILE_NEEDED = 'A new document needs its Markdown file.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Plan {
  id: string;
  title: string;
  /** His optional line about it; may be empty. */
  line: string;
  ready: boolean;
  created: string;
  /** Changes only when a new file is uploaded. */
  updated: string;
  markdown: string;
}

export interface PlanRead { id: string; at: string; version: string }
export interface PlanDraft { title: string; line: string; ready: boolean }
export type PlanStatus = 'new' | 'updated' | 'read';

const isTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isPlan(v: unknown): v is Plan {
  return isRecord(v) && typeof v.id === 'string' && UUID.test(v.id) &&
    typeof v.title === 'string' && v.title.trim() !== '' && v.title.length <= PLAN_LIMITS.title &&
    typeof v.line === 'string' && v.line.length <= PLAN_LIMITS.line && typeof v.ready === 'boolean' &&
    isTime(v.created) && isTime(v.updated) && typeof v.markdown === 'string';
}

export function parsePlans(raw: string | null): Plan[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isPlan)) throw new Error('Stored plans are invalid');
  if (new Set(data.map((p) => p.id)).size !== data.length) throw new Error('Stored plans repeat an id');
  return data.map((p) => ({
    id: p.id, title: p.title, line: p.line, ready: p.ready, created: p.created, updated: p.updated, markdown: p.markdown,
  }));
}

export function parsePlansRead(raw: string | null): PlanRead[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored plan reads are not a list');
  return data
    .filter((r): r is PlanRead => isRecord(r) && typeof r.id === 'string' && isTime(r.at) && isTime(r.version))
    .map((r) => ({ id: r.id, at: r.at, version: r.version }));
}

/** A new plan goes on top; an edited one keeps its place. */
export function upsertPlan(plans: Plan[], plan: Plan): Plan[] {
  return plans.some((p) => p.id === plan.id) ? plans.map((p) => (p.id === plan.id ? plan : p)) : [plan, ...plans];
}

export function removePlan(plans: Plan[], id: string): Plan[] {
  return plans.filter((p) => p.id !== id);
}

export function movePlan(plans: Plan[], id: string, by: -1 | 1): Plan[] {
  const at = plans.findIndex((p) => p.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= plans.length) return plans;
  const next = [...plans];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

export const readyPlans = (plans: Plan[]): Plan[] => plans.filter((p) => p.ready);

export function planStatus(plan: Plan, read: PlanRead[]): PlanStatus {
  const row = read.find((r) => r.id === plan.id);
  if (!row) return 'new';
  return Date.parse(plan.updated) > Date.parse(row.version) ? 'updated' : 'read';
}

export function plansWaiting(plans: Plan[], read: PlanRead[]): boolean {
  return readyPlans(plans).some((p) => planStatus(p, read) !== 'read');
}

export function markPlanRead(read: PlanRead[], plan: Plan, at: string): PlanRead[] {
  return [...read.filter((r) => r.id !== plan.id), { id: plan.id, at, version: plan.updated }];
}

const oneLine = (v: string) => v.replace(/\s*[\r\n]+\s*/g, ' ').trim();

export function parsePlanForm(get: (name: string) => string): { draft: PlanDraft; error?: string } {
  const draft = { title: oneLine(get('title') ?? ''), line: oneLine(get('line') ?? ''), ready: get('ready') === 'on' };
  const ok = draft.title !== '' && draft.title.length <= PLAN_LIMITS.title && draft.line.length <= PLAN_LIMITS.line;
  return ok ? { draft } : { draft, error: PLAN_INVALID };
}

const TEXT_TYPES = ['text/markdown', 'text/plain', 'text/x-markdown'];
const TEXT_NAMES = /\.(md|markdown|txt)$/i;

export async function readPlanFile(file: File): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  if (!TEXT_NAMES.test(file.name) && !TEXT_TYPES.includes(file.type)) {
    return { ok: false, error: 'The document must be a Markdown file (.md).' };
  }
  if (file.size > PLAN_LIMITS.bytes) return { ok: false, error: `The document is too large (max ${PLAN_LIMITS.bytes / 1024} KB).` };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "That file isn't UTF-8 text. Save it from Typora as Markdown and try again." };
  }
  return { ok: true, markdown: text.replace(/^﻿/, '').replace(/\r\n?/g, '\n') };
}

/** What she asked him to do from a document's "What I'll do" lists, as she last sent it. */
export interface PlanPicks { planId: string; picks: { key: string; title: string }[]; at: string; changed: boolean }

const isPick = (p: unknown): p is { key: string; title: string } => isRecord(p) && typeof p.key === 'string' && typeof p.title === 'string';

export function parsePlanPicks(raw: string | null): PlanPicks[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Stored plan picks are not a list');
  return data
    .filter((r): r is PlanPicks => isRecord(r) && typeof r.planId === 'string' && Array.isArray(r.picks) && r.picks.every(isPick) &&
      isTime(r.at) && typeof r.changed === 'boolean')
    .map((r) => ({ planId: r.planId, picks: r.picks.map((p) => ({ key: p.key, title: p.title })), at: r.at, changed: r.changed }));
}

/**
 * Her send from one list: `shown` are the items that list held, `ticked` the ones she ticked. Picks from lists she
 * did not send are kept, anything not in the document is ignored, and the result follows his order.
 */
export function sendPicks(
  all: PlanPicks[], planId: string, items: { key: string; title: string }[], shown: string[], ticked: string[], at: string,
): PlanPicks[] {
  const before = all.find((r) => r.planId === planId);
  const had = new Set(before?.picks.map((p) => p.key) ?? []);
  const inList = new Set(shown);
  const on = new Set(ticked.filter((k) => inList.has(k)));
  const picks = items.filter((i) => (inList.has(i.key) ? on.has(i.key) : had.has(i.key))).map((i) => ({ key: i.key, title: i.title }));
  return [...all.filter((r) => r.planId !== planId), { planId, picks, at, changed: Boolean(before) }];
}

export function picksNew(all: PlanPicks[], seen: string | null): boolean {
  return all.some((r) => seen === null || Date.parse(r.at) > Date.parse(seen));
}
