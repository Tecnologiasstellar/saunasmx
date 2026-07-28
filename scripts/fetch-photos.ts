#!/usr/bin/env tsx
/**
 * Downloads the catalogue in src/modules/ui/photos.ts into public/img.
 *
 * The files are committed, so this is not part of the build — it exists so the
 * set can be re-fetched or re-sized without anyone having to remember which URL
 * each image came from. Usage: npm run photos:fetch [--force]
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { ALL_PHOTOS } from '../src/modules/ui/photos';

const DIR = 'public/img';
const force = process.argv.includes('--force');

await mkdir(DIR, { recursive: true });

for (const photo of ALL_PHOTOS) {
  const path = `${DIR}/pexels-${photo.id}.jpg`;

  if (!force && (await stat(path).catch(() => null))) {
    console.log(`skip  ${path} (already present)`);
    continue;
  }

  // Pexels' own resize parameters. Natural aspect ratio: the layout crops with
  // object-cover, so a fixed crop here would only throw pixels away.
  const url = `https://images.pexels.com/photos/${photo.id}/pexels-photo-${photo.id}.jpeg?auto=compress&cs=tinysrgb&w=${photo.width}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${photo.id}: ${response.status} ${response.statusText} — ${photo.source}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  console.log(`saved ${path} (${Math.round(bytes.length / 1024)} KB) — ${photo.photographer}`);
}

console.log(`\n${ALL_PHOTOS.length} photo(s) in ${DIR}.`);
process.exit(0);
