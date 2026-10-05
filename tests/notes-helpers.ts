import type { KV, R2 } from '../worker/types';

export function memoryKV() {
  const data = new Map<string, string>();
  const puts: { key: string; value: string; options?: { expirationTtl?: number } }[] = [];
  const kv: KV & { data: typeof data; puts: typeof puts } = {
    data,
    puts,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, options) {
      data.set(key, value);
      puts.push({ key, value, options });
    },
  };
  return kv;
}

export function memoryR2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const r2: R2 & { objects: typeof objects } = {
    objects,
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, httpMetadata: { contentType: o.contentType } } : null;
    },
    async get(key, options) {
      const o = objects.get(key);
      if (!o) return null;
      const r = options?.range;
      const bytes = r ? o.bytes.slice(r.offset, r.offset + r.length) : o.bytes;
      return { body: new Blob([bytes]).stream() };
    },
    async put(key, value, options) {
      objects.set(key, { bytes: new Uint8Array(value), contentType: options?.httpMetadata?.contentType });
    },
    async delete(keys) {
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
  return r2;
}
