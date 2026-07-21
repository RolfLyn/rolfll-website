// tests/home.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

describe('home page', () => {
  const html = readFileSync('dist/index.html', 'utf-8');
  const { document } = parseHTML(html);

  it('links to all four pages in the nav', () => {
    const hrefs = [...document.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/works', '/resume', '/contact']));
  });

  it('shows the eyebrow label for the about section', () => {
    expect(document.body.textContent).toContain('01');
    expect(document.body.textContent).toContain('about');
  });

  it('shows the professional intro copy', () => {
    expect(document.body.textContent).toContain(
      'I build machine learning systems on human data, and study what they actually do.',
    );
    expect(document.body.textContent).toContain('Lead People Analytics Specialist at Grundfos');
    expect(document.body.textContent).toContain('The practice keeps the research honest.');
  });
});
