# Blog operations

The programmatic contrast-therapy blog: one Spanish article per day, written by
Claude from DataForSEO keyword research, stored in its own Neon database.

## Where things live

| Piece | File |
|---|---|
| Pipeline | `src/modules/blog/publish.ts` |
| CLI entry point | `scripts/daily_agent.ts` (`npm run blog:agent`) |
| HTTP entry point | `src/app/api/blog/publish/route.ts` |
| Schedule | `.github/workflows/blog-daily.yml` |
| Schema | `src/db/schema.ts`, migrations in `src/db/migrations/` |
| Public pages | `src/app/blog/`, `src/app/llms.txt/route.ts` |

## Environment

| Variable | Needed by | Required? |
|---|---|---|
| `BLOG_DATABASE_URL` | blog pages + agent | Yes. **Not** `DATABASE_URL` — that is the marketplace database. |
| `ANTHROPIC_API_KEY` | agent | Yes |
| `WORKER_SECRET` | `/api/blog/publish` | Only if using the HTTP entry point |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | agent | No — falls back to a rotating seed keyword |
| `OPENAI_API_KEY` | agent | No — post is stored without an embedding |

Vercel needs `BLOG_DATABASE_URL` regardless of where the agent runs, or `/blog`
returns a 500.

## Why GitHub Actions and not Vercel Cron

The reason is the **cron-job quota, not the timeout**. Hobby allows exactly one
cron job per project, and that slot belongs to the outbox drain. A second entry
in `vercel.json` is not inert — it fails the whole deployment with "your plan
allows a maximum of 1 cron job". Add it back only together with a plan upgrade.

Duration is not the blocker: a measured run is **~75 seconds** (≈85s with
DataForSEO) and Hobby accepts a `maxDuration` up to **300s**, which the route
sets. Note that ceiling is validated at build time — a larger value fails the
deploy rather than being clamped down.

GitHub Actions also keeps one code path to debug, since it runs the same command
an operator runs locally. `/api/blog/publish` stays available for manual
triggering and for a future plan upgrade.

## Running it

```bash
# Draft only — researches and writes, prints the article, writes nothing
npm run blog:agent -- --dry

# Publish
npm run blog:agent

# Over HTTP (needs WORKER_SECRET)
curl -H "Authorization: Bearer $WORKER_SECRET" https://saunas.mx/api/blog/publish
```

Both paths are idempotent on slug: a rerun on the same day updates the existing
post rather than failing on the unique index.

## Failure behaviour

| What breaks | What happens |
|---|---|
| DataForSEO unreachable or unauthorized | Warns, falls back to the day's seed keyword, publishes anyway |
| OpenAI unreachable | Warns, publishes with a null embedding |
| Claude refuses or hits `max_tokens` | Throws — nothing is written |
| Fewer than 2 internal links produced | Warns only; the post still publishes |

## Rollback

```sql
DELETE FROM posts WHERE slug = '<slug>';
```

The blog has its own Neon project, so nothing here can affect marketplace data.
