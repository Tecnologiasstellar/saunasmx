# Curated knowledge library

## Boundary

The library is independent from the generated blog:

- Blog: `src/modules/blog`, separate `BLOG_DATABASE_URL`, generated Markdown posts.
- Library: `src/modules/library`, canonical marketplace `DATABASE_URL`, official external resources and human editorial review.

No library job calls `publishDailyPost`, writes the blog `posts` table, or changes `/blog`.

## Public promise

Every resource visible under `/biblioteca` must pass all of these database/query gates:

1. Its source channel is explicitly marked `official_account = true`.
2. The imported resource carries `source_official = true`.
3. A content editor set `workflow_status = published`.
4. It has a publication timestamp.
5. Its rights status permits an official embed or attributed link.
6. Its creator profile is published.

The UI repeats the provenance in plain Spanish and links to both the original resource and the page used to verify the official account.

## Source allowlist

`config/library/suanas-mx/sources.json` is hand-reviewed configuration, not crawler output. It contains:

- official creator identity;
- canonical website;
- platform/external ID;
- official channel/feed URL;
- an official-site verification URL;
- whether ingestion is active.

A source not in this file (or an equivalent admin-approved database row) is not researched automatically.

The first active source is SaunaTimes / Sauna Talk. The official SaunaTimes site identifies Sauna Talk as its podcast; the feed is the show’s Libsyn feed. Add each future source only after confirming the account from the creator’s own website.

## Commands

```sh
npm run db:migrate
npm run db:seed
npm run library:seed -- --marketplace=suanas-mx
npm run library:ingest -- --marketplace=suanas-mx --limit=25
```

YouTube requires `YOUTUBE_API_KEY`. RSS discovery requires no credential.

In constrained environments where `tsx` cannot open its IPC socket, use:

```sh
node --import tsx scripts/library-seed.ts --marketplace=suanas-mx
node --import tsx scripts/library-ingest.ts --marketplace=suanas-mx --limit=25
```

## Automation

`GET|POST /api/library/ingest` runs the same discovery flow and requires:

```text
Authorization: Bearer $WORKER_SECRET
```

It is intentionally absent from `vercel.json`. Add a production cron only after:

- migration `0003_milky_hammerhead.sql` is applied;
- `WORKER_SECRET` exists;
- `YOUTUBE_API_KEY` exists when YouTube sources are active;
- all active source rows have been reviewed;
- an editor is assigned to `/ops/biblioteca`;
- candidate volume and API quota are understood.

The job only produces `needs_review` candidates. It never publishes.

## Editorial workflow

1. The job polls active official channels.
2. Platform IDs and canonical URLs deduplicate resources.
3. Changed published resources move to `needs_revalidation`.
4. An editor opens `/ops/biblioteca`.
5. The editor writes an original annotation and takeaways.
6. The editor confirms official provenance, rights/embed status, and claims/safety review.
7. Publication writes an editorial review and audit-log row.
8. `/biblioteca`, the detail page, and the sitemap revalidate.

## Official adapters

### YouTube

- Resolves the approved channel’s upload playlist with the YouTube Data API.
- Fetches metadata using `videos.list`.
- Keeps only public, embeddable videos.
- Uses `youtube-nocookie.com` official iframe embeds.
- Stores title, duration, thumbnail, language, publication date, and license metadata.
- Does not use keyword search to discover unknown channels.

### Podcast/article RSS

- Reads the creator/publisher’s canonical RSS or Atom feed.
- Stores metadata and the enclosure URL for audit only.
- Never downloads, proxies, or rehosts audio.
- Public pages link to the canonical item unless a separately permitted official embed exists.

## Current graph

The initial migration adds:

- creators and official channels;
- resources and creator/resource relationships;
- topics and resource/topic relationships;
- learning-path collections and ordered items;
- ingestion runs;
- editorial reviews.

Evidence claims and destination relationships are the next bounded extension. The current schema already leaves resources and directory profiles in the same canonical database, so those relations can be added without coupling the library to the blog.

## Claude Code integration

This feature was built in an isolated checkout and branch:

```text
branch: codex/knowledge-library
checkout: work/saunas-mx-knowledge-library
```

Recommended merge order:

1. Database schema and migration.
2. `src/modules/library` and scripts.
3. Feature flags and source configuration.
4. Public `/biblioteca` routes and UI.
5. `/ops/biblioteca` review workflow.
6. Sitemap and navigation.
7. Tests and this runbook.

Likely overlap files:

- `src/modules/database/schema.ts`
- `config/marketplaces/*/marketplace.yaml`
- `src/app/sitemap.xml/route.ts`
- `src/app/ops/page.tsx`
- `src/modules/auth/current-user.ts`
- `package.json`

All other new library files are isolated. If Claude Code has changed an overlap file, merge its behavior first and then reapply the small library addition; do not replace the whole file.

