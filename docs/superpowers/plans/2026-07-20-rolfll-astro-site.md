# rolfll.com Astro Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WordPress rolfll.com site with a from-scratch static Astro site (Home, Works, Resume, Contact) matching the approved minimal/editorial design, editable via git.

**Architecture:** A single Astro static site (no SSR adapter). Content (projects, resume entries) lives as Markdown files validated by Zod schemas via Astro content collections. Shared `Layout`/`Nav`/`Footer`/`Eyebrow` components carry the design system (typography, monochrome palette, monospace eyebrow labels, scroll-reveal + view-transition motion) across all four pages. Contact form posts directly to Formspree; no backend code.

**Tech Stack:** Astro 7, TypeScript (strict preset), Vitest + linkedom for testing built HTML output, Formspree (external, for contact form), Cloudflare Pages (deploy target, configured manually after this plan).

## Global Constraints

- Framework: Astro static site, `output` left at the default (static, no adapter).
- Content editing: all content changes are Markdown files under `src/content/` + git commit/push. No CMS, no admin UI.
- Design: background `#fafaf8`, text `#1a1a1a`, serif body font, monospace (`Consolas`/`Menlo`) only for "`// NN — label`" eyebrow labels and small technical details. No accent color anywhere (monochrome only).
- Motion: CSS-only scroll reveal, CSS underline on nav hover, Astro's `ClientRouter` view transitions, one blinking-cursor flourish on eyebrow labels. No JS animation libraries.
- Testing: `npm test` runs `astro build && vitest run` — tests read the real built HTML from `dist/` (via `linkedom`), not component internals.
- Hosting target: Cloudflare Pages, build command `npm run build`, output directory `dist` (documented in README; not configured by this plan since it requires Rolf's Cloudflare/GitHub accounts).
- Contact form: plain HTML `<form>` posting to `https://formspree.io/f/<FORM_ID>` — no server code, no secrets in the repo.

---

### Task 1: Project scaffold & test tooling

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/pages/index.astro`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: an `npm test` script (`astro build && vitest run`) every later task relies on; a `dist/index.html` build output every later test reads from.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rolfll-website",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "astro build && vitest run"
  },
  "dependencies": {
    "astro": "^7.1.3"
  },
  "devDependencies": {
    "typescript": "^7.0.2",
    "vitest": "^4.1.10",
    "linkedom": "^0.18.13"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rolfll.com',
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Write the failing test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('build output', () => {
  it('produces a home page', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('Coming soon');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `astro build` succeeds but produces no `dist/index.html` (no pages exist yet), so `readFileSync` throws `ENOENT`.

- [ ] **Step 7: Create the placeholder home page**

```astro
---
// src/pages/index.astro
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>rolfll.com</title>
  </head>
  <body>
    <h1>Coming soon</h1>
  </body>
</html>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json src/pages/index.astro tests/smoke.test.ts
git commit -m "Scaffold Astro project with build-output testing"
```

---

### Task 2: Content collection schemas

**Files:**
- Create: `src/content/schemas.ts`
- Create: `src/content.config.ts`
- Test: `tests/schemas.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `projectSchema`, `resumeItemSchema`, and types `ProjectData`, `ResumeItemData` from `src/content/schemas.ts` (used by Task 4's `ProjectCard.astro` and Task 5's `ResumeEntry.astro`). Collections named `projects` and `resume`, queryable via `getCollection('projects')` / `getCollection('resume')` from `astro:content` (used by Task 4/5 pages).

- [ ] **Step 1: Write the failing test**

```ts
// tests/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { projectSchema, resumeItemSchema } from '../src/content/schemas';

describe('projectSchema', () => {
  it('accepts a valid project entry', () => {
    const result = projectSchema.safeParse({
      title: 'Test project',
      description: 'A test project description.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry missing the required description', () => {
    const result = projectSchema.safeParse({ title: 'Test project' });
    expect(result.success).toBe(false);
  });
});

describe('resumeItemSchema', () => {
  it('accepts a valid experience entry', () => {
    const result = resumeItemSchema.safeParse({
      type: 'experience',
      title: 'Lead People Analytics Specialist',
      org: 'Grundfos',
      dateRange: '2024–present',
      description: 'People analytics strategy and applied AI enablement.',
      order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type value', () => {
    const result = resumeItemSchema.safeParse({
      type: 'hobby',
      title: 'Woodworking',
      description: 'Building furniture.',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schemas.test.ts`
Expected: FAIL — `src/content/schemas.ts` does not exist (module not found).

- [ ] **Step 3: Create `src/content/schemas.ts`**

```ts
import { z } from 'astro/zod';

export const projectSchema = z.object({
  title: z.string(),
  dateRange: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string(),
  order: z.number().default(0),
});

export const resumeItemSchema = z.object({
  type: z.enum(['education', 'experience', 'competency', 'interest']),
  title: z.string(),
  org: z.string().optional(),
  dateRange: z.string().optional(),
  description: z.string(),
  order: z.number().default(0),
});

export type ProjectData = z.infer<typeof projectSchema>;
export type ResumeItemData = z.infer<typeof resumeItemSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Create empty content directories**

Run: `mkdir -p src/content/projects src/content/resume`

- [ ] **Step 6: Create `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { projectSchema, resumeItemSchema } from './content/schemas';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: projectSchema,
});

