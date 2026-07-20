# rolfll.com Redesign — Design Spec

## Background

`rolfll.com` currently runs on WordPress (a "CVio"-style portfolio/resume theme). The Home, Resume, and Contact pages have real content; the Works/portfolio section is entirely unedited theme demo content (placeholder titles like "Placeholder for project", stock images) and was never actually filled in.

Goal: replace the WordPress site with a from-scratch static site, built and maintained via git rather than a CMS.

## Purpose & Scope

Personal/professional portfolio site for Rolf Lyneborg Lund (Lead People Analytics Specialist, Grundfos; Associate Professor in Social Data Science, AAU). Four pages: Home, Works, Resume, Contact. Out of scope for this pass: blog, CMS/admin UI, image galleries/lightboxes (structure should allow adding these later without a rebuild).

## Site Structure & Content

- **Home** — intro/bio (adapted from current site's tagline copy), links to LinkedIn, GitHub, academic profile.
- **Works** — grid of real projects (3–6 to start), each with a short description and what it involved. Content drafted collaboratively (Rolf provides the raw facts, write-up done together) during implementation.
- **Resume** — CV content restructured as clean sections: professional summary, education, experience, competencies, personal interests. Sourced from the current site's real resume content.
- **Contact** — direct email/phone plus a working form.

**Content model:** projects and resume entries are individual Markdown files with frontmatter (title, dates, tags, description), using Astro content collections. Adding a project later means adding one `.md` file — no code changes required.

## Visual Design

- **Base**: warm off-white background (`#fafaf8`), near-black text, serif body font (Georgia-style), generous whitespace, single-column layout with content capped around 700–800px wide.
- **Editorial/technical accent**: small uppercase monospace "`// 01 — about`"-style eyebrow labels above sections, occasional monospace detail lines (e.g. `focus: applied-ml, sociology, behavioral-data`).
- **Color**: monochrome — no accent color. Emphasis/links via underline or grayscale weight shifts, not a brand hue.
- **Nav**: slim top bar, name/logo left, page links right.
- **Motion**: CSS-only fade/slide-in as sections scroll into view; animated underline on nav link hover; Astro's native View Transitions for smooth crossfade between pages; one small on-brand flourish (e.g. blinking cursor after an eyebrow label, or a "typed-out" intro line).

## Tech & Architecture

- **Framework**: Astro (static site generator). Content collections for `projects/` and `resume/`. Shared `Layout`, `Nav`, and `Footer` components so all pages inherit consistent styling. Any genuinely interactive widget (if one arises later) uses an Astro "island" rather than adopting a full JS framework site-wide.
- **Repo**: local git repo at `C:\Users\Admin\Documents\rolfll-website`, to be pushed to Rolf's personal GitHub account (auth pending — `gh auth login` to be completed by Rolf).
- **Editing workflow**: git-based. Future content changes (new project, resume tweak) are Markdown file edits + commit + push. No CMS.
- **Contact form**: plain HTML form posting to a Formspree endpoint. No backend code or secrets to manage; submissions delivered by email.

## Deployment & Migration

1. Build the Astro site in this repo; push to a new GitHub repo under Rolf's account.
2. Connect the repo to Cloudflare Pages (free tier) — push to `main` auto-builds and deploys to a Pages preview URL.
3. Test thoroughly on the preview URL.
4. Once confirmed, repoint `rolfll.com`'s DNS to Cloudflare (keep the existing registrar — change nameservers/records only, no registrar transfer needed).
5. Only after the new site is live and confirmed working on the real domain, cancel the old WordPress hosting plan.

## Open Items for Implementation

- Exact project list/content for Works (to be drafted together during implementation).
- Confirm GitHub authentication (`gh auth login`) before the repo-push/Cloudflare Pages steps.
- Exact monospace/serif font choices (system font stack vs. a specific webfont) — default to a solid system stack (e.g. Georgia/Times for serif, Consolas/Menlo/monospace) unless Rolf wants a specific webfont later.
