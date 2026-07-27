#!/usr/bin/env tsx
/** Drains the outbox once. Run from cron, or on demand during development. */
import { getDb } from '../src/modules/database/client';
import { expireStaleAssignments } from '../src/modules/matching-engine/assign';
import { processOutbox } from '../src/modules/worker/outbox-worker';

const db = await getDb();
const expired = await expireStaleAssignments(db);
const result = await processOutbox(db);

console.log(
  `Outbox: processed ${result.processed}, completed ${result.completed}, failed ${result.failed}. Expired assignments: ${expired}.`,
);
process.exit(0);
