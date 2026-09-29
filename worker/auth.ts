import type { KV } from './types';

export type Role = 'reader' | 'admin';

export const SESSION_DAYS = 90;
export const MAX_FAILURES = 5;
export const LOCKOUT_SECONDS = 900;

const SESSION_MS = SESSION_DAYS * 86_400_000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Compares fixed-length HMACs so timing does not reveal the password's length or prefix.
export async function passwordMatches(given: string, expected: string, secret: string): Promise<boolean> {
  return timingSafeEqual(await hmac(secret, `pw:${given}`), await hmac(secret, `pw:${expected}`));
}

export async function createSession(role: Role, secret: string, nowMs: number): Promise<string> {
  const payload = `${role}.${nowMs + SESSION_MS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(
  value: string | undefined, role: Role, secret: string, nowMs: number,
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [valueRole, expires, signature] = parts;
  if (valueRole !== role) return false;
  const expiresMs = Number(expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
  return timingSafeEqual(signature, await hmac(secret, `${valueRole}.${expires}`));
}

export async function csrfToken(session: string, secret: string): Promise<string> {
  return hmac(secret, `csrf:${session}`);
}

export async function verifyCsrf(token: string, session: string, secret: string): Promise<boolean> {
  return token !== '' && timingSafeEqual(token, await csrfToken(session, secret));
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function sessionCookie(name: string, value: string, path: string): string {
  return `${name}=${value}; Path=${path}; Max-Age=${SESSION_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`;
}

// IPv6 users typically control a whole /64, so count failures per /64 rather than per address.
export function clientKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups]
    : headGroups;
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

async function failureCount(kv: KV, ip: string): Promise<number> {
  return Number((await kv.get(`fail:${ip}`)) ?? 0);
}

export async function isLockedOut(kv: KV, ip: string): Promise<boolean> {
  return (await failureCount(kv, ip)) >= MAX_FAILURES;
}

export async function recordFailure(kv: KV, ip: string): Promise<void> {
  await kv.put(`fail:${ip}`, String((await failureCount(kv, ip)) + 1), { expirationTtl: LOCKOUT_SECONDS });
}
