#!/usr/bin/env tsx
/**
 * Imports the research CSVs into `directory_profile`.
 *
 * Dry run by default — it prints exactly what an apply would do, including the
 * fields it would refuse to touch, and writes nothing:
 *
 *   npm run directory:import
 *   npm run directory:import -- --apply
 *   npm run directory:import -- --apply --marketplace=suanas-mx
 *
 * Safe to re-run. Records match on (marketplace, dataset, external id), so a
 * refreshed research file updates the rows it should and leaves operator edits
 * alone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../src/modules/database/client';
import { parseCsv } from '../src/modules/directory/csv';
import {
  importProfiles,
  mapPlaces,
  mapProviders,
  type Copy,
  type MappingIssue,
  type Terms,
} from '../src/modules/directory/import';
import { getMarketplaceId } from '../src/modules/marketplace-config/publish';

function arg(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

const apply = process.argv.includes('--apply');
const slug = arg('marketplace') ?? 'suanas-mx';
const dir = join(process.cwd(), 'data', 'directory');

const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const terms = JSON.parse(read('terms.es.json')) as Terms;
const copy = JSON.parse(read('copy.es.json')) as Copy;

const places = mapPlaces(parseCsv(read('sauna_places.csv')), terms, copy);
const providers = mapProviders(parseCsv(read('sauna_suppliers.csv')), terms, copy);

const profiles = [...places.profiles, ...providers.profiles];
const issues: MappingIssue[] = [...places.issues, ...providers.issues];

console.log(`Marketplace: ${slug}`);
console.log(`Mode:        ${apply ? 'APPLY (writes to the database)' : 'dry run (writes nothing)'}`);
console.log(`Mapped:      ${places.profiles.length} lugares, ${providers.profiles.length} proveedores\n`);

if (issues.length > 0) {
  console.log(`Mapping issues (${issues.length}):`);
  for (const issue of issues) console.log(`  ${issue.externalId}: ${issue.issue}`);
  console.log('');
}

const db = await getDb();
const marketplaceId = await getMarketplaceId(db, slug);
const result = await importProfiles(db, { marketplaceId, profiles, mode: apply ? 'apply' : 'dry_run' });

const counts = { create: 0, update: 0, unchanged: 0 };
for (const operation of result.operations) counts[operation.operation] += 1;

const publishable = result.operations.filter((operation) => operation.published).length;
const held = profiles.filter((profile) => profile.evidenceStatus === 'verify').length;

console.log(`Created:     ${counts.create}`);
console.log(`Updated:     ${counts.update}`);
console.log(`Unchanged:   ${counts.unchanged}`);
console.log(`Public:      ${publishable} of ${profiles.length}`);
console.log(`Held back:   ${held} con evidencia "verify" (nunca se publican automáticamente)`);

if (result.conflicts.length > 0) {
  console.log(`\nConflicts — edited since the last import, left untouched (${result.conflicts.length}):`);
  for (const conflict of result.conflicts) {
    console.log(`  ${conflict.externalId} ${conflict.name}: ${conflict.fields.join(', ')}`);
  }
}

if (result.unpublished.length > 0) {
  console.log(`\nUnpublished — evidence no longer supports a public page (${result.unpublished.length}):`);
  for (const row of result.unpublished) console.log(`  ${row.externalId} ${row.name}`);
}

if (!apply) console.log('\nNothing was written. Re-run with --apply to commit these changes.');

process.exit(0);
