import { isValidDate } from './dates';

// Small checks shared by the JSON blocks he writes in admin (the special event and the gift).
// Each throws a Problem whose message names where the problem is.

const ID = /^[a-z0-9][a-z0-9-]*$/i;
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export class Problem extends Error {}

export function text(v: unknown, max: number, where: string, optional = false): string | undefined {
  if (v === undefined && optional) return undefined;
  if (typeof v !== 'string' || v.trim() === '') throw new Problem(`${where} needs some text.`);
  if (v.length > max) throw new Problem(`${where} is too long (at most ${max} characters).`);
  return v;
}

export function id(v: unknown, where: string, max: number): string {
  if (typeof v !== 'string' || !ID.test(v) || v.length > max) {
    throw new Problem(`${where} needs an id of letters, numbers and dashes.`);
  }
  return v;
}

export function date(v: unknown, where: string): string {
  if (typeof v !== 'string' || !isValidDate(v)) throw new Problem(`${where} needs a real date written like 2026-01-31.`);
  return v;
}

export function list(v: unknown, max: number, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Problem(`${where} must be a list.`);
  if (v.length > max) throw new Problem(`${where} has too many entries (at most ${max}).`);
  return v;
}
