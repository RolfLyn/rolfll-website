import { describe, it, expect } from 'vitest';
import {
  passwordMatches, createSession, verifySession, csrfToken, verifyCsrf,
  readCookie, sessionCookie, isLockedOut, recordFailure, clientKey,
} from '../worker/auth';
import { memoryKV } from './notes-helpers';

const SECRET = 'test-secret';
const DAY = 86_400_000;

describe('passwordMatches', () => {
  it('matches only the exact password', async () => {
    expect(await passwordMatches('open sesame', 'open sesame', SECRET)).toBe(true);
    expect(await passwordMatches('open sesam', 'open sesame', SECRET)).toBe(false);
    expect(await passwordMatches('', 'open sesame', SECRET)).toBe(false);
  });
});

describe('sessions', () => {
  it('round-trips for the same role within 90 days', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'reader', SECRET, 89 * DAY)).toBe(true);
  });

  it('expires after 90 days', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'reader', SECRET, 91 * DAY)).toBe(false);
  });

  it('does not accept a reader session as admin', async () => {
    const s = await createSession('reader', SECRET, 0);
    expect(await verifySession(s, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession(s.replace(/^reader/, 'admin'), 'admin', SECRET, 1)).toBe(false);
  });

  it('rejects tampering, a different secret, and garbage', async () => {
    const s = await createSession('admin', SECRET, 0);
    const [role, , sig] = s.split('.');
    expect(await verifySession(`${role}.${999 * DAY}.${sig}`, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession(s, 'admin', 'rotated-secret', 1)).toBe(false);
    expect(await verifySession(undefined, 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession('nonsense', 'admin', SECRET, 1)).toBe(false);
    expect(await verifySession('admin.abc.def', 'admin', SECRET, 1)).toBe(false);
  });
});

describe('csrf', () => {
  it('is bound to the session it was made for', async () => {
    const a = await createSession('admin', SECRET, 0);
    const b = await createSession('admin', SECRET, 1000);
    const token = await csrfToken(a, SECRET);
    expect(await verifyCsrf(token, a, SECRET)).toBe(true);
    expect(await verifyCsrf(token, b, SECRET)).toBe(false);
    expect(await verifyCsrf('', a, SECRET)).toBe(false);
  });
});

describe('cookies', () => {
  it('reads a named cookie from the header', () => {
    const req = new Request('https://x.test/', { headers: { Cookie: 'a=1; notes_reader=r.2.sig; b=3' } });
    expect(readCookie(req, 'notes_reader')).toBe('r.2.sig');
    expect(readCookie(req, 'notes_admin')).toBeUndefined();
    expect(readCookie(new Request('https://x.test/'), 'notes_reader')).toBeUndefined();
  });

  it('builds a hardened 90-day cookie scoped to a path', () => {
    const c = sessionCookie('notes_reader', 'v', '/for-you');
    expect(c).toContain('notes_reader=v');
    expect(c).toContain('Path=/for-you');
    expect(c).toContain('Max-Age=7776000');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
  });
});

describe('clientKey', () => {
  it('keeps IPv4 as is and groups IPv6 by /64', () => {
    expect(clientKey('1.2.3.4')).toBe('1.2.3.4');
    expect(clientKey('2001:db8:1:2::1')).toBe(clientKey('2001:0DB8:0001:0002:ffff:0:0:9'));
    expect(clientKey('2001:db8:1:2::1')).not.toBe(clientKey('2001:db8:1:3::1'));
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
  });
});

describe('lockout', () => {
  it('locks an IP out after 5 failures with a 15 minute TTL', async () => {
    const kv = memoryKV();
    for (let i = 0; i < 4; i++) await recordFailure(kv, '1.2.3.4');
    expect(await isLockedOut(kv, '1.2.3.4')).toBe(false);
    await recordFailure(kv, '1.2.3.4');
    expect(await isLockedOut(kv, '1.2.3.4')).toBe(true);
    expect(await isLockedOut(kv, '5.6.7.8')).toBe(false);
    expect(kv.puts.every((p) => p.options?.expirationTtl === 900)).toBe(true);
  });
});
