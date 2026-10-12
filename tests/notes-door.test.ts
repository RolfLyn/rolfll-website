import { describe, it, expect } from 'vitest';
import { createDoor, verifyDoor, doorCookie, closedDoorCookie, DOOR_SECONDS } from '../worker/auth';

const SECRET = 'test-secret';
const SESSION = 'reader.1.sig';
const T = Date.parse('2026-10-12T20:00:00Z');

describe('door', () => {
  it('opens for the same session within 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, SESSION, SECRET, T)).toBe(true);
    expect(await verifyDoor(door, SESSION, SECRET, T + 29 * 60_000)).toBe(true);
  });

  it('closes after 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, SESSION, SECRET, T + DOOR_SECONDS * 1000)).toBe(false);
  });

  it('refuses another session, another secret, tampering and nonsense', async () => {
    const door = await createDoor(SESSION, SECRET, T);
    expect(await verifyDoor(door, 'reader.2.sig', SECRET, T)).toBe(false);
    expect(await verifyDoor(door, SESSION, 'other-secret', T)).toBe(false);
    const [, expires, sig] = door.split('.');
    expect(await verifyDoor(`door.${Number(expires) - 60_000}.${sig}`, SESSION, SECRET, T)).toBe(false);
    for (const bad of [undefined, '', 'door', 'door.x.y', `reader.${expires}.${sig}`]) {
      expect(await verifyDoor(bad, SESSION, SECRET, T)).toBe(false);
    }
  });

  it('refuses a door that claims to stay open longer than 30 minutes', async () => {
    const door = await createDoor(SESSION, SECRET, T + 3_600_000);
    expect(await verifyDoor(door, SESSION, SECRET, T)).toBe(false);
  });

  it('sets a 30-minute http-only cookie on the notes path, and can clear it', () => {
    expect(doorCookie('v', '/for-you')).toBe('notes_door=v; Path=/for-you; Max-Age=1800; HttpOnly; Secure; SameSite=Lax');
    expect(closedDoorCookie('/for-you')).toBe('notes_door=; Path=/for-you; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  });
});
