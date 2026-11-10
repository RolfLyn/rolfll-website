import { Marked, Renderer, type Token, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import { escapeHtml } from './html';

// His documents are written in Typora (GitHub-flavoured Markdown). They are rendered on the server into a safe
// subset: raw HTML is shown as text (except Typora's <br>), links go only to the web, mail or a heading on the page,
// and images show their description instead of loading anything.
// Lists under a "What I'll do" heading become cards she can tick and send back to him.

export interface PickItem { key: string; title: string }
export interface Rendered { html: string; headings: { id: string; text: string }[]; items: PickItem[] }
/** How to draw a "What I'll do" list: a form when she can send (action and csrf), plain cards in a preview. */
export interface PickOptions { action?: string; csrf?: string; chosen: string[]; sent?: boolean }

const PICK_HEADING = /^what i(?:['’]ll| will) do$/i;
type PickList = Tokens.List & { picks?: boolean };

/** Heading ids the way Typora makes them, so its #links work. */
function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

function firstStrong(tokens: Token[] | undefined): Tokens.Strong | undefined {
  for (const t of tokens ?? []) {
    if (t.type === 'strong') return t as Tokens.Strong;
    const inner = firstStrong((t as { tokens?: Token[] }).tokens);
    if (inner) return inner;
  }
  return undefined;
}

const BR = /^<br\s*\/?>$/i;
const SENT = "Got it. I'll take care of these.";

export function renderMarkdown(source: string, title: string, picks?: PickOptions): Rendered {
  const headings: Rendered['headings'] = [];
  const items: PickItem[] = [];
  const used = new Map<string, number>();
  let forms = 0;
  const keys = new Map<string, number>();
  // The title is already shown above the paper, so a first "# Title" that repeats it is left out.
  const first = source.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/);
  const kept = first && first[1].trim().toLowerCase() === title.trim().toLowerCase() ? source.slice(first[0].length) : source;
  // Typora's [TOC] marker: the page already shows its own contents list.
  const body = kept.replace(/^[ \t]*\[toc\][ \t]*$/gim, '');

  const marked = new Marked({ gfm: true, breaks: false });
  // A fixed back-link label: the library puts the label text into an attribute unescaped.
  marked.use(markedFootnote({ backRefLabel: 'Back to the text' }));
  marked.use({
    hooks: {
      // Lists under a "What I'll do" heading, until the next heading as big or bigger, become her picks.
      processAllTokens(tokens) {
        let depth = 0;
        for (const t of tokens) {
          if (t.type === 'heading') {
            const h = t as Tokens.Heading;
            if (PICK_HEADING.test(h.text.replace(/[*_`~]/g, '').trim())) depth = h.depth;
            else if (depth && h.depth <= depth) depth = 0;
          } else if (depth && t.type === 'list') {
            (t as PickList).picks = true;
          }
        }
        return tokens;
      },
    },
    renderer: {
      heading(this: Renderer, { tokens, depth }: Tokens.Heading) {
        // Its words without any Markdown, so a heading with a link lists and links the way Typora does.
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer).replace(/\s+/g, ' ').trim();
        const base = slug(plain) || 'section';
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen ? `${base}-${seen}` : base;
        if (depth === 2) headings.push({ id, text: plain });
        return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      list(this: Renderer, token: PickList) {
        if (!token.picks) return Renderer.prototype.list.call(this, token);
        const plain = (tokens: Token[]) => this.parser.parseInline(tokens, this.parser.textRenderer).replace(/\s+/g, ' ').trim();
        const cards = token.items.map((item) => {
          const strong = firstStrong(item.tokens);
          const inline = item.tokens.find((t) => (t as { tokens?: Token[] }).tokens) as { tokens: Token[] } | undefined;
          const name = (strong ? plain(strong.tokens) : plain(inline?.tokens ?? [])).slice(0, 120) || 'Untitled';
          // Two bullets with the same title stay apart: the second becomes "title#2".
          const base = name.toLowerCase();
          const n = (keys.get(base) ?? 0) + 1;
          keys.set(base, n);
          const key = n > 1 ? `${base}#${n}` : base;
          items.push({ key, title: name });
          return { key, body: this.parser.parse(item.tokens) };
        });
        if (!picks) return Renderer.prototype.list.call(this, token);
        const live = Boolean(picks.action && picks.csrf);
        const list = cards.map((c) => {
          const value = escapeHtml(c.key);
          const on = picks.chosen.includes(c.key) ? ' checked' : '';
          const keep = live ? `<input type="hidden" name="all" value="${value}">` : '';
          return `<li><label class="pick"><input type="checkbox" name="pick" value="${value}"${on}${live ? '' : ' disabled'}>${keep}<span class="heart" aria-hidden="true"></span><span class="pick-body">${c.body}</span></label></li>`;
        }).join('\n');
        if (!live) return `<div class="picks"><ul class="pick-list">\n${list}\n</ul></div>\n`;
        forms += 1;
        const id = `picks-${forms}`;
        return `<form class="picks" id="${id}" method="post" action="${escapeHtml(picks.action!)}"><input type="hidden" name="csrf" value="${escapeHtml(picks.csrf!)}"><input type="hidden" name="back" value="${id}">
<ul class="pick-list">
${list}
</ul>
<button class="pick-send" type="submit">These, please</button>
${picks.sent ? `<p class="pick-sent">${escapeHtml(SENT)}</p>` : ''}
</form>
`;
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
  return { html: marked.parse(body, { async: false }) as string, headings, items };
}
