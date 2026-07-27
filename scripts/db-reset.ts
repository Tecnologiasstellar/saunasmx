#!/usr/bin/env tsx
/**
 * Destroys and recreates the LOCAL embedded database.
 *
 * Refuses to run when DATABASE_URL is set — this script must never be capable
 * of dropping a shared or production database. Reset a remote database with a
 * deliberate, reviewed migration instead.
 */
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, migrateDatabase } from '../src/modules/database/client';

if (process.env.DATABASE_URL?.trim()) {
  console.error('Refusing to reset: DATABASE_URL is set. This script only resets the local .pgdata database.');
  process.exit(1);
}

const dataDir = process.env.PGLITE_DIR?.trim() || resolve(process.cwd(), '.pgdata');
if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`Removed ${dataDir}`);
}

const db = await getDb();
await migrateDatabase(db);
console.log('Local database recreated and migrated.');
process.exit(0);
