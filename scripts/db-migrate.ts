#!/usr/bin/env tsx
/** Applies committed migrations to the configured database. */
import { getDb, migrateDatabase } from '../src/modules/database/client';

const target = process.env.DATABASE_URL?.trim() ? 'remote Postgres (DATABASE_URL)' : 'embedded PGlite (.pgdata)';
console.log(`Migrating ${target}…`);

const db = await getDb();
await migrateDatabase(db);

console.log('Migrations applied.');
process.exit(0);
