import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('works page', () => {
  const html = readFileSync('dist/works/index.html', 'utf-8');

  it('lists all four real projects', () => {
    expect(html).toContain('Lead People Analytics Specialist');
    expect(html).toContain('Scientific Director');
    expect(html).toContain('Associate Professor');
    expect(html).toContain('Ph.D. Research');
  });
});
