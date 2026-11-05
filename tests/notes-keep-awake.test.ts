import { describe, it, expect } from 'vitest';
import { KEEP_AWAKE_SCRIPT, listeningShell, adminShell } from '../worker/views';
import { readingRoomPage, readingRoomAdminPage } from '../worker/reading-room-views';
import { roomPage } from '../worker/after-dark-views';
import type { Book } from '../worker/books';
import type { Entry } from '../worker/after-dark';

const ID = '11111111-1111-4111-8111-111111111111';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const audio = { key: KEY, type: 'audio/mp4' };
const book: Book = { id: ID, title: 'Placeholder', author: 'Someone', line: '', created: '2026-11-02T22:00:00.000Z', audio };
const entry: Entry = { id: ID, title: '', text: 'Placeholder', created: '2026-11-02T22:00:00.000Z', audio };

describe('keeping the screen on', () => {
  it('is on reader pages that have a sound', () => {
    expect(listeningShell('t', '', '<audio controls></audio>')).toContain(KEEP_AWAKE_SCRIPT);
    expect(readingRoomPage({ books: [book], played: [], replies: [], back: '/n', mediaBase: '/m' })).toContain(KEEP_AWAKE_SCRIPT);
    expect(roomPage({ entries: [entry], replies: [], mediaBase: '/m' })).toContain(KEEP_AWAKE_SCRIPT);
  });

  it('is left out where nothing can play', () => {
    expect(listeningShell('t', '', '<p>Words</p>')).not.toContain('wakeLock');
    expect(listeningShell('t', '', '&lt;audio')).not.toContain('wakeLock');
    expect(readingRoomPage({ books: [], played: [], replies: [], back: '/n', mediaBase: '/m' })).not.toContain('wakeLock');
    expect(roomPage({ entries: [{ ...entry, audio: undefined }], replies: [], mediaBase: '/m' })).not.toContain('wakeLock');
  });

  it('is left out of admin pages', () => {
    expect(adminShell('<audio controls></audio>')).not.toContain('wakeLock');
    expect(readingRoomAdminPage({ base: '/n', csrf: 'x', books: [book], played: [], replies: [], draft: { title: '', author: '', line: '' } })).not.toContain('wakeLock');
  });
});