const resume = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resume' }),
  schema: resumeItemSchema,
});

export const collections = { projects, resume };
```

- [ ] **Step 7: Run the full test suite to verify nothing broke**

Run: `npm test`
Expected: PASS — build still succeeds with zero entries in both (empty) collections, and both `tests/smoke.test.ts` and `tests/schemas.test.ts` pass.

- [ ] **Step 8: Commit**

```bash
git add src/content/schemas.ts src/content.config.ts tests/schemas.test.ts
git commit -m "Add content collection schemas for projects and resume"
```

---

### Task 3: Design system + layout components + Home page

**Files:**
- Create: `src/data/social.ts`
- Create: `src/styles/global.css`
- Create: `src/components/Eyebrow.astro`
- Create: `src/components/Nav.astro`
- Create: `src/components/Footer.astro`
- Create: `src/layouts/Layout.astro`
- Modify: `src/pages/index.astro` (replace placeholder with real Home content)
- Test: `tests/home.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 directly (design system is independent of content collections).
- Produces: `Layout.astro` with `Props { title: string; description: string }`, wrapping `<slot />` with `Nav`, `Footer`, global styles, `ClientRouter`, and a scroll-reveal script listening for `.reveal` elements (used by every later page). `Eyebrow.astro` with `Props { index: string; label: string }` (used by Works/Resume/Contact pages). `social.ts` exports `LINKEDIN_URL`, `GITHUB_URL`, `AAU_PROFILE_URL`, `EMAIL` (used by Footer, Home, Contact).

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(document.body.textContent).toContain('Lead People Analytics Specialist at Grundfos');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — current placeholder home page has no `<nav>`, no eyebrow label, no bio copy.

- [ ] **Step 3: Create `src/data/social.ts`**

```ts
// Replace AAU_PROFILE_URL with your real AAU VBN research-portal profile URL before deploying.
export const AAU_PROFILE_URL = 'https://vbn.aau.dk/en/persons/REPLACE_WITH_YOUR_PROFILE_SLUG';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/starpen/';
export const GITHUB_URL = 'https://github.com/RolfLund';
export const EMAIL = 'rolf@rolfll.com';
```

- [ ] **Step 4: Create `src/styles/global.css`**

