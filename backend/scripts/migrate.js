const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { createPool } = require('../src/db/pool');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
  const pool = createPool();
  try {
    const migrationPath = path.resolve(__dirname, '../db/migrations/001_create_users.sql');
    const migration = await fs.readFile(migrationPath, 'utf8');
    await pool.query(migration);
    process.stdout.write('Database migration 001 applied.\n');
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exitCode = 1;
});
