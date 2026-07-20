import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('site polish', () => {
  it('publishes a favicon', () => {
    expect(existsSync('dist/favicon.svg')).toBe(true);
  });

  it('every page references the favicon and links to all four routes', () => {
    const pages = [
      'dist/index.html',
      'dist/works/index.html',
      'dist/resume/index.html',
      'dist/contact/index.html',
    ];
    for (const page of pages) {
      const html = readFileSync(page, 'utf-8');
      expect(html).toContain('href="/favicon.svg"');
      expect(html).toContain('href="/works"');
      expect(html).toContain('href="/resume"');
      expect(html).toContain('href="/contact"');
    }
  });
});