```css
:root {
  --color-bg: #fafaf8;
  --color-text: #1a1a1a;
  --color-muted: #6b6b6b;
  --color-border: #ddd;
  --font-serif: Georgia, 'Times New Roman', serif;
  --font-mono: Consolas, 'SFMono-Regular', Menlo, monospace;
  --content-width: 760px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-serif);
  line-height: 1.6;
}

main {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.site-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 1.5rem;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--color-border);
}

.site-nav__name {
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;
}

.site-nav nav ul {
  display: flex;
  gap: 1.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.site-nav nav a {
  position: relative;
  color: var(--color-text);
  text-decoration: none;
  padding-bottom: 2px;
}

.site-nav nav a::after {
  content: '';
  position: absolute;
  left: 0;
  right: 100%;
  bottom: 0;
  height: 1px;
  background: var(--color-text);
  transition: right 0.2s ease;
}

.site-nav nav a:hover::after,
.site-nav nav a[aria-current='page']::after {
  right: 0;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-bottom: 0.5rem;
}

.eyebrow__cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.reveal {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.reveal.is-visible {
  opacity: 1;
  transform: none;
}

.hero__focus {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-muted);
}

.hero-links {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.hero-links a {
  color: var(--color-text);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.project-card {
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.project-card__date,
.resume-entry__date {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-muted);
}

.project-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin-top: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.project-card__tags li {
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 2px 6px;
}

.resume-section + .resume-section {
  margin-top: 2rem;
}

.resume-entry + .resume-entry {
  margin-top: 1rem;
}

.resume-entry__heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.resume-entry__org {
  font-weight: normal;
  color: var(--color-muted);
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 480px;
  margin-top: 1.5rem;
}

.contact-form label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-muted);
}

.contact-form input,
.contact-form textarea {
  font-family: var(--font-serif);
  font-size: 1rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

.contact-form button {
  align-self: flex-start;
  font-family: var(--font-mono);
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  padding: 0.6rem 1.25rem;
  border: 1px solid var(--color-text);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.site-footer {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--color-muted);
}

.site-footer__links {
  display: flex;
  gap: 1rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.site-footer a {
  color: var(--color-muted);
}
```

- [ ] **Step 5: Create `src/components/Eyebrow.astro`**

```astro
---
interface Props {
  index: string;
  label: string;
}
const { index, label } = Astro.props;
---
<p class="eyebrow">
  <span class="eyebrow__code">// {index} &mdash; {label}</span><span class="eyebrow__cursor" aria-hidden="true">_</span>
</p>
```

- [ ] **Step 6: Create `src/components/Nav.astro`**

```astro
---
const links = [
  { href: '/', label: 'Home' },
  { href: '/works', label: 'Works' },
  { href: '/resume', label: 'Resume' },
  { href: '/contact', label: 'Contact' },
];
const currentPath = Astro.url.pathname.replace(/\/$/, '') || '/';
---
<header class="site-nav">
  <a class="site-nav__name" href="/">Rolf Lyneborg Lund</a>
  <nav>
    <ul>
      {links.map((link) => (
        <li>
          <a href={link.href} aria-current={currentPath === link.href ? 'page' : undefined}>{link.label}</a>
        </li>
      ))}
    </ul>
  </nav>
</header>
```

- [ ] **Step 7: Create `src/components/Footer.astro`**

```astro
---
import { LINKEDIN_URL, GITHUB_URL, EMAIL } from '../data/social';
const year = new Date().getFullYear();
---
<footer class="site-footer">
  <p>&copy; {year} Rolf Lyneborg Lund</p>
  <ul class="site-footer__links">
    <li><a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
    <li><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>
    <li><a href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
  </ul>
</footer>
```

- [ ] **Step 8: Create `src/layouts/Layout.astro`**

```astro
---
import '../styles/global.css';
import { ClientRouter } from 'astro:transitions';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title} &middot; Rolf Lyneborg Lund</title>
    <meta name="description" content={description} />
    <ClientRouter />
  </head>
  <body>
    <Nav />
    <main>
      <slot />
    </main>
    <Footer />
    <script>
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15 },
      );

      function observeReveals() {
        document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
      }

      observeReveals();
      document.addEventListener('astro:page-load', observeReveals);
    </script>
  </body>
</html>
```

- [ ] **Step 9: Replace `src/pages/index.astro` with the real Home page**

