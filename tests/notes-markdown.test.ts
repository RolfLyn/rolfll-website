import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { renderMarkdown } from '../worker/markdown';

const dom = (html: string) => parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
const render = (md: string, title = 'A title') => renderMarkdown(md, title);

describe('rendering his Markdown', () => {
  it('renders the common pieces', () => {
    const { html } = render([
      '## Part one', '', 'Some **bold** and *italic* and ~~gone~~.', '',
      '- one', '  - nested', '- two', '', '1. first', '2. second', '',
      '> a quote', '', '---', '', '`code` here', '', '```', 'block', '```',
    ].join('\n'));
    const d = dom(html);
    expect(d.querySelector('h2')!.textContent).toBe('Part one');
    expect(d.querySelector('strong')!.textContent).toBe('bold');
    expect(d.querySelector('em')!.textContent).toBe('italic');
    expect(d.querySelector('del')!.textContent).toBe('gone');
    expect(d.querySelector('ul ul li')!.textContent).toBe('nested');
    expect(d.querySelectorAll('ol li')).toHaveLength(2);
    expect(d.querySelector('blockquote')).toBeTruthy();
    expect(d.querySelector('hr')).toBeTruthy();
    expect(d.querySelector('pre code')!.textContent).toContain('block');
  });

  it('wraps tables so wide ones scroll inside the paper', () => {
    const { html } = render('| School | Distance |\n| --- | --- |\n| One | 1 km |');
    expect(dom(html).querySelector('div.table > table td')!.textContent).toBe('One');
  });

  it('draws task list boxes instead of inputs', () => {
    const d = dom(render('- [x] done\n- [ ] to do').html);
    expect(d.querySelector('input')).toBeNull();
    expect(d.querySelectorAll('span.box')).toHaveLength(2);
    expect(d.querySelectorAll('span.box.done')).toHaveLength(1);
  });

  it('gathers footnotes with links both ways', () => {
    const d = dom(render('A claim.[^1]\n\n[^1]: The source.').html);
    const ref = d.querySelector('sup a')!;
    expect(ref.getAttribute('href')!.startsWith('#')).toBe(true);
    const target = d.getElementById(ref.getAttribute('href')!.slice(1))!;
    expect(target.textContent).toContain('The source.');
    expect(target.querySelector('a[href^="#"]')).toBeTruthy();
  });

  it('opens web links in a new tab and keeps heading links in place', () => {
    const d = dom(render('See https://example.com and [mail](mailto:a@b.c) and [below](#part-two).\n\n## Part two').html);
    const web = d.querySelector('a[href="https://example.com"]')!;
    expect(web.getAttribute('target')).toBe('_blank');
    expect(web.getAttribute('rel')).toBe('noopener noreferrer');
    const anchor = d.querySelector('a[href="#part-two"]')!;
    expect(anchor.getAttribute('target')).toBeNull();
    expect(d.getElementById('part-two')!.tagName).toBe('H2');
  });

  it('gives repeated headings their own ids and lists the sections', () => {
    const { html, headings } = render('## Costs\n\n## Ærø & more!\n\n## Costs\n\n### Small');
    expect(headings).toEqual([{ id: 'costs', text: 'Costs' }, { id: 'ærø--more', text: 'Ærø & more!' }, { id: 'costs-1', text: 'Costs' }]);
    expect(dom(html).getElementById('costs-1')).toBeTruthy();
  });

  it('drops a first heading that repeats the title, and keeps a different one', () => {
    expect(dom(render('# A title\n\nText').html).querySelector('h1')).toBeNull();
    expect(dom(render('# Another\n\nText').html).querySelector('h1')!.textContent).toBe('Another');
  });

  it('keeps footnote labels from breaking into the markup', () => {
    const { html } = render('Hi[^x" onmouseover="alert(1)]\n\n[^x" onmouseover="alert(1)]: note');
    const d = dom(html);
    for (const el of d.querySelectorAll('*')) {
      for (const a of el.attributes) expect(a.name.startsWith('on')).toBe(false);
    }
    expect(d.body.textContent).toContain('note');
  });

  it('lists a heading with a link by its words, with the id Typora gives it', () => {
    const { html, headings } = render('## See [the school](https://example.com) now\n\n## Two\n\n## Three');
    expect(headings[0]).toEqual({ id: 'see-the-school-now', text: 'See the school now' });
    expect(dom(html).querySelector('h2#see-the-school-now a[href="https://example.com"]')).toBeTruthy();
  });

  it("leaves out Typora's [TOC] marker, since the contents list is automatic", () => {
    const { html } = render('Intro\n\n[TOC]\n\n## A\n\n[toc]');
    expect(html).not.toMatch(/\[toc\]/i);
    expect(html).toContain('Intro');
  });

  it('keeps Typora line breaks', () => {
    expect(dom(render('one<br>two<br/>three').html).querySelectorAll('br')).toHaveLength(2);
  });

  it('never lets a document run code or load anything', () => {
    const { html } = render([
      '<script>alert(1)</script>', '', '<img src=x onerror=alert(1)>', '', '<iframe src="https://evil"></iframe>', '',
      '[x](javascript:alert(1)) and [y](data:text/html,hi) and [z](JAVASCRIPT:alert(2))', '',
      '![a photo](https://example.com/p.jpg)', '', '<a href="https://x" onclick="alert(1)">raw</a>',
    ].join('\n'));
    const d = dom(html);
    expect(d.querySelector('script, iframe, img')).toBeNull();
    for (const el of d.querySelectorAll('*')) {
      for (const a of el.attributes) expect(a.name.startsWith('on')).toBe(false);
    }
    for (const a of d.querySelectorAll('a')) expect(/^(javascript|data):/i.test(a.getAttribute('href') ?? '')).toBe(false);
    expect(d.querySelector('span.alt')!.textContent).toBe('a photo');
    expect(d.body.textContent).toContain('<script>alert(1)</script>');
  });
});

