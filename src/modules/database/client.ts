import { resolve } from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Database access.
 *
 * `DATABASE_URL` unset  → embedded PGlite (real PostgreSQL compiled to WASM)
 *                         stored in .pgdata/. Local development and tests need
 *                         no server, no container and no cloud credentials.
 * `DATABASE_URL` set    → node-postgres pool against Supabase/Neon/any Postgres.
 *
 * Both paths run the same committed SQL migrations. See ADR-010.
 */

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The handle passed to a `db.transaction(...)` callback. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export const MIGRATIONS_FOLDER = resolve(process.cwd(), 'src/modules/database/migrations');

type Holder = { db: Database | null; promise: Promise<Database> | null };

// Survives Next.js hot reloads, which would otherwise open a pool per edit.
const holder: Holder = ((globalThis as Record<string, unknown>).__marketplaceDb as Holder | undefined) ?? {
  db: null,
  promise: null,
};
(globalThis as Record<string, unknown>).__marketplaceDb = holder;

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 10 });
    return drizzle(pool, { schema }) as unknown as Database;
  }

  const { drizzle } = await import('drizzle-orm/pglite');
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = process.env.PGLITE_DIR?.trim() || resolve(process.cwd(), '.pgdata');
  const client = await PGlite.create({ dataDir });
  return drizzle(client, { schema }) as unknown as Database;
}

export async function getDb(): Promise<Database> {
  if (holder.db) return holder.db;
  holder.promise ??= connect().then((db) => {
    holder.db = db;
    return db;
  });
  return holder.promise;
}

/** Applies committed migrations to whichever backend is configured. */
export async function migrateDatabase(db: Database): Promise<void> {
  if (process.env.DATABASE_URL?.trim()) {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrator is typed per-driver; the schema-generic handle is compatible at runtime.
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
    return;
  }
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above.
  await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
}

export { schema };
