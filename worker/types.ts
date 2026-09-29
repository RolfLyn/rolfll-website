export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  NOTES: KV;
  ASSETS: { fetch(request: Request): Promise<Response> };
  NOTES_PATH?: string;
  READER_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
  COOKIE_SECRET?: string;
}
