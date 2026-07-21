import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('works page', () => {
  const html = readFileSync('dist/works/index.html', 'utf-8');

  it('lists all five real projects', () => {
    expect(html).toContain('Talent Lake');
    expect(html).toContain('Functional Job Cluster');
    expect(html).toContain('Job ad generator');
    expect(html).toContain('Layoff monitor');
    expect(html).toContain('Research');
  });

  it('renders the research item as a list of publications', () => {
    expect(html).toContain('Sociogeographical Machine Learning');
    expect(html).toContain('Kunstig intelligens og algoritmer');
  });

  it('shows the works intro copy', () => {
    expect(html).toContain('Four systems and a line of research');
  });
});