```astro
---
import Layout from '../layouts/Layout.astro';
import Eyebrow from '../components/Eyebrow.astro';
import { LINKEDIN_URL, GITHUB_URL, AAU_PROFILE_URL } from '../data/social';
---
<Layout
  title="Home"
  description="Rolf Lyneborg Lund — Lead People Analytics Specialist at Grundfos and Associate Professor in Social Data Science at AAU."
>
  <section class="reveal">
    <Eyebrow index="01" label="about" />
    <h1>Lead People Analytics Specialist at Grundfos. Associate Professor in Social Data Science at AAU.</h1>
    <p class="hero__focus">focus: applied-ml, sociology, behavioral-data</p>
  </section>
  <section class="hero-links reveal">
    <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">LinkedIn</a>
    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
    <a href={AAU_PROFILE_URL} target="_blank" rel="noopener noreferrer">Academic profile</a>
  </section>
</Layout>
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/data/social.ts src/styles/global.css src/components/Eyebrow.astro src/components/Nav.astro src/components/Footer.astro src/layouts/Layout.astro src/pages/index.astro tests/home.test.ts
git commit -m "Add design system, layout components, and real Home page"
```

---

### Task 4: Works page + real project content

**Files:**
- Create: `src/components/ProjectCard.astro`
- Create: `src/content/projects/lead-people-analytics-grundfos.md`
- Create: `src/content/projects/masshine-scientific-director.md`
- Create: `src/content/projects/associate-professor-social-data-science.md`
- Create: `src/content/projects/phd-applied-ml-sociology.md`
- Create: `src/pages/works.astro`
- Test: `tests/works.test.ts`

**Interfaces:**
- Consumes: `ProjectData` type from `src/content/schemas.ts` (Task 2); `Layout.astro`, `Eyebrow.astro` from Task 3.
- Produces: `/works` page other tasks' final integration test (Task 7) checks for nav consistency.

- [ ] **Step 1: Write the failing test**

```ts
// tests/works.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('works page', () => {
  const html = readFileSync('dist/works/index.html', 'utf-8');

  it('lists all four real projects', () => {
    expect(html).toContain('Lead People Analytics Specialist');
    expect(html).toContain('Scientific Director');
    expect(html).toContain('Associate Professor');
    expect(html).toContain('Ph.D. Research');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/pages/works.astro` does not exist, so `astro build` produces no `dist/works/index.html`.

- [ ] **Step 3: Create the project content files**

```markdown
---
title: "Lead People Analytics Specialist — Grundfos"
dateRange: "2024–present"
tags: ["people-analytics", "applied-ai", "vendor-evaluation"]
description: "Leading people analytics strategy at Grundfos: data readiness assessment, applied AI enablement, and vendor evaluation for HR and analytics tooling."
order: 1
---
```
Save as `src/content/projects/lead-people-analytics-grundfos.md`.

```markdown
---
title: "Scientific Director — MASSHINE"
dateRange: "2024"
tags: ["research-leadership", "digital-humanities", "applied-ml"]
description: "Scientific direction of MASSHINE, Aalborg University's research center for digital humanities and social science, focused on applied machine learning for social data."
order: 2
---
```
Save as `src/content/projects/masshine-scientific-director.md`.

```markdown
---
title: "Associate Professor — Social Data Science"
dateRange: "2022–2024"
tags: ["research", "teaching", "social-data-science"]
description: "Research and teaching in applied social data science at Aalborg University, building on earlier work as Assistant Professor (2020–2022)."
order: 3
---
```
Save as `src/content/projects/associate-professor-social-data-science.md`.

```markdown
---
title: "Ph.D. Research — Applied ML for Big Data"
dateRange: "2016–2019"
tags: ["phd-research", "sociology", "machine-learning"]
description: "Doctoral research in sociology applying machine learning methods to large-scale behavioral data."
order: 4
---
```
Save as `src/content/projects/phd-applied-ml-sociology.md`.

- [ ] **Step 4: Create `src/components/ProjectCard.astro`**

