import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('build output', () => {
  it('produces a home page', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('Coming soon');
  });
});
