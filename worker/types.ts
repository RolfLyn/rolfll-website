export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface R2Head {
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface R2Body {
  body: ReadableStream;
}

export interface R2 {
  head(key: string): Promise<R2Head | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2Body | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

export interface Env {
  NOTES: KV;
  MEDIA: R2;
  ASSETS: { fetch(request: Request): Promise<Response> };
  NOTES_PATH?: string;
  READER_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
  COOKIE_SECRET?: string;
}
