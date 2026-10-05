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

## Deployment

Deployed via Cloudflare Workers (static assets), configured in `wrangler.jsonc` (`assets.directory` = `./dist`). Connected to GitHub repo `RolfLyn/rolfll-website` — push to `master` triggers a build (`npm run build`) and deploy automatically.

## Before deploying

- [x] Replace `AAU_PROFILE_URL` in `src/data/social.ts` with your real academic profile URL.
- [x] Sign up at [Formspree](https://formspree.io), create a form, and replace `FORMSPREE_ID` in `src/pages/contact.astro` with your real form ID.
- [x] Run `gh auth login` if you haven't yet, then create a GitHub repo and push this project.
- [x] Connect the GitHub repo to Cloudflare (Workers Builds, `npm run build`, assets served from `dist/` via `wrangler.jsonc`).
- [x] Test the site on the Cloudflare preview URL.
- [ ] Repoint rolfll.com's DNS to Cloudflare (nameservers/records only — no registrar transfer needed).
- [ ] Once the new site is confirmed live on the real domain, cancel the old WordPress hosting plan.

## Private notes

A hidden, password-protected page served by the Worker script in `worker/`. Nothing about it (path, passwords, messages) is stored in this repo.

- Messages live in the `NOTES` KV namespace, as one JSON list under the key `notes`.
- Photos and sound live in the `notes-media` R2 bucket (binding `MEDIA`), referenced from each note as `photo`/`audio`. They are only served through the Worker to logged-in viewers, with Range support. Deleting or replacing an attachment deletes its file.
- Configuration is Cloudflare secrets: `NOTES_PATH` (e.g. `/for-you`), `READER_PASSWORD`, `ADMIN_PASSWORD`, `COOKIE_SECRET`. Set or change one with `npx wrangler secret put <NAME>`.
- Daily use: open `<NOTES_PATH>/admin`, write a note, pick a date, save. The reader sees the latest note dated today or earlier (Copenhagen time), plus the earlier ones below it.
- Changing `COOKIE_SECRET` logs everyone out. Changing `NOTES_PATH` moves the page.
- Local dev: put test values for the four secrets in `.dev.vars` (gitignored), then `npx astro build && npx wrangler dev`.
