// tests/resume.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('resume page', () => {
  const html = readFileSync('dist/resume/index.html', 'utf-8');

  it('shows all six resume sections', () => {
    expect(html).toContain('Experience');
    expect(html).toContain('Education');
    expect(html).toContain('Competencies');
    expect(html).toContain('Recognition &amp; funding');
    expect(html).toContain('Public voice on AI');
    expect(html).toContain('Personal interests');
  });

  it('shows a representative entry from each section', () => {
    expect(html).toContain('Lead People Analytics Specialist');
    expect(html).toContain('External Lecturer');
    expect(html).toContain('Ph.D. in Sociology');
    expect(html).toContain('Quantitative methods');
    expect(html).toContain('Spar Nord Foundation Research Award');
    expect(html).toContain('National media commentary on AI');
    expect(html).toContain('Woodworking');
  });
});
