import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

describe('contact page', () => {
  const html = readFileSync('dist/contact/index.html', 'utf-8');
  const { document } = parseHTML(html);

  it('has a form posting to Formspree', () => {
    const form = document.querySelector('form.contact-form');
    expect(form?.getAttribute('method')).toBe('POST');
    expect(form?.getAttribute('action')).toContain('formspree.io/f/');
  });

  it('has name, email, and message fields', () => {
    expect(document.querySelector('input[name="name"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('textarea[name="message"]')).not.toBeNull();
  });

  it('shows the direct email address', () => {
    expect(document.body.textContent).toContain('rolf@rolfll.com');
  });

  it('shows the consult-ask copy', () => {
    expect(document.body.textContent).toContain('it is cheaper to talk first');
  });
});
