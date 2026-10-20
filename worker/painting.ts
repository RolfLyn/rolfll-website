export const SECRET_MAX = 500;
export const SECRET_INVALID = `A secret needs text of up to ${SECRET_MAX} characters.`;
export const SPOT_INVALID = 'Tap the painting to choose where it hides.';

/** Van Gogh's Almond Blossom (1890), public domain, served from public/. */
export const PAINTING = { src: '/art/almond-blossom.webp', width: 2400, height: 1896 };
/** A spot's tap target is a square this fraction of the painting's height; centres closer than this clash. */
export const SPOT_SIZE = 0.07;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Secret {
  id: string;
  text: string;
  /** Centre of its spot, as fractions (0 to 1) across and down the painting. */
  x: number;
  y: number;
  /** ISO timestamp of the first save; kept on edits. Secrets are numbered in this order. */
  created: string;
}

/** The admin form's fields as typed (positions in percent), so a rejected save can show them again. */
export interface SecretDraft {
  text: string;
  x: string;
  y: string;
}

export const EMPTY_SECRET: SecretDraft = { text: '', x: '', y: '' };

export interface Found {
  id: string;
  at: string;
}

const isFraction = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;
const isTime = (t: unknown): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t));

function isSecret(value: unknown): value is Secret {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === 'string' && UUID.test(s.id) &&
    typeof s.text === 'string' && s.text.trim() !== '' && s.text.length <= SECRET_MAX &&
    isFraction(s.x) && isFraction(s.y) && isTime(s.created);
}

function sortSecrets(secrets: Secret[]): Secret[] {
  return [...secrets].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
}

export function parseSecrets(raw: string | null): Secret[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isSecret)) throw new Error('Stored secrets are invalid');
  if (new Set(data.map((s) => s.id)).size !== data.length) throw new Error('Stored secrets repeat an id');
  return sortSecrets(data.map((s) => ({ id: s.id, text: s.text, x: s.x, y: s.y, created: s.created })));
}

export function upsertSecret(secrets: Secret[], secret: Secret): Secret[] {
  return sortSecrets([...secrets.filter((s) => s.id !== secret.id), secret]);
}

export function removeSecret(secrets: Secret[], id: string): Secret[] {
  return secrets.filter((s) => s.id !== id);
}

function percent(typed: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(typed)) return null;
  const n = Number(typed.replace(',', '.'));
  return n <= 100 ? Math.round(n * 100) / 10000 : null;
}

export function parseSecretForm(get: (name: string) => string): {
  draft: SecretDraft; value?: { text: string; x: number; y: number }; error?: string;
} {
  const draft: SecretDraft = { text: get('text').replace(/\r\n?/g, '\n').trim(), x: get('x').trim(), y: get('y').trim() };
  const x = percent(draft.x);
  const y = percent(draft.y);
  const errors = [
    draft.text === '' || draft.text.length > SECRET_MAX ? SECRET_INVALID : '',
    x === null || y === null ? SPOT_INVALID : '',
  ].filter(Boolean);
  if (errors.length > 0 || x === null || y === null) return { draft, error: errors.join(' ') };
  return { draft, value: { text: draft.text, x, y } };
}

/** The number (1-based, creation order) of a secret whose spot would overlap one at (x, y), if any. */
export function tooClose(secrets: Secret[], x: number, y: number, except?: string): number | null {
  const aspect = PAINTING.width / PAINTING.height;
  const index = secrets.findIndex((s) => s.id !== except && Math.hypot((s.x - x) * aspect, s.y - y) < SPOT_SIZE);
  return index === -1 ? null : index + 1;
}

function isFound(value: unknown): value is Found {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return typeof f.id === 'string' && UUID.test(f.id) && isTime(f.at);
}

export function parseFound(raw: string | null): Found[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(isFound)) throw new Error('Stored found secrets are invalid');
  return data.map((f) => ({ id: f.id, at: f.at }));
}

/** Records the first time a secret is found; returns the same list when it already was. */
export function markFound(found: Found[], id: string, at: string): Found[] {
  return found.some((f) => f.id === id) ? found : [...found, { id, at }];
}

export function dropFound(found: Found[], id: string): Found[] {
  return found.filter((f) => f.id !== id);
}
