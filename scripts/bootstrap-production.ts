#!/usr/bin/env tsx
/**
 * One-time production bootstrap: publishes the on-disk marketplace configs
 * into the database and creates the first real operator account.
 *
 * Unlike scripts/seed.ts, this never inserts synthetic fixtures (no fake
 * providers, no example.com accounts) — it only does what a real production
 * database needs before it can accept a real project. Safe to re-run.
 *
 * Usage:
 *   npm run bootstrap:production -- --operator-email=you@example.com [--operator-name="Your Name"]
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../src/modules/database/client';
import { appUser, userRole } from '../src/modules/database/schema';
import { loadMarketplaceConfigs } from '../src/modules/marketplace-config/loader';
import { publishMarketplaceConfigs } from '../src/modules/marketplace-config/publish';

function arg(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

const operatorEmail = arg('operator-email');
const operatorName = arg('operator-name') ?? 'Operador';

if (!operatorEmail) {
  console.error('Missing required argument: --operator-email');
  console.error('Example: npm run bootstrap:production -- --operator-email=you@example.com');
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('Refusing to run: DATABASE_URL is not set. This script targets a real Postgres database, not the local embedded one.');
  process.exit(1);
}

const db = await getDb();

const configs = loadMarketplaceConfigs();
const marketplaceIds = await publishMarketplaceConfigs(db, configs);
console.log(`Published ${marketplaceIds.size} marketplace config(s): ${[...marketplaceIds.keys()].join(', ')}`);

const existingUser = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, operatorEmail)).limit(1);
const userId =
  existingUser[0]?.id ??
  (await db.insert(appUser).values({ email: operatorEmail, name: operatorName, status: 'active' }).returning({ id: appUser.id }))[0]!.id;

const existingRoles = await db.select().from(userRole).where(eq(userRole.userId, userId)).limit(1);
if (existingRoles.length === 0) {
  await db.insert(userRole).values({ userId, role: 'operator' });
  console.log(`Created operator role for ${operatorEmail}.`);
} else {
  console.log(`${operatorEmail} already has a role — left unchanged.`);
}

console.log('\nBootstrap complete. Sign in at /entrar with this email to reach /ops.');
process.exit(0);
