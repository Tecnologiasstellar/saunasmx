#!/usr/bin/env tsx
/**
 * Daily publishing agent for the contrast-therapy blog.
 *
 *   npm run blog:agent           # research → write → insert (published immediately)
 *   npm run blog:agent -- --dry  # research → write → print, no database write
 *
 * The pipeline itself lives in src/modules/blog/publish.ts so the same work is
 * available over HTTP at /api/blog/publish for Vercel Cron. Mirrors the outbox
 * worker: one module, two entry points.
 */
import { publishDailyPost } from '../src/modules/blog/publish';

const dryRun = process.argv.includes('--dry');

const result = await publishDailyPost({ dryRun });

if (dryRun && result.markdown) {
  console.log(`\n--- MARKDOWN ---\n${result.markdown}`);
  console.log(`\n--- JSON-LD ---\n${JSON.stringify(result.jsonLd, null, 2)}`);
  console.log('\nDry run: nothing written to the database.');
}

process.exit(0);
