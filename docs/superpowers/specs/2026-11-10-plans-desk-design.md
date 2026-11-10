# Reading room: a writing desk with "Our plans"

## Why

He writes documents to help her with practical things in their life together, the first being a guide to schools for her son ahead of a move. He wants her to read them somewhere warm, as letters from him, and to come away reassured. They belong in the reading room next to his books, songs and photos: a writing desk with a leather folder of his documents.

He writes them in Markdown in Typora (GitHub-flavoured Markdown) and wants to upload them as they are, with the cosy styling applied automatically. Documents can be long. He needs to upload one before it is finished and keep it hidden from her until he marks it ready.

## Goals

- In the reading room, under the sideboard, a lamp-lit writing desk with a leather folder labelled "Our plans".
- The folder opens a sheet listing his ready documents as letters.
- A document opens as its own page: his Markdown rendered on cream paper in the site's warm style, comfortable for long reading on her iPhone.
- Long documents get a contents list, a reading progress line, "continue where you left off" and "back to the top", all automatic.
- He uploads `.md` files in admin, keeps them hidden until ready, replaces them while he works, reorders and deletes them.
- A dot tells her when a ready document is new to her or has changed since she read it.

## Non-goals

- Images inside documents. Links are fine.
- Replies or hearts on documents.
- Editing Markdown in the browser. He edits on his computer and uploads again.
- Showing her drafts in any form.

## Anti-goals

- Anything from his documents in this public repo. Tests use placeholders.
- A draft reaching her browser, through the page, the folder list, a guessed URL or the unread dot.
- Markdown that can run code or pull in outside content: raw HTML in a document is shown as text, never as HTML; links cannot be `javascript:`; images are not loaded.
- A document that looks broken because he used a common Markdown feature.

## What she sees

**The desk** sits under the sideboard in `<base>/reading-room`, drawn in CSS in the same lamp-lit wood: a writing desk with a drawer and legs, a green banker's lamp with a warm glow, an inkwell and pen, and a brown leather folder with stitched edges, a red ribbon and "Our plans" in gold handwriting (Caveat). The label "Our plans" sits under it, with the small gold dot when something is waiting. The desk shows only when at least one document is ready. The approved mockup is the visual reference; it lives outside the repo in the builder's scratchpad (`mock4`, `desk.html`), and the builder of this feature has it.

**The folder sheet** (`?open=plans` without JavaScript) rises like the album's: heading "Our plans", a short muted line "Things I worked out for us.", then one card per ready document in his order. Each card has a thin rose edge, the title, his optional line, and a small caps marker: "NEW" if she has never opened it, "UPDATED" if he replaced it after she last opened it, "READ" otherwise. Tapping a card opens the document.

**A document** at `<base>/reading-room/plans/<id>` is its own page:
- A warm beige background with the document on a cream paper card with a faint paper texture and soft shadow.
- At the top: "‹ Our plans" back to the reading room with the folder open, "For you" in rose handwriting, the title, a small gold ornament.
- Then his Markdown: headings in warm serif (h2 in a deep rose), paragraphs at a comfortable size and line height, bullet and numbered lists with rose markers, bold and italic, block quotes as soft gold-edged boxes, tables with a gold header rule that scroll sideways inside the paper if wide, horizontal rules as the gold ornament, inline code and code blocks in a quiet monospace box, links in deep rose that open in a new tab; links to a heading in the same document (`#some-heading`, as Typora makes them) jump there in place. Typora extras render too: task lists as small drawn boxes (ticked or not), ~~strikethrough~~, footnotes as numbered notes gathered at the end with links both ways, bare URLs as links, and `<br>` line breaks.
- A first `# Heading` in the file is dropped if it equals the title, so the title never shows twice.
- **Contents:** when the document has three or more `##` headings, "In this letter" lists them under the title; each jumps to its heading.
- **Progress:** a thin gold line fixed at the very top of the screen fills as she scrolls.
- **Continue:** her phone remembers how far she read each document (local storage, per document). When she opens it again more than a screen down from the top, a small "Continue where you left off" button appears under the title and scrolls there. Replacing the file resets it.
- **At the end:** "Back to the top" and "‹ Our plans".
- `prefers-reduced-motion`: no smooth scrolling.
- Without JavaScript: everything except progress and continue works.

Opening a document records that she read it (time and the document's version), which clears its dot.

## What he sees in admin

On `<base>/admin/reading-room`, a section "Our plans" under the album:
- Add a document: title (required), a line (optional), the `.md` file (required when adding), and a "Ready for her" checkbox (off by default).
- Each document listed in order with title, "Ready" or "Not ready", whether she has read the current version and when, and actions: Preview (the document page as she would see it, recording nothing), Edit (title, line, ready, optionally a new file), Up, Down, Delete (with confirmation).
- A new document goes to the top.

## Rules

- KV `plans` holds the list: `{ id, title, line, ready, created, updated, markdown }`. `updated` changes only when a new file is uploaded. KV `plans_read` holds `{ id, at, version }` per document she opened, where `version` is the `updated` time she read.
- Files: `.md` or `.markdown` or `text/markdown` or `text/plain`, UTF-8, up to 200 KB. A file that is not valid UTF-8 text is refused with a message.
- Title up to 120 characters, line up to 200, single line each.
- A document that is not ready is never sent to her: the reading room lists only ready ones, the document route answers 404 for a draft or unknown id, and the unread dot counts only ready ones.
- The reading room link on her notes page shows its unread dot also when a ready document is NEW or UPDATED for her.
- Reading is recorded on the server when her session opens the document page (not in preview).
- Markdown is rendered on the server as GitHub-flavoured Markdown (what Typora writes) into a safe subset: headings with stable ids (Typora-style slugs, so its `#heading` links work), paragraphs, emphasis, strikethrough, lists (nested, including task lists), block quotes, tables, horizontal rules, code, footnotes, links (http, https, mailto and same-page `#` only; anything else renders as plain text). Raw HTML is escaped, except `<br>` which becomes a line break. Image syntax renders as its alt text. Links to his other documents are not supported (plain text), so a draft is never revealed through a link.
- Rendering uses the `marked` library with GitHub-flavoured options and a footnote extension (the builder's call), with its HTML, link and image output overridden as above; tests prove a `<script>`, an `onerror` attribute and a `javascript:` link in a document all come out inert.
- Deploy backups cover `plans` and `plans_read`: the backup script lives outside the repo, and the builder adds the two keys to it before the deploy.

## Left to the builder

File layout, whether to use a Markdown library (it must not add network calls, and its output must still be escaped and filtered as above) or a small renderer, the exact CSS, and the details of the drawing.
