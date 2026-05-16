import fs from 'fs';
import path from 'path';
import { pool } from './pool.js';

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Running schema migration…');
  await pool.query(sql);
  console.log('Schema migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
