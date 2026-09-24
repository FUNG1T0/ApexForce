const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { createPool } = require('../src/db/pool');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
  const pool = createPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDirectory = path.resolve(__dirname, '../db/migrations');
    const migrationFiles = (await fs.readdir(migrationDirectory))
      .filter((filename) => /^\d+_[a-z0-9_-]+\.sql$/i.test(filename))
      .sort();

    for (const filename of migrationFiles) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (existing.rowCount > 0) {
        process.stdout.write(`Database migration ${filename} already applied.\n`);
        continue;
      }

      const migrationPath = path.join(migrationDirectory, filename);
      const migration = await fs.readFile(migrationPath, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(migration);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        process.stdout.write(`Database migration ${filename} applied.\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exitCode = 1;
});
