import type { KV } from '../worker/types';

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
