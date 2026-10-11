import { isValidDate } from './dates';

export const REPLY_MAX = 280;

export interface Answer {
  heart: boolean;
  text: string;
}

export interface Reply extends Answer {
  date: string;
  /** When she last changed it (ISO, server clock). */
  at: string;
}

function isReply(value: unknown): value is Reply {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.date === 'string' && isValidDate(r.date) &&
    typeof r.heart === 'boolean' &&
    typeof r.text === 'string' && r.text.length <= REPLY_MAX &&
    (r.heart || r.text !== '') &&
    typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at));
}

export function parseReplies(raw: string | null): Reply[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isReply)) throw new Error('Stored replies are invalid');
  return data.map((r) => ({ date: r.date, heart: r.heart, text: r.text, at: r.at }));
}

export function parseReplyForm(get: (name: string) => string): Answer | null {
  const text = get('text').replace(/\r\n?/g, '\n').trim();
  if (text.length > REPLY_MAX) return null;
  return { heart: get('heart') === 'on', text };
}

/** One reply per note; an empty answer removes it. */
export function setReply(replies: Reply[], date: string, answer: Answer, at: string): Reply[] {
  const rest = replies.filter((r) => r.date !== date);
  return answer.heart || answer.text !== '' ? [...rest, { date, heart: answer.heart, text: answer.text, at }] : rest;
}

/** A note saved on `to` replaces whatever reply was there; a moved note brings its own reply along. */
export function moveReply(replies: Reply[], from: string | undefined, to: string): Reply[] {
  if (from === to) return replies;
  return replies.filter((r) => r.date !== to).map((r) => (r.date === from ? { ...r, date: to } : r));
}

export function dropReply(replies: Reply[], date: string): Reply[] {
  return replies.filter((r) => r.date !== date);
}