```astro
---
import type { ProjectData } from '../content/schemas';

type Props = Pick<ProjectData, 'title' | 'dateRange' | 'tags' | 'description'>;
const { title, dateRange, tags, description } = Astro.props;
---
<article class="project-card reveal">
  {dateRange && <p class="project-card__date">{dateRange}</p>}
  <h3>{title}</h3>
  <p>{description}</p>
  <ul class="project-card__tags">
    {tags.map((tag) => <li>{tag}</li>)}
  </ul>
</article>
```

- [ ] **Step 5: Create `src/pages/works.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Eyebrow from '../components/Eyebrow.astro';
import ProjectCard from '../components/ProjectCard.astro';
import { getCollection } from 'astro:content';

const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
---
<Layout title="Works" description="Selected work in people analytics, applied machine learning, and social data science.">
  <Eyebrow index="02" label="works" />
  <h1>Selected work</h1>
  <div class="project-grid">
    {projects.map((project) => (
      <ProjectCard
        title={project.data.title}
        dateRange={project.data.dateRange}
        tags={project.data.tags}
        description={project.data.description}
      />
    ))}
  </div>
</Layout>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProjectCard.astro src/content/projects src/pages/works.astro tests/works.test.ts
git commit -m "Add Works page with real project content"
```

---

### Task 5: Resume page + real resume content

**Files:**
- Create: `src/components/ResumeEntry.astro`
- Create: `src/content/resume/experience-lead-people-analytics.md`
- Create: `src/content/resume/experience-scientific-director-masshine.md`
- Create: `src/content/resume/experience-associate-professor.md`
- Create: `src/content/resume/experience-assistant-professor.md`
- Create: `src/content/resume/education-phd-sociology.md`
- Create: `src/content/resume/education-masters-educational-sociology.md`
- Create: `src/content/resume/education-bachelor-social-education.md`
- Create: `src/content/resume/competency-quantitative-methods.md`
- Create: `src/content/resume/competency-ai-solution-implementation.md`
- Create: `src/content/resume/interest-arduino-robotics.md`
- Create: `src/content/resume/interest-woodworking.md`
- Create: `src/content/resume/interest-powerlifting.md`
- Create: `src/content/resume/interest-music.md`
- Create: `src/pages/resume.astro`
- Test: `tests/resume.test.ts`

