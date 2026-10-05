import { describe, it, expect } from 'vitest';
import { resolveType, checkFile, newKey, parseRange, serveMedia, MAX_BYTES } from '../worker/media';
import { MEDIA_KEY } from '../worker/notes';
import { memoryR2 } from './notes-helpers';

describe('resolveType', () => {
  it('accepts allowed types and infers from extension when the type is empty', () => {
    expect(resolveType('photo', { name: 'a.jpg', type: 'image/jpeg' })).toBe('image/jpeg');
    expect(resolveType('audio', { name: 'x.m4a', type: 'audio/x-m4a' })).toBe('audio/x-m4a');
    expect(resolveType('audio', { name: 'Recording (3).M4A', type: '' })).toBe('audio/mp4');
    expect(resolveType('audio', { name: 'song.mp3', type: 'application/octet-stream' })).toBe('audio/mpeg');
  });

  it('rejects everything else', () => {
    expect(resolveType('photo', { name: 'x.svg', type: 'image/svg+xml' })).toBeNull();
    expect(resolveType('photo', { name: 'IMG_1.HEIC', type: 'image/heic' })).toBeNull();
    expect(resolveType('photo', { name: 'a.mp3', type: '' })).toBeNull();
    expect(resolveType('audio', { name: 'a.jpg', type: 'image/jpeg' })).toBeNull();
  });
});

describe('checkFile', () => {
  it('enforces size limits', () => {
    expect(checkFile('photo', { name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES.photo })).toEqual({ ok: true, type: 'image/jpeg' });
    const tooBig = checkFile('photo', { name: 'a.jpg', type: 'image/jpeg', size: MAX_BYTES.photo + 1 });
    expect(tooBig.ok).toBe(false);
    expect(!tooBig.ok && tooBig.error).toContain('too large');
    expect(MAX_BYTES).toEqual({ photo: 10 * 1024 * 1024, audio: 25 * 1024 * 1024 });
  });

  it('explains unsupported types', () => {
    const r = checkFile('photo', { name: 'IMG.HEIC', type: 'image/heic', size: 10 });
    expect(!r.ok && r.error).toBe('Photo must be JPG, PNG, WebP or GIF.');
    const s = checkFile('audio', { name: 'x.ogg', type: 'audio/ogg', size: 10 });
    expect(!s.ok && s.error).toBe('Sound must be M4A, MP3, AAC or WAV.');
  });
});

describe('newKey', () => {
  it('makes unique keys with the right extension', () => {
    const a = newKey('audio', 'audio/x-m4a');
    const b = newKey('audio', 'audio/x-m4a');
    expect(a).toMatch(MEDIA_KEY);
    expect(a.endsWith('.m4a')).toBe(true);
    expect(a).not.toBe(b);
    expect(newKey('photo', 'image/jpeg').endsWith('.jpg')).toBe(true);
  });
});

describe('parseRange', () => {
  it('parses single byte ranges', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-', 100)).toEqual({ offset: 0, length: 100 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ offset: 10, length: 10 });
    expect(parseRange('bytes=-10', 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange('bytes=90-200', 100)).toEqual({ offset: 90, length: 10 });
  });

  it('flags unsatisfiable ranges and ignores ones it does not support', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=20-10', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});

describe('serveMedia', () => {
  const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
  const setup = async () => {
    const r2 = memoryR2();
    await r2.put('k.m4a', bytes.buffer, { httpMetadata: { contentType: 'audio/mp4' } });
    return r2;
  };
  const req = (range?: string) => new Request('https://x.test/m', { headers: range ? { Range: range } : {} });

  it('serves the whole file with safe headers', async () => {
    const res = (await serveMedia(await setup(), 'k.m4a', req()))!;
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mp4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('serves a byte range as 206', async () => {
    const res = (await serveMedia(await setup(), 'k.m4a', req('bytes=10-19')))!;
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(10, 20));
  });

  it('answers 416 for an unsatisfiable range and null for a missing file', async () => {
    const r2 = await setup();
    const res = (await serveMedia(r2, 'k.m4a', req('bytes=500-')))!;
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */100');
    expect(await serveMedia(r2, 'nope.m4a', req())).toBeNull();
  });
});