describe('"What I\'ll do" picks', () => {
  const doc = [
    '## Before', '', '- not a pick', '',
    "## What I'll do", '', 'Intro line.', '',
    '- **Visit schools.** We go together.', '- **Paperwork** sorted by me.', '- A plain one without bold', '',
    'Closing line.', '', '## After', '', '- also not a pick',
  ].join('\n');
  const opts = { action: '/for-you/reading-room/plans/x/picks', csrf: 'tok', chosen: ['paperwork'] };

  it('finds the items by their bold titles', () => {
    expect(renderMarkdown(doc, 'T').items).toEqual([
      { key: 'visit schools.', title: 'Visit schools.' }, { key: 'paperwork', title: 'Paperwork' },
      { key: 'a plain one without bold', title: 'A plain one without bold' },
    ]);
  });

  it('turns only that section into cards she can tick and send', () => {
    const d = dom(renderMarkdown(doc, 'T', opts).html);
    const form = d.querySelector('form.picks')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe(opts.action);
    expect(form.querySelector('input[name="csrf"]')!.getAttribute('value')).toBe('tok');
    const boxes = [...form.querySelectorAll('input[name="pick"]')];
    expect(boxes.map((b) => b.getAttribute('value'))).toEqual(['visit schools.', 'paperwork', 'a plain one without bold']);
    expect(boxes.map((b) => b.hasAttribute('checked'))).toEqual([false, true, false]);
    expect([...form.querySelectorAll('input[name="all"]')]).toHaveLength(3);
    expect(form.querySelector('button')!.textContent).toBe('These, please');
    expect(form.textContent).toContain('We go together.');
    expect(d.querySelectorAll('form')).toHaveLength(1);
    expect(d.body.textContent).toContain('not a pick');
  });

  it('shows the cards without a form in a preview', () => {
    const d = dom(renderMarkdown(doc, 'T', { chosen: [] }).html);
    expect(d.querySelector('form')).toBeNull();
    expect(d.querySelectorAll('input[name="pick"][disabled]')).toHaveLength(3);
  });

  it('thanks her once she has sent them', () => {
    expect(renderMarkdown(doc, 'T', { ...opts, sent: true }).html).toContain("Got it. I&#39;ll take care of these.");
    expect(renderMarkdown(doc, 'T', opts).html).not.toContain('Got it.');
  });

  it('knows the heading however the apostrophe is written', () => {
    for (const h of ["What I'll do", 'What I’ll do', 'What I will do', '**What I\'ll do**']) {
      expect(renderMarkdown(`## ${h}\n\n- **One** x`, 'T').items).toHaveLength(1);
    }
    expect(renderMarkdown('## What we do\n\n- **One** x', 'T').items).toHaveLength(0);
  });

  it('keeps plain rendering when no picks are asked for', () => {
    expect(dom(renderMarkdown(doc, 'T').html).querySelector('input')).toBeNull();
  });
});