**Interfaces:**
- Consumes: `ResumeItemData` type from `src/content/schemas.ts` (Task 2); `Layout.astro`, `Eyebrow.astro` from Task 3.
- Produces: `/resume` page (checked by Task 7's integration test).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/pages/resume.astro` does not exist.

- [ ] **Step 3: Create the resume content files**

```markdown
---
type: "experience"
title: "Lead People Analytics Specialist"
org: "Grundfos"
dateRange: "2024–present"
description: "Leading people analytics strategy, data readiness assessment, and applied AI enablement."
order: 1
---
```
Save as `src/content/resume/experience-lead-people-analytics.md`.

```markdown
---
type: "experience"
title: "Scientific Director, MASSHINE"
org: "Aalborg University"
dateRange: "2024"
description: "Scientific direction of AAU's research center for digital humanities and social science."
order: 2
---
```
Save as `src/content/resume/experience-scientific-director-masshine.md`.

```markdown
---
type: "experience"
title: "Associate Professor, Social Data Science"
org: "Aalborg University"
dateRange: "2022–2024"
description: "Research and teaching in applied social data science."
order: 3
---
```
Save as `src/content/resume/experience-associate-professor.md`.

```markdown
---
type: "experience"
title: "Assistant Professor, Applied Social Data Science"
org: "Aalborg University"
dateRange: "2020–2022"
description: "Research and teaching in applied social data science."
order: 4
---
```
Save as `src/content/resume/experience-assistant-professor.md`.

```markdown
---
type: "education"
title: "Ph.D. in Sociology"
org: "Aalborg University"
dateRange: "2016–2019"
description: "Doctoral research on applied machine learning for big data."
order: 1
---
```
Save as `src/content/resume/education-phd-sociology.md`.

```markdown
---
type: "education"
title: "M.Sc. in Educational Sociology"
dateRange: "2011–2014"
description: "Specialized in quantitative methods and effect evaluation."
order: 2
---
```
Save as `src/content/resume/education-masters-educational-sociology.md`.

```markdown
---
type: "education"
title: "B.A. in Social Education"
dateRange: "2008–2011"
description: "Emphasis on learning methods and communication."
order: 3
---
```
Save as `src/content/resume/education-bachelor-social-education.md`.

```markdown
---
type: "competency"
title: "Quantitative methods & applied machine learning"
description: "15+ years analyzing human behavior through computational methods, from descriptive statistics to advanced AI models."
order: 1
---
```
Save as `src/content/resume/competency-quantitative-methods.md`.

```markdown
---
type: "competency"
title: "AI solution implementation & vendor evaluation"
description: "Data readiness assessment, strategic scoping of AI deployments, and vendor selection to reduce cost and risk."
order: 2
---
```
Save as `src/content/resume/competency-ai-solution-implementation.md`.

```markdown
---
type: "interest"
title: "Arduino & robotics"
description: "Hands-on electronics and robotics projects."
order: 1
---
```
Save as `src/content/resume/interest-arduino-robotics.md`.

```markdown
---
type: "interest"
title: "Woodworking"
description: "Building and finishing furniture."
order: 2
---
```
Save as `src/content/resume/interest-woodworking.md`.

```markdown
---
type: "interest"
title: "Powerlifting"
description: "Strength training and competition."
order: 3
---
```
Save as `src/content/resume/interest-powerlifting.md`.

```markdown
---
type: "interest"
title: "Music"
description: "Playing and listening."
order: 4
---
```
Save as `src/content/resume/interest-music.md`.

- [ ] **Step 4: Create `src/components/ResumeEntry.astro`**

```astro
---
import type { ResumeItemData } from '../content/schemas';

type Props = Pick<ResumeItemData, 'title' | 'org' | 'dateRange' | 'description'>;
const { title, org, dateRange, description } = Astro.props;
---
<article class="resume-entry reveal">
  <div class="resume-entry__heading">
    <h3>{title}{org && <span class="resume-entry__org"> &mdash; {org}</span>}</h3>
    {dateRange && <p class="resume-entry__date">{dateRange}</p>}
  </div>
  <p>{description}</p>
</article>
```

- [ ] **Step 5: Create `src/pages/resume.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Eyebrow from '../components/Eyebrow.astro';
import ResumeEntry from '../components/ResumeEntry.astro';
import { getCollection } from 'astro:content';

const entries = await getCollection('resume');
const byType = (type: string) =>
  entries.filter((entry) => entry.data.type === type).sort((a, b) => a.data.order - b.data.order);

const sections = [
  { type: 'experience', heading: 'Experience' },
  { type: 'education', heading: 'Education' },
  { type: 'competency', heading: 'Competencies' },
  { type: 'interest', heading: 'Personal interests' },
];
---
<Layout title="Resume" description="Professional experience, education, and competencies.">
  <Eyebrow index="03" label="resume" />
  <h1>Resume</h1>
  {sections.map(({ type, heading }) => (
    <section class="resume-section">
      <h2>{heading}</h2>
      {byType(type).map((entry) => (
        <ResumeEntry
          title={entry.data.title}
          org={entry.data.org}
          dateRange={entry.data.dateRange}
          description={entry.data.description}
        />
      ))}
    </section>
  ))}
</Layout>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ResumeEntry.astro src/content/resume src/pages/resume.astro tests/resume.test.ts
git commit -m "Add Resume page with real CV content"
```

---

### Task 6: Contact page + Formspree form

**Files:**
- Create: `src/pages/contact.astro`
- Test: `tests/contact.test.ts`

**Interfaces:**
- Consumes: `EMAIL` from `src/data/social.ts` (Task 3); `Layout.astro`, `Eyebrow.astro` from Task 3.
- Produces: `/contact` page (checked by Task 7's integration test). Introduces `FORMSPREE_ID` placeholder that must be replaced before deploy (tracked in Task 7's README).

- [ ] **Step 1: Write the failing test**

```ts
// tests/contact.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/pages/contact.astro` does not exist.

- [ ] **Step 3: Create `src/pages/contact.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Eyebrow from '../components/Eyebrow.astro';
import { EMAIL } from '../data/social';

// Replace with your real Formspree form ID before deploying (see README).
const FORMSPREE_ID = 'REPLACE_WITH_YOUR_FORMSPREE_FORM_ID';
---
<Layout title="Contact" description="Get in touch about project-based consults in people analytics and applied AI.">
  <Eyebrow index="04" label="contact" />
  <h1>Contact</h1>
  <p>Available for project-based consults. Get help asking the right questions about AI.</p>
  <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
  <form class="contact-form" action={`https://formspree.io/f/${FORMSPREE_ID}`} method="POST">
    <label for="name">Name</label>
    <input type="text" id="name" name="name" required />
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required />
    <label for="message">Message</label>
    <textarea id="message" name="message" rows="6" required></textarea>
    <button type="submit">Send</button>
  </form>
</Layout>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/contact.astro tests/contact.test.ts
git commit -m "Add Contact page with Formspree-backed form"
```

---

### Task 7: Favicon, README, and cross-page integration check

**Files:**
- Create: `public/favicon.svg`
- Create: `README.md`
- Test: `tests/polish.test.ts`

**Interfaces:**
- Consumes: build output from all prior tasks (`dist/index.html`, `dist/works/index.html`, `dist/resume/index.html`, `dist/contact/index.html`).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Write the failing test**

```ts
// tests/polish.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `public/favicon.svg` doesn't exist yet, so it isn't copied into `dist/`.

- [ ] **Step 3: Create `public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#fafaf8"/>
  <text x="16" y="21" font-family="Georgia, serif" font-size="14" text-anchor="middle" fill="#1a1a1a">RL</text>
</svg>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Create `README.md`**

```markdown
# rolfll.com

Personal site for Rolf Lyneborg Lund, built with [Astro](https://astro.build).

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

Open http://localhost:4321.

## Testing

\`\`\`bash
npm test
\`\`\`

Runs \`astro build\` then the Vitest suite against the built output in \`dist/\`.

## Adding content

- **Projects**: add a Markdown file to \`src/content/projects/\` with frontmatter matching \`projectSchema\` in \`src/content/schemas.ts\` (\`title\`, optional \`dateRange\`, \`tags\`, \`description\`, \`order\`).
- **Resume entries**: add a Markdown file to \`src/content/resume/\` with frontmatter matching \`resumeItemSchema\` (\`type\`: one of \`education\`/\`experience\`/\`competency\`/\`interest\`, \`title\`, optional \`org\`/\`dateRange\`, \`description\`, \`order\`).

No CMS — edit files, commit, push.

## Before deploying

- [ ] Replace \`AAU_PROFILE_URL\` in \`src/data/social.ts\` with your real academic profile URL.
- [ ] Sign up at [Formspree](https://formspree.io), create a form, and replace \`FORMSPREE_ID\` in \`src/pages/contact.astro\` with your real form ID.
- [ ] Run \`gh auth login\` if you haven't yet, then create a GitHub repo and push this project.
- [ ] Connect the GitHub repo to Cloudflare Pages (build command \`npm run build\`, output directory \`dist\`).
- [ ] Test the site on the Cloudflare Pages preview URL.
- [ ] Repoint rolfll.com's DNS to Cloudflare (nameservers/records only — no registrar transfer needed).
- [ ] Once the new site is confirmed live on the real domain, cancel the old WordPress hosting plan.
```

- [ ] **Step 6: Commit**

```bash
git add public/favicon.svg README.md tests/polish.test.ts
git commit -m "Add favicon, README, and cross-page integration test"
```
