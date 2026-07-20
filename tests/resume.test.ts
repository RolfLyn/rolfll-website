// tests/resume.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('resume page', () => {
  const html = readFileSync('dist/resume/index.html', 'utf-8');

  it('shows all four resume sections', () => {
    expect(html).toContain('Experience');
    expect(html).toContain('Education');
    expect(html).toContain('Competencies');
    expect(html).toContain('Personal interests');
  });

  it('shows a representative entry from each section', () => {
    expect(html).toContain('Lead People Analytics Specialist');
    expect(html).toContain('Ph.D. in Sociology');
    expect(html).toContain('Quantitative methods');
    expect(html).toContain('Woodworking');
  });
});
