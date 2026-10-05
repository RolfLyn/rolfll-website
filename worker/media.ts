import type { R2 } from './types';

export type MediaKind = 'photo' | 'audio';

export const MAX_BYTES: Record<MediaKind, number> = {
  photo: 10 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

const EXTENSION_FOR_TYPE: Record<MediaKind, Record<string, string>> = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' },
  audio: {
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3',
    'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  },
};

const TYPE_FOR_EXTENSION: Record<MediaKind, Record<string, string>> = {
  photo: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' },
  audio: { m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav' },
};

const TYPE_ERROR: Record<MediaKind, string> = {
  photo: 'Photo must be JPG, PNG, WebP or GIF.',
  audio: 'Sound must be M4A, MP3, AAC or WAV.',
};

export function resolveType(kind: MediaKind, file: { name: string; type: string }): string | null {
  const type = file.type.toLowerCase();
  if (Object.hasOwn(EXTENSION_FOR_TYPE[kind], type)) return type;
  if (type !== '' && type !== 'application/octet-stream') return null;
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return Object.hasOwn(TYPE_FOR_EXTENSION[kind], extension) ? TYPE_FOR_EXTENSION[kind][extension] : null;
}

export type FileCheck = { ok: true; type: string } | { ok: false; error: string };

export function checkFile(kind: MediaKind, file: { name: string; type: string; size: number }): FileCheck {
  const type = resolveType(kind, file);
  if (!type) return { ok: false, error: TYPE_ERROR[kind] };
  if (file.size > MAX_BYTES[kind]) {
    const label = kind === 'photo' ? 'Photo' : 'Sound';
    return { ok: false, error: `${label} is too large (max ${MAX_BYTES[kind] / 1024 / 1024} MB).` };
  }
  return { ok: true, type };
}

export function newKey(kind: MediaKind, type: string): string {
  return `${crypto.randomUUID()}.${EXTENSION_FOR_TYPE[kind][type]}`;
}

export function parseRange(
  header: string | null, size: number,
): { offset: number; length: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { offset: start, length: end - start + 1 };
}

export async function serveMedia(bucket: R2, key: string, request: Request): Promise<Response | null> {
  const head = await bucket.head(key);
  if (!head) return null;
  const headers: Record<string, string> = {
    'Content-Type': head.httpMetadata?.contentType ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'private, max-age=86400',
  };
  const range = parseRange(request.headers.get('Range'), head.size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${head.size}` } });
  }
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return null;
  if (!range) return new Response(object.body, { headers });
  const last = range.offset + range.length - 1;
  return new Response(object.body, {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${range.offset}-${last}/${head.size}` },
  });
}
