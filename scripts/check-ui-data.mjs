import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [phase, snapshotPath] = process.argv.slice(2);
if (!['before', 'after'].includes(phase) || !snapshotPath || !process.env.TRANS_TEST_APP) throw new Error('Expected before|after, snapshot path and TRANS_TEST_APP');
process.loadEnvFile(path.resolve('.vercel/.env.production.local'));
const require = createRequire(path.join(process.env.TRANS_TEST_APP, 'package.json'));
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('Production database not available; aborting UI publication');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables = ['drivers', 'fleets', 'trips', 'reports', 'fuelings', 'expenses', 'freight_prices', 'management_users'];
  const snapshot = {};
  for (const table of tables) {
    const result = await client.query(`SELECT count(*)::integer AS count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text), '')) AS fingerprint FROM public."${table}" t`);
    snapshot[table] = result.rows[0];
  }
  await client.query('COMMIT');
  if (phase === 'before') {
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
    console.log('UI_DATA_BASELINE', JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([table, value]) => [table, value.count]))));
  } else {
    const before = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const changed = tables.filter((table) => JSON.stringify(before[table]) !== JSON.stringify(snapshot[table]));
    if (changed.length) {
      console.error('UI_DATA_CHANGED_DURING_DEPLOY', changed.join(', '));
      console.error('No data will be restored or overwritten automatically. Check for concurrent operational activity.');
      process.exitCode = 1;
    } else console.log('UI_DATA_UNCHANGED', JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([table, value]) => [table, value.count]))));
  }
} finally {
  await client.query('ROLLBACK').catch(() => {});
  client.release();
  await pool.end();
}
