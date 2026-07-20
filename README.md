# rolfll.com

Personal site for Rolf Lyneborg Lund, built with [Astro](https://astro.build).

## Development

```bash
npm install
npm run dev
```

Open http://localhost:4321.

## Testing

```bash
npm test
```

Runs `astro build` then the Vitest suite against the built output in `dist/`.

## Adding content

- **Projects**: add a Markdown file to `src/content/projects/` with frontmatter matching `projectSchema` in `src/content/schemas.ts` (`title`, optional `dateRange`, `tags`, `description`, `order`).
- **Resume entries**: add a Markdown file to `src/content/resume/` with frontmatter matching `resumeItemSchema` (`type`: one of `education`/`experience`/`competency`/`interest`, `title`, optional `org`/`dateRange`, `description`, `order`).

No CMS — edit files, commit, push.

## Before deploying

- [ ] Replace `AAU_PROFILE_URL` in `src/data/social.ts` with your real academic profile URL.
- [ ] Sign up at [Formspree](https://formspree.io), create a form, and replace `FORMSPREE_ID` in `src/pages/contact.astro` with your real form ID.
- [ ] Run `gh auth login` if you haven't yet, then create a GitHub repo and push this project.
- [ ] Connect the GitHub repo to Cloudflare Pages (build command `npm run build`, output directory `dist`).
- [ ] Test the site on the Cloudflare Pages preview URL.
- [ ] Repoint rolfll.com's DNS to Cloudflare (nameservers/records only — no registrar transfer needed).
- [ ] Once the new site is confirmed live on the real domain, cancel the old WordPress hosting plan.
