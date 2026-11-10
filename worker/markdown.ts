import { Marked, Renderer, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import { escapeHtml } from './html';

// His documents are written in Typora (GitHub-flavoured Markdown). They are rendered on the server into a safe
// subset: raw HTML is shown as text (except Typora's <br>), links go only to the web, mail or a heading on the page,
// and images show their description instead of loading anything.

export interface Rendered { html: string; headings: { id: string; text: string }[] }

/** Heading ids the way Typora makes them, so its #links work. */
function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

const plainText = (md: string) => md.replace(/[*_`~]/g, '').trim();

const BR = /^<br\s*\/?>$/i;

export function renderMarkdown(source: string, title: string): Rendered {
  const headings: Rendered['headings'] = [];
  const used = new Map<string, number>();
  // The title is already shown above the paper, so a first "# Title" that repeats it is left out.
  const first = source.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/);
  const kept = first && first[1].trim().toLowerCase() === title.trim().toLowerCase() ? source.slice(first[0].length) : source;
  // Typora's [TOC] marker: the page already shows its own contents list.
  const body = kept.replace(/^[ \t]*\[toc\][ \t]*$/gim, '');

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use(markedFootnote());
  marked.use({
    renderer: {
      heading(this: Renderer, { tokens, depth, text }: Tokens.Heading) {
        const plain = plainText(text);
        const base = slug(plain) || 'section';
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen ? `${base}-${seen}` : base;
        if (depth === 2) headings.push({ id, text: plain });
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return BR.test(text.trim()) ? '<br>' : escapeHtml(text);
      },
      link(this: Renderer, { href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const to = (href ?? '').trim();
        if (to.startsWith('#')) return `<a href="${escapeHtml(to)}">${inner}</a>`;
        if (/^(https?:|mailto:)/i.test(to)) return `<a href="${escapeHtml(to)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        return inner;
      },
      image({ text }: Tokens.Image) {
        return `<span class="alt">${escapeHtml(text)}</span>`;
      },
      checkbox({ checked }: Tokens.Checkbox) {
        return `<span class="box${checked ? ' done' : ''}" aria-label="${checked ? 'done' : 'to do'}"></span> `;
      },
      table(this: Renderer, token: Tokens.Table) {
        return `<div class="table">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
    },
  });
  return { html: marked.parse(body, { async: false }) as string, headings };
}
